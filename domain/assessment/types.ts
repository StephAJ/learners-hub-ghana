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

/**
 * A picture attached to a question or one of its options.
 *
 * `alt` is required rather than optional. A diagram a learner cannot see and
 * cannot have read to them is not an accessible question, it is an
 * unanswerable one — so the authoring side refuses to save an image without
 * a description, and the runner refuses to render one.
 */
export type QuestionMedia = {
  alt: string;
  url: string;
};

export type QuestionOption = {
  id: string;
  label: string;
  /**
   * Shown instead of the label when present; the label stays as the
   * accessible name and the fallback for anything that cannot show images.
   */
  media?: QuestionMedia;
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
  /**
   * A formula, written in TeX, shown under the prompt.
   *
   * Kept separate from the prompt rather than embedded in it, so the prompt
   * stays a plain sentence that reads correctly to a screen reader and in a
   * question bank listing, and the formula can be presented as mathematics
   * rather than as punctuation.
   */
  formula?: string;
  id: string;
  marks: number;
  /** A diagram, photograph or chart the question is about. */
  media?: QuestionMedia;
  options: QuestionOption[];
  position: number;
  prompt: string;
  questionVersion: number;
  type: QuestionType;
};

/* ==========================================================================
   When a learner may see how they did

   The column has existed since the schema was written and was inserted as the
   literal 'after-release' every time, then never read — so "practice mode with
   immediate feedback versus exam mode with delayed feedback", which the scope
   names as a first-release requirement, was a field and not a behaviour.

   after-release is still the default, because it is the safe one: a paper
   whose answers appear the moment it is submitted is a paper the next learner
   to sit it already has.
   ========================================================================== */
export type FeedbackPolicy =
  /** Marks and answers as soon as a question is answered. Practice only. */
  | "immediate"
  /** Marks and answers when the learner submits, before a teacher marks. */
  | "after-attempt"
  /** Nothing until the teacher releases the result. */
  | "after-release";

export type Assessment = {
  authorPersonId: string;
  feedbackPolicy: FeedbackPolicy;
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

