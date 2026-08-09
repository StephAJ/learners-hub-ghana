import { evaluateQuestionResponse } from "../domain/assessment/assessment";
import type {
  AssessmentQuestionSnapshot,
  QuestionMedia,
  QuestionOption,
  QuestionType,
} from "../domain/assessment/types";
import { AuthorizationError } from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import type { LessonBlock } from "../domain/learning/types";
import { requireOfferingContentAccess } from "./content-repository";
import { getSchoolDatabase } from "./index";
import type { SchoolDatabase } from "./school-database";

/* ==========================================================================
   Lesson checkpoints

   The interactive block used to render one hardcoded question about the small
   intestine, in every subject, for every teacher. This resolves the block's
   configured question ids against the subject's question bank instead, and
   marks the learner's answers with domain/assessment — the same marking a
   paper gets, so "correct" means the same thing in a lesson as it does in an
   examination.

   Two rules shape the whole module:

   1. Answer keys never leave the server. The learner payload is built by
      dropping answerKey, and marking happens here rather than in the player.
   2. The question ids come from the published lesson version in the database,
      never from the request. A learner posting another block's ids gets the
      block's real questions marked, not the ones they asked for.
   ========================================================================== */

export class LessonCheckpointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LessonCheckpointError";
  }
}

/** A checkpoint question as a learner receives it: no answer key. */
export type CheckpointQuestion = Omit<
  AssessmentQuestionSnapshot,
  "answerKey" | "questionVersion"
> & { version: number };

export type LessonCheckpoint = {
  blockId: string;
  questions: CheckpointQuestion[];
  totalMarks: number;
};

export type CheckpointResponseInput = {
  questionId: string;
  value: unknown;
};

export type CheckpointQuestionResult = {
  awardedMarks: number;
  correct: boolean;
  marks: number;
  /** True for essay, file-upload and the like: a teacher marks these. */
  needsTeacher: boolean;
  questionId: string;
  /** The author's explanation, released only once an answer is submitted. */
  rationale?: string;
};

export type CheckpointMarkResult = {
  awardedMarks: number;
  questions: CheckpointQuestionResult[];
  totalMarks: number;
};

type CheckpointRequest = {
  blockId: string;
  lessonId: string;
  lessonVersion: number;
};

export async function getLessonCheckpoint(
  access: AccessContext,
  request: CheckpointRequest,
): Promise<LessonCheckpoint> {
  const { questions } = await loadCheckpoint(access, request);
  return {
    blockId: request.blockId,
    questions: questions.map(toLearnerQuestion),
    totalMarks: totalMarksOf(questions),
  };
}

export async function markLessonCheckpoint(
  access: AccessContext,
  request: CheckpointRequest & { responses: CheckpointResponseInput[] },
): Promise<CheckpointMarkResult> {
  const { questions } = await loadCheckpoint(access, request);
  const answered = new Map(
    request.responses.map((response) => [response.questionId, response.value]),
  );

  const marked = questions.map((question) => {
    /* A question the learner skipped is still marked, as a zero. Leaving it
       out of the result would let the player show three of four questions as
       correct and call the checkpoint complete. */
    const evaluation = evaluateQuestionResponse(question.snapshot, {
      value: answered.get(question.snapshot.id) ?? null,
    });
    const needsTeacher = evaluation.markingStatus === "needs-marking";
    return {
      awardedMarks: evaluation.awardedMarks,
      correct: !needsTeacher && evaluation.awardedMarks === question.snapshot.marks,
      marks: question.snapshot.marks,
      needsTeacher,
      questionId: question.snapshot.id,
      rationale: question.rationale || undefined,
    } satisfies CheckpointQuestionResult;
  });

  return {
    awardedMarks: marked.reduce((sum, result) => sum + result.awardedMarks, 0),
    questions: marked,
    totalMarks: totalMarksOf(questions),
  };
}

type LoadedQuestion = {
  rationale: string;
  snapshot: AssessmentQuestionSnapshot;
};

/**
 * The block's questions, with answer keys, for the current published version.
 *
 * Everything the caller passes is treated as a claim to be checked: the lesson
 * must be published at the version named, the block must belong to that
 * version, and the learner must reach the offering the lesson sits in.
 */
async function loadCheckpoint(
  access: AccessContext,
  request: CheckpointRequest,
): Promise<{ offeringId: string; questions: LoadedQuestion[] }> {
  if (access.membershipStatus !== "active") {
    throw new AuthorizationError("An active school membership is required.");
  }
  const database = await getSchoolDatabase();
  const lesson = await database
    .prepare(
      `SELECT l.offering_id, v.id AS version_id
      FROM lessons l
      INNER JOIN lesson_versions v
        ON v.lesson_id = l.id AND v.version = l.current_version
      WHERE l.tenant_id = ? AND l.id = ? AND l.status = 'published'
        AND l.current_version = ? AND v.status = 'published'
      LIMIT 1`,
    )
    .bind(access.tenantId, request.lessonId, request.lessonVersion)
    .first<{ offering_id: string; version_id: string }>();
  if (!lesson) {
    throw new LessonCheckpointError(
      "A checkpoint can only be answered on the current published lesson.",
    );
  }
  await requireOfferingContentAccess(access, lesson.offering_id);

  const block = await database
    .prepare(
      `SELECT config
      FROM lesson_blocks
      WHERE tenant_id = ? AND lesson_version_id = ? AND id = ?
        AND type = 'interactive'
      LIMIT 1`,
    )
    .bind(access.tenantId, lesson.version_id, request.blockId)
    .first<{ config: string }>();
  if (!block) {
    throw new LessonCheckpointError(
      "This checkpoint is not part of the published lesson.",
    );
  }

  const questionIds = checkpointQuestionIds(block.config);
  if (questionIds.length === 0) {
    throw new LessonCheckpointError(
      "This checkpoint has no questions attached yet.",
    );
  }

  const questions = await loadBankQuestions(
    database,
    access.tenantId,
    lesson.offering_id,
    questionIds,
  );
  if (questions.length === 0) {
    throw new LessonCheckpointError(
      "The questions in this checkpoint are no longer available.",
    );
  }
  return { offeringId: lesson.offering_id, questions };
}

/**
 * Loads the current approved version of each question, in the order the
 * teacher arranged them.
 *
 * Retired and draft questions are left out rather than refused: a teacher
 * retiring one question in a bank of forty should shorten the checkpoint, not
 * break every lesson that ever used it.
 */
async function loadBankQuestions(
  database: SchoolDatabase,
  tenantId: string,
  offeringId: string,
  questionIds: string[],
): Promise<LoadedQuestion[]> {
  const placeholders = questionIds.map(() => "?").join(", ");
  const result = await database
    .prepare(
      `SELECT
        q.id,
        q.type,
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
        AND q.id IN (${placeholders})`,
    )
    .bind(tenantId, offeringId, ...questionIds)
    .all<{
      answer_key: string;
      formula: string | null;
      id: string;
      marks: number;
      media: string | null;
      options: string;
      prompt: string;
      rationale: string;
      type: QuestionType;
      version: number;
    }>();

  const byId = new Map(result.results.map((row) => [row.id, row]));
  return questionIds
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row, index) => ({
      rationale: row.rationale,
      snapshot: {
        answerKey: parseJson(row.answer_key, {}),
        formula: row.formula ?? undefined,
        id: row.id,
        marks: Number(row.marks),
        media: parseJson<QuestionMedia | undefined>(row.media, undefined),
        options: parseJson<QuestionOption[]>(row.options, []),
        position: index + 1,
        prompt: row.prompt,
        questionVersion: Number(row.version),
        type: row.type,
      },
    }));
}

/**
 * Strips the answer key. The only place the learner payload is built.
 *
 * Written as an explicit field list rather than a rest spread so that adding a
 * field to AssessmentQuestionSnapshot cannot silently start shipping it to
 * learners — a new `answerHint` column would have travelled with `...rest`.
 */
function toLearnerQuestion(question: LoadedQuestion): CheckpointQuestion {
  const snapshot = question.snapshot;
  return {
    formula: snapshot.formula,
    id: snapshot.id,
    marks: snapshot.marks,
    media: snapshot.media,
    options: snapshot.options,
    position: snapshot.position,
    prompt: snapshot.prompt,
    type: snapshot.type,
    version: snapshot.questionVersion,
  };
}

function totalMarksOf(questions: LoadedQuestion[]): number {
  return questions.reduce((sum, question) => sum + question.snapshot.marks, 0);
}

export function checkpointQuestionIds(config: string): string[] {
  const parsed = parseJson<LessonBlock["config"]>(config, {});
  const ids = parsed?.questionIds;
  if (!Array.isArray(ids)) return [];
  return ids.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}
