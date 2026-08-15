import { AuthorizationError } from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import {
  masteryState,
  type MasteryState,
} from "../domain/learning/mastery";
import { requireOfferingContentAccess } from "./content-repository";
import { getSchoolDatabase } from "./index";

/* ==========================================================================
   What a learner can actually do

   The product could report two things about a subject and neither was an
   answer to "how am I getting on": a percentage of lessons opened, and a mark
   out of a hundred on whichever paper was last released. The first measures
   attendance at the material. The second is a single number covering six
   different things, so a learner who is fine at fractions and lost on
   decimals reads 62% and learns nothing they can act on.

   This reports per standard — the curriculum outcomes the school itself
   wrote — and separates two questions that were previously one:

     Have you been taught this?   lessons that map to the standard, completed
     Can you do it?               released marks on questions that test it

   The second is the one that matters, and it is why question_standard_links
   exists. A standard with lessons behind it and no questions is honestly
   reported as taught-but-unevidenced rather than counted as mastered, because
   having read something is not the same as being able to do it, and a screen
   that conflates the two tells a learner they are fine right up until an
   examination says otherwise.

   Only released marks count. An unreleased mark is a teacher's working, and
   surfacing it here would be a way of reading a result the teacher has not
   given back yet.
   ========================================================================== */

export type StandardMastery = {
  /** Released questions answered against this standard. */
  attempted: number;
  code: string;
  /** Of those, the ones fully correct. */
  correct: number;
  description: string;
  lessonsDone: number;
  lessonsTotal: number;
  standardId: string;
  state: MasteryState;
  strand: string;
};

export type SubjectMastery = {
  offeringId: string;
  /** Standards the learner can do, and how many there are in total. */
  secureCount: number;
  standards: StandardMastery[];
  subjectName: string;
};

export async function learnerMastery(
  access: AccessContext,
  input: { learnerPersonId?: string; offeringId: string },
): Promise<SubjectMastery> {
  if (access.membershipStatus !== "active") {
    throw new AuthorizationError("An active school membership is required.");
  }
  const learnerPersonId = input.learnerPersonId ?? access.actorPersonId;

  /* A learner may only ever ask about themselves. Everyone else goes through
     the same offering check every other content read uses, which is what stops
     a teacher reading a learner in a class they do not teach. */
  if (access.role === "learner" && learnerPersonId !== access.actorPersonId) {
    throw new AuthorizationError("You can only see your own progress.");
  }
  await requireOfferingContentAccess(access, input.offeringId);

  const database = await getSchoolDatabase();

  const subject = await database
    .prepare(
      `SELECT s.name AS subject_name
      FROM subject_offerings o
      INNER JOIN subjects s ON s.id = o.subject_id
      WHERE o.tenant_id = ? AND o.id = ?
      LIMIT 1`,
    )
    .bind(access.tenantId, input.offeringId)
    .first<{ subject_name: string }>();

  const standards = await database
    .prepare(
      `SELECT id, code, strand, description
      FROM curriculum_standards
      WHERE tenant_id = ? AND offering_id = ? AND status <> 'retired'
      ORDER BY position, code`,
    )
    .bind(access.tenantId, input.offeringId)
    .all<{
      code: string;
      description: string;
      id: string;
      strand: string;
    }>();

  /* Lessons that map to each standard, and how many the learner has finished.
     Published lessons only: a draft is not something anybody was taught. */
  const taught = await database
    .prepare(
      `SELECT
        link.standard_id,
        COUNT(DISTINCT l.id) AS total,
        COUNT(DISTINCT CASE WHEN p.percent >= 100 THEN l.id END) AS done
      FROM lesson_standard_links link
      INNER JOIN lessons l
        ON l.id = link.lesson_id AND l.status = 'published'
      LEFT JOIN lesson_progress p
        ON p.lesson_id = l.id AND p.learner_person_id = ?
      WHERE link.tenant_id = ? AND l.offering_id = ?
      GROUP BY link.standard_id`,
    )
    .bind(learnerPersonId, access.tenantId, input.offeringId)
    .all<{ done: number; standard_id: string; total: number }>();

  /* Released marks on questions that test each standard.
     "Correct" is full marks on the question rather than any marks at all —
     a partially credited answer is evidence of progress, not of being able to
     do the thing, and this column is read as the latter. */
  const evidence = await database
    .prepare(
      `SELECT
        qsl.standard_id,
        COUNT(*) AS attempted,
        SUM(
          CASE
            WHEN (COALESCE(r.auto_marks, 0) + COALESCE(r.manual_marks, 0))
                 >= qv.marks THEN 1
            ELSE 0
          END
        ) AS correct
      FROM assessment_responses r
      INNER JOIN assessment_attempts a
        ON a.id = r.attempt_id
        AND a.learner_person_id = ?
        AND a.released_at IS NOT NULL
      INNER JOIN question_versions qv ON qv.id = r.question_version_id
      INNER JOIN question_standard_links qsl ON qsl.question_id = qv.question_id
      WHERE r.tenant_id = ?
      GROUP BY qsl.standard_id`,
    )
    .bind(learnerPersonId, access.tenantId)
    .all<{ attempted: number; correct: number; standard_id: string }>();

  const taughtBy = new Map(
    (taught.results ?? []).map((row) => [row.standard_id, row]),
  );
  const evidenceBy = new Map(
    (evidence.results ?? []).map((row) => [row.standard_id, row]),
  );

  const rows: StandardMastery[] = (standards.results ?? []).map((standard) => {
    const lessons = taughtBy.get(standard.id);
    const marks = evidenceBy.get(standard.id);
    const attempted = Number(marks?.attempted ?? 0);
    const correct = Number(marks?.correct ?? 0);
    const lessonsDone = Number(lessons?.done ?? 0);

    return {
      attempted,
      code: standard.code,
      correct,
      description: standard.description,
      lessonsDone,
      lessonsTotal: Number(lessons?.total ?? 0),
      standardId: standard.id,
      state: masteryState({ attempted, correct, lessonsDone }),
      strand: standard.strand,
    };
  });

  return {
    offeringId: input.offeringId,
    secureCount: rows.filter((row) => row.state === "secure").length,
    standards: rows,
    subjectName: subject?.subject_name ?? "",
  };
}

/**
 * Ties a bank question to the standards it tests.
 *
 * Replaces the whole set rather than adding to it, so unticking a standard in
 * the composer removes it — the composer sends what the question should be
 * mapped to, not a delta.
 */
export async function setQuestionStandards(
  access: AccessContext,
  input: { offeringId: string; questionId: string; standardIds: string[] },
): Promise<void> {
  if (access.membershipStatus !== "active") {
    throw new AuthorizationError("An active school membership is required.");
  }
  await requireOfferingContentAccess(access, input.offeringId);

  const database = await getSchoolDatabase();

  /* Only standards belonging to this question's own subject. Without this a
     teacher could map a science question to a mathematics outcome and quietly
     corrupt another subject's mastery picture. */
  const allowed = await database
    .prepare(
      `SELECT id
      FROM curriculum_standards
      WHERE tenant_id = ? AND offering_id = ?`,
    )
    .bind(access.tenantId, input.offeringId)
    .all<{ id: string }>();
  const permitted = new Set((allowed.results ?? []).map((row) => row.id));

  await database
    .prepare(
      `DELETE FROM question_standard_links
      WHERE tenant_id = ? AND question_id = ?`,
    )
    .bind(access.tenantId, input.questionId)
    .run();

  for (const standardId of new Set(input.standardIds)) {
    if (!permitted.has(standardId)) continue;
    await database
      .prepare(
        `INSERT INTO question_standard_links
          (id, tenant_id, question_id, standard_id)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (question_id, standard_id) DO NOTHING`,
      )
      .bind(crypto.randomUUID(), access.tenantId, input.questionId, standardId)
      .run();
  }
}

/** The standards a question is currently mapped to. */
export async function questionStandards(
  access: AccessContext,
  questionId: string,
): Promise<string[]> {
  const database = await getSchoolDatabase();
  const result = await database
    .prepare(
      `SELECT standard_id
      FROM question_standard_links
      WHERE tenant_id = ? AND question_id = ?`,
    )
    .bind(access.tenantId, questionId)
    .all<{ standard_id: string }>();
  return (result.results ?? []).map((row) => row.standard_id);
}
