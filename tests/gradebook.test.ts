import { describe, expect, it } from "vitest";
import type { AccessContext } from "../domain/identity/types";
import {
  adjustGradeEntry,
  approveReport,
  calculateWeightedGrade,
  gradeFromScale,
  releaseReport,
  submitGradebook,
  canViewReleasedReport,
} from "../domain/reporting/gradebook";
import type {
  GradeCategory,
  GradeEntry,
  GradeItem,
  GradeScaleBand,
  ReportCard,
} from "../domain/reporting/types";

const categories: GradeCategory[] = [
  { id: "ca", name: "Continuous assessment", weightPercent: 40 },
  { id: "exam", name: "End-of-term examination", weightPercent: 60 },
];

const items: GradeItem[] = [
  { categoryId: "ca", id: "quiz", maximumMarks: 20, title: "Quiz" },
  { categoryId: "ca", id: "project", maximumMarks: 30, title: "Project" },
  { categoryId: "exam", id: "exam", maximumMarks: 50, title: "Examination" },
];

const entries: GradeEntry[] = [
  entry("quiz", 16),
  entry("project", 25),
  entry("exam", 42),
];

const administrator: AccessContext = {
  actorPersonId: "admin-1",
  classGroupIds: [],
  linkedLearnerIds: [],
  membershipStatus: "active",
  role: "academic-admin",
  subjectOfferingIds: [],
  tenantId: "tenant-greenfield",
};

describe("gradebook and reports", () => {
  it("calculates a weighted total from stored category policy", () => {
    const result = calculateWeightedGrade(categories, items, entries);

    expect(result.categoryScores).toEqual([
      { categoryId: "ca", percentage: 82, weightedScore: 32.8 },
      { categoryId: "exam", percentage: 84, weightedScore: 50.4 },
    ]);
    expect(result.totalPercent).toBe(83.2);
  });

  it("requires a reason and preserves the raw mark when adjusting", () => {
    const original = entry("quiz", 16);
    expect(() => adjustGradeEntry(original, 18, " ")).toThrow("reason");

    const adjusted = adjustGradeEntry(original, 18, "Moderation correction");
    expect(adjusted.rawMarks).toBe(16);
    expect(adjusted.adjustedMarks).toBe(18);
  });

  it("blocks gradebook submission while required marks are missing", () => {
    expect(() =>
      submitGradebook(
        [
          ...entries,
          {
            ...entry("project", 0),
            learnerPersonId: "learner-2",
            status: "missing",
          },
        ],
        "2026-07-23T12:00:00Z",
      ),
    ).toThrow("missing");
  });

  it("maps scores through a configurable scale", () => {
    expect(gradeFromScale(83.2, scale())).toEqual({
      grade: "A",
      remark: "Excellent",
    });
    expect(gradeFromScale(48, scale())).toEqual({
      grade: "E",
      remark: "Pass",
    });
  });

  it("enforces report approval before release", () => {
    const submitted = report("submitted");
    expect(() => releaseReport(administrator, submitted, "2026-07-23")).toThrow(
      "approved",
    );

    const approved = approveReport(
      administrator,
      submitted,
      "2026-07-23T13:00:00Z",
    );
    const released = releaseReport(
      administrator,
      approved,
      "2026-07-23T14:00:00Z",
    );
    expect(released.status).toBe("released");
    expect(released.version).toBe(1);
  });

  it("allows only linked guardians to view released reports", () => {
    const guardian: AccessContext = {
      actorPersonId: "guardian-1",
      classGroupIds: [],
      linkedLearnerIds: ["learner-1"],
      membershipStatus: "active",
      role: "guardian",
      subjectOfferingIds: [],
      tenantId: "tenant-greenfield",
    };

    expect(canViewReleasedReport(guardian, report("released"))).toBe(true);
    expect(
      canViewReleasedReport(
        { ...guardian, linkedLearnerIds: ["learner-2"] },
        report("released"),
      ),
    ).toBe(false);
    expect(canViewReleasedReport(guardian, report("approved"))).toBe(false);
  });
});

function entry(itemId: string, marks: number): GradeEntry {
  return {
    adjustedMarks: null,
    id: `entry-${itemId}`,
    itemId,
    learnerPersonId: "learner-1",
    rawMarks: marks,
    status: "recorded",
  };
}

function report(status: ReportCard["status"]): ReportCard {
  return {
    approvedAt: status === "approved" || status === "released" ? "2026-07-23" : undefined,
    id: "report-1",
    learnerPersonId: "learner-1",
    periodId: "term-1",
    releasedAt: status === "released" ? "2026-07-23" : undefined,
    status,
    tenantId: "tenant-greenfield",
    version: status === "released" ? 1 : 0,
  };
}

function scale(): GradeScaleBand[] {
  return [
    { grade: "A", maximumPercent: 100, minimumPercent: 80, remark: "Excellent" },
    { grade: "B", maximumPercent: 79.99, minimumPercent: 70, remark: "Very good" },
    { grade: "C", maximumPercent: 69.99, minimumPercent: 60, remark: "Good" },
    { grade: "D", maximumPercent: 59.99, minimumPercent: 50, remark: "Credit" },
    { grade: "E", maximumPercent: 49.99, minimumPercent: 40, remark: "Pass" },
    { grade: "F", maximumPercent: 39.99, minimumPercent: 0, remark: "Needs support" },
  ];
}
