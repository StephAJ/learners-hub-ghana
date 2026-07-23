import { canAccessLearner, canPerform } from "../identity/authorization";
import type { AccessContext } from "../identity/types";
import type {
  GradeCategory,
  GradeEntry,
  GradeItem,
  GradeScaleBand,
  ReportCard,
  WeightedGrade,
} from "./types";

export class ReportingPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportingPolicyError";
  }
}

export function calculateWeightedGrade(
  categories: GradeCategory[],
  items: GradeItem[],
  entries: GradeEntry[],
): WeightedGrade {
  validateCategoryWeights(categories);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const categoryScores = categories.map((category) => {
    const categoryEntries = entries.filter((entry) => {
      const item = itemById.get(entry.itemId);
      return (
        item?.categoryId === category.id &&
        entry.status !== "excused" &&
        entry.status !== "excluded"
      );
    });
    if (categoryEntries.some((entry) => entry.status === "missing")) {
      throw new ReportingPolicyError(
        `Required marks are missing in ${category.name}.`,
      );
    }
    const earned = categoryEntries.reduce(
      (sum, entry) => sum + effectiveMarks(entry),
      0,
    );
    const possible = categoryEntries.reduce(
      (sum, entry) => sum + (itemById.get(entry.itemId)?.maximumMarks ?? 0),
      0,
    );
    const percentage = possible === 0 ? 0 : (earned / possible) * 100;
    return {
      categoryId: category.id,
      percentage: round(percentage),
      weightedScore: round(
        percentage * (category.weightPercent / 100),
      ),
    };
  });

  return {
    categoryScores,
    totalPercent: round(
      categoryScores.reduce(
        (sum, category) => sum + category.weightedScore,
        0,
      ),
    ),
  };
}

export function adjustGradeEntry(
  entry: GradeEntry,
  adjustedMarks: number,
  reason: string,
): GradeEntry {
  if (!reason.trim()) {
    throw new ReportingPolicyError(
      "A reason is required for a grade adjustment.",
    );
  }
  if (!Number.isFinite(adjustedMarks) || adjustedMarks < 0) {
    throw new ReportingPolicyError("Adjusted marks must be zero or greater.");
  }
  return {
    ...entry,
    adjustedMarks,
    adjustmentReason: reason.trim(),
    status: "recorded",
  };
}

export function submitGradebook(entries: GradeEntry[], submittedAt: string) {
  if (entries.some((entry) => entry.status === "missing")) {
    throw new ReportingPolicyError(
      "Resolve every missing mark before submitting the gradebook.",
    );
  }
  if (Number.isNaN(new Date(submittedAt).getTime())) {
    throw new ReportingPolicyError("Submission time is invalid.");
  }
  return { status: "submitted" as const, submittedAt };
}

export function gradeFromScale(
  percentage: number,
  bands: GradeScaleBand[],
) {
  const band = bands.find(
    (item) =>
      percentage >= item.minimumPercent &&
      percentage <= item.maximumPercent,
  );
  if (!band) {
    throw new ReportingPolicyError(
      "The grading scale does not cover this score.",
    );
  }
  return { grade: band.grade, remark: band.remark };
}

export function approveReport(
  access: AccessContext,
  report: ReportCard,
  approvedAt: string,
): ReportCard {
  requireReportAuthority(access);
  if (report.tenantId !== access.tenantId) {
    throw new ReportingPolicyError("Report belongs to another school.");
  }
  if (report.status !== "submitted") {
    throw new ReportingPolicyError(
      "Only a submitted report can be approved.",
    );
  }
  return { ...report, approvedAt, status: "approved" };
}

export function releaseReport(
  access: AccessContext,
  report: ReportCard,
  releasedAt: string,
): ReportCard {
  requireReportAuthority(access);
  if (report.tenantId !== access.tenantId) {
    throw new ReportingPolicyError("Report belongs to another school.");
  }
  if (report.status !== "approved") {
    throw new ReportingPolicyError(
      "A report must be approved before release.",
    );
  }
  return {
    ...report,
    releasedAt,
    status: "released",
    version: report.version + 1,
  };
}

export function canViewReleasedReport(
  access: AccessContext,
  report: ReportCard,
) {
  return (
    report.status === "released" &&
    report.tenantId === access.tenantId &&
    canAccessLearner(access, report.learnerPersonId)
  );
}

function validateCategoryWeights(categories: GradeCategory[]) {
  const total = categories.reduce(
    (sum, category) => sum + category.weightPercent,
    0,
  );
  if (Math.abs(total - 100) > 0.001) {
    throw new ReportingPolicyError(
      "Grade category weights must total 100%.",
    );
  }
}

function effectiveMarks(entry: GradeEntry) {
  return entry.adjustedMarks ?? entry.rawMarks;
}

function requireReportAuthority(access: AccessContext) {
  if (
    access.role !== "school-admin" &&
    access.role !== "academic-admin"
  ) {
    throw new ReportingPolicyError(
      "Your role cannot approve or release reports.",
    );
  }
  if (!canPerform(access, "report:read")) {
    throw new ReportingPolicyError(
      "An active academic membership is required.",
    );
  }
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

