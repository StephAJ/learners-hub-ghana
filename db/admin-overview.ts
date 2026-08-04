import { canPerform, AuthorizationError } from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import { schoolReadiness } from "../domain/academic/structure";
import { ensurePlatformReady } from "../server/platform-ready";
import { getPostgresPool } from "./postgres";

/* ==========================================================================
   What the school actually looks like right now

   The admin home used to be a mockup: a four-of-five readiness checklist with
   the ticks written into the markup, metric tiles reading 34, 4, 11/12 and 2,
   and a "work that is waiting" panel naming a class that needed a teacher.
   None of it was measured. It said the same thing to a school on its first
   day as to one halfway through the year, and it listed "Open the public
   admissions intake" as the next step — a capability that did not exist.

   One round trip, deliberately. These are six small aggregates over a school
   of hundreds, and issuing them together keeps the home page a single query
   rather than a waterfall.
   ========================================================================== */

export type AdminOverview = {
  applicationsAwaitingReview: number;
  classesWithoutTeacher: Array<{ id: string; name: string }>;
  classGroupCount: number;
  currentYearName: string | null;
  intake: { label: string; status: string } | null;
  learnerCount: number;
  pendingInvitations: number;
  placedLearnerCount: number;
  readiness: ReturnType<typeof schoolReadiness>;
  staffWithoutSubject: number;
  unstaffedOfferingCount: number;
};

export async function loadAdminOverview(
  access: AccessContext,
): Promise<AdminOverview> {
  if (!canPerform(access, "people:read")) {
    throw new AuthorizationError(
      "Your school role does not allow this action.",
    );
  }
  await ensurePlatformReady();

  const database = getPostgresPool();
  const tenant = access.tenantId;

  const [
    year,
    classes,
    offerings,
    people,
    applications,
    intake,
    profile,
  ] = await Promise.all([
    database.query<{ name: string }>(
      `SELECT name FROM academic_years
        WHERE tenant_id = $1 AND status = 'current' LIMIT 1`,
      [tenant],
    ),
    database.query<{
      class_teacher_person_id: string | null;
      id: string;
      learner_count: number;
      name: string;
    }>(
      `SELECT
          c.id,
          c.name,
          c.class_teacher_person_id,
          COUNT(m.id) FILTER (WHERE m.status = 'active') AS learner_count
         FROM class_groups AS c
         LEFT JOIN tenant_memberships AS m
           ON m.tenant_id = c.tenant_id
          AND m.role = 'learner'
          AND m.scope_type = 'class'
          AND (m.scope_id = c.name OR m.scope_id = c.id)
        WHERE c.tenant_id = $1 AND c.status = 'active'
        GROUP BY c.id
        ORDER BY c.name`,
      [tenant],
    ),
    database.query<{ total: number; unstaffed: number }>(
      /* An offering counts as staffed when at least one active assignment
         points at it. Written as a NOT EXISTS rather than a LEFT JOIN count so
         that an offering with two teachers is still one offering. */
      `SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (
            WHERE NOT EXISTS (
              SELECT 1 FROM teacher_assignments AS a
               WHERE a.offering_id = o.id AND a.status = 'active'
            )
          ) AS unstaffed
         FROM subject_offerings AS o
        WHERE o.tenant_id = $1 AND o.status = 'active'`,
      [tenant],
    ),
    database.query<{
      invited: number;
      learners: number;
      teachers: number;
      teachers_without_subject: number;
    }>(
      /* "Without a subject" means a teacher whose membership is scoped to the
         whole school rather than to a subject or a class — which is the state
         an invitation leaves them in, and the reason they cannot yet plan a
         lesson. */
      `SELECT
          COUNT(*) FILTER (WHERE status = 'invited') AS invited,
          COUNT(*) FILTER (WHERE role = 'learner' AND status = 'active')
            AS learners,
          COUNT(*) FILTER (
            WHERE role IN ('teacher', 'class-teacher') AND status = 'active'
          ) AS teachers,
          COUNT(*) FILTER (
            WHERE role IN ('teacher', 'class-teacher')
              AND status = 'active'
              AND scope_type = 'tenant'
          ) AS teachers_without_subject
         FROM tenant_memberships
        WHERE tenant_id = $1`,
      [tenant],
    ),
    database.query<{ awaiting: number }>(
      `SELECT COUNT(*) FILTER (WHERE status = 'submitted') AS awaiting
         FROM admission_application_records
        WHERE tenant_id = $1`,
      [tenant],
    ),
    database.query<{ label: string; status: string }>(
      `SELECT label, status FROM admission_intakes
        WHERE tenant_id = $1
        ORDER BY (status = 'open') DESC, closes_on DESC
        LIMIT 1`,
      [tenant],
    ),
    database.query<{ present: number }>(
      `SELECT COUNT(*) AS present FROM school_profiles WHERE tenant_id = $1`,
      [tenant],
    ),
  ]);

  const classRows = classes.rows;
  const classesWithoutTeacher = classRows
    .filter((row) => !row.class_teacher_person_id)
    .map((row) => ({ id: row.id, name: row.name }));
  const teacherCount = Number(people.rows[0]?.teachers ?? 0);
  const intakeRow = intake.rows[0] ?? null;

  return {
    applicationsAwaitingReview: Number(applications.rows[0]?.awaiting ?? 0),
    classesWithoutTeacher,
    classGroupCount: classRows.length,
    currentYearName: year.rows[0]?.name ?? null,
    intake: intakeRow
      ? { label: intakeRow.label, status: intakeRow.status }
      : null,
    learnerCount: Number(people.rows[0]?.learners ?? 0),
    pendingInvitations: Number(people.rows[0]?.invited ?? 0),
    placedLearnerCount: classRows.reduce(
      (total, row) => total + Number(row.learner_count),
      0,
    ),
    readiness: schoolReadiness({
      classesWithTeacher: classRows.length - classesWithoutTeacher.length,
      classGroupCount: classRows.length,
      hasCurrentYear: year.rows.length > 0,
      hasOpenIntake: intakeRow?.status === "open",
      hasProfile: Number(profile.rows[0]?.present ?? 0) > 0,
      offeringCount: Number(offerings.rows[0]?.total ?? 0),
      teacherCount,
      unstaffedOfferingCount: Number(offerings.rows[0]?.unstaffed ?? 0),
    }),
    staffWithoutSubject: Number(
      people.rows[0]?.teachers_without_subject ?? 0,
    ),
    unstaffedOfferingCount: Number(offerings.rows[0]?.unstaffed ?? 0),
  };
}
