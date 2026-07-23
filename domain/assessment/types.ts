export type QuestionType =
  | "single-choice"
  | "multiple-choice"
  | "true-false"
  | "short-text"
  | "numeric"
  | "matching"
  | "ordering"
  | "essay"
  | "file-upload"
  | "hotspot"
  | "composite";

export type AssessmentPurpose =
  | "diagnostic"
  | "formative"
  | "homework"
  | "summative"
  | "mock-examination"
  | "timed-examination"
  | "survey";

export type AssessmentStatus = "draft" | "published" | "archived";

export type QuestionOption = {
  id: string;
  label: string;
};

export type QuestionResponse = {
  value: unknown;
};

export type QuestionAnswerKey = {
  rubric?: string;
  tolerance?: number;
  value?: unknown;
};

export type AssessmentQuestionSnapshot = {
  answerKey: QuestionAnswerKey;
  id: string;
  marks: number;
  options: QuestionOption[];
  position: number;
  prompt: string;
  questionVersion: number;
  type: QuestionType;
};

export type Assessment = {
  authorPersonId: string;
  id: string;
  instructions: string;
  offeringId: string;
  passMarkPercent: number;
  publishedAt?: string;
  purpose: AssessmentPurpose;
  questions: AssessmentQuestionSnapshot[];
  status: AssessmentStatus;
  tenantId: string;
  timeLimitMinutes: number;
  title: string;
  version: number;
};

export type CreateAssessmentDraftCommand = Omit<
  Assessment,
  "publishedAt" | "questions" | "status" | "version"
>;

export type ResponseMarkingStatus =
  | "unanswered"
  | "auto-marked"
  | "needs-marking"
  | "marked";

export type MarkedQuestionResponse = {
  awardedMarks: number;
  autoMarks: number;
  feedback?: string;
  flagged: boolean;
  manualMarks?: number;
  markingStatus: ResponseMarkingStatus;
  questionId: string;
  response: QuestionResponse;
};

export type AssessmentAttemptStatus =
  | "in-progress"
  | "submitted"
  | "needs-marking"
  | "marked"
  | "released"
  | "invalidated";

export type AssessmentAttempt = {
  assessmentId: string;
  assessmentVersion: number;
  deadlineAt: string;
  id: string;
  learnerPersonId: string;
  maxMarks: number;
  questions: AssessmentQuestionSnapshot[];
  responses: MarkedQuestionResponse[];
  score: number;
  startedAt: string;
  status: AssessmentAttemptStatus;
  submittedAt?: string;
  tenantId: string;
};

