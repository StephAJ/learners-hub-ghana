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
import { lineFromAnswerKey } from "../domain/assessment/bracketed";
import type {
  Assessment,
  AssessmentAttemptStatus,
  AssessmentPurpose,
  AssessmentQuestionSnapshot,
  FeedbackPolicy,
  MarkedQuestionResponse,
  QuestionAnswerKey,
  QuestionMedia,
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
  seededDemoOfferingIds,
} from "./learning-repository";
import { validateUpload } from "../domain/content/content-policy";
import { scanUpload } from "../server/content-scan";
import type { MediaKind } from "../domain/content/types";
import { getMediaStore, getSchoolDatabase } from "./index";
import {
  demoAssessmentBySlug,
  demoAssessmentQuestions,
  demoAssessments,
  demoQuestionBank,
  demoSubjectByOffering,
  type DemoAssessment,
} from "../domain/demo/greenfield";
import type { SchoolDatabase, SchoolStatement } from "./school-database";

import {
  linkAssessmentToMarkbook,
  recordReleasedResultInMarkbook,
} from "./assessment-markbook";
import { demoSchoolEnabled } from "../server/demo-school";
import { SCHOOL_TENANT_ID } from "../server/school-tenant";

/* The one school this deployment serves. Was the literal
   "tenant-greenfield" — the demo school's own id — written out here and
   in five other files. */
const TENANT_ID = SCHOOL_TENANT_ID;
export const DIGESTION_ASSESSMENT_ID = "assessment-digestion-check";

import {
  loadTeachingOfferings,
  selectOffering,
  type TeachingOffering,
} from "./teaching-offerings";

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
    /* A file-upload question is marked from what the learner handed in, and
       its written answer is empty by design. Without these the marker saw an
       empty quotation and had nothing to award marks against. */
    attachments: ResponseAttachment[];
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
  /* Every subject this teacher may write questions for, the selected one
     included. The workspace named one offering and gated on the constant
     SCIENCE_OFFERING_ID, so a teacher of any other subject was refused at the
     door rather than shown their own question bank. */
  offerings: TeachingOffering[];
  reviewQueue: ReviewAttempt[];
  /* The subject's curriculum outcomes, so the composer can ask which ones a
     question is evidence for. Without this the mastery picture stays empty
     however many questions a teacher writes. */
  standards: Array<{ code: string; description: string; id: string }>;
  subjectName: string;
  typeCoverage: number;
};

export type LearnerQuestion = Omit<AssessmentQuestionSnapshot, "answerKey">;

/** A file handed in as the answer to one question. */
export type ResponseAttachment = {
  contentType: string;
  filename: string;
  id: string;
  questionId: string;
  sizeBytes: number;
  uploadedAt: string;
};

/* Six, the same ceiling handed-in assignment work uses. A learner
   photographing a page at a time reaches it honestly; a hundred files against
   one question is a mistake or a stuck button. */
const MAX_RESPONSE_ATTACHMENTS = 6;

/* ==========================================================================
   What a learner is told about their own paper

   The result used to be three numbers: score, maximum, and whether it had been
   released. A teacher would write feedback against each written answer —
   assessment_responses.feedback, stored on marking — and the learner never saw
   a word of it. Nor which questions they got right, nor what the right answer
   was. The most useful thing in the whole assessment subsystem was written to
   the database and thrown away.

   Visibility is the feedback policy's to decide, not this type's: see
   reviewVisible(). A question is only ever accompanied by its correct answer
   once the policy allows it, because the answer key is the one thing that
   cannot be un-shown.
   ========================================================================== */
export type LearnerQuestionReview = {
  awardedMarks: number;
  /** The teacher's own words, where they wrote any. */
  feedback: string;
  /** Present only once the policy allows the key to be shown. */
  correctAnswer?: string;
  markingStatus: MarkedQuestionResponse["markingStatus"];
  maximumMarks: number;
  questionId: string;
};

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
  /* Which subject set it, so the runner can send the learner back to it. The
     finished screen linked at the demo Integrated Science slug, so every
     assessment in every subject offered "Return to Integrated Science". */
  offeringId: string;
  passMarkPercent: number;
  purpose: AssessmentPurpose;
  questions: LearnerQuestion[];
  /** Files handed in against file-upload questions in this attempt. */
  responseAttachments: ResponseAttachment[];
  result: {
    maximumMarks: number;
    released: boolean;
    score: number;
  } | null;
  /* Empty until the paper's feedback policy allows a review. */
  review: LearnerQuestionReview[];
  timeLimitMinutes: number;
  title: string;
  version: number;
};

export type CreateBankQuestionInput = {
  correctAnswer: string;
  difficulty: QuestionBankSummary["difficulty"];
  /** TeX, in the subset the runner draws. */
  formula?: string;
  marks: number;
  /** A diagram the question is about. Both fields are required together. */
  media?: QuestionMedia;
  options: string[];
  prompt: string;
  rationale: string;
  topic: string;
  type: QuestionType;
};

export type CreateAssessmentInput = {
  feedbackPolicy?: FeedbackPolicy;
  instructions: string;
  passMarkPercent: number;
  purpose: AssessmentPurpose;
  questionIds: string[];
  timeLimitMinutes: number;
  title: string;
};

export async function listTeacherAssessmentWorkspace(
  access: AccessContext,
  requestedOfferingId?: string,
): Promise<TeacherAssessmentWorkspace> {
  requireAssessmentPermission(access);
  await ensureAssessmentFoundation();
  const database = await getSchoolDatabase();
  const offering = await requireOffering(
    database,
    access,
    requestedOfferingId,
  );
  const offerings = await loadTeachingOfferings(database, access);

  const [bank, assessments, reviewQueue, standards] = await Promise.all([
    loadQuestionBank(database, access.tenantId, offering.id),
    loadAssessmentSummaries(database, access.tenantId, offering.id),
    loadReviewQueue(database, access.tenantId, offering.id),
    loadOfferingStandards(database, access.tenantId, offering.id),
  ]);

  return {
    assessments,
    bank,
    className: offering.className,
    code: offering.subjectCode,
    offeringId: offering.id,
    offerings,
    reviewQueue,
    standards,
    subjectName: offering.subjectName,
    typeCoverage: new Set(bank.map((question) => question.type)).size,
  };
}

/** The subject's curriculum outcomes, for the composer's standards picker. */
async function loadOfferingStandards(
  database: SchoolDatabase,
  tenantId: string,
  offeringId: string,
): Promise<Array<{ code: string; description: string; id: string }>> {
  const result = await database
    .prepare(
      `SELECT id, code, description
      FROM curriculum_standards
      WHERE tenant_id = ? AND offering_id = ? AND status <> 'retired'
      ORDER BY position, code`,
    )
    .bind(tenantId, offeringId)
    .all<{ code: string; description: string; id: string }>();
  return result.results ?? [];
}

/* The offering a request is about, or a refusal saying which of the two
   things went wrong: holding no subjects at all, and asking for one that is
   not yours, are different problems with different fixes. */
async function requireOffering(
  database: SchoolDatabase,
  access: AccessContext,
  requestedOfferingId?: string,
): Promise<TeachingOffering> {
  const offerings = await loadTeachingOfferings(database, access);
  if (offerings.length === 0) {
    throw new AuthorizationError(
      "No subject offering is assigned to your account. An administrator assigns subjects on the Academics screen.",
    );
  }
  if (requestedOfferingId && !canTeachOffering(access, requestedOfferingId)) {
    throw new AuthorizationError(
      "You are not assigned to this subject offering.",
    );
  }
  const offering = selectOffering(offerings, requestedOfferingId);
  if (!offering) {
    throw new AuthorizationError(
      "You are not assigned to this subject offering.",
    );
  }
  return offering;
}

export async function createBankQuestion(
  access: AccessContext,
  input: CreateBankQuestionInput,
  requestedOfferingId?: string,
): Promise<QuestionBankSummary> {
  await ensureAssessmentFoundation();
  validateQuestionInput(input);
  const database = await getSchoolDatabase();
  const offering = await requireOffering(
    database,
    access,
    requestedOfferingId,
  );
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
        offering.id,
        access.actorPersonId,
        input.type,
        input.difficulty,
        input.topic.trim(),
      ),
    database
      .prepare(
        `INSERT INTO question_versions
          (id, tenant_id, question_id, version, prompt, options, answer_key, rationale, media, formula, marks, status, created_by_person_id)
        VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)`,
      )
      .bind(
        questionVersionId,
        access.tenantId,
        questionId,
        input.prompt.trim(),
        JSON.stringify(options),
        JSON.stringify(answerKey),
        input.rationale.trim(),
        /* An image without a description is refused rather than stored, so a
           question can never reach a learner who cannot perceive it. */
        input.media?.url && input.media.alt?.trim()
          ? JSON.stringify(input.media)
          : null,
        input.formula?.trim() || null,
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
  requestedOfferingId?: string,
): Promise<AssessmentSummary> {
  await ensureAssessmentFoundation();
  validateAssessmentInput(input);
  const database = await getSchoolDatabase();
  const offering = await requireOffering(
    database,
    access,
    requestedOfferingId,
  );
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
        v.media,
        v.formula,
        v.marks
      FROM question_bank_items q
      INNER JOIN question_versions v
        ON v.question_id = q.id AND v.version = q.current_version
      WHERE q.tenant_id = ?
        AND q.offering_id = ?
        AND q.status = 'approved'
        AND q.id IN (${placeholders})`,
    )
    .bind(access.tenantId, offering.id, ...uniqueQuestionIds)
    .all<{
      answer_key: string;
      current_version: number;
      formula: string | null;
      id: string;
      marks: number;
      media: string | null;
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
    /* Practice papers show their marking as soon as the learner submits;
       anything that counts waits for the teacher. The default is the strict
       one — an unset policy must never leak an answer key. */
    feedbackPolicy: input.feedbackPolicy ?? "after-release",
    id: crypto.randomUUID(),
    instructions: input.instructions.trim(),
    offeringId: offering.id,
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
      formula: row.formula ?? undefined,
      id: row.id,
      marks: row.marks,
      /* Frozen into the paper's snapshot with everything else, so a published
         question keeps the diagram it was published with. */
      media: row.media
        ? parseJson<QuestionMedia | undefined>(row.media, undefined)
        : undefined,
      /* The public half of a number-line key, lifted onto the snapshot so it
         survives the key being stripped for the learner. */
      line: lineFromAnswerKey(row.type, parseJson(row.answer_key, {})),
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
        VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, 1, 0, ?, 'draft', ?)`,
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
        draft.feedbackPolicy,
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
  const database = await getSchoolDatabase();
  const draft = await loadAssessment(
    database,
    access.tenantId,
    assessmentId,
  );
  /* A file-response paper used to be refused here — "File-response quizzes
     require secure school file storage before publication" — so a teacher
     could write the question and never use it. That storage is the same one
     lesson media and handed-in assignment work already use; what was missing
     was the join between an answer and an asset, which
     assessment_response_attachments now carries. */
  const published = publishAssessment(access, draft, new Date().toISOString());
  const versionId = `${assessmentId}:v${published.version}`;

  await database.batch([
    database
      .prepare(
        `INSERT INTO assessment_versions
          (id, tenant_id, assessment_id, version, title, purpose, instructions, time_limit_minutes, pass_mark_percent, attempts_allowed, shuffle_questions, feedback_policy, status, published_at, created_by_person_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, 'published', ?, ?)`,
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
        published.feedbackPolicy,
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

  /* After the batch, and outside it. A paper that publishes and then fails to
     reach the markbook is a paper the teacher can still set; a markbook column
     that exists for a paper nobody can sit is neither. */
  await linkAssessmentToMarkbook(access, {
    assessmentId: published.id,
    offeringId: draft.offeringId,
    title: published.title,
    totalMarks: totalMarks(published.questions),
  });

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
  subjectName: string;
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
        s.name AS subject_name,
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
      INNER JOIN subject_offerings o ON o.id = a.offering_id
      INNER JOIN subjects s ON s.id = o.subject_id
      /* Scoped to the classes this learner is in. Without this join the
         query returned every published paper in the school, so a JHS 2
         learner's assessment list carried SHS 1 papers they could open —
         and the page had to ask a demo lookup what subject each one was,
         because nothing here told it. */
      INNER JOIN tenant_memberships m
        ON m.tenant_id = a.tenant_id AND m.scope_id = o.class_name
        AND m.person_id = ? AND m.status = 'active' AND m.scope_type = 'class'
      WHERE a.tenant_id = ? AND v.status = 'published'
      ORDER BY a.updated_at DESC`,
    )
    .bind(access.actorPersonId, access.actorPersonId, access.tenantId)
    .all<{
      attempt_status: AssessmentAttemptStatus | null;
      id: string;
      offering_id: string;
      purpose: AssessmentPurpose;
      question_count: number;
      subject_name: string;
      time_limit_minutes: number;
      title: string;
      total_marks: number;
    }>();

  return result.results.map((row) => ({
    id: row.id,
    offeringId: row.offering_id,
    purpose: row.purpose,
    subjectName: row.subject_name,
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
  const [responses, attachments] = attempt
    ? await Promise.all([
        loadAttemptResponseValues(database, access.tenantId, attempt.id),
        loadResponseAttachments(database, access.tenantId, attempt.id),
      ])
    : [{}, []];

  /* The marks and the teacher's words, when the paper's policy allows them.
     Loaded rather than assembled from the snapshot so a question a teacher
     re-marked shows the mark they gave, not the one the machine did. */
  const review =
    attempt && reviewVisible(assessment.feedbackPolicy, attempt.status)
      ? await loadAttemptReview(
          database,
          access.tenantId,
          attempt.id,
          assessment,
        )
      : [];

  return toLearnerAssessment(
    assessment,
    attempt,
    responses,
    attachments,
    review,
  );
}

/**
 * Whether this learner may see their marks yet.
 *
 * The whole point of the policy column, which had never been read. An
 * in-progress attempt is never reviewable whatever the policy says: a paper
 * that shows the answer to question three while question four is still open is
 * not an assessment.
 */
function reviewVisible(
  policy: FeedbackPolicy,
  status: AssessmentAttemptStatus,
): boolean {
  if (status === "in-progress" || status === "invalidated") return false;
  if (policy === "after-release") return status === "released";
  /* immediate and after-attempt both mean "once it is handed in" here; the
     difference between them is inside the runner, which may show a mark as
     each answer is given. */
  return true;
}

async function loadAttemptReview(
  database: SchoolDatabase,
  tenantId: string,
  attemptId: string,
  assessment: Assessment,
): Promise<LearnerQuestionReview[]> {
  const result = await database
    .prepare(
      `SELECT
        qv.question_id,
        r.auto_marks,
        r.manual_marks,
        r.marking_status,
        r.feedback,
        qv.marks AS maximum_marks
      FROM assessment_responses r
      INNER JOIN question_versions qv ON qv.id = r.question_version_id
      WHERE r.tenant_id = ? AND r.attempt_id = ?`,
    )
    .bind(tenantId, attemptId)
    .all<{
      auto_marks: number | null;
      feedback: string | null;
      manual_marks: number | null;
      marking_status: MarkedQuestionResponse["markingStatus"];
      maximum_marks: number;
      question_id: string;
    }>();

  const byId = new Map(
    assessment.questions.map((question) => [question.id, question]),
  );

  return result.results.map((row) => ({
    awardedMarks:
      Number(row.manual_marks ?? 0) > 0
        ? Number(row.manual_marks)
        : Number(row.auto_marks ?? 0),
    correctAnswer: describeAnswerKey(byId.get(row.question_id)),
    feedback: row.feedback ?? "",
    markingStatus: row.marking_status,
    maximumMarks: Number(row.maximum_marks),
    questionId: row.question_id,
  }));
}

/**
 * The answer key as something a learner can read.
 *
 * The key is one shape — `{ value }` — holding whatever the question type
 * needs: an option id, a list of them, a number, a set of pairs, a sequence.
 * A learner is owed the answer rather than the JSON, so each shape gets a
 * sentence, and the option ids are resolved to the words the learner saw.
 *
 * Returns "" for a question with no machine-checkable answer. An essay's
 * "correct answer" is the teacher's feedback, which is carried separately.
 */
function describeAnswerKey(
  question: AssessmentQuestionSnapshot | undefined,
): string {
  if (!question) return "";
  const { value } = question.answerKey;
  if (value === null || value === undefined || value === "") return "";

  const label = (optionId: unknown) =>
    question.options.find((option) => option.id === optionId)?.label ??
    String(optionId);

  if (question.type === "true-false") {
    return value === true || value === "true" ? "True" : "False";
  }
  if (question.type === "single-choice") return label(value);
  if (question.type === "multiple-choice" && Array.isArray(value)) {
    return value.map(label).join(", ");
  }
  if (question.type === "cloze" && Array.isArray(value)) {
    return value.map(label).join(", ");
  }
  if (question.type === "number-line" && value && typeof value === "object") {
    return String((value as { value?: unknown }).value ?? "");
  }
  if (question.type === "ordering" && Array.isArray(value)) {
    return value.map(label).join(" → ");
  }
  if (
    (question.type === "matching" || question.type === "grouping") &&
    value &&
    typeof value === "object"
  ) {
    return Object.entries(value as Record<string, unknown>)
      .map(([left, right]) => `${label(left)} → ${label(right)}`)
      .join(", ");
  }
  /* A table's keys are cell coordinates and its values are typed words, so
     neither half is an option to look up — it reads as the cells themselves. */
  if (question.type === "table" && value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([cell, entry]) => `${cell} = ${String(entry)}`)
      .join(", ");
  }
  return String(value);
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
    const [responses, attachments] = await Promise.all([
      loadAttemptResponseValues(database, access.tenantId, existing.id),
      loadResponseAttachments(database, access.tenantId, existing.id),
    ]);
    return toLearnerAssessment(assessment, existing, responses, attachments);
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
    await loadResponseAttachments(database, access.tenantId, attemptId),
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
  if (!canTeachOffering(access, row.offering_id)) {
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
  /* The queue that comes back is the one the marked response belongs to, not
     whichever subject sorts first. */
  return loadReviewQueue(database, access.tenantId, row.offering_id);
}

export async function releasePersistentResult(
  access: AccessContext,
  attemptId: string,
): Promise<ReviewAttempt[]> {
  await ensureAssessmentFoundation();
  const database = await getSchoolDatabase();
  const attempt = await database
    .prepare(
      `SELECT aa.status, aa.assessment_id, a.offering_id
      FROM assessment_attempts aa
      INNER JOIN assessments a ON a.id = aa.assessment_id
      WHERE aa.id = ? AND aa.tenant_id = ?
      LIMIT 1`,
    )
    .bind(attemptId, access.tenantId)
    .first<{
      assessment_id: string;
      offering_id: string;
      status: AssessmentAttemptStatus;
    }>();
  if (!attempt) throw new AssessmentPolicyError("Attempt was not found.");
  if (!canTeachOffering(access, attempt.offering_id)) {
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

  /* Releasing is the moment the result stands, so it is the moment it reaches
     the markbook. Nothing did this: the teacher marked the paper and then
     typed the same figures in by hand. */
  await recordReleasedResultInMarkbook(access, {
    assessmentId: attempt.assessment_id,
    attemptId,
  });

  return loadReviewQueue(database, access.tenantId, attempt.offering_id);
}

export async function ensureAssessmentFoundation() {
  /* Also what runs the migrations, so it stays above the gate. */
  await ensureLearningFoundation();
  /* A school's question bank and its papers are its own. */
  if (!demoSchoolEnabled()) return;

  const database = await getSchoolDatabase();
  /* Only the offerings the learning seed actually created. A question bank item
     carries offering_id across a foreign key, so a paper written for an
     offering the school owns under its own id has nothing to attach to — see
     seededDemoOfferingIds(). */
  const seeded = await seededDemoOfferingIds();
  const questions = demoQuestionBank.filter((question) =>
    seeded.has(question.offeringId),
  );
  const assessments = demoAssessments.filter((assessment) =>
    seeded.has(assessment.offeringId),
  );

  const publishedQuiz = demoAssessmentBySlug("digestive-system-check")!;
  /* The published paper's snapshots, which the review attempt marks against.
     The attempt goes in only when its paper did. */
  const publishedQuizQuestions = assessments.includes(publishedQuiz)
    ? assessmentSnapshots(publishedQuiz)
    : [];
  await database.batch([
    ...seedQuestions(database, questions),
    ...seedAssessments(database, assessments),
    ...seedReviewAttempt(database, publishedQuizQuestions),
  ]);
}

/** A paper's questions in the shape the schema snapshots them. */
function assessmentSnapshots(
  assessment: DemoAssessment,
): AssessmentQuestionSnapshot[] {
  return demoAssessmentQuestions(assessment).map((question, index) => ({
    answerKey: question.answerKey,
    formula: question.formula,
    id: question.id,
    marks: question.marks,
    media: question.media,
    options: question.options,
    position: index + 1,
    prompt: question.prompt,
    questionVersion: 1,
    type: question.type,
  }));
}

function seedQuestions(
  database: SchoolDatabase,
  bank: typeof demoQuestionBank,
) {
  /* The bank comes from the shared dataset, which also renders the paper a
     learner sits. It used to be defined here as well, so the two could — and
     did — drift: the fractions homework defined in the dataset never reached
     the database at all. */
  const statements: SchoolStatement[] = [];
  for (const question of bank) {
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

    /* What the question is evidence for. Cited by code in the dataset — the
       way lessons cite standards — and resolved against the subject's own
       list here, so a code that does not belong to this subject is dropped
       rather than seeded into another subject's mastery picture.

       Without these rows the progress screen is honest but empty: every
       outcome reads "covered in class, not tested yet" however many papers a
       learner sits. */
    for (const code of question.standardCodes) {
      const standard = subject?.standards.find(
        (candidate) => candidate.code === code,
      );
      if (!standard) continue;
      statements.push(
        database
          .prepare(
            `INSERT OR IGNORE INTO question_standard_links
              (id, tenant_id, question_id, standard_id)
            VALUES (?, ?, ?, ?)`,
          )
          .bind(
            `${question.id}:${standard.id}`,
            TENANT_ID,
            question.id,
            standard.id,
          ),
      );
    }
  }
  return statements;
}

function seedAssessments(
  database: SchoolDatabase,
  papers: typeof demoAssessments,
) {
  const statements: SchoolStatement[] = [];
  for (const assessment of papers) {
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

async function loadQuestionBank(
  database: SchoolDatabase,
  tenantId: string,
  offeringId: string,
) {
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
    .bind(tenantId, offeringId)
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
  offeringId: string,
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
        /* No subject name here. It was selected as "s.name AS subject_name"
           with nothing joined as s, which PostgreSQL refuses outright — so
           every call to this failed with "missing FROM-clause entry for table
           s" and the whole teacher Assessments screen with it. Nothing read
           the column: the row type never declared it and the mapping below
           never returned it. The workspace gets its subject name from the
           offering it already resolved. */
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
    .bind(tenantId, offeringId)
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

async function loadReviewQueue(
  database: SchoolDatabase,
  tenantId: string,
  offeringId: string,
) {
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
        qv.question_id,
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
    .bind(tenantId, offeringId)
    .all<{
      attempt_id: string;
      learner_name: string;
      maximum_marks: number;
      prompt: string | null;
      question_id: string | null;
      question_version_id: string | null;
      response: string | null;
      response_maximum_marks: number | null;
      score: number;
      status: AssessmentAttemptStatus;
      submitted_at: string;
      title: string;
    }>();
  const attachments = await loadReviewAttachments(
    database,
    tenantId,
    result.results.map((row) => row.attempt_id),
  );

  return result.results.map((row) => ({
    attemptId: row.attempt_id,
    learnerName: row.learner_name,
    maximumMarks: Number(row.maximum_marks),
    response:
      row.question_version_id && row.prompt && row.response_maximum_marks
        ? {
            attachments: (
              attachments.get(row.attempt_id) ?? []
            ).filter((file) => file.questionId === row.question_id),
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

/** Every attempt's handed-in files in one query, rather than one per row. */
async function loadReviewAttachments(
  database: SchoolDatabase,
  tenantId: string,
  attemptIds: string[],
): Promise<Map<string, ResponseAttachment[]>> {
  const byAttempt = new Map<string, ResponseAttachment[]>();
  const unique = [...new Set(attemptIds)];
  if (unique.length === 0) return byAttempt;

  const placeholders = unique.map(() => "?").join(", ");
  const result = await database
    .prepare(
      `SELECT a.id, a.attempt_id, a.question_id, a.uploaded_at,
        m.original_filename, m.content_type, m.size_bytes
      FROM assessment_response_attachments a
      INNER JOIN media_assets m ON m.id = a.media_asset_id
      WHERE a.tenant_id = ? AND m.status = 'ready'
        AND a.attempt_id IN (${placeholders})
      ORDER BY a.uploaded_at`,
    )
    .bind(tenantId, ...unique)
    .all<{
      attempt_id: string;
      content_type: string;
      id: string;
      original_filename: string;
      question_id: string;
      size_bytes: number;
      uploaded_at: string;
    }>();

  for (const row of result.results) {
    const list = byAttempt.get(row.attempt_id) ?? [];
    list.push({
      contentType: row.content_type,
      filename: row.original_filename,
      id: row.id,
      questionId: row.question_id,
      sizeBytes: Number(row.size_bytes),
      uploadedAt: row.uploaded_at,
    });
    byAttempt.set(row.attempt_id, list);
  }
  return byAttempt;
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
        v.feedback_policy,
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
      feedback_policy: FeedbackPolicy;
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
    feedbackPolicy: row.feedback_policy ?? "after-release",
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

/** A question as the learner may see it: everything but the answer key. */
function toLearnerQuestion({
  answerKey,
  ...question
}: AssessmentQuestionSnapshot): LearnerQuestion {
  void answerKey;
  return question;
}

function toLearnerAssessment(
  assessment: Assessment,
  attempt: AttemptRow | null,
  responses: Record<string, QuestionResponse>,
  responseAttachments: ResponseAttachment[] = [],
  review: LearnerQuestionReview[] = [],
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
    offeringId: assessment.offeringId,
    passMarkPercent: assessment.passMarkPercent,
    purpose: assessment.purpose,
    /* Everything except the answer key. Written as a rest-destructure rather
       than by listing the fields to keep: the field list silently dropped the
       question's diagram and formula on the way out, and would drop whatever
       is added next. The omission of answerKey is the point, so it is the only
       thing stated. */
    questions: assessment.questions.map(toLearnerQuestion),
    responseAttachments,
    review,
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
      "grouping",
      "ordering",
      "cloze",
      "number-line",
      "table",
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
  if (input.type === "cloze") {
    if (splitAuthoredList(input.correctAnswer).length === 0) {
      throw new AssessmentPolicyError(
        "A gap-fill question needs at least one word in square brackets.",
      );
    }
  }
  if (input.type === "table") {
    const cells = splitAuthoredList(input.correctAnswer).filter((cell) =>
      cell.includes(PAIR_SEPARATOR),
    );
    if (cells.length === 0) {
      throw new AssessmentPolicyError(
        "A table question needs at least one cell in square brackets for the learner to fill in.",
      );
    }
  }
  if (input.type === "number-line") {
    const [value, min, max] = input.correctAnswer
      .split(PAIR_SEPARATOR)
      .map((part) => Number(part.trim()));
    if (![value, min, max].every(Number.isFinite)) {
      throw new AssessmentPolicyError(
        "A number line needs a start, an end and the correct value.",
      );
    }
    if (min >= max) {
      throw new AssessmentPolicyError(
        "A number line has to end after it starts.",
      );
    }
    /* An answer nobody can point at is not a question. */
    if (value < min || value > max) {
      throw new AssessmentPolicyError(
        "The correct value has to sit on the line.",
      );
    }
  }
  if (input.type === "grouping") {
    const rows = splitAuthoredList(input.correctAnswer).filter((row) =>
      row.includes(PAIR_SEPARATOR),
    );
    if (rows.length < 2) {
      throw new AssessmentPolicyError(
        "A sorting question needs at least two items and the group each belongs in.",
      );
    }
    const groups = new Set(
      rows.map((row) => row.split(PAIR_SEPARATOR)[1]?.trim().toLowerCase()),
    );
    if (groups.size < 2) {
      throw new AssessmentPolicyError(
        "A sorting question needs at least two different groups.",
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
  /* A passage's answers, in gap order. Compared exactly, like ordering: the
     third gap's word belongs in the third gap. */
  if (input.type === "cloze") {
    return {
      value: splitAuthoredList(input.correctAnswer).map((word) =>
        slugify(word),
      ),
    };
  }

  /* A table is a set of filled cells keyed "row:column", so it shares the map
     shape matching and sorting use — but the values are the words a learner
     types, not option ids, so they are stored as written rather than
     slugified. Marking normalises case and spacing. */
  if (input.type === "table") {
    return {
      value: Object.fromEntries(
        splitAuthoredList(input.correctAnswer)
          .map((cell) => cell.split(PAIR_SEPARATOR))
          .filter((parts) => parts.length === 2)
          .map(([key, answer]) => [key.trim(), answer.trim()]),
      ),
    };
  }

  /* Value, range and tolerance in one field, because the line a learner is
     shown is part of the question rather than a display setting. */
  if (input.type === "number-line") {
    const [value, min, max, tolerance] = input.correctAnswer
      .split(PAIR_SEPARATOR)
      .map((part) => part.trim());
    return {
      tolerance: Number(tolerance) || 0,
      value: {
        max: Number(max) || 0,
        min: Number(min) || 0,
        value: Number(value) || 0,
      },
    };
  }

  if (input.type === "matching" || input.type === "grouping") {
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


/* ==========================================================================
   Files handed in as an answer

   Mirrors attachLearnerSubmissionFile() in db/operations-repository.ts, which
   has done the same job for assignment work since before this existed. The
   rules match because the risks match: a learner may attach only to their own
   attempt, only while it is still open, and only a document or a photograph
   of one. The kind is inferred here rather than taken from the client, which
   has no business choosing how its own upload is validated.
   ========================================================================== */

export async function attachAssessmentResponseFile(
  access: AccessContext,
  input: { attemptId: string; file: File; questionId: string },
): Promise<LearnerAssessment> {
  requireActiveMembership(access);
  await ensureAssessmentFoundation();
  const database = await getSchoolDatabase();
  const attempt = await requireOwnOpenAttempt(database, access, input.attemptId);

  const question = attempt.questions.find(
    (item) => item.id === input.questionId,
  );
  if (!question || question.type !== "file-upload") {
    throw new AssessmentPolicyError(
      "That question does not take a file answer.",
    );
  }

  const existing = await database
    .prepare(
      `SELECT COUNT(*) AS total FROM assessment_response_attachments
      WHERE tenant_id = ? AND attempt_id = ? AND question_id = ?`,
    )
    .bind(access.tenantId, input.attemptId, input.questionId)
    .first<{ total: number | string }>();
  if (Number(existing?.total ?? 0) >= MAX_RESPONSE_ATTACHMENTS) {
    throw new AssessmentPolicyError(
      `An answer can carry at most ${MAX_RESPONSE_ATTACHMENTS} files.`,
    );
  }

  const contentType = input.file.type || "application/octet-stream";
  const kind: MediaKind = contentType.startsWith("image/")
    ? "image"
    : "document";
  const validated = validateUpload({
    contentType,
    filename: input.file.name,
    kind,
    sizeBytes: input.file.size,
  });
  /* Read once, checked, then written from the same bytes. The extension and
     the content type both come from the browser, so both come from whoever is
     uploading — this is the first thing in the pipeline that looks at what is
     actually in the file. */
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  await scanUpload({ bytes, extension: validated.extension, kind });

  const assetId = crypto.randomUUID();
  const objectKey = [
    access.tenantId,
    attempt.offeringId,
    `${assetId}.${validated.extension}`,
  ].join("/");
  const bucket = await getMediaStore();
  /* The bytes already read for the scan, rather than a second pass over
     the same 25 MB. */
  await bucket.put(objectKey, bytes, {
    customMetadata: {
      assetId,
      offeringId: attempt.offeringId,
      tenantId: access.tenantId,
    },
    httpMetadata: { contentType },
  });

  /* The object goes down first and is removed again if the rows fail: a media
     row pointing at bytes that are not there is the worse half-state, because
     nothing later can tell it apart from a file the learner really sent. */
  try {
    await database.batch([
      database
        .prepare(
          `INSERT INTO media_assets
            (id, tenant_id, offering_id, uploaded_by_person_id, kind,
             original_filename, content_type, size_bytes, object_key, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready')`,
        )
        .bind(
          assetId,
          access.tenantId,
          attempt.offeringId,
          access.actorPersonId,
          kind,
          validated.filename,
          contentType,
          input.file.size,
          objectKey,
        ),
      database
        .prepare(
          `INSERT INTO assessment_response_attachments
            (id, tenant_id, attempt_id, question_id, media_asset_id)
          VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          access.tenantId,
          input.attemptId,
          input.questionId,
          assetId,
        ),
    ]);
  } catch (error) {
    await bucket.delete(objectKey);
    throw error;
  }

  return getLearnerAssessment(access, attempt.assessmentId);
}

export async function removeAssessmentResponseFile(
  access: AccessContext,
  input: { attachmentId: string; attemptId: string },
): Promise<LearnerAssessment> {
  requireActiveMembership(access);
  await ensureAssessmentFoundation();
  const database = await getSchoolDatabase();
  const attempt = await requireOwnOpenAttempt(database, access, input.attemptId);

  const row = await database
    .prepare(
      `SELECT a.id, a.media_asset_id, m.object_key
      FROM assessment_response_attachments a
      INNER JOIN media_assets m ON m.id = a.media_asset_id
      WHERE a.tenant_id = ? AND a.id = ? AND a.attempt_id = ?
      LIMIT 1`,
    )
    .bind(access.tenantId, input.attachmentId, input.attemptId)
    .first<{ id: string; media_asset_id: string; object_key: string }>();
  if (!row) {
    throw new AssessmentPolicyError("That file is not part of this answer.");
  }

  await database.batch([
    database
      .prepare(
        `DELETE FROM assessment_response_attachments
        WHERE tenant_id = ? AND id = ?`,
      )
      .bind(access.tenantId, input.attachmentId),
    database
      .prepare(
        `UPDATE media_assets SET status = 'deleted'
        WHERE tenant_id = ? AND id = ?`,
      )
      .bind(access.tenantId, row.media_asset_id),
  ]);
  const bucket = await getMediaStore();
  await bucket.delete(row.object_key).catch(() => undefined);

  return getLearnerAssessment(access, attempt.assessmentId);
}

/**
 * The attempt, if it belongs to this learner and is still open.
 *
 * Once an attempt is handed in its contents are what the teacher is marking,
 * so a page added afterwards is a change no marker could see happen.
 */
async function requireOwnOpenAttempt(
  database: SchoolDatabase,
  access: AccessContext,
  attemptId: string,
): Promise<{
  assessmentId: string;
  id: string;
  offeringId: string;
  questions: AssessmentQuestionSnapshot[];
}> {
  const row = await database
    .prepare(
      `SELECT at.id, at.assessment_id, at.status, a.offering_id
      FROM assessment_attempts at
      INNER JOIN assessments a ON a.id = at.assessment_id
      WHERE at.tenant_id = ? AND at.id = ? AND at.learner_person_id = ?
      LIMIT 1`,
    )
    .bind(access.tenantId, attemptId, access.actorPersonId)
    .first<{
      assessment_id: string;
      id: string;
      offering_id: string;
      status: AssessmentAttemptStatus;
    }>();
  if (!row) {
    throw new AssessmentPolicyError("That attempt was not found.");
  }
  if (row.status !== "in-progress") {
    throw new AssessmentPolicyError("This attempt has already been handed in.");
  }
  const assessment = await loadAssessment(
    database,
    access.tenantId,
    row.assessment_id,
  );
  return {
    assessmentId: row.assessment_id,
    id: row.id,
    offeringId: row.offering_id,
    questions: assessment.questions,
  };
}

/**
 * Serves one file handed in as an answer.
 *
 * Not served through /api/content/media: that route authorises by subject
 * offering, which every learner in the class shares, so one learner's answer
 * would be readable by any classmate holding an asset id. The owner is
 * resolved first, and anyone else must teach the offering it was set for.
 */
export async function getResponseAttachmentResponse(
  access: AccessContext,
  attachmentId: string,
): Promise<Response> {
  await ensureAssessmentFoundation();
  const database = await getSchoolDatabase();
  const row = await database
    .prepare(
      `SELECT m.object_key, m.content_type, m.original_filename, m.size_bytes,
        at.learner_person_id, a.offering_id
      FROM assessment_response_attachments t
      INNER JOIN assessment_attempts at ON at.id = t.attempt_id
      INNER JOIN assessments a ON a.id = at.assessment_id
      INNER JOIN media_assets m ON m.id = t.media_asset_id
      WHERE t.id = ? AND t.tenant_id = ?
      LIMIT 1`,
    )
    .bind(attachmentId, access.tenantId)
    .first<{
      content_type: string;
      learner_person_id: string;
      object_key: string;
      offering_id: string;
      original_filename: string;
      size_bytes: number;
    }>();
  if (!row) return new Response("Attachment not found.", { status: 404 });

  const isOwner = access.actorPersonId === row.learner_person_id;
  if (!isOwner && !canTeachOffering(access, row.offering_id)) {
    throw new AuthorizationError("You are not authorised to read this answer.");
  }

  const bucket = await getMediaStore();
  const object = await bucket.get(row.object_key);
  if (!object) return new Response("Attachment not found.", { status: 404 });

  return new Response(object.body, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
        row.original_filename,
      )}`,
      "content-length": String(row.size_bytes),
      "content-type": row.content_type,
      "x-content-type-options": "nosniff",
    },
  });
}

async function loadResponseAttachments(
  database: SchoolDatabase,
  tenantId: string,
  attemptId: string,
): Promise<ResponseAttachment[]> {
  const result = await database
    .prepare(
      `SELECT a.id, a.question_id, a.uploaded_at,
        m.original_filename, m.content_type, m.size_bytes
      FROM assessment_response_attachments a
      INNER JOIN media_assets m ON m.id = a.media_asset_id
      WHERE a.tenant_id = ? AND a.attempt_id = ? AND m.status != 'deleted'
      ORDER BY a.uploaded_at`,
    )
    .bind(tenantId, attemptId)
    .all<{
      content_type: string;
      id: string;
      original_filename: string;
      question_id: string;
      size_bytes: number;
      uploaded_at: string;
    }>();
  return result.results.map((row) => ({
    contentType: row.content_type,
    filename: row.original_filename,
    id: row.id,
    questionId: row.question_id,
    sizeBytes: Number(row.size_bytes),
    uploadedAt: row.uploaded_at,
  }));
}

/* ==========================================================================
   Editing a question already in the bank

   There was no way to. A question written with a typo, a wrong mark total or
   an option in the wrong order stayed that way for ever, and the only remedy
   was writing a second question and leaving the first in the list.

   It creates a new version rather than rewriting the old one, and that is not
   fastidiousness: `assessment_questions` stores a snapshot of the exact
   version a paper was published with, and an attempt is marked against that
   snapshot. Editing in place would silently restate what a learner sat weeks
   after they sat it. The old version stays, the papers already published stay
   bound to it, and the next paper picks up the new one.
   ========================================================================== */
export async function updateBankQuestion(
  access: AccessContext,
  questionId: string,
  input: CreateBankQuestionInput,
): Promise<QuestionBankSummary> {
  await ensureAssessmentFoundation();
  validateQuestionInput(input);
  const database = await getSchoolDatabase();

  const existing = await database
    .prepare(
      `SELECT id, offering_id, current_version
      FROM question_bank_items
      WHERE id = ? AND tenant_id = ?
      LIMIT 1`,
    )
    .bind(questionId, access.tenantId)
    .first<{ current_version: number; id: string; offering_id: string }>();
  if (!existing) {
    throw new AssessmentPolicyError("That question was not found.");
  }
  if (!canTeachOffering(access, existing.offering_id)) {
    throw new AuthorizationError(
      "You are not assigned to this subject offering.",
    );
  }

  const version = Number(existing.current_version) + 1;
  const options = toQuestionOptions(input.options);
  const answerKey = buildAnswerKey(input, options);

  await database.batch([
    database
      .prepare(
        `INSERT INTO question_versions
          (id, tenant_id, question_id, version, prompt, options, answer_key, rationale, media, formula, marks, status, created_by_person_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)`,
      )
      .bind(
        `${questionId}:v${version}`,
        access.tenantId,
        questionId,
        version,
        input.prompt.trim(),
        JSON.stringify(options),
        JSON.stringify(answerKey),
        input.rationale.trim(),
        input.media?.url && input.media.alt?.trim()
          ? JSON.stringify(input.media)
          : null,
        input.formula?.trim() || null,
        input.marks,
        access.actorPersonId,
      ),
    database
      .prepare(
        `UPDATE question_bank_items
        SET type = ?, difficulty = ?, topic = ?, current_version = ?
        WHERE id = ? AND tenant_id = ?`,
      )
      .bind(
        input.type,
        input.difficulty,
        input.topic.trim(),
        version,
        questionId,
        access.tenantId,
      ),
    auditStatement(
      database,
      access,
      "question.revised",
      "question",
      questionId,
      { version },
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
    version,
  };
}

/** Everything the composer needs to reopen a question for editing. */
export async function getBankQuestion(
  access: AccessContext,
  questionId: string,
): Promise<CreateBankQuestionInput & { id: string; standardIds: string[] }> {
  await ensureAssessmentFoundation();
  const database = await getSchoolDatabase();

  const row = await database
    .prepare(
      `SELECT
        item.id, item.offering_id, item.type, item.difficulty, item.topic,
        version.prompt, version.options, version.answer_key, version.rationale,
        version.media, version.formula, version.marks
      FROM question_bank_items item
      INNER JOIN question_versions version
        ON version.question_id = item.id AND version.version = item.current_version
      WHERE item.id = ? AND item.tenant_id = ?
      LIMIT 1`,
    )
    .bind(questionId, access.tenantId)
    .first<{
      answer_key: string;
      difficulty: QuestionBankSummary["difficulty"];
      formula: string | null;
      id: string;
      marks: number;
      media: string | null;
      offering_id: string;
      options: string;
      prompt: string;
      rationale: string;
      topic: string;
      type: QuestionType;
    }>();
  if (!row) throw new AssessmentPolicyError("That question was not found.");
  if (!canTeachOffering(access, row.offering_id)) {
    throw new AuthorizationError(
      "You are not assigned to this subject offering.",
    );
  }

  const options = parseJson<QuestionOption[]>(row.options, []);
  const answerKey = parseJson<QuestionAnswerKey>(row.answer_key, {});

  return {
    /* The composer edits answers as the words a learner sees, so the stored
       option ids are resolved back to labels on the way out. */
    correctAnswer: answerToText(row.type, answerKey.value, options),
    difficulty: row.difficulty,
    formula: row.formula ?? undefined,
    id: row.id,
    marks: Number(row.marks),
    media: row.media
      ? parseJson<QuestionMedia | undefined>(row.media, undefined)
      : undefined,
    options: options.map((option) => option.label),
    prompt: row.prompt,
    rationale: row.rationale,
    /* So reopening a question shows the outcomes it is already mapped to,
       rather than an empty checklist a teacher would have to fill in again —
       and would silently clear by saving. */
    standardIds: await loadQuestionStandardIds(
      database,
      access.tenantId,
      row.id,
    ),
    topic: row.topic,
    type: row.type,
  };
}

async function loadQuestionStandardIds(
  database: SchoolDatabase,
  tenantId: string,
  questionId: string,
): Promise<string[]> {
  const result = await database
    .prepare(
      `SELECT standard_id
      FROM question_standard_links
      WHERE tenant_id = ? AND question_id = ?`,
    )
    .bind(tenantId, questionId)
    .all<{ standard_id: string }>();
  return (result.results ?? []).map((row) => row.standard_id);
}

/** The stored answer as the composer's single text field. */
function answerToText(
  type: QuestionType,
  value: unknown,
  options: QuestionOption[],
): string {
  const label = (id: unknown) =>
    options.find((option) => option.id === id)?.label ?? String(id ?? "");
  if (value === null || value === undefined) return "";
  if (type === "true-false") {
    return value === true || value === "true" ? "True" : "False";
  }
  if (type === "single-choice") return label(value);
  if (Array.isArray(value)) return value.map(label).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([left, right]) => `${label(left)} = ${label(right)}`)
      .join(", ");
  }
  return String(value);
}
