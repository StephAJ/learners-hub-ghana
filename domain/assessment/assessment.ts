import { canTeachOffering } from "../identity/authorization";
import type { AccessContext } from "../identity/types";
import type {
  Assessment,
  AssessmentAttempt,
  AssessmentQuestionSnapshot,
  CreateAssessmentDraftCommand,
  MarkedQuestionResponse,
  QuestionResponse,
} from "./types";

export class AssessmentPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssessmentPolicyError";
  }
}

export function createAssessmentDraft(
  command: CreateAssessmentDraftCommand,
): Assessment {
  requireText(command.tenantId, "School is required.");
  requireText(command.offeringId, "Subject offering is required.");
  requireText(command.authorPersonId, "Assessment author is required.");
  requireText(command.title, "Assessment title is required.");
  requireRange(command.passMarkPercent, 0, 100, "Pass mark");
  requireRange(command.timeLimitMinutes, 1, 600, "Time limit");

  return {
    ...command,
    questions: [],
    status: "draft",
    version: 0,
  };
}

export function addAssessmentQuestion(
  assessment: Assessment,
  question: AssessmentQuestionSnapshot,
): Assessment {
  requireDraft(assessment);
  if (question.marks <= 0) {
    throw new AssessmentPolicyError("Question marks must be greater than zero.");
  }
  if (assessment.questions.some((item) => item.id === question.id)) {
    throw new AssessmentPolicyError("A question can only appear once.");
  }

  return {
    ...assessment,
    questions: [
      ...assessment.questions,
      { ...question, position: assessment.questions.length + 1 },
    ],
  };
}

export function publishAssessment(
  access: AccessContext,
  assessment: Assessment,
  publishedAt: string,
): Assessment {
  requireDraft(assessment);
  if (assessment.tenantId !== access.tenantId) {
    throw new AssessmentPolicyError("Assessment belongs to another school.");
  }
  if (!canTeachOffering(access, assessment.offeringId)) {
    throw new AssessmentPolicyError(
      "You are not assigned to this subject offering.",
    );
  }
  if (assessment.questions.length === 0) {
    throw new AssessmentPolicyError(
      "An assessment needs at least one question.",
    );
  }

  return {
    ...assessment,
    publishedAt,
    status: "published",
    version: assessment.version + 1,
  };
}

export function startAssessmentAttempt(
  assessment: Assessment,
  learnerPersonId: string,
  startedAt: string,
): AssessmentAttempt {
  if (assessment.status !== "published") {
    throw new AssessmentPolicyError(
      "Only a published assessment can be attempted.",
    );
  }
  requireText(learnerPersonId, "Learner is required.");
  const startTime = new Date(startedAt);
  if (Number.isNaN(startTime.getTime())) {
    throw new AssessmentPolicyError("Attempt start time is invalid.");
  }

  return {
    assessmentId: assessment.id,
    assessmentVersion: assessment.version,
    deadlineAt: new Date(
      startTime.getTime() + assessment.timeLimitMinutes * 60_000,
    ).toISOString(),
    id: crypto.randomUUID(),
    learnerPersonId,
    maxMarks: totalMarks(assessment.questions),
    questions: assessment.questions.map((question) => ({
      ...question,
      answerKey: { ...question.answerKey },
      options: question.options.map((option) => ({ ...option })),
    })),
    responses: [],
    score: 0,
    startedAt: startTime.toISOString(),
    status: "in-progress",
    tenantId: assessment.tenantId,
  };
}

export function submitAssessmentAttempt(
  attempt: AssessmentAttempt,
  responses: MarkedQuestionResponse[],
  submittedAt: string,
): AssessmentAttempt {
  if (attempt.status !== "in-progress") {
    throw new AssessmentPolicyError(
      "Only an in-progress attempt can be submitted.",
    );
  }
  if (new Date(submittedAt).getTime() > new Date(attempt.deadlineAt).getTime()) {
    throw new AssessmentPolicyError(
      "The assessment time limit has been exceeded.",
    );
  }

  const needsMarking = responses.some(
    (response) => response.markingStatus === "needs-marking",
  );
  return {
    ...attempt,
    responses,
    score: responses.reduce(
      (sum, response) => sum + response.awardedMarks,
      0,
    ),
    status: needsMarking ? "needs-marking" : "marked",
    submittedAt: new Date(submittedAt).toISOString(),
  };
}

export function evaluateQuestionResponse(
  question: AssessmentQuestionSnapshot,
  response: QuestionResponse,
): MarkedQuestionResponse {
  if (isManualQuestion(question.type)) {
    return markedResponse(question.id, response, 0, "needs-marking");
  }
  const correct = answersMatch(
    question.type,
    question.answerKey.value,
    response.value,
    question.answerKey.tolerance,
  );
  return markedResponse(
    question.id,
    response,
    correct ? question.marks : 0,
    "auto-marked",
  );
}

export function markConstructedResponse(
  response: MarkedQuestionResponse,
  manualMarks: number,
  maximumMarks: number,
  feedback?: string,
): MarkedQuestionResponse {
  requireRange(manualMarks, 0, maximumMarks, "Awarded marks");
  return {
    ...response,
    awardedMarks: response.autoMarks + manualMarks,
    feedback: feedback?.trim() || undefined,
    manualMarks,
    markingStatus: "marked",
  };
}

function answersMatch(
  type: AssessmentQuestionSnapshot["type"],
  expected: unknown,
  actual: unknown,
  tolerance = 0,
) {
  if (type === "numeric") {
    const expectedNumber = Number(expected);
    const actualNumber = Number(actual);
    return (
      Number.isFinite(expectedNumber) &&
      Number.isFinite(actualNumber) &&
      Math.abs(expectedNumber - actualNumber) <= tolerance
    );
  }
  if (type === "short-text") {
    return normaliseText(expected) === normaliseText(actual);
  }
  if (type === "multiple-choice") {
    return serialiseSortedArray(expected) === serialiseSortedArray(actual);
  }
  /* A matching answer is a set of pairs, not a sequence of them. The learner's
     object is built up in whichever order they worked the dropdowns, so
     comparing it raw marked a completely correct answer wrong whenever that
     order differed from the author's — which it usually did. */
  if (type === "matching") {
    return serialiseSortedEntries(expected) === serialiseSortedEntries(actual);
  }
  /* Ordering is the opposite case: the sequence is the answer, so this stays
     an exact comparison. */
  return JSON.stringify(expected) === JSON.stringify(actual);
}

function markedResponse(
  questionId: string,
  response: QuestionResponse,
  marks: number,
  markingStatus: MarkedQuestionResponse["markingStatus"],
): MarkedQuestionResponse {
  return {
    awardedMarks: marks,
    autoMarks: marks,
    flagged: false,
    markingStatus,
    questionId,
    response,
  };
}

function isManualQuestion(type: AssessmentQuestionSnapshot["type"]) {
  return type === "essay" || type === "file-upload" || type === "composite";
}

function normaliseText(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function serialiseSortedArray(value: unknown) {
  return JSON.stringify(
    Array.isArray(value) ? value.map(String).sort() : [],
  );
}

/** A matching answer, key-sorted so insertion order cannot affect the result. */
function serialiseSortedEntries(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return JSON.stringify(null);
  }
  return JSON.stringify(
    Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, String(entry)] as const)
      /* Blank selections are "not answered yet", not an answer of "". Dropping
         them keeps a half-filled attempt from accidentally matching a key that
         happens to have the same filled pairs. */
      .filter(([, entry]) => entry !== "")
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function totalMarks(questions: AssessmentQuestionSnapshot[]) {
  return questions.reduce((total, question) => total + question.marks, 0);
}

function requireDraft(assessment: Assessment) {
  if (assessment.status !== "draft") {
    throw new AssessmentPolicyError(
      "Only a draft assessment can be changed.",
    );
  }
}

function requireText(value: string, message: string) {
  if (!value.trim()) throw new AssessmentPolicyError(message);
}

function requireRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new AssessmentPolicyError(
      `${label} must be between ${minimum} and ${maximum}.`,
    );
  }
}

