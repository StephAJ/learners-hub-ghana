import type { AccessContext } from "../domain/identity/types";
import type { SchoolDatabase } from "./school-database";

/* ==========================================================================
   Which subjects a person teaches

   The markbook, the assessment workspace and the daily class workspace all
   need the same list, and each of them used to answer it with the same
   constant: SCIENCE_OFFERING_ID. Replacing one constant with three copies of
   a query would be the mistake this branch already fixed once, in
   loadAccessScopes(), so the list is resolved here and nowhere else.

   The offerings themselves come from access.subjectOfferingIds, which is
   resolved from teacher_assignments once per request. What this adds is the
   naming a screen needs — the subject, the class, the subject's code — which
   is a join rather than an authorisation question.
   ========================================================================== */

export type TeachingOffering = {
  classGroupId: string;
  className: string;
  id: string;
  subjectCode: string;
  subjectName: string;
};

/* An administrator gets the school's offerings rather than their own. The
   role already passes canTeachOffering(), and a head of department opening
   one subject's markbook should not be told they teach nothing. */
export function reachesEveryOffering(access: AccessContext): boolean {
  return access.role === "school-admin" || access.role === "academic-admin";
}

export async function loadTeachingOfferings(
  database: SchoolDatabase,
  access: AccessContext,
): Promise<TeachingOffering[]> {
  const scopedToSelf = !reachesEveryOffering(access);
  if (scopedToSelf && access.subjectOfferingIds.length === 0) return [];

  /* The id list is interpolated rather than bound because the driver takes a
     fixed parameter list, and these are ids this process just read out of
     teacher_assignments — not input. Quotes are doubled regardless. */
  const ownFilter = scopedToSelf
    ? `AND offering.id IN (${access.subjectOfferingIds
        .map((id) => `'${id.replace(/'/g, "''")}'`)
        .join(", ")})`
    : "";

  const result = await database
    .prepare(
      `SELECT
        offering.id,
        offering.class_group_id,
        offering.class_name,
        subject.code AS subject_code,
        subject.name AS subject_name
      FROM subject_offerings AS offering
      INNER JOIN subjects AS subject ON subject.id = offering.subject_id
      WHERE offering.tenant_id = ? AND offering.status = 'active'
        ${ownFilter}
      ORDER BY offering.class_name, subject.name`,
    )
    .bind(access.tenantId)
    .all<{
      class_group_id: string;
      class_name: string;
      id: string;
      subject_code: string;
      subject_name: string;
    }>();

  return result.results.map((row) => ({
    classGroupId: row.class_group_id,
    className: row.class_name,
    id: row.id,
    subjectCode: row.subject_code,
    subjectName: row.subject_name,
  }));
}

/* The offering a request is about: the one it asked for, or the first the
   person holds. Asking for one they do not hold is a refusal rather than a
   quiet fall back to their first subject, because the id arrives from a URL —
   the caller raises it, since each workspace words it differently. */
export function selectOffering(
  offerings: TeachingOffering[],
  requestedId?: string,
): TeachingOffering | undefined {
  if (!requestedId) return offerings[0];
  return offerings.find((offering) => offering.id === requestedId);
}
