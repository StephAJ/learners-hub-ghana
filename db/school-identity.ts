import type { SchoolDatabase } from "./school-database";

/* ==========================================================================
   The two facts every learner-facing document has to get right

   Which class a learner is in, and what the school is called. Both were
   written out as literals on live paths — "JHS 2 Gold" and "Greenfield
   Academy" — so a guardian's report card named a class their child is not in,
   at a school they do not attend, and every absence alert in every school said
   the child had been absent from JHS 2 Gold.

   One place, because there were three copies of the placement query and none
   of the school name, and a value that appears three times is a value that
   eventually appears twice correctly.
   ========================================================================== */

export type ClassPlacement = { id: string; name: string };

/**
 * The class group a learner is currently placed in.
 *
 * Placement is a membership scoped to a class. The scope is matched against
 * both the class id and its name because the seeded cast is scoped by name —
 * accepting either means a school that creates its classes through the admin
 * screen and one that inherited them from a seed both resolve.
 */
export async function loadLearnerPlacement(
  database: SchoolDatabase,
  tenantId: string,
  learnerId: string,
): Promise<ClassPlacement | null> {
  const placement = await database
    .prepare(
      `SELECT class_group.id, class_group.name
      FROM class_groups AS class_group
      INNER JOIN tenant_memberships AS membership
        ON membership.tenant_id = class_group.tenant_id
          AND membership.person_id = ?
          AND membership.status = 'active'
          AND membership.scope_type = 'class'
          AND (
            membership.scope_id = class_group.id
            OR membership.scope_id = class_group.name
          )
      WHERE class_group.tenant_id = ?
      LIMIT 1`,
    )
    .bind(learnerId, tenantId)
    .first<ClassPlacement>();
  return placement ?? null;
}

/**
 * What this school calls itself.
 *
 * The tenant row is the authority: it is what /admin/school edits, and what
 * the sidebar and the public site already read through other paths.
 */
export async function loadSchoolName(
  database: SchoolDatabase,
  tenantId: string,
): Promise<string> {
  const tenant = await database
    .prepare(`SELECT name FROM tenants WHERE id = ? LIMIT 1`)
    .bind(tenantId)
    .first<{ name: string }>();
  return tenant?.name ?? "";
}
