import { evaluateQuestionResponse } from "../domain/assessment/assessment";
import type {
  AssessmentQuestionSnapshot,
  QuestionMedia,
  QuestionOption,
  QuestionType,
} from "../domain/assessment/types";
import { AuthorizationError } from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import { requireOfferingContentAccess } from "./content-repository";
import { getSchoolDatabase } from "./index";
import type { SchoolDatabase } from "./school-database";

/* ==========================================================================
   Practice

   Everything playful in this product belongs here rather than on a paper. A
   graded assessment decides what goes on a report a family keeps, so it stays
   calm, timed once, and answered once. Practice is the opposite of all three:
   untimed, unlimited, and recorded nowhere.

   "Recorded nowhere" is the whole feature, not a shortcut. There is no attempt
   row, no grade entry, no progress write and no audit event in this module —
   deliberately, and the absence is the thing to preserve if it is ever
   extended. A learner has to be able to get a question wrong six times in a
   row without it counting, or they will not use it on anything they find
   hard, which is the only thing worth practising.

   It reuses the two rules the lesson checkpoint is built on:

   1. Answer keys never leave the server. The learner payload drops answerKey,
      and marking happens here.
   2. What is marked comes from the database, not the request. A learner
      posting a question id from another subject gets an authorisation error,
      not that subject's question.
   ========================================================================== */

export class PracticeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PracticeError";
  }
}

/** A practice question as a learner receives it: no answer key. */
export type PracticeQuestion = {
  formula?: string;
  id: string;
  marks: number;
  media?: QuestionMedia;
  options: QuestionOption[];
  prompt: string;
  topic: string;
  type: QuestionType;
};

export type PracticeSet = {
  offeringId: string;
  questions: PracticeQuestion[];
  subjectName: string;
  /** Topics in this bank, so a learner can practise one thing rather than all. */
  topics: string[];
};

export type PracticeMark = {
  /** The author's explanation. In practice it is shown whatever the outcome —
      the point is to learn the thing, not to be told only when wrong. */
  rationale?: string;
  correct: boolean;
  /** What the right answer was, in words. Only ever sent after an attempt. */
  expected: string;
  questionId: string;
};

/**
 * Types practice can ask.
 *
 * Anything a teacher marks by hand is left out: an essay cannot be answered
 * and marked in the same breath, and a practice screen that says "your teacher
 * will look at this" has failed at the one thing it is for.
 */
const INSTANT: ReadonlySet<QuestionType> = new Set<QuestionType>([
  "single-choice",
  "multiple-choice",
  "true-false",
  "short-text",
  "numeric",
  "matching",
  "grouping",
  "ordering",
]);

const DEFAULT_SET_SIZE = 8;

/**
 * A set of questions to practise from one subject.
 *
 * Drawn from the subject's approved bank. Ordered by a rotating seed rather
 * than at random, so a learner who practises twice in a row does not get the
 * same eight questions — and so the set is reproducible for a given seed,
 * which is what makes it testable.
 */
export async function buildPracticeSet(
  access: AccessContext,
  input: { offeringId: string; seed?: number; size?: number; topic?: string },
): Promise<PracticeSet> {
  if (access.membershipStatus !== "active") {
    throw new AuthorizationError("An active school membership is required.");
  }
  await requireOfferingContentAccess(access, input.offeringId);

  const database = await getSchoolDatabase();
  const offering = await database
    .prepare(
      `SELECT s.name AS subject_name
      FROM subject_offerings o
      INNER JOIN subjects s ON s.id = o.subject_id
      WHERE o.tenant_id = ? AND o.id = ?
      LIMIT 1`,
    )
    .bind(access.tenantId, input.offeringId)
    .first<{ subject_name: string }>();
  if (!offering) {
    throw new PracticeError("That subject could not be found.");
  }

  const rows = await loadApprovedBank(database, access.tenantId, input.offeringId);
  const answerable = rows.filter((row) => INSTANT.has(row.type));
  const topics = [...new Set(answerable.map((row) => row.topic).filter(Boolean))].sort();

  const pool = input.topic
    ? answerable.filter((row) => row.topic === input.topic)
    : answerable;

  return {
    offeringId: input.offeringId,
    questions: rotate(pool, input.seed ?? 0)
      .slice(0, Math.max(1, input.size ?? DEFAULT_SET_SIZE))
      .map(toLearnerQuestion),
    subjectName: offering.subject_name,
    topics,
  };
}

/**
 * Marks one practice answer.
 *
 * One at a time rather than a whole set, because feedback the moment an answer
 * is given is the difference between practice and a test. Nothing is written.
 */
export async function markPracticeAnswer(
  access: AccessContext,
  input: { offeringId: string; questionId: string; value: unknown },
): Promise<PracticeMark> {
  if (access.membershipStatus !== "active") {
    throw new AuthorizationError("An active school membership is required.");
  }
  await requireOfferingContentAccess(access, input.offeringId);

  const database = await getSchoolDatabase();
  /* Scoped to the offering the learner has just been checked against, so a
     question id from another subject finds nothing rather than being marked. */
  const rows = await loadApprovedBank(
    database,
    access.tenantId,
    input.offeringId,
    input.questionId,
  );
  const question = rows[0];
  if (!question || !INSTANT.has(question.type)) {
    throw new PracticeError("That question is not available to practise.");
  }

  const evaluation = evaluateQuestionResponse(question.snapshot, {
    value: input.value ?? null,
  });

  return {
    correct: evaluation.awardedMarks === question.snapshot.marks,
    expected: describeExpected(question.snapshot),
    questionId: question.snapshot.id,
    rationale: question.rationale || undefined,
  };
}

/* -- Loading -------------------------------------------------------------- */

type BankRow = {
  rationale: string;
  snapshot: AssessmentQuestionSnapshot;
  topic: string;
  type: QuestionType;
};

async function loadApprovedBank(
  database: SchoolDatabase,
  tenantId: string,
  offeringId: string,
  questionId?: string,
): Promise<BankRow[]> {
  const result = await database
    .prepare(
      `SELECT
        q.id,
        q.type,
        q.topic,
        v.prompt,
        v.options,
        v.answer_key,
        v.rationale,
        v.media,
        v.formula,
        v.marks,
        v.version
      FROM question_bank_items q
      INNER JOIN question_versions v
        ON v.question_id = q.id AND v.version = q.current_version
      WHERE q.tenant_id = ? AND q.offering_id = ? AND q.status = 'approved'
        ${questionId ? "AND q.id = ?" : ""}
      ORDER BY q.id`,
    )
    .bind(
      ...(questionId
        ? [tenantId, offeringId, questionId]
        : [tenantId, offeringId]),
    )
    .all<{
      answer_key: string;
      formula: string | null;
      id: string;
      marks: number;
      media: string | null;
      options: string;
      prompt: string;
      rationale: string | null;
      topic: string | null;
      type: QuestionType;
      version: number;
    }>();

  return (result.results ?? []).map((row, index) => ({
    rationale: row.rationale ?? "",
    snapshot: {
      answerKey: parseJson(row.answer_key, { value: "" }),
      formula: row.formula ?? undefined,
      id: row.id,
      marks: row.marks,
      media: parseJson<QuestionMedia | undefined>(row.media, undefined),
      options: parseJson<QuestionOption[]>(row.options, []),
      /* Only meaningful on a paper, where it is the question's place in the
         running order. Practice has no fixed order, so this is the row's
         position in the bank and nothing reads it. */
      position: index,
      prompt: row.prompt,
      questionVersion: row.version,
      type: row.type,
    },
    topic: row.topic ?? "",
    type: row.type,
  }));
}

function toLearnerQuestion(row: BankRow): PracticeQuestion {
  return {
    formula: row.snapshot.formula,
    id: row.snapshot.id,
    marks: row.snapshot.marks,
    media: row.snapshot.media,
    options: row.snapshot.options,
    prompt: row.snapshot.prompt,
    topic: row.topic,
    type: row.type,
  };
}

/**
 * The right answer, in the words the learner saw.
 *
 * Sent only in a mark response, never with the questions — so it cannot be
 * read out of the payload before answering.
 */
function describeExpected(snapshot: AssessmentQuestionSnapshot): string {
  const expected = snapshot.answerKey.value;
  const label = (id: unknown) =>
    snapshot.options.find((option) => option.id === String(id))?.label ??
    String(id);

  if (snapshot.type === "true-false") {
    return expected === true || expected === "true" ? "True" : "False";
  }
  if (Array.isArray(expected)) {
    return snapshot.type === "ordering"
      ? expected.map(label).join(" → ")
      : expected.map(label).join(", ");
  }
  if (expected && typeof expected === "object") {
    /* Matching and sorting: the option ids are stored bare, but the runner
       shows them prefixed by side, so both spellings are tried. */
    const named = (id: string, side: "left" | "right") =>
      snapshot.options.find((option) => option.id === `${side}:${id}`)?.label ??
      label(id);
    return Object.entries(expected as Record<string, unknown>)
      .map(([left, right]) => `${named(left, "left")} → ${named(String(right), "right")}`)
      .join(", ");
  }
  return label(expected);
}

/**
 * A different slice of the bank each time, without randomness.
 *
 * Math.random would make the set untestable and would also let two calls in
 * the same session repeat. Rotating by the seed gives a learner a fresh set on
 * each visit while keeping any given seed reproducible.
 */
function rotate<T>(items: T[], seed: number): T[] {
  if (items.length === 0) return items;
  const offset = ((seed % items.length) + items.length) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
