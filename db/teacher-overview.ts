import { canPerform, AuthorizationError } from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import { ensurePlatformReady } from "../server/platform-ready";
import { getPostgresPool } from "./postgres";

/* ==========================================================================
   What is actually waiting for this teacher

   The teacher home was written rather than measured, in exactly the way the
   admin home was before it was computed. Its timetable was a hardcoded array
   of three Integrated Science classes; its tiles read 3, 12, 2 and 1; its
   "What needs action" panel named yesterday's JHS 2 Gold register, twelve
   body-systems models and a draft called "How breathing powers the body".
   None of it was true of anyone, and it said the same thing to a teacher on
   their first morning as to one mid-term.

   Every fact below was already in the database. This is a query.

   One round trip, like loadAdminOverview(): five small aggregates scoped to
   the offerings this person teaches, issued together rather than as a
   waterfall behind a page render.
   ========================================================================== */

export type TeacherTimetableEntry = {
  className: string;
  id: string;
  room: string;
  startsAt: string;
  status: string;
  subjectName: string;
};

export type TeacherOverview = {
  /* Marked but not yet released, and not yet marked. Both are work. */
  awaitingMarking: number;
  classesToday: number;
  draftLessons: number;
  /* Registers for the teacher's classes with no submitted session today. */
  registersOutstanding: number;
  subjectCount: number;
  timetable: TeacherTimetableEntry[];
  /* Grade entries still missing a mark in an open markbook. The number that
     decides whether a markbook can be submitted at all. */
  missingMarks: number;
};

const EMPTY: TeacherOverview = {
  awaitingMarking: 0,
  classesToday: 0,
  draftLessons: 0,
  missingMarks: 0,
  registersOutstanding: 0,
  subjectCount: 0,
  timetable: [],
};

/* PostgreSQL's ISODOW is 1..7 from Monday; timetable_entries.weekday follows
   the same convention — the demo school's Friday rows carry 5. */
function isoWeekday(now: Date): number {
  return now.getUTCDay() === 0 ? 7 : now.getUTCDay();
}

export async function loadTeacherOverview(
  access: AccessContext,
  now = new Date(),
): Promise<TeacherOverview> {
  if (!canPerform(access, "lesson:create")) {
    throw new AuthorizationError(
      "Your school role does not allow this action.",
    );
  }
  await ensurePlatformReady();

  /* A teacher with no subjects has nothing waiting rather than an error: the
     home page is where they find out, and gap 1's Academics screen is where
     it gets fixed. */
  if (access.subjectOfferingIds.length === 0) return EMPTY;

  const database = getPostgresPool();
  const tenant = access.tenantId;
  const offerings = access.subjectOfferingIds;
  const classes = access.classGroupIds;
  const today = now.toISOString().slice(0, 10);
  const weekday = isoWeekday(now);

  const [timetable, marking, drafts, missing, registers] = await Promise.all([
    database.query<{
      class_name: string;
      id: string;
      room: string;
      starts_at: string;
      status: string;
      subject_name: string;
    }>(
      `SELECT
          e.id,
          e.subject_name,
          e.room,
          p.starts_at,
          e.status,
          COALESCE(c.name, e.class_group_id) AS class_name
         FROM timetable_entries AS e
         INNER JOIN timetable_periods AS p ON p.id = e.period_id
         LEFT JOIN class_groups AS c ON c.id = e.class_group_id
        WHERE e.tenant_id = $1
          AND e.weekday = $2
          AND e.status != 'cancelled'
          AND (
            e.teacher_person_id = $3
            OR e.substitute_teacher_person_id = $3
            OR e.offering_id = ANY($4::text[])
          )
        ORDER BY p.starts_at`,
      [tenant, weekday, access.actorPersonId, offerings],
    ),
    database.query<{ awaiting: number }>(
      /* Handed in and not yet released back. A submission that has been marked
         but not released is still work: the learner has not seen it. */
      `SELECT COUNT(*) AS awaiting
         FROM assignment_submissions AS s
         INNER JOIN assignments AS a ON a.id = s.assignment_id
        WHERE s.tenant_id = $1
          AND a.offering_id = ANY($2::text[])
          AND s.submitted_at IS NOT NULL
          AND s.released_at IS NULL`,
      [tenant, offerings],
    ),
    database.query<{ drafts: number }>(
      `SELECT COUNT(*) AS drafts
         FROM lessons
        WHERE tenant_id = $1
          AND offering_id = ANY($2::text[])
          AND status = 'draft'`,
      [tenant, offerings],
    ),
    database.query<{ missing: number }>(
      /* Only in a markbook still open — once submitted, a missing mark is the
         correction workflow's problem rather than a thing to chase. */
      `SELECT COUNT(*) AS missing
         FROM grade_entries AS e
         INNER JOIN grade_items AS i ON i.id = e.item_id
         INNER JOIN gradebook_submissions AS g
           ON g.period_id = i.period_id AND g.offering_id = i.offering_id
        WHERE e.tenant_id = $1
          AND i.offering_id = ANY($2::text[])
          AND e.status = 'missing'
          AND g.status = 'open'`,
      [tenant, offerings],
    ),
    classes.length === 0
      ? Promise.resolve({ rows: [{ outstanding: 0 }] })
      : database.query<{ outstanding: number }>(
          /* A class of the teacher's with no register submitted for today.
             LEFT JOIN rather than NOT EXISTS so a class whose register was
             started and left in draft still counts as outstanding. */
          `SELECT COUNT(*) AS outstanding
             FROM class_groups AS c
             LEFT JOIN attendance_sessions AS s
               ON s.class_group_id = c.id
              AND s.tenant_id = c.tenant_id
              AND s.session_date = $2
              AND s.status = 'submitted'
            WHERE c.tenant_id = $1
              AND c.id = ANY($3::text[])
              AND s.id IS NULL`,
          [tenant, today, classes],
        ),
  ]);

  return {
    awaitingMarking: Number(marking.rows[0]?.awaiting ?? 0),
    classesToday: timetable.rows.length,
    draftLessons: Number(drafts.rows[0]?.drafts ?? 0),
    missingMarks: Number(missing.rows[0]?.missing ?? 0),
    registersOutstanding: Number(registers.rows[0]?.outstanding ?? 0),
    subjectCount: offerings.length,
    timetable: timetable.rows.map((row) => ({
      className: row.class_name,
      id: row.id,
      room: row.room,
      startsAt: row.starts_at,
      status: row.status,
      subjectName: row.subject_name,
    })),
  };
}
