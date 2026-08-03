import {
  addAssessmentQuestion,
  AssessmentPolicyError,
  createAssessmentDraft,
  evaluateQuestionResponse,
  markConstructedResponse,
  publishAssessment,
  startAssessmentAttempt,
  submitAssessmentAttempt,
} from "../domain/assessment/assessment";
import type {
  Assessment,
  AssessmentAttemptStatus,
  AssessmentPurpose,
  AssessmentQuestionSnapshot,
  MarkedQuestionResponse,
  QuestionAnswerKey,
  QuestionOption,
  QuestionResponse,
  QuestionType,
} from "../domain/assessment/types";
import {
  AuthorizationError,
  canPerform,
  canTeachOffering,
} from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import {
  ensureLearningFoundation,
  SCIENCE_OFFERING_ID,
} from "./learning-repository";
import { getSchoolDatabase } from "./index";
import {
  demoAssessmentBySlug,
  demoAssessmentQuestions,
  demoAssessments,
  demoQuestionBank,
  demoSubjectByOffering,
  type DemoAssessment,
} from "../domain/demo/greenfield";
import type { SchoolDatabase, SchoolStatement } from "./school-database";

const TENANT_ID = "tenant-greenfield";
export const DIGESTION_ASSESSMENT_ID = "assessment-digestion-check";

export type QuestionBankSummary = {
  difficulty: "foundation" | "standard" | "challenge";
  id: string;
  marks: number;
  prompt: string;
  status: "draft" | "approved" | "retired";
  topic: string;
  type: QuestionType;
  usageCount: number;
  version: number;
};

export type AssessmentSummary = {
  attemptCount: number;
  id: string;
  purpose: AssessmentPurpose;
  questionCount: number;
  status: Assessment["status"];
  timeLimitMinutes: number;
  title: string;
  totalMarks: number;
  version: number;
};

export type ReviewAttempt = {
  attemptId: string;
  learnerName: string;
  maximumMarks: number;
  response?: {
    maximumMarks: number;
    prompt: string;
    questionVersionId: string;
    responseText: string;
  };
  score: number;
  status: AssessmentAttemptStatus;
  submittedAt: string;
  title: string;
};

export type TeacherAssessmentWorkspace = {
  assessments: AssessmentSummary[];
  bank: QuestionBankSummary[];
  className: string;
  code: string;
  offeringId: string;
  reviewQueue: ReviewAttempt[];
  subjectName: string;
  typeCoverage: number;
};

export type LearnerQuestion = Omit<AssessmentQuestionSnapshot, "answerKey">;

export type LearnerAssessment = {
  attempt: {
    deadlineAt: string;
    id: string;
    responses: Record<string, QuestionResponse>;
    startedAt: string;
    status: AssessmentAttemptStatus;
  } | null;
  id: string;
  instructions: string;
  passMarkPercent: number;
  purpose: AssessmentPurpose;
  questions: LearnerQuestion[];
  result: {
    maximumMarks: number;
    released: boolean;
    score: number;
  } | null;
  timeLimitMinutes: number;
  title: string;
  version: number;
};

export type CreateBankQuestionInput = {
  correctAnswer: string;
  difficulty: QuestionBankSummary["difficulty"];
  marks: number;
  options: string[];
  prompt: string;
  rationale: string;
  topic: string;
  type: QuestionType;
};

export type CreateAssessmentInput = {
  instructions: string;
  passMarkPercent: number;
  purpose: AssessmentPurpose;
  questionIds: string[];
  timeLimitMinutes: number;
  title: string;
};

export async function listTeacherAssessmentWorkspace(
  access: AccessContext,
): Promise<TeacherAssessmentWorkspace> {
  requireAssessmentPermission(access);
  await ensureAssessmentFoundation();
  const scopedAccess = await withTeacherAssignments(access);
  if (!canTeachOffering(scopedAccess, SCIENCE_OFFERING_ID)) {
    throw new AuthorizationError(
      "No active assessment subject is assigned to your account.",
    );
  }
  const database = await getSchoolDatabase();
  const [bank, assessments, reviewQueue] = await Promise.all([
    loadQuestionBank(database, access.tenantId),
    loadAssessmentSummaries(database, access.tenantId),
    loadReviewQueue(database, access.tenantId),
  ]);

  return {
    assessments,
    bank,
    className: "JHS 2 Gold",
    code: "IS",
    offeringId: SCIENCE_OFFERING_ID,
    reviewQueue,
    subjectName: "Integrated Science",
    typeCoverage: new Set(bank.map((question) => question.type)).size,
  };
}

export async function createBankQuestion(
  access: AccessContext,
  input: CreateBankQuestionInput,
): Promise<QuestionBankSummary> {
  await ensureAssessmentFoundation();
  validateQuestionInput(input);
  const scopedAccess = await withTeacherAssignments(access);
  if (!canTeachOffering(scopedAccess, SCIENCE_OFFERING_ID)) {
    throw new AuthorizationError(
      "You are not assigned to this subject offering.",
    );
  }
  const database = await getSchoolDatabase();
  const questionId = crypto.randomUUID();
  const questionVersionId = `${questionId}:v1`;
  const options = toQuestionOptions(input.options);
  const answerKey = buildAnswerKey(input, options);

  await database.batch([
    database
      .prepare(
        `INSERT INTO question_bank_items
          (id, tenant_id, offering_id, author_person_id, type, status, difficulty, topic, tags, current_version)
        VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, '[]', 1)`,
      )
      .bind(
        questionId,
        access.tenantId,
        SCIENCE_OFFERING_ID,
        access.actorPersonId,
        input.type,
        input.difficulty,
        input.topic.trim(),
      ),
    database
      .prepare(
        `INSERT INTO question_versions
          (id, tenant_id, question_id, version, prompt, options, answer_key, rationale, marks, status, created_by_person_id)
        VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, 'approved', ?)`,
      )
      .bind(
        questionVersionId,
        access.tenantId,
        questionId,
        input.prompt.trim(),
        JSON.stringify(options),
        JSON.stringify(answerKey),
        input.rationale.trim(),
        input.marks,
        access.actorPersonId,
      ),
    auditStatement(
      database,
      access,
      "question.created",
      "question",
      questionId,
      { type: input.type },
    ),
  ]);

  return {
    difficulty: input.difficulty,
    id: questionId,
    marks: input.marks,
    prompt: input.prompt.trim(),
    status: "approved",
    topic: input.topic.trim(),
    type: input.type,
    usageCount: 0,
    version: 1,
  };
}

export async function createPersistentAssessmentDraft(
  access: AccessContext,
  input: CreateAssessmentInput,
): Promise<AssessmentSummary> {
  await ensureAssessmentFoundation();
  validateAssessmentInput(input);
  const scopedAccess = await withTeacherAssignments(access);
  if (!canTeachOffering(scopedAccess, SCIENCE_OFFERING_ID)) {
    throw new AuthorizationError(
      "You are not assigned to this subject offering.",
    );
  }
  const database = await getSchoolDatabase();
  const uniqueQuestionIds = [...new Set(input.questionIds)];
  const placeholders = uniqueQuestionIds.map(() => "?").join(", ");
  const questionRows = await database
    .prepare(
      `SELECT
        q.id,
        q.type,
        q.current_version,
        v.prompt,
        v.options,
        v.answer_key,
        v.marks
      FROM question_bank_items q
      INNER JOIN question_versions v
        ON v.question_id = q.id AND v.version = q.current_version
      WHERE q.tenant_id = ?
        AND q.offering_id = ?
        AND q.status = 'approved'
        AND q.id IN (${placeholders})`,
    )
    .bind(
      access.tenantId,
      SCIENCE_OFFERING_ID,
      ...uniqueQuestionIds,
    )
    .all<{
      answer_key: string;
      current_version: number;
      id: string;
      marks: number;
      options: string;
      prompt: string;
      type: QuestionType;
    }>();
  if (questionRows.results.length !== uniqueQuestionIds.length) {
    throw new AssessmentPolicyError(
      "One or more selected questions are unavailable.",
    );
  }
  const byId = new Map(
    questionRows.results.map((row) => [row.id, row]),
  );
  let draft = createAssessmentDraft({
    authorPersonId: access.actorPersonId,
    id: crypto.randomUUID(),
    instructions: input.instructions.trim(),
    offeringId: SCIENCE_OFFERING_ID,
    passMarkPercent: input.passMarkPercent,
    purpose: input.purpose,
    tenantId: access.tenantId,
    timeLimitMinutes: input.timeLimitMinutes,
    title: input.title.trim(),
  });
  for (const questionId of uniqueQuestionIds) {
    const row = byId.get(questionId);
    if (!row) continue;
    draft = addAssessmentQuestion(draft, {
      answerKey: parseJson<QuestionAnswerKey>(row.answer_key, {}),
      id: row.id,
      marks: row.marks,
      options: parseJson<QuestionOption[]>(row.options, []),
      position: draft.questions.length + 1,
      prompt: row.prompt,
      questionVersion: row.current_version,
      type: row.type,
    });
  }
  const versionId = `${draft.id}:v0`;
  await database.batch([
    database
      .prepare(
        `INSERT INTO assessments
          (id, tenant_id, offering_id, author_person_id, status, current_version)
        VALUES (?, ?, ?, ?, 'draft', 0)`,
      )
      .bind(
        draft.id,
        draft.tenantId,
        draft.offeringId,
        draft.authorPersonId,
      ),
    database
      .prepare(
        `INSERT INTO assessment_versions
          (id, tenant_id, assessment_id, version, title, purpose, instructions, time_limit_minutes, pass_mark_percent, attempts_allowed, shuffle_questions, feedback_policy, status, created_by_person_id)
        VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, 1, 0, 'after-release', 'draft', ?)`,
      )
      .bind(
        versionId,
        draft.tenantId,
        draft.id,
        draft.title,
        draft.purpose,
        draft.instructions,
        draft.timeLimitMinutes,
        draft.passMarkPercent,
        draft.authorPersonId,
      ),
    ...draft.questions.map((question) =>
      database
        .prepare(
          `INSERT INTO assessment_questions
            (id, tenant_id, assessment_version_id, question_version_id, position, marks, required, snapshot)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          draft.tenantId,
          versionId,
          questionVersionId(question),
          question.position,
          question.marks,
          JSON.stringify(question),
        ),
    ),
    auditStatement(
      database,
      access,
      "assessment.draft_created",
      "assessment",
      draft.id,
      { questionCount: draft.questions.length },
    ),
  ]);
  return {
    attemptCount: 0,
    id: draft.id,
    purpose: draft.purpose,
    questionCount: draft.questions.length,
    status: draft.status,
    timeLimitMinutes: draft.timeLimitMinutes,
    title: draft.title,
    totalMarks: totalMarks(draft.questions),
    version: draft.version,
  };
}

export async function publishPersistentAssessment(
  access: AccessContext,
  assessmentId: string,
): Promise<AssessmentSummary> {
  await ensureAssessmentFoundation();
  const scopedAccess = await withTeacherAssignments(access);
  const database = await getSchoolDatabase();
  const draft = await loadAssessment(
    database,
    access.tenantId,
    assessmentId,
  );
  if (draft.questions.some((question) => question.type === "file-upload")) {
    throw new AssessmentPolicyError(
      "File-response quizzes require secure school file storage before publication.",
    );
  }
  const published = publishAssessment(
    scopedAccess,
    draft,
    new Date().toISOString(),
  );
  const versionId = `${assessmentId}:v${published.version}`;

  await database.batch([
    database
      .prepare(
        `INSERT INTO assessment_versions
          (id, tenant_id, assessment_id, version, title, purpose, instructions, time_limit_minutes, pass_mark_percent, attempts_allowed, shuffle_questions, feedback_policy, status, published_at, created_by_person_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 'after-release', 'published', ?, ?)`,
      )
      .bind(
        versionId,
        published.tenantId,
        published.id,
        published.version,
        published.title,
        published.purpose,
        published.instructions,
        published.timeLimitMinutes,
        published.passMarkPercent,
        published.publishedAt,
        published.authorPersonId,
      ),
    ...published.questions.map((question) =>
      database
        .prepare(
          `INSERT INTO assessment_questions
            (id, tenant_id, assessment_version_id, question_version_id, position, marks, required, snapshot)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          published.tenantId,
          versionId,
          questionVersionId(question),
          question.position,
          question.marks,
          JSON.stringify(question),
        ),
    ),
    database
      .prepare(
        `UPDATE assessments
        SET status = 'published', current_version = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?`,
      )
      .bind(published.version, published.id, published.tenantId),
    auditStatement(
      database,
      access,
      "assessment.published",
      "assessment",
      published.id,
      { version: published.version },
    ),
  ]);

  return {
    attemptCount: 0,
    id: published.id,
    purpose: published.purpose,
    questionCount: published.questions.length,
    status: "published",
    timeLimitMinutes: published.timeLimitMinutes,
    title: published.title,
    totalMarks: totalMarks(published.questions),
    version: published.version,
  };
}

export type LearnerAssessmentCard = {
  id: string;
  /** Which subject set it, so the card can say so. */
  offeringId: string;
  purpose: AssessmentPurpose;
  questionCount: number;
  status: AssessmentAttemptStatus | "not-started";
  timeLimitMinutes: number;
  title: string;
  totalMarks: number;
};

/**
 * Every published assessment this learner can sit.
 *
 * The learner's index had no such query behind it: it listed the two quizzes
 * in the static demo dataset, so a paper a teacher actually built and
 * published was invisible to the class it was published for. The only
 * database-backed route in was the runner, and that defaulted to one
 * hardcoded assessment id.
 *
 * Drafts are excluded — an unpublished paper is the teacher's business — and
 * each card carries the learner's own attempt state so the index can say
 * whether they have started, submitted, or had a result released.
 */
export async function listLearnerAssessments(
  access: AccessContext,
): Promise<LearnerAssessmentCard[]> {
  requireActiveMembership(access);
  await ensureAssessmentFoundation();
  const database = await getSchoolDatabase();
  const result = await database
    .prepare(
      `SELECT
        a.id,
        a.offering_id,
        v.title,
        v.purpose,
        v.time_limit_minutes,
        (
          SELECT COUNT(*)
          FROM assessment_questions aq
          WHERE aq.assessment_version_id = v.id
        ) AS question_count,
        (
          SELECT COALESCE(SUM(aq.marks), 0)
          FROM assessment_questions aq
          WHERE aq.assessment_version_id = v.id
        ) AS total_marks,
        (
          SELECT at.status
          FROM assessment_attempts at
          WHERE at.assessment_id = a.id
            AND at.learner_person_id = ?
          ORDER BY at.started_at DESC
          LIMIT 1
        ) AS attempt_status
      FROM assessments a
      INNER JOIN assessment_versions v
        ON v.assessment_id = a.id AND v.version = a.current_version
      WHERE a.tenant_id = ? AND v.status = 'published'
      ORDER BY a.updated_at DESC`,
    )
    .bind(access.actorPersonId, access.tenantId)
    .all<{
      attempt_status: AssessmentAttemptStatus | null;
      id: string;
      offering_id: string;
      purpose: AssessmentPurpose;
      question_count: number;
      time_limit_minutes: number;
      title: string;
      total_marks: number;
    }>();

  return result.results.map((row) => ({
    id: row.id,
    offeringId: row.offering_id,
    purpose: row.purpose,
    questionCount: Number(row.question_count),
    status: row.attempt_status ?? "not-started",
    timeLimitMinutes: Number(row.time_limit_minutes),
    title: row.title,
    totalMarks: Number(row.total_marks),
  }));
}

export async function getLearnerAssessment(
  access: AccessContext,
  assessmentId = DIGESTION_ASSESSMENT_ID,
): Promise<LearnerAssessment> {
  requireActiveMembership(access);
  await ensureAssessmentFoundation();
  const database = await getSchoolDatabase();
  const assessment = await loadAssessment(
    database,
    access.tenantId,
    assessmentId,
  );
  if (assessment.status !== "published") {
    throw new AssessmentPolicyError("Assessment is not available to learners.");
  }
  const attempt = await findLearnerAttempt(
    database,
    access,
    assessmentId,
    assessment.version,
  );
  const responses = attempt
    ? await loadAttemptResponseValues(database, access.tenantId, attempt.id)
    : {};

  return toLearnerAssessment(assessment, attempt, responses);
}

export async function startPersistentAttempt(
  access: AccessContext,
  assessmentId = DIGESTION_ASSESSMENT_ID,
): Promise<LearnerAssessment> {
  requireActiveMembership(access);
  await ensureAssessmentFoundation();
  const database = await getSchoolDatabase();
  const assessment = await loadAssessment(
    database,
    access.tenantId,
    assessmentId,
  );
  const existing = await findLearnerAttempt(
    database,
    access,
    assessmentId,
    assessment.version,
  );
  if (existing) {
    const responses = await loadAttemptResponseValues(
      database,
      access.tenantId,
      existing.id,
    );
    return toLearnerAssessment(assessment, existing, responses);
  }

  const attempt = startAssessmentAttempt(
    assessment,
    access.actorPersonId,
    new Date().toISOString(),
  );
  await database.batch([
    database
      .prepare(
        `INSERT INTO assessment_attempts
          (id, tenant_id, assessment_id, assessment_version, learner_person_id, status, question_order, started_at, deadline_at, maximum_marks)
        VALUES (?, ?, ?, ?, ?, 'in-progress', ?, ?, ?, ?)`,
      )
      .bind(
        attempt.id,
        attempt.tenantId,
        attempt.assessmentId,
        attempt.assessmentVersion,
        attempt.learnerPersonId,
        JSON.stringify(attempt.questions.map((question) => question.id)),
        attempt.startedAt,
        attempt.deadlineAt,
        attempt.maxMarks,
      ),
    auditStatement(
      database,
      access,
      "attempt.started",
      "assessment-attempt",
      attempt.id,
      { assessmentId },
    ),
  ]);
  return toLearnerAssessment(assessment, toAttemptRow(attempt), {});
}

export async function savePersistentResponse(
  access: AccessContext,
  attemptId: string,
  questionId: string,
  response: QuestionResponse,
  flagged: boolean,
) {
  requireActiveMembership(access);
  const database = await getSchoolDatabase();
  const context = await requireWritableAttempt(
    database,
    access,
    attemptId,
    questionId,
  );
  await database
    .prepare(
      `INSERT INTO assessment_responses
        (id, tenant_id, attempt_id, question_version_id, response, flagged, marking_status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'unanswered', CURRENT_TIMESTAMP)
      ON CONFLICT (attempt_id, question_version_id)
      DO UPDATE SET
        response = excluded.response,
        flagged = excluded.flagged,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      crypto.randomUUID(),
      access.tenantId,
      attemptId,
      context.questionVersionId,
      JSON.stringify(response),
      flagged ? 1 : 0,
    )
    .run();
  return { flagged, questionId, saved: true };
}

export async function submitPersistentAttempt(
  access: AccessContext,
  attemptId: string,
): Promise<LearnerAssessment> {
  requireActiveMembership(access);
  const database = await getSchoolDatabase();
  const attemptRow = await requireOwnedAttempt(database, access, attemptId);
  const assessment = await loadAssessment(
    database,
    access.tenantId,
    attemptRow.assessment_id,
  );
  const values = await loadAttemptResponseValues(
    database,
    access.tenantId,
    attemptId,
  );
  const markedResponses = assessment.questions.map((question) => {
    const marked = evaluateQuestionResponse(
      question,
      values[question.id] ?? { value: null },
    );
    return {
      ...marked,
      flagged: false,
    };
  });
  const receivedAt = new Date();
  const deadlineAt = new Date(attemptRow.deadline_at);
  const effectiveSubmissionTime =
    receivedAt.getTime() > deadlineAt.getTime()
      ? deadlineAt.toISOString()
      : receivedAt.toISOString();
  const attempt = submitAssessmentAttempt(
    {
      assessmentId: attemptRow.assessment_id,
      assessmentVersion: attemptRow.assessment_version,
      deadlineAt: attemptRow.deadline_at,
      id: attemptRow.id,
      learnerPersonId: attemptRow.learner_person_id,
      maxMarks: attemptRow.maximum_marks,
      questions: assessment.questions,
      responses: [],
      score: attemptRow.auto_marks + attemptRow.manual_marks,
      startedAt: attemptRow.started_at,
      status: attemptRow.status,
      tenantId: attemptRow.tenant_id,
    },
    markedResponses,
    effectiveSubmissionTime,
  );
  const autoMarks = markedResponses.reduce(
    (sum, response) => sum + response.autoMarks,
    0,
  );

  await database.batch([
    ...assessment.questions.map((question, index) =>
      responseMarkStatement(
        database,
        access.tenantId,
        attemptId,
        question,
        markedResponses[index],
      ),
    ),
    database
      .prepare(
        `UPDATE assessment_attempts
        SET status = ?, submitted_at = ?, auto_marks = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ? AND learner_person_id = ?`,
      )
      .bind(
        attempt.status,
        attempt.submittedAt,
        autoMarks,
        attemptId,
        access.tenantId,
        access.actorPersonId,
      ),
    auditStatement(
      database,
      access,
      "attempt.submitted",
      "assessment-attempt",
      attemptId,
      {
        autoMarks,
        autoSubmitted: receivedAt.getTime() > deadlineAt.getTime(),
        status: attempt.status,
      },
    ),
  ]);

  return toLearnerAssessment(
    assessment,
    {
      ...attemptRow,
      auto_marks: autoMarks,
      status: attempt.status,
      submitted_at: attempt.submittedAt ?? null,
    },
    values,
  );
}

export async function markPersistentResponse(
  access: AccessContext,
  attemptId: string,
  questionVersionId: string,
  marks: number,
  feedback: string,
): Promise<ReviewAttempt[]> {
  await ensureAssessmentFoundation();
  const database = await getSchoolDatabase();
  const row = await database
    .prepare(
      `SELECT
        r.auto_marks,
        r.flagged,
        r.marking_status,
        r.response,
        qv.marks AS maximum_marks,
        a.offering_id
      FROM assessment_responses r
      INNER JOIN question_versions qv ON qv.id = r.question_version_id
      INNER JOIN assessment_attempts aa ON aa.id = r.attempt_id
      INNER JOIN assessments a ON a.id = aa.assessment_id
      WHERE r.attempt_id = ?
        AND r.question_version_id = ?
        AND r.tenant_id = ?
      LIMIT 1`,
    )
    .bind(attemptId, questionVersionId, access.tenantId)
    .first<{
      auto_marks: number;
      flagged: number;
      marking_status: MarkedQuestionResponse["markingStatus"];
      maximum_marks: number;
      offering_id: string;
      response: string;
    }>();
  if (!row) throw new AssessmentPolicyError("Response was not found.");
  const scopedAccess = await withTeacherAssignments(access);
  if (!canTeachOffering(scopedAccess, row.offering_id)) {
    throw new AuthorizationError(
      "You are not assigned to this subject offering.",
    );
  }
  const marked = markConstructedResponse(
    {
      awardedMarks: row.auto_marks,
      autoMarks: row.auto_marks,
      flagged: Boolean(row.flagged),
      markingStatus: row.marking_status,
      questionId: questionVersionId,
      response: parseJson<QuestionResponse>(row.response, { value: "" }),
    },
    marks,
    row.maximum_marks,
    feedback,
  );

  await database.batch([
    database
      .prepare(
        `UPDATE assessment_responses
        SET manual_marks = ?, marking_status = 'marked', feedback = ?,
          marked_by_person_id = ?, marked_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE attempt_id = ? AND question_version_id = ? AND tenant_id = ?`,
      )
      .bind(
        marked.manualMarks ?? 0,
        marked.feedback ?? null,
        access.actorPersonId,
        attemptId,
        questionVersionId,
        access.tenantId,
      ),
    database
      .prepare(
        `UPDATE assessment_attempts
        SET
          manual_marks = (
            SELECT COALESCE(SUM(manual_marks), 0)
            FROM assessment_responses
            WHERE attempt_id = ?
          ),
          status = CASE
            WHEN EXISTS (
              SELECT 1 FROM assessment_responses
              WHERE attempt_id = ? AND marking_status = 'needs-marking'
            ) THEN 'needs-marking'
            ELSE 'marked'
          END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?`,
      )
      .bind(attemptId, attemptId, attemptId, access.tenantId),
    auditStatement(
      database,
      access,
      "response.marked",
      "assessment-attempt",
      attemptId,
      { marks, questionVersionId },
    ),
  ]);
  return loadReviewQueue(database, access.tenantId);
}

export async function releasePersistentResult(
  access: AccessContext,
  attemptId: string,
): Promise<ReviewAttempt[]> {
  await ensureAssessmentFoundation();
  const database = await getSchoolDatabase();
  const attempt = await database
    .prepare(
      `SELECT aa.status, a.offering_id
      FROM assessment_attempts aa
      INNER JOIN assessments a ON a.id = aa.assessment_id
      WHERE aa.id = ? AND aa.tenant_id = ?
      LIMIT 1`,
    )
    .bind(attemptId, access.tenantId)
    .first<{ offering_id: string; status: AssessmentAttemptStatus }>();
  if (!attempt) throw new AssessmentPolicyError("Attempt was not found.");
  const scopedAccess = await withTeacherAssignments(access);
  if (!canTeachOffering(scopedAccess, attempt.offering_id)) {
    throw new AuthorizationError(
      "You are not assigned to this subject offering.",
    );
  }
  if (attempt.status !== "marked") {
    throw new AssessmentPolicyError(
      "Complete marking before releasing this result.",
    );
  }
  await database.batch([
    database
      .prepare(
        `UPDATE assessment_attempts
        SET status = 'released', released_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?`,
      )
      .bind(attemptId, access.tenantId),
    auditStatement(
      database,
      access,
      "attempt.released",
      "assessment-attempt",
      attemptId,
      {},
    ),
  ]);
  return loadReviewQueue(database, access.tenantId);
}

export async function ensureAssessmentFoundation() {
  await ensureLearningFoundation();
  const database = await getSchoolDatabase();
  /* The published paper's snapshots, which the review attempt marks against. */
  const publishedQuizQuestions = assessmentSnapshots(
    demoAssessmentBySlug("digestive-system-check")!,
  );
  await database.batch([
    ...seedQuestions(database),
    ...seedAssessments(database),
    ...seedReviewAttempt(database, publishedQuizQuestions),
  ]);
}

/** A paper's questions in the shape the schema snapshots them. */
function assessmentSnapshots(
  assessment: DemoAssessment,
): AssessmentQuestionSnapshot[] {
  return demoAssessmentQuestions(assessment).map((question, index) => ({
    answerKey: question.answerKey,
    id: question.id,
    marks: question.marks,
    options: question.options,
    position: index + 1,
    prompt: question.prompt,
    questionVersion: 1,
    type: question.type,
  }));
}

function seedQuestions(database: SchoolDatabase) {
  /* The bank comes from the shared dataset, which also renders the paper a
     learner sits. It used to be defined here as well, so the two could — and
     did — drift: the fractions homework defined in the dataset never reached
     the database at all. */
  const statements: SchoolStatement[] = [];
  for (const question of demoQuestionBank) {
    const subject = demoSubjectByOffering(question.offeringId);
    statements.push(
      database
        .prepare(
          `INSERT OR IGNORE INTO question_bank_items
            (id, tenant_id, offering_id, author_person_id, type, status, difficulty, topic, tags, current_version)
          VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, '[]', 1)`,
        )
        .bind(
          question.id,
          TENANT_ID,
          question.offeringId,
          subject?.teacherPersonId ?? "person-grace",
          question.type,
          question.difficulty,
          question.topic,
        ),
      database
        .prepare(
          `INSERT OR IGNORE INTO question_versions
            (id, tenant_id, question_id, version, prompt, options, answer_key, rationale, marks, status, created_by_person_id)
          VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, 'approved', ?)`,
        )
        .bind(
          `${question.id}:v1`,
          TENANT_ID,
          question.id,
          question.prompt,
          JSON.stringify(question.options),
          JSON.stringify(question.answerKey),
          question.rationale,
          question.marks,
          subject?.teacherPersonId ?? "person-grace",
        ),
    );
  }
  return statements;
}

function seedAssessments(database: SchoolDatabase) {
  const statements: SchoolStatement[] = [];
  for (const assessment of demoAssessments) {
    const published = assessment.status === "published";
    /* A published paper is version 1; a draft has not been versioned yet. */
    const version = published ? 1 : 0;
    const versionId = `${assessment.id}:v${version}`;
    statements.push(
      database
        .prepare(
          `INSERT OR IGNORE INTO assessments
            (id, tenant_id, offering_id, author_person_id, status, current_version)
          VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          assessment.id,
          TENANT_ID,
          assessment.offeringId,
          assessment.authorPersonId,
          assessment.status,
          version,
        ),
      database
        .prepare(
          `INSERT OR IGNORE INTO assessment_versions
            (id, tenant_id, assessment_id, version, title, purpose, instructions,
             time_limit_minutes, pass_mark_percent, attempts_allowed,
             shuffle_questions, feedback_policy, status, published_at, created_by_person_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 'after-release', ?, ?, ?)`,
        )
        .bind(
          versionId,
          TENANT_ID,
          assessment.id,
          version,
          assessment.title,
          assessment.purpose,
          assessment.instructions,
          assessment.timeLimitMinutes,
          assessment.passMarkPercent,
          assessment.status,
          assessment.publishedAt ?? null,
          assessment.authorPersonId,
        ),
    );
    assessmentSnapshots(assessment).forEach((question) => {
      statements.push(
        database
          .prepare(
            `INSERT OR IGNORE INTO assessment_questions
              (id, tenant_id, assessment_version_id, question_version_id, position, marks, required, snapshot)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
          )
          .bind(
            `assessment-question-${assessment.id}-${question.id}`,
            TENANT_ID,
            versionId,
            questionVersionId(question),
            question.position,
            question.marks,
            JSON.stringify(question),
          ),
      );
    });
  }
  return statements;
}

function seedReviewAttempt(
  database: SchoolDatabase,
  questions: AssessmentQuestionSnapshot[],
) {
  const attemptId = "attempt-kwame-digestion";
  const essay = questions.find((question) => question.type === "essay");
  const choice = questions.find(
    (question) => question.type === "single-choice",
  );
  if (!essay || !choice) return [];
  return [
    database
      .prepare(
        `INSERT OR IGNORE INTO assessment_attempts
          (id, tenant_id, assessment_id, assessment_version, learner_person_id, status, question_order, started_at, deadline_at, submitted_at, auto_marks, manual_marks, maximum_marks)
        VALUES (?, ?, ?, 1, 'person-kwame', 'needs-marking', ?, ?, ?, ?, 1, 0, 9)`,
      )
      .bind(
        attemptId,
        TENANT_ID,
        DIGESTION_ASSESSMENT_ID,
        JSON.stringify(questions.map((question) => question.id)),
        "2026-07-23T08:10:00Z",
        "2026-07-23T08:22:00Z",
        "2026-07-23T08:19:00Z",
      ),
    database
      .prepare(
        `INSERT OR IGNORE INTO assessment_responses
          (id, tenant_id, attempt_id, question_version_id, response, flagged, auto_marks, marking_status)
        VALUES ('response-kwame-choice', ?, ?, ?, ?, 0, 1, 'auto-marked')`,
      )
      .bind(
        TENANT_ID,
        attemptId,
        questionVersionId(choice),
        JSON.stringify({ value: "small-intestine" }),
      ),
    database
      .prepare(
        `INSERT OR IGNORE INTO assessment_responses
          (id, tenant_id, attempt_id, question_version_id, response, flagged, auto_marks, marking_status)
        VALUES ('response-kwame-essay', ?, ?, ?, ?, 0, 0, 'needs-marking')`,
      )
      .bind(
        TENANT_ID,
        attemptId,
        questionVersionId(essay),
        JSON.stringify({
          value:
            "The small intestine has many villi, so digested food has more surface to pass into the blood.",
        }),
      ),
  ];
}

async function loadQuestionBank(database: SchoolDatabase, tenantId: string) {
  const result = await database
    .prepare(
      `SELECT
        q.id,
        q.type,
        q.status,
        q.difficulty,
        q.topic,
        q.current_version,
        v.prompt,
        v.marks,
        COUNT(aq.id) AS usage_count
      FROM question_bank_items q
      INNER JOIN question_versions v
        ON v.question_id = q.id AND v.version = q.current_version
      LEFT JOIN assessment_questions aq ON aq.question_version_id = v.id
      WHERE q.tenant_id = ? AND q.offering_id = ?
      GROUP BY q.id, v.id
      ORDER BY q.updated_at DESC, q.created_at DESC`,
    )
    .bind(tenantId, SCIENCE_OFFERING_ID)
    .all<{
      current_version: number;
      difficulty: QuestionBankSummary["difficulty"];
      id: string;
      marks: number;
      prompt: string;
      status: QuestionBankSummary["status"];
      topic: string;
      type: QuestionType;
      usage_count: number;
    }>();
  return result.results.map((row) => ({
    difficulty: row.difficulty,
    id: row.id,
    marks: Number(row.marks),
    prompt: row.prompt,
    status: row.status,
    topic: row.topic,
    type: row.type,
    usageCount: Number(row.usage_count),
    version: row.current_version,
  }));
}

async function loadAssessmentSummaries(
  database: SchoolDatabase,
  tenantId: string,
) {
  const result = await database
    .prepare(
      `SELECT
        a.id,
        a.status,
        a.current_version,
        v.title,
        v.purpose,
        v.time_limit_minutes,
        (
          SELECT COUNT(*)
          FROM assessment_questions aq
          WHERE aq.assessment_version_id = v.id
        ) AS question_count,
        (
          SELECT COALESCE(SUM(aq.marks), 0)
          FROM assessment_questions aq
          WHERE aq.assessment_version_id = v.id
        ) AS total_marks,
        (
          SELECT COUNT(*)
          FROM assessment_attempts at
          WHERE at.assessment_id = a.id
        ) AS attempt_count
      FROM assessments a
      INNER JOIN assessment_versions v
        ON v.assessment_id = a.id AND v.version = a.current_version
      WHERE a.tenant_id = ? AND a.offering_id = ?
      ORDER BY a.updated_at DESC`,
    )
    .bind(tenantId, SCIENCE_OFFERING_ID)
    .all<{
      attempt_count: number;
      current_version: number;
      id: string;
      purpose: AssessmentPurpose;
      question_count: number;
      status: Assessment["status"];
      time_limit_minutes: number;
      title: string;
      total_marks: number;
    }>();
  return result.results.map((row) => ({
    attemptCount: Number(row.attempt_count),
    id: row.id,
    purpose: row.purpose,
    questionCount: Number(row.question_count),
    status: row.status,
    timeLimitMinutes: row.time_limit_minutes,
    title: row.title,
    totalMarks: Number(row.total_marks),
    version: row.current_version,
  }));
}

async function loadReviewQueue(database: SchoolDatabase, tenantId: string) {
  const result = await database
    .prepare(
      `SELECT
        at.id AS attempt_id,
        at.status,
        at.auto_marks + at.manual_marks AS score,
        at.maximum_marks,
        at.submitted_at,
        av.title,
        p.first_name || ' ' || p.last_name AS learner_name,
        r.question_version_id,
        r.response,
        qv.prompt,
        qv.marks AS response_maximum_marks
      FROM assessment_attempts at
      INNER JOIN assessments a ON a.id = at.assessment_id
      INNER JOIN assessment_versions av
        ON av.assessment_id = at.assessment_id
        AND av.version = at.assessment_version
      INNER JOIN people p ON p.id = at.learner_person_id
      LEFT JOIN assessment_responses r
        ON r.attempt_id = at.id AND r.marking_status = 'needs-marking'
      LEFT JOIN question_versions qv ON qv.id = r.question_version_id
      WHERE at.tenant_id = ?
        AND a.offering_id = ?
        AND at.status IN ('needs-marking', 'marked', 'released')
      ORDER BY
        CASE at.status WHEN 'needs-marking' THEN 1 WHEN 'marked' THEN 2 ELSE 3 END,
        at.submitted_at`,
    )
    .bind(tenantId, SCIENCE_OFFERING_ID)
    .all<{
      attempt_id: string;
      learner_name: string;
      maximum_marks: number;
      prompt: string | null;
      question_version_id: string | null;
      response: string | null;
      response_maximum_marks: number | null;
      score: number;
      status: AssessmentAttemptStatus;
      submitted_at: string;
      title: string;
    }>();
  return result.results.map((row) => ({
    attemptId: row.attempt_id,
    learnerName: row.learner_name,
    maximumMarks: Number(row.maximum_marks),
    response:
      row.question_version_id && row.prompt && row.response_maximum_marks
        ? {
            maximumMarks: Number(row.response_maximum_marks),
            prompt: row.prompt,
            questionVersionId: row.question_version_id,
            responseText: String(
              parseJson<QuestionResponse>(row.response ?? "{}", {
                value: "",
              }).value ?? "",
            ),
          }
        : undefined,
    score: Number(row.score),
    status: row.status,
    submittedAt: row.submitted_at,
    title: row.title,
  }));
}

async function loadAssessment(
  database: SchoolDatabase,
  tenantId: string,
  assessmentId: string,
): Promise<Assessment> {
  const row = await database
    .prepare(
      `SELECT
        a.id,
        a.tenant_id,
        a.offering_id,
        a.author_person_id,
        a.status,
        a.current_version,
        v.id AS version_id,
        v.title,
        v.purpose,
        v.instructions,
        v.time_limit_minutes,
        v.pass_mark_percent,
        v.published_at
      FROM assessments a
      INNER JOIN assessment_versions v
        ON v.assessment_id = a.id AND v.version = a.current_version
      WHERE a.id = ? AND a.tenant_id = ?
      LIMIT 1`,
    )
    .bind(assessmentId, tenantId)
    .first<{
      author_person_id: string;
      current_version: number;
      id: string;
      instructions: string;
      offering_id: string;
      pass_mark_percent: number;
      published_at: string | null;
      purpose: AssessmentPurpose;
      status: Assessment["status"];
      tenant_id: string;
      time_limit_minutes: number;
      title: string;
      version_id: string;
    }>();
  if (!row) throw new AssessmentPolicyError("Assessment was not found.");
  const questionsResult = await database
    .prepare(
      `SELECT snapshot
      FROM assessment_questions
      WHERE tenant_id = ? AND assessment_version_id = ?
      ORDER BY position`,
    )
    .bind(tenantId, row.version_id)
    .all<{ snapshot: string }>();

  return {
    authorPersonId: row.author_person_id,
    id: row.id,
    instructions: row.instructions,
    offeringId: row.offering_id,
    passMarkPercent: row.pass_mark_percent,
    publishedAt: row.published_at ?? undefined,
    purpose: row.purpose,
    questions: questionsResult.results.map((question) =>
      normaliseSnapshot(
        parseJson<AssessmentQuestionSnapshot>(question.snapshot, {
          answerKey: {},
          id: "",
          marks: 0,
          options: [],
          position: 0,
          prompt: "",
          questionVersion: 0,
          type: "single-choice",
        }),
      ),
    ),
    status: row.status,
    tenantId: row.tenant_id,
    timeLimitMinutes: row.time_limit_minutes,
    title: row.title,
    version: row.current_version,
  };
}

/**
 * Repairs a snapshot written before int8 was parsed as a number.
 *
 * A question's marks are frozen into the snapshot JSON when a paper is
 * assembled. Any paper assembled while node-postgres was still handing int8
 * back as a string has `"marks": "2"` written into it permanently, and no
 * amount of fixing the type parser changes rows that already exist — so
 * `sum + question.marks` kept concatenating on exactly the deployments that
 * had been used the longest. Coerced on the way out rather than migrated,
 * because the snapshot is deliberately immutable: it is the record of what
 * the paper said when it was published.
 */
function normaliseSnapshot(
  question: AssessmentQuestionSnapshot,
): AssessmentQuestionSnapshot {
  return {
    ...question,
    marks: Number(question.marks) || 0,
    position: Number(question.position) || 0,
    questionVersion: Number(question.questionVersion) || 0,
  };
}

async function findLearnerAttempt(
  database: SchoolDatabase,
  access: AccessContext,
  assessmentId: string,
  version: number,
) {
  return database
    .prepare(
      `SELECT *
      FROM assessment_attempts
      WHERE tenant_id = ?
        AND learner_person_id = ?
        AND assessment_id = ?
        AND assessment_version = ?
        AND status != 'invalidated'
      ORDER BY started_at DESC
      LIMIT 1`,
    )
    .bind(access.tenantId, access.actorPersonId, assessmentId, version)
    .first<AttemptRow>();
}

async function loadAttemptResponseValues(
  database: SchoolDatabase,
  tenantId: string,
  attemptId: string,
) {
  const result = await database
    .prepare(
      `SELECT qv.question_id, r.response
      FROM assessment_responses r
      INNER JOIN question_versions qv ON qv.id = r.question_version_id
      WHERE r.tenant_id = ? AND r.attempt_id = ?`,
    )
    .bind(tenantId, attemptId)
    .all<{ question_id: string; response: string }>();
  return Object.fromEntries(
    result.results.map((row) => [
      row.question_id,
      parseJson<QuestionResponse>(row.response, { value: null }),
    ]),
  );
}

function toLearnerAssessment(
  assessment: Assessment,
  attempt: AttemptRow | null,
  responses: Record<string, QuestionResponse>,
): LearnerAssessment {
  const released = attempt?.status === "released";
  return {
    attempt: attempt
      ? {
          deadlineAt: attempt.deadline_at,
          id: attempt.id,
          responses,
          startedAt: attempt.started_at,
          status: attempt.status,
        }
      : null,
    id: assessment.id,
    instructions: assessment.instructions,
    passMarkPercent: assessment.passMarkPercent,
    purpose: assessment.purpose,
    questions: assessment.questions.map((question) => ({
      id: question.id,
      marks: question.marks,
      options: question.options,
      position: question.position,
      prompt: question.prompt,
      questionVersion: question.questionVersion,
      type: question.type,
    })),
    result:
      attempt && attempt.status !== "in-progress"
        ? {
            maximumMarks: attempt.maximum_marks,
            released,
            score: released
              ? attempt.auto_marks + attempt.manual_marks
              : attempt.auto_marks,
          }
        : null,
    timeLimitMinutes: assessment.timeLimitMinutes,
    title: assessment.title,
    version: assessment.version,
  };
}

async function requireWritableAttempt(
  database: SchoolDatabase,
  access: AccessContext,
  attemptId: string,
  questionId: string,
) {
  const row = await database
    .prepare(
      `SELECT
        at.status,
        at.deadline_at,
        qv.id AS question_version_id
      FROM assessment_attempts at
      INNER JOIN assessment_versions av
        ON av.assessment_id = at.assessment_id
        AND av.version = at.assessment_version
      INNER JOIN assessment_questions aq
        ON aq.assessment_version_id = av.id
      INNER JOIN question_versions qv
        ON qv.id = aq.question_version_id
      WHERE at.id = ?
        AND at.tenant_id = ?
        AND at.learner_person_id = ?
        AND qv.question_id = ?
      LIMIT 1`,
    )
    .bind(attemptId, access.tenantId, access.actorPersonId, questionId)
    .first<{
      deadline_at: string;
      question_version_id: string;
      status: AssessmentAttemptStatus;
    }>();
  if (!row) throw new AssessmentPolicyError("Attempt question was not found.");
  if (row.status !== "in-progress") {
    throw new AssessmentPolicyError(
      "Responses cannot change after submission.",
    );
  }
  if (Date.now() > new Date(row.deadline_at).getTime()) {
    throw new AssessmentPolicyError("The assessment time limit has expired.");
  }
  return { questionVersionId: row.question_version_id };
}

async function requireOwnedAttempt(
  database: SchoolDatabase,
  access: AccessContext,
  attemptId: string,
) {
  const attempt = await database
    .prepare(
      `SELECT *
      FROM assessment_attempts
      WHERE id = ? AND tenant_id = ? AND learner_person_id = ?
      LIMIT 1`,
    )
    .bind(attemptId, access.tenantId, access.actorPersonId)
    .first<AttemptRow>();
  if (!attempt) throw new AssessmentPolicyError("Attempt was not found.");
  return attempt;
}

function responseMarkStatement(
  database: SchoolDatabase,
  tenantId: string,
  attemptId: string,
  question: AssessmentQuestionSnapshot,
  marked: MarkedQuestionResponse,
) {
  return database
    .prepare(
      `INSERT INTO assessment_responses
        (id, tenant_id, attempt_id, question_version_id, response, flagged, auto_marks, marking_status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (attempt_id, question_version_id)
      DO UPDATE SET
        response = excluded.response,
        auto_marks = excluded.auto_marks,
        marking_status = excluded.marking_status,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      crypto.randomUUID(),
      tenantId,
      attemptId,
      questionVersionId(question),
      JSON.stringify(marked.response),
      marked.flagged ? 1 : 0,
      marked.autoMarks,
      marked.markingStatus,
    );
}

async function withTeacherAssignments(access: AccessContext) {
  if (access.role === "school-admin" || access.role === "academic-admin") {
    return access;
  }
  const database = await getSchoolDatabase();
  const result = await database
    .prepare(
      `SELECT offering_id
      FROM teacher_assignments
      WHERE tenant_id = ? AND teacher_person_id = ? AND status = 'active'`,
    )
    .bind(access.tenantId, access.actorPersonId)
    .all<{ offering_id: string }>();
  return {
    ...access,
    subjectOfferingIds: result.results.map((row) => row.offering_id),
  };
}

function requireAssessmentPermission(access: AccessContext) {
  if (!canPerform(access, "assessment:publish")) {
    throw new AuthorizationError(
      "Your school role does not allow assessment authoring.",
    );
  }
}

function requireActiveMembership(access: AccessContext) {
  if (access.membershipStatus !== "active") {
    throw new AuthorizationError("An active school membership is required.");
  }
}

function validateQuestionInput(input: CreateBankQuestionInput) {
  if (
    !input.prompt?.trim() ||
    !input.topic?.trim() ||
    !Number.isInteger(input.marks) ||
    input.marks < 1 ||
    input.marks > 100
  ) {
    throw new AssessmentPolicyError(
      "Prompt, topic, and marks from 1 to 100 are required.",
    );
  }
  if (
    ![
      "single-choice",
      "multiple-choice",
      "true-false",
      "short-text",
      "numeric",
      "matching",
      "ordering",
      "essay",
      "file-upload",
      "hotspot",
      "composite",
    ].includes(input.type)
  ) {
    throw new AssessmentPolicyError("Select a supported question type.");
  }
  if (
    ["single-choice", "multiple-choice"].includes(input.type) &&
    input.options.filter((option) => option.trim()).length < 2
  ) {
    throw new AssessmentPolicyError(
      "Choice questions need at least two options.",
    );
  }
  /* Everything below stops a question being saved in a shape the marker
     cannot evaluate. Without these a teacher could publish an ordering
     question with no sequence, and every learner attempt would score zero
     with nothing on screen explaining why. */
  if (
    ["single-choice", "multiple-choice", "true-false"].includes(input.type) &&
    !input.correctAnswer.trim()
  ) {
    throw new AssessmentPolicyError(
      "Mark which option is correct before saving.",
    );
  }
  if (input.type === "numeric" && !Number.isFinite(Number(input.correctAnswer))) {
    throw new AssessmentPolicyError(
      "A numeric question needs a number as its answer.",
    );
  }
  if (input.type === "ordering") {
    const sequence = splitAuthoredList(input.correctAnswer);
    if (sequence.length < 2) {
      throw new AssessmentPolicyError(
        "An ordering question needs at least two items in their correct order.",
      );
    }
  }
  if (input.type === "matching") {
    const pairs = splitAuthoredList(input.correctAnswer).filter((pair) =>
      pair.includes(PAIR_SEPARATOR),
    );
    if (pairs.length < 2) {
      throw new AssessmentPolicyError(
        "A matching question needs at least two complete pairs.",
      );
    }
  }
}

function validateAssessmentInput(input: CreateAssessmentInput) {
  const supportedPurposes: AssessmentPurpose[] = [
    "diagnostic",
    "formative",
    "homework",
    "summative",
    "mock-examination",
    "timed-examination",
    "survey",
  ];
  if (
    !input.title?.trim() ||
    !input.instructions?.trim() ||
    !Number.isInteger(input.timeLimitMinutes) ||
    input.timeLimitMinutes < 1 ||
    input.timeLimitMinutes > 600 ||
    !Number.isInteger(input.passMarkPercent) ||
    input.passMarkPercent < 0 ||
    input.passMarkPercent > 100 ||
    !supportedPurposes.includes(input.purpose) ||
    !Array.isArray(input.questionIds) ||
    input.questionIds.length === 0
  ) {
    throw new AssessmentPolicyError(
      "Title, instructions, valid timing, pass mark, and at least one question are required.",
    );
  }
}

function buildAnswerKey(
  input: CreateBankQuestionInput,
  options: QuestionOption[],
): QuestionAnswerKey {
  if (
    input.type === "essay" ||
    input.type === "file-upload" ||
    input.type === "composite"
  ) {
    return { rubric: input.correctAnswer.trim() };
  }
  if (input.type === "true-false") {
    return { value: input.correctAnswer.trim().toLowerCase() === "true" };
  }
  if (input.type === "multiple-choice") {
    const answers = input.correctAnswer
      .split(",")
      .map((answer) => slugify(answer))
      .filter((answer) => options.some((option) => option.id === answer));
    return { value: answers };
  }
  if (input.type === "numeric") {
    return { value: Number(input.correctAnswer) };
  }
  if (input.type === "single-choice") {
    return { value: slugify(input.correctAnswer) };
  }
  /* Ordering: the sequence is the answer, so the key is the option ids in the
     order the author gave, and the learner's response is compared to it
     exactly. The stored options stay in their presented order, which is not
     the answer order — otherwise the question shows the learner the answer. */
  if (input.type === "ordering") {
    return {
      value: splitAuthoredList(input.correctAnswer).map((label) =>
        slugify(label),
      ),
    };
  }
  /* Matching: a map from left id to right id. Written the same way the runner
     builds a learner's response, so the two are directly comparable. */
  if (input.type === "matching") {
    const pairs = splitAuthoredList(input.correctAnswer)
      .map((pair) => pair.split(PAIR_SEPARATOR))
      .filter((parts) => parts.length === 2);
    return {
      value: Object.fromEntries(
        pairs.map(([left, right]) => [slugify(left), slugify(right)]),
      ),
    };
  }
  return { value: input.correctAnswer.trim() };
}

/* Separates the two halves of an authored matching pair, and a side marker
   from its label. Two colons because a single one appears in real question
   text often enough to be a hazard. */
const PAIR_SEPARATOR = "::";

/**
 * Option labels, as ids the runner understands.
 *
 * Matching is the one type whose ids are not derived from the label alone:
 * the runner splits a matching question's options into two columns by a
 * `left:` / `right:` prefix on the id, so the author has to be able to say
 * which side an option belongs to. It does that by prefixing the entry
 * `left::` or `right::`; everything else is a plain label.
 */
function toQuestionOptions(options: string[]) {
  return options
    .map((label) => label.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(PAIR_SEPARATOR);
      const side = separator === -1 ? "" : entry.slice(0, separator);
      if (side !== "left" && side !== "right") {
        return { id: slugify(entry), label: entry };
      }
      const label = entry.slice(separator + PAIR_SEPARATOR.length).trim();
      return { id: `${side}:${slugify(label)}`, label };
    });
}

/** Splits a comma-separated authored list, keeping only non-empty entries. */
function splitAuthoredList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function questionVersionId(question: AssessmentQuestionSnapshot) {
  return `${question.id}:v${question.questionVersion}`;
}

function totalMarks(questions: AssessmentQuestionSnapshot[]) {
  return questions.reduce((sum, question) => sum + question.marks, 0);
}

function auditStatement(
  database: SchoolDatabase,
  access: AccessContext,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
) {
  return database
    .prepare(
      `INSERT INTO audit_events
        (id, tenant_id, actor_person_id, action, entity_type, entity_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      access.tenantId,
      access.actorPersonId,
      action,
      entityType,
      entityId,
      JSON.stringify(metadata),
    );
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toAttemptRow(
  attempt: ReturnType<typeof startAssessmentAttempt>,
): AttemptRow {
  return {
    assessment_id: attempt.assessmentId,
    assessment_version: attempt.assessmentVersion,
    auto_marks: 0,
    deadline_at: attempt.deadlineAt,
    id: attempt.id,
    learner_person_id: attempt.learnerPersonId,
    manual_marks: 0,
    maximum_marks: attempt.maxMarks,
    released_at: null,
    started_at: attempt.startedAt,
    status: attempt.status,
    submitted_at: null,
    tenant_id: attempt.tenantId,
  };
}

type AttemptRow = {
  assessment_id: string;
  assessment_version: number;
  auto_marks: number;
  deadline_at: string;
  id: string;
  learner_person_id: string;
  manual_marks: number;
  maximum_marks: number;
  released_at: string | null;
  started_at: string;
  status: AssessmentAttemptStatus;
  submitted_at: string | null;
  tenant_id: string;
};

