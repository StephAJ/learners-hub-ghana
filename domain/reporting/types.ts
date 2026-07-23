export type GradeEntryStatus =
  | "recorded"
  | "missing"
  | "absent"
  | "excused"
  | "excluded";

export type GradeCategory = {
  id: string;
  name: string;
  weightPercent: number;
};

export type GradeItem = {
  categoryId: string;
  id: string;
  maximumMarks: number;
  title: string;
};

export type GradeEntry = {
  adjustedMarks: number | null;
  adjustmentReason?: string;
  id: string;
  itemId: string;
  learnerPersonId: string;
  rawMarks: number;
  status: GradeEntryStatus;
};

export type CategoryScore = {
  categoryId: string;
  percentage: number;
  weightedScore: number;
};

export type WeightedGrade = {
  categoryScores: CategoryScore[];
  totalPercent: number;
};

export type GradeScaleBand = {
  grade: string;
  maximumPercent: number;
  minimumPercent: number;
  remark: string;
};

export type ReportStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "released"
  | "superseded";

export type ReportCard = {
  approvedAt?: string;
  id: string;
  learnerPersonId: string;
  periodId: string;
  releasedAt?: string;
  status: ReportStatus;
  tenantId: string;
  version: number;
};

