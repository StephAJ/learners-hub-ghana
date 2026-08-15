import type { AccessContext } from "../domain/identity/types";
import { getSchoolDatabase } from "./index";
import { ensureGradingPeriod } from "./grading-period-repository";
import { createGradeItem } from "./gradebook-structure-repository";
import type { SchoolDatabase } from "./school-database";

/* ==========================================================================
   The join between a paper and the markbook

   `grade_items` has carried an `assessment_id` column since the schema was
   written. One seed statement filled it in and nothing ever read it, so the
   two halves of the school's core loop were not connected: a teacher marked a
   paper, released the result, and then typed the same marks into the markbook
   by hand — if a column existed to type them into, which for every subject but
   the demo's Integrated Science it did not.

   Publishing a paper creates the column. Releasing a result fills that
   learner's cell. Neither is optional and neither asks: a mark that exists in
   two places and only agrees when somebody remembers to copy it is worse than
   one that exists in one.

   Marks are written on *release*, not on marking. Releasing is the moment a
   teacher says the result stands, and the markbook feeds the report card.
   ========================================================================== */

/** The category a paper's column lands in when the school has not said. */
const DEFAULT_CATEGORY = {
  kind: "continuous-assessment" as const,
  name: "Continuous assessment",
  weightPercent: 100,
};

export async function linkAssessmentToMarkbook(
  access: AccessContext,
  input: {
    assessmentId: string;
    offeringId: string;
    title: string;
    totalMarks: number;
  },
): Promise<void> {
  const database = await getSchoolDatabase();
  const period = await ensureGradingPeriod(database, access.tenantId);

  const existing = await database
    .prepare(
      `SELECT id FROM grade_items
      WHERE tenant_id = ? AND period_id = ? AND assessment_id = ?
      LIMIT 1`,
    )
    .bind(access.tenantId, period.id, input.assessmentId)
    .first<{ id: string }>();
  /* Republishing a paper must not add a second column for it. */
  if (existing) return;

  const categoryId = await resolveCategory(
    database,
    access,
    period.id,
    input.offeringId,
  );

  await createGradeItem(access, input.offeringId, {
    assessmentId: input.assessmentId,
    categoryId,
    maximumMarks: input.totalMarks || 1,
    title: input.title,
  });
}

/**
 * Writes a released attempt's score into the markbook.
 *
 * Silent when the paper has no column — a paper published before this existed
 * has none, and losing the release over it would be the wrong trade.
 */
export async function recordReleasedResultInMarkbook(
  access: AccessContext,
  input: { assessmentId: string; attemptId: string },
): Promise<void> {
  const database = await getSchoolDatabase();

  const attempt = await database
    .prepare(
      `SELECT learner_person_id, auto_marks, manual_marks
      FROM assessment_attempts
      WHERE id = ? AND tenant_id = ?
      LIMIT 1`,
    )
    .bind(input.attemptId, access.tenantId)
    .first<{
      auto_marks: number | null;
      learner_person_id: string;
      manual_marks: number | null;
    }>();
  if (!attempt) return;

  const item = await database
    .prepare(
      `SELECT id, maximum_marks FROM grade_items
      WHERE tenant_id = ? AND assessment_id = ? AND status <> 'excluded'
      ORDER BY position DESC
      LIMIT 1`,
    )
    .bind(access.tenantId, input.assessmentId)
    .first<{ id: string; maximum_marks: number }>();
  if (!item) return;

  /* Auto-marked questions and the ones a teacher read, added. Either may be
     null on an attempt with none of that kind. */
  const scored =
    Number(attempt.auto_marks ?? 0) + Number(attempt.manual_marks ?? 0);
  const marks = Math.max(0, Math.min(scored, Number(item.maximum_marks)));

  await database
    .prepare(
      `UPDATE grade_entries
      SET raw_marks = ?, status = 'recorded', updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND item_id = ? AND learner_person_id = ?`,
    )
    .bind(marks, access.tenantId, item.id, attempt.learner_person_id)
    .run();

  /* A learner placed in the class after the column was created has no entry
     yet, so the update above changes nothing and this fills the gap. */
  await database
    .prepare(
      `INSERT INTO grade_entries
        (id, tenant_id, item_id, learner_person_id, raw_marks, status,
         recorded_by_person_id)
      SELECT ?, ?, ?, ?, ?, 'recorded', ?
      WHERE NOT EXISTS (
        SELECT 1 FROM grade_entries
        WHERE tenant_id = ? AND item_id = ? AND learner_person_id = ?
      )`,
    )
    .bind(
      crypto.randomUUID(),
      access.tenantId,
      item.id,
      attempt.learner_person_id,
      marks,
      access.actorPersonId,
      access.tenantId,
      item.id,
      attempt.learner_person_id,
    )
    .run();

  await database
    .prepare(
      `INSERT INTO audit_events
        (id, tenant_id, actor_person_id, action, entity_type, entity_id,
         metadata)
      VALUES (?, ?, ?, 'gradebook.result_recorded', 'assessment-attempt', ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      access.tenantId,
      access.actorPersonId,
      input.attemptId,
      JSON.stringify({ itemId: item.id, marks }),
    )
    .run();
}

/**
 * Which category a paper's column belongs in.
 *
 * The offering's first continuous-assessment category, then its first category
 * of any kind, and only if it has none at all does this create one. A school
 * that has set its own weighting keeps it.
 */
async function resolveCategory(
  database: SchoolDatabase,
  access: AccessContext,
  periodId: string,
  offeringId: string,
): Promise<string> {
  const preferred = await database
    .prepare(
      `SELECT id FROM grade_categories
      WHERE tenant_id = ? AND period_id = ? AND offering_id = ?
      ORDER BY
        CASE WHEN kind = 'continuous-assessment' THEN 0 ELSE 1 END,
        position
      LIMIT 1`,
    )
    .bind(access.tenantId, periodId, offeringId)
    .first<{ id: string }>();
  if (preferred) return preferred.id;

  const id = crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO grade_categories
        (id, tenant_id, period_id, offering_id, name, kind, weight_percent,
         position)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    .bind(
      id,
      access.tenantId,
      periodId,
      offeringId,
      DEFAULT_CATEGORY.name,
      DEFAULT_CATEGORY.kind,
      DEFAULT_CATEGORY.weightPercent,
    )
    .run();
  return id;
}
