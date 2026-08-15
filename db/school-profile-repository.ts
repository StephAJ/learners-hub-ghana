import {
  AuthorizationError,
  canPerform,
} from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import {
  applySchoolProfileEdit,
  defaultSchoolProfile,
  greenfieldProfile,
  parseSchoolProfile,
  type SchoolProfile,
  type SchoolProfileEdit,
} from "../domain/school/public-profile";
import { demoSchoolEnabled } from "../server/demo-school";
import { ensurePlatformReady } from "../server/platform-ready";
import {
  DEFAULT_STUDENT_NUMBER_PREFIX,
  normaliseStudentNumberPrefix,
} from "./people-repository";
import { getPostgresPool } from "./postgres";

/* ==========================================================================
   What the public site says about a school

   Until this existed, `greenfieldProfile` was imported directly by the
   landing page, the sign-in page, the admissions section, the applicant
   account and the admissions emails. Five surfaces read a constant, which
   meant a school could not correct its own telephone number without a
   developer and a redeploy.

   `loadSchoolProfile` is not permission-gated. It is what the public, signed
   out, unauthenticated site renders — asking for a permission first would be
   asking who is reading a school's front page.
   ========================================================================== */

import { SCHOOL_TENANT_ID } from "../server/school-tenant";

/* The one school this deployment serves. Was the literal
   "tenant-greenfield" — the demo school's own id — written out here and
   in five other files. */
const DEFAULT_TENANT_ID = SCHOOL_TENANT_ID;

export async function loadSchoolProfile(
  tenantId: string = DEFAULT_TENANT_ID,
): Promise<SchoolProfile> {
  await ensurePlatformReady();

  const result = await getPostgresPool().query<{ document: string }>(
    `SELECT document FROM school_profiles WHERE tenant_id = $1`,
    [tenantId],
  );

  const starting = await startingProfile(tenantId);
  const stored = result.rows[0]?.document;
  if (!stored) return starting;

  /* A document that will not parse is a school with a broken front page, so
     the failure is swallowed and the default rendered. parseSchoolProfile
     then fills any individual field that is missing or the wrong type, so a
     partly-written document still renders the parts it does have. */
  try {
    return parseSchoolProfile(JSON.parse(stored), starting);
  } catch {
    return starting;
  }
}

/**
 * What a school with no stored document publishes.
 *
 * This used to be `greenfieldProfile` unconditionally, so an install that had
 * never been near the demo still served Greenfield's address, its BECE
 * results, its mural and two testimonials from people who do not work there.
 * A real school starts from its own name and copy that says plainly it has not
 * been written yet.
 */
async function startingProfile(tenantId: string): Promise<SchoolProfile> {
  if (demoSchoolEnabled()) return greenfieldProfile;
  const result = await getPostgresPool().query<{ name: string }>(
    `SELECT name FROM tenants WHERE id = $1 LIMIT 1`,
    [tenantId],
  );
  return defaultSchoolProfile(result.rows[0]?.name ?? "");
}

/**
 * The profile as the school's own record, for the admin screen.
 *
 * Distinct from `loadSchoolProfile` only in that it is gated: the public read
 * is anonymous by design, and an editing screen should not quietly borrow an
 * anonymous path.
 */
export async function loadSchoolProfileForEditing(
  access: AccessContext,
): Promise<SchoolProfile> {
  requirePermission(access, "academic:manage");
  return loadSchoolProfile(access.tenantId);
}

/** The settings that live on the tenant row rather than in the document. */
export async function loadSchoolSettings(
  access: AccessContext,
): Promise<{ studentNumberPrefix: string }> {
  requirePermission(access, "academic:manage");
  await ensurePlatformReady();
  const result = await getPostgresPool().query<{
    student_number_prefix: string;
  }>(`SELECT student_number_prefix FROM tenants WHERE id = $1`, [
    access.tenantId,
  ]);
  return {
    studentNumberPrefix:
      result.rows[0]?.student_number_prefix ?? DEFAULT_STUDENT_NUMBER_PREFIX,
  };
}

export async function saveSchoolProfile(
  access: AccessContext,
  edit: SchoolProfileEdit,
): Promise<SchoolProfile> {
  requirePermission(access, "academic:manage");
  await ensurePlatformReady();

  const current = await loadSchoolProfile(access.tenantId);
  const updated = applySchoolProfileEdit(current, edit);

  await getPostgresPool().query(
    `INSERT INTO school_profiles (tenant_id, document, updated_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (tenant_id)
       DO UPDATE SET document = EXCLUDED.document,
                     updated_at = CURRENT_TIMESTAMP`,
    [access.tenantId, JSON.stringify(updated)],
  );

  /* The school's name is shown by the workspace sidebar from the tenant row,
     not the profile, so renaming the school in one place and not the other
     would leave staff looking at the old name all day. */
  await getPostgresPool().query(
    `UPDATE tenants SET name = $2, student_number_prefix = $3 WHERE id = $1`,
    [
      access.tenantId,
      updated.name,
      normaliseStudentNumberPrefix(edit.studentNumberPrefix ?? ""),
    ],
  );

  await getPostgresPool().query(
    `INSERT INTO audit_events
       (id, tenant_id, actor_person_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, 'school.profile-updated', 'school-profile', $2, $4::jsonb)`,
    [
      crypto.randomUUID(),
      access.tenantId,
      access.actorPersonId,
      JSON.stringify({ name: updated.name }),
    ],
  );

  return updated;
}

/** Whether a school has written its own profile, for the readiness list. */
export async function hasStoredSchoolProfile(
  tenantId: string,
): Promise<boolean> {
  const result = await getPostgresPool().query(
    `SELECT 1 FROM school_profiles WHERE tenant_id = $1`,
    [tenantId],
  );
  return (result.rowCount ?? 0) > 0;
}

function requirePermission(
  access: AccessContext,
  permission: Parameters<typeof canPerform>[1],
) {
  if (!canPerform(access, permission)) {
    throw new AuthorizationError(
      "Your school role does not allow this action.",
    );
  }
}
