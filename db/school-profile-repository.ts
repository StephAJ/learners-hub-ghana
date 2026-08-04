import {
  AuthorizationError,
  canPerform,
} from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import {
  applySchoolProfileEdit,
  greenfieldProfile,
  parseSchoolProfile,
  type SchoolProfile,
  type SchoolProfileEdit,
} from "../domain/school/public-profile";
import { ensurePlatformReady } from "../server/platform-ready";
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

const DEFAULT_TENANT_ID = "tenant-greenfield";

export async function loadSchoolProfile(
  tenantId: string = DEFAULT_TENANT_ID,
): Promise<SchoolProfile> {
  await ensurePlatformReady();

  const result = await getPostgresPool().query<{ document: string }>(
    `SELECT document FROM school_profiles WHERE tenant_id = $1`,
    [tenantId],
  );

  const stored = result.rows[0]?.document;
  if (!stored) return greenfieldProfile;

  /* A document that will not parse is a school with a broken front page, so
     the failure is swallowed and the default rendered. parseSchoolProfile
     then fills any individual field that is missing or the wrong type, so a
     partly-written document still renders the parts it does have. */
  try {
    return parseSchoolProfile(JSON.parse(stored));
  } catch {
    return greenfieldProfile;
  }
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
    `UPDATE tenants SET name = $2 WHERE id = $1`,
    [access.tenantId, updated.name],
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
