import {
  AuthorizationError,
  canPerform,
  canTeachOffering,
} from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import { ReportingPolicyError } from "../domain/reporting/gradebook";
import { getSchoolDatabase } from "./index";
import { ensureGradingPeriod } from "./grading-period-repository";
import type { SchoolDatabase } from "./school-database";

/* ==========================================================================
   The shape of a markbook

   Categories and columns used to exist only as seed rows. `seedGradeItem()`
   bound SCIENCE_OFFERING_ID for every item it wrote and was the only thing in
   the codebase that inserted into `grade_items` at all — so a teacher of any
   other subject opened a markbook with two categories, no columns, and no
   control anywhere that would add one. The two categories were fixed at 40%
   continuous assessment and 60% examination, which the product scope forbids
   twice over: the weighting has to be configurable, and a historical formula
   has to stay reproducible.

   Both are ordinary records now. What a school may not do is leave the
   weights summing to something other than 100 — every report card is computed
   from them, and `calculateWeightedGrade()` refuses a set that does not add
   up, so catching it here means the refusal arrives while somebody is editing
   rather than at the end of term.

   Adding a column adds a row for every learner on the roster, marked missing.
   A column that exists for the class but not for a learner is how a markbook
   quietly loses somebody.
   ========================================================================== */

export type GradeCategoryInput = {
  kind: "continuous-assessment" | "examination" | "other";
  name: string;
  weightPercent: number;
};

export type GradeItemInput = {
  assessmentId?: string | null;
  categoryId: string;
  dueOn?: string | null;
  maximumMarks: number;
  title: string;
};

export async function createGradeCategory(
  access: AccessContext,
  offeringId: string,
  input: GradeCategoryInput,
): Promise<void> {
  const { database, periodId } = await reachOffering(access, offeringId);
  const name = requireText(input.name, "The category needs a name.");
  requireWeight(input.weightPercent);

  const position = await nextPosition(
    database,
    `SELECT COALESCE(MAX(position), 0) AS highest FROM grade_categories
     WHERE tenant_id = ? AND period_id = ? AND offering_id = ?`,
    [access.tenantId, periodId, offeringId],
  );

  await database
    .prepare(
      `INSERT INTO grade_categories
        (id, tenant_id, period_id, offering_id, name, kind, weight_percent,
         position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      access.tenantId,
      periodId,
      offeringId,
      name,
      input.kind,
      input.weightPercent,
      position,
    )
    .run();
  await audit(database, access, "gradebook.category_created", offeringId, {
    name,
    weightPercent: input.weightPercent,
  });
}

export async function updateGradeCategory(
  access: AccessContext,
  categoryId: string,
  input: GradeCategoryInput,
): Promise<void> {
  const database = await getSchoolDatabase();
  const category = await requireCategory(database, access, categoryId);
  const name = requireText(input.name, "The category needs a name.");
  requireWeight(input.weightPercent);

  await database
    .prepare(
      `UPDATE grade_categories
      SET name = ?, kind = ?, weight_percent = ?
      WHERE id = ? AND tenant_id = ?`,
    )
    .bind(
      name,
      input.kind,
      input.weightPercent,
      categoryId,
      access.tenantId,
    )
    .run();
  await audit(
    database,
    access,
    "gradebook.category_updated",
    category.offering_id,
    { name, weightPercent: input.weightPercent },
  );
}

/**
 * Removes a category, and refuses while it still holds columns.
 *
 * Cascading would delete marks. A teacher who means to remove a category with
 * work in it has to say what happens to the work first, which is a decision
 * and not a side effect.
 */
export async function deleteGradeCategory(
  access: AccessContext,
  categoryId: string,
): Promise<void> {
  const database = await getSchoolDatabase();
  const category = await requireCategory(database, access, categoryId);

  const held = await database
    .prepare(
      `SELECT COUNT(*) AS held FROM grade_items
      WHERE tenant_id = ? AND category_id = ? AND status <> 'excluded'`,
    )
    .bind(access.tenantId, categoryId)
    .first<{ held: number }>();
  if (Number(held?.held ?? 0) > 0) {
    throw new ReportingPolicyError(
      "Remove or move this category's columns before removing the category.",
    );
  }

  await database
    .prepare(`DELETE FROM grade_categories WHERE id = ? AND tenant_id = ?`)
    .bind(categoryId, access.tenantId)
    .run();
  await audit(
    database,
    access,
    "gradebook.category_removed",
    category.offering_id,
    { name: category.name },
  );
}

/**
 * Adds a column to a markbook, and a blank entry for every learner in it.
 *
 * Returns the item id so a caller that is creating a column for a published
 * assessment can hold on to it.
 */
export async function createGradeItem(
  access: AccessContext,
  offeringId: string,
  input: GradeItemInput,
): Promise<string> {
  const { database, periodId } = await reachOffering(access, offeringId);
  const title = requireText(input.title, "The column needs a title.");
  if (!Number.isFinite(input.maximumMarks) || input.maximumMarks <= 0) {
    throw new ReportingPolicyError("A column is marked out of more than zero.");
  }

  const category = await database
    .prepare(
      `SELECT id FROM grade_categories
      WHERE id = ? AND tenant_id = ? AND offering_id = ? AND period_id = ?
      LIMIT 1`,
    )
    .bind(input.categoryId, access.tenantId, offeringId, periodId)
    .first<{ id: string }>();
  if (!category) {
    throw new ReportingPolicyError(
      "That category is not part of this markbook. Add a category first.",
    );
  }

  const position = await nextPosition(
    database,
    `SELECT COALESCE(MAX(position), 0) AS highest FROM grade_items
     WHERE tenant_id = ? AND period_id = ? AND offering_id = ?`,
    [access.tenantId, periodId, offeringId],
  );

  const itemId = crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO grade_items
        (id, tenant_id, period_id, offering_id, category_id, assessment_id,
         title, maximum_marks, due_on, status, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    )
    .bind(
      itemId,
      access.tenantId,
      periodId,
      offeringId,
      input.categoryId,
      input.assessmentId ?? null,
      title,
      Math.round(input.maximumMarks),
      input.dueOn ?? null,
      position,
    )
    .run();

  await createMissingEntries(database, access, offeringId, itemId);
  await audit(database, access, "gradebook.item_created", offeringId, {
    itemId,
    title,
  });
  return itemId;
}

export async function updateGradeItem(
  access: AccessContext,
  itemId: string,
  input: Omit<GradeItemInput, "assessmentId">,
): Promise<void> {
  const database = await getSchoolDatabase();
  const item = await requireItem(database, access, itemId);
  const title = requireText(input.title, "The column needs a title.");
  if (!Number.isFinite(input.maximumMarks) || input.maximumMarks <= 0) {
    throw new ReportingPolicyError("A column is marked out of more than zero.");
  }

  await database
    .prepare(
      `UPDATE grade_items
      SET title = ?, maximum_marks = ?, category_id = ?, due_on = ?
      WHERE id = ? AND tenant_id = ?`,
    )
    .bind(
      title,
      Math.round(input.maximumMarks),
      input.categoryId,
      input.dueOn ?? null,
      itemId,
      access.tenantId,
    )
    .run();
  await audit(
    database,
    access,
    "gradebook.item_updated",
    item.offering_id,
    { itemId, title },
  );
}

/**
 * Takes a column out of the markbook without deleting the marks in it.
 *
 * The integrity rules are explicit that submitted marks are never hard-deleted
 * through ordinary UI, and `loadItems()` already skips excluded columns — so
 * this is a status change, and the record of what was entered survives.
 */
export async function excludeGradeItem(
  access: AccessContext,
  itemId: string,
): Promise<void> {
  const database = await getSchoolDatabase();
  const item = await requireItem(database, access, itemId);

  await database
    .prepare(
      `UPDATE grade_items SET status = 'excluded' WHERE id = ? AND tenant_id = ?`,
    )
    .bind(itemId, access.tenantId)
    .run();
  await audit(database, access, "gradebook.item_excluded", item.offering_id, {
    itemId,
    title: item.title,
  });
}

/**
 * A blank, missing entry for every learner in the offering's class.
 *
 * Exported because publishing an assessment creates a column too, and a
 * column without entries is invisible to the markbook.
 */
export async function createMissingEntries(
  database: SchoolDatabase,
  access: AccessContext,
  offeringId: string,
  itemId: string,
): Promise<void> {
  const offering = await database
    .prepare(
      `SELECT class_group_id, class_name FROM subject_offerings
      WHERE id = ? AND tenant_id = ? LIMIT 1`,
    )
    .bind(offeringId, access.tenantId)
    .first<{ class_group_id: string; class_name: string }>();
  if (!offering) return;

  /* Scope is matched on both the class id and its name, as everywhere else a
     placement is resolved — see loadAccessScopes() in db/people-repository.ts. */
  const learners = await database
    .prepare(
      `SELECT DISTINCT person.id
      FROM people AS person
      INNER JOIN tenant_memberships AS membership
        ON membership.person_id = person.id
      WHERE person.tenant_id = ? AND person.kind = 'learner'
        AND membership.status = 'active'
        AND membership.scope_type = 'class'
        AND (membership.scope_id = ? OR membership.scope_id = ?)`,
    )
    .bind(access.tenantId, offering.class_group_id, offering.class_name)
    .all<{ id: string }>();

  for (const learner of learners.results) {
    await database
      .prepare(
        `INSERT INTO grade_entries
          (id, tenant_id, item_id, learner_person_id, raw_marks, status,
           recorded_by_person_id)
        VALUES (?, ?, ?, ?, NULL, 'missing', ?)
        ON CONFLICT DO NOTHING`,
      )
      .bind(
        crypto.randomUUID(),
        access.tenantId,
        itemId,
        learner.id,
        access.actorPersonId,
      )
      .run();
  }
}

/** The teacher of the offering, or an administrator, and the current term. */
async function reachOffering(access: AccessContext, offeringId: string) {
  if (!canPerform(access, "gradebook:manage")) {
    throw new AuthorizationError(
      "Your school role does not allow changing a markbook.",
    );
  }
  if (!canTeachOffering(access, offeringId)) {
    throw new AuthorizationError(
      "You are not assigned to this subject offering.",
    );
  }
  const database = await getSchoolDatabase();
  const period = await ensureGradingPeriod(database, access.tenantId);
  return { database, periodId: period.id };
}

async function requireCategory(
  database: SchoolDatabase,
  access: AccessContext,
  categoryId: string,
) {
  const category = await database
    .prepare(
      `SELECT id, name, offering_id FROM grade_categories
      WHERE id = ? AND tenant_id = ? LIMIT 1`,
    )
    .bind(categoryId, access.tenantId)
    .first<{ id: string; name: string; offering_id: string }>();
  if (!category) {
    throw new ReportingPolicyError("That category was not found.");
  }
  await reachOffering(access, category.offering_id);
  return category;
}

async function requireItem(
  database: SchoolDatabase,
  access: AccessContext,
  itemId: string,
) {
  const item = await database
    .prepare(
      `SELECT id, title, offering_id FROM grade_items
      WHERE id = ? AND tenant_id = ? LIMIT 1`,
    )
    .bind(itemId, access.tenantId)
    .first<{ id: string; offering_id: string; title: string }>();
  if (!item) throw new ReportingPolicyError("That column was not found.");
  await reachOffering(access, item.offering_id);
  return item;
}

async function nextPosition(
  database: SchoolDatabase,
  sql: string,
  binds: string[],
): Promise<number> {
  const row = await database
    .prepare(sql)
    .bind(...binds)
    .first<{ highest: number }>();
  return Number(row?.highest ?? 0) + 1;
}

function requireText(value: string, message: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new ReportingPolicyError(message);
  return trimmed;
}

function requireWeight(weight: number) {
  if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
    throw new ReportingPolicyError("A weight is a percentage between 0 and 100.");
  }
}

async function audit(
  database: SchoolDatabase,
  access: AccessContext,
  action: string,
  offeringId: string,
  metadata: Record<string, unknown>,
) {
  await database
    .prepare(
      `INSERT INTO audit_events
        (id, tenant_id, actor_person_id, action, entity_type, entity_id,
         metadata)
      VALUES (?, ?, ?, ?, 'subject-offering', ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      access.tenantId,
      access.actorPersonId,
      action,
      offeringId,
      JSON.stringify(metadata),
    )
    .run();
}
