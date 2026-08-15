import {
  AuthorizationError,
  canAccessLearner,
  canPerform,
  canTeachOffering,
} from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import {
  assertSubmittableWork,
  changeTimetableEntry,
  correctAttendance,
  DailyOperationsPolicyError,
  preparePublishedAssignment,
  releaseRubricMark,
  shouldCreateGuardianAlert,
  submitAttendanceRegister,
  summarizeAttendance,
} from "../domain/operations/daily-operations";
import {
  isSchoolDay,
  recentSchoolDays,
  schoolDate,
  schoolWeekday,
} from "../domain/operations/school-calendar";
import type {
  AttendanceCode,
  AttendanceRecord,
  AttendanceSessionStatus,
  RubricCriterion,
  RubricScore,
  SubmissionStatus,
  TimetableEntryStatus,
} from "../domain/operations/types";
import { validateUpload } from "../domain/content/content-policy";
import { scanUpload } from "../server/content-scan";
import type { MediaKind } from "../domain/content/types";
import { ensureReportingFoundation } from "./reporting-repository";
import { getMediaStore, getSchoolDatabase } from "./index";
import type { SchoolDatabase, SchoolStatement } from "./school-database";
import {
  SCIENCE_OFFERING_ID,
  seededDemoOfferingIds,
} from "./learning-repository";
import {
  loadTeachingOfferings,
  selectOffering,
  type TeachingOffering,
} from "./teaching-offerings";
import { ensurePeopleSeed } from "./people-repository";
import { loadLearnerPlacement } from "./school-identity";
import { sendAbsenceNoticeMail } from "../server/mail/notification-mail";
import {
  demoLearners,
  demoPeriods,
  demoTimetable,
} from "../domain/demo/greenfield";

/* Enough for a scanned exercise book without becoming a place to park a
   video. Each file is still bounded by the shared 25 MB upload limit. */
const MAX_SUBMISSION_ATTACHMENTS = 6;

import { demoSchoolEnabled } from "../server/demo-school";
import { SCHOOL_TENANT_ID } from "../server/school-tenant";

/* The one school this deployment serves. Was the literal
   "tenant-greenfield" — the demo school's own id — written out here and
   in five other files. */
const TENANT_ID = SCHOOL_TENANT_ID;
const CLASS_GROUP_ID = "class-jhs2-gold";
const CLASS_NAME = "JHS 2 Gold";

export type RubricCriterionView = RubricCriterion & {
  description: string;
};

export type TeacherAssignmentSummary = {
  dueAt: string;
  id: string;
  maximumPoints: number;
  needsMarking: number;
  rubric: RubricCriterionView[];
  status: string;
  submissionCount: number;
  title: string;
};

export type MarkingSubmission = {
  assignmentId: string;
  assignmentTitle: string;
  attachments: SubmissionAttachmentView[];
  criteria: RubricCriterionView[];
  id: string;
  learnerName: string;
  responseText: string;
  status: SubmissionStatus;
  studentId: string;
  submittedAt: string;
};

export type AttendanceRow = AttendanceRecord & {
  learnerName: string;
  recordId: string;
  studentId: string;
};

export type AttendanceWorkspace = {
  date: string;
  rows: AttendanceRow[];
  sessionId: string;
  status: AttendanceSessionStatus;
  summary: ReturnType<typeof summarizeAttendance>;
};

export type TimetablePeriodView = {
  endsAt: string;
  id: string;
  kind: "lesson" | "break" | "assembly";
  name: string;
  position: number;
  startsAt: string;
};

export type TimetableEntryView = {
  changeReason: string | null;
  id: string;
  periodId: string;
  room: string;
  status: TimetableEntryStatus;
  subjectName: string;
  substituteTeacherName: string | null;
  teacherName: string;
  weekday: number;
};

export type TeacherOperationsWorkspace = {
  assignments: TeacherAssignmentSummary[];
  attendance: AttendanceWorkspace;
  className: string;
  currentDate: string;
  markingQueue: MarkingSubmission[];
  /* Every subject this teacher holds, the selected one included. The screen
     was gated on SCIENCE_OFFERING_ID and its register on one class group, so
     it showed JHS 2 Gold's Integrated Science to whoever could open it and
     refused everybody else. */
  offeringId: string | null;
  offerings: TeachingOffering[];
  periods: TimetablePeriodView[];
  subjectName: string;
  timetable: TimetableEntryView[];
};

/* What one request to this workspace is about: a class, and the subject being
   taught to it. The two are separate because the screen serves two roles —
   assignments and marking belong to a subject, the register and the timetable
   belong to the class.

   A class teacher may hold no subject at all and must still take their
   register, which is why the offering is nullable. */
type OperationsScope = {
  classGroupId: string;
  className: string;
  offering: TeachingOffering | null;
};

/** One handed-in file, as both the learner and the marker see it. */
export type SubmissionAttachmentView = {
  contentType: string;
  filename: string;
  id: string;
  sizeBytes: number;
  uploadedAt: string;
};

export type LearnerAssignmentView = {
  attachments: SubmissionAttachmentView[];
  dueAt: string;
  feedback: string | null;
  id: string;
  maximumPoints: number;
  score: number | null;
  status: SubmissionStatus;
  subjectName: string;
  title: string;
};

export type LearnerSchoolDayWorkspace = {
  assignments: LearnerAssignmentView[];
  attendance: {
    currentCode: AttendanceCode | null;
    summary: ReturnType<typeof summarizeAttendance>;
  };
  currentDate: string;
  learner: {
    className: string;
    id: string;
    name: string;
    studentId: string;
  };
  periods: TimetablePeriodView[];
  timetable: TimetableEntryView[];
};

export type GuardianAlertView = {
  id: string;
  issuedAt: string;
  message: string;
  status: "issued" | "read" | "dismissed";
  title: string;
};

export type GuardianSchoolDayWorkspace = LearnerSchoolDayWorkspace & {
  alerts: GuardianAlertView[];
  linkedChildren: Array<{ id: string; name: string }>;
};

export type CreateAssignmentInput = {
  /* Which of the teacher's subjects the assignment is for. Absent means the
     one they are looking at, which the repository resolves. */
  offeringId?: string;
  brief: string;
  criteria: Array<{
    description: string;
    maximumPoints: number;
    name: string;
  }>;
  dueAt: string;
  title: string;
};

export type SaveAttendanceInput = {
  code: AttendanceCode;
  correctionReason?: string;
  note?: string;
  recordId: string;
};

export type ReleaseRubricInput = {
  feedback: string;
  scores: RubricScore[];
  submissionId: string;
};

/* The class and subject a request is about.

   A subject teacher selects an offering and the class follows from it. A class
   teacher who teaches nothing falls back to the class they hold, so their
   register still opens. Anyone holding neither is told which of the two they
   are missing. */
async function resolveOperationsScope(
  database: SchoolDatabase,
  access: AccessContext,
  requestedOfferingId?: string,
): Promise<{ offerings: TeachingOffering[]; scope: OperationsScope }> {
  const offerings = await loadTeachingOfferings(database, access);

  if (requestedOfferingId && !canTeachOffering(access, requestedOfferingId)) {
    throw new AuthorizationError(
      "You are not assigned to this subject offering.",
    );
  }

  const offering = selectOffering(offerings, requestedOfferingId);
  if (offering) {
    return {
      offerings,
      scope: {
        classGroupId: offering.classGroupId,
        className: offering.className,
        offering,
      },
    };
  }

  const classGroupId = access.classGroupIds[0];
  if (!classGroupId) {
    throw new AuthorizationError(
      "No class or subject is assigned to your account. An administrator assigns both on the Academics screen.",
    );
  }
  const group = await database
    .prepare(`SELECT name FROM class_groups WHERE id = ? AND tenant_id = ? LIMIT 1`)
    .bind(classGroupId, access.tenantId)
    .first<{ name: string }>();
  return {
    offerings,
    scope: {
      classGroupId,
      className: group?.name ?? classGroupId,
      offering: null,
    },
  };
}

export async function getTeacherOperationsWorkspace(
  access: AccessContext,
  requestedOfferingId?: string,
): Promise<TeacherOperationsWorkspace> {
  requireTeacherOperationsAccess(access);
  await ensureOperationsFoundation();
  const database = await getSchoolDatabase();
  const { offerings, scope } = await resolveOperationsScope(
    database,
    access,
    requestedOfferingId,
  );
  if (access.role === "class-teacher") {
    await requireDailyAttendanceScope(access, scope.classGroupId);
  }

  const [assignments, attendance, periods, timetable] = await Promise.all([
    loadTeacherAssignments(database, access.tenantId, scope.offering?.id),
    loadAttendanceWorkspace(database, access.tenantId, scope.classGroupId),
    loadPeriods(database, access.tenantId),
    loadTimetable(database, access.tenantId, scope.classGroupId),
  ]);
  return {
    assignments,
    attendance,
    className: scope.className,
    currentDate: schoolDate(),
    markingQueue: await loadMarkingQueue(
      database,
      access.tenantId,
      scope.offering?.id,
    ),
    offeringId: scope.offering?.id ?? null,
    offerings,
    periods,
    subjectName: scope.offering?.subjectName ?? "No subject assigned",
    timetable,
  };
}

export async function createPersistentAssignment(
  access: AccessContext,
  input: CreateAssignmentInput,
) {
  requirePermission(access, "assignment:manage");
  await ensureOperationsFoundation();
  const database0 = await getSchoolDatabase();
  const { scope } = await resolveOperationsScope(
    database0,
    access,
    input.offeringId,
  );
  if (!scope.offering) {
    throw new AuthorizationError(
      "No subject offering is assigned to your account.",
    );
  }
  const criteria = input.criteria.map((criterion, index) => ({
    id: `criterion-${index + 1}`,
    maximumPoints: criterion.maximumPoints,
    name: criterion.name,
  }));
  const maximumPoints = criteria.reduce(
    (total, criterion) => total + criterion.maximumPoints,
    0,
  );
  const published = preparePublishedAssignment(
    {
      brief: input.brief,
      dueAt: input.dueAt,
      maximumPoints,
      opensAt: new Date().toISOString(),
      title: input.title,
    },
    criteria,
  );
  const database = await getSchoolDatabase();
  const assignmentId = crypto.randomUUID();
  const versionId = `${assignmentId}:v1`;
  const criterionIds = input.criteria.map(() => crypto.randomUUID());
  /* The class the subject is taught to, so publishing a Mathematics
     assignment creates submission rows for that class's learners rather than
     for JHS 2 Gold's. */
  const learners = await loadClassLearnerIds(
    database,
    access.tenantId,
    scope.offering.classGroupId,
  );
  await database.batch([
    database
      .prepare(
        `INSERT INTO assignments
          (id, tenant_id, offering_id, author_person_id, status, current_version)
        VALUES (?, ?, ?, ?, 'published', 1)`,
      )
      .bind(
        assignmentId,
        access.tenantId,
        scope.offering.id,
        access.actorPersonId,
      ),
    database
      .prepare(
        `INSERT INTO assignment_versions
          (id, tenant_id, assignment_id, version, title, brief, opens_at,
           due_at, maximum_points, submission_mode, status, published_at,
           created_by_person_id)
        VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, 'text', 'published', ?, ?)`,
      )
      .bind(
        versionId,
        access.tenantId,
        assignmentId,
        published.title.trim(),
        published.brief.trim(),
        published.opensAt,
        published.dueAt,
        published.maximumPoints,
        new Date().toISOString(),
        access.actorPersonId,
      ),
    ...input.criteria.flatMap((criterion, index) =>
      seedCriterionWithLevels(
        database,
        access.tenantId,
        versionId,
        criterionIds[index],
        criterion,
        index + 1,
      ),
    ),
    ...learners.map((learnerId) =>
      database
        .prepare(
          `INSERT INTO assignment_submissions
            (id, tenant_id, assignment_id, assignment_version,
             learner_person_id, status)
          VALUES (?, ?, ?, 1, ?, 'not-started')`,
        )
        .bind(
          crypto.randomUUID(),
          access.tenantId,
          assignmentId,
          learnerId,
        ),
    ),
    auditStatement(
      database,
      access,
      "assignment.published",
      "assignment",
      assignmentId,
      { version: 1 },
    ),
  ]);
  return getTeacherOperationsWorkspace(access);
}

export async function savePersistentAttendance(
  access: AccessContext,
  input: SaveAttendanceInput,
) {
  requirePermission(access, "attendance:manage");
  await ensureOperationsFoundation();
  const database = await getSchoolDatabase();
  /* The register being written decides which class teacher may write it. This
     read used to happen after the scope check, which could only be against the
     one hardcoded class. */
  const row = await database
    .prepare(
      `SELECT r.id, r.learner_person_id, r.code, r.note, s.id AS session_id,
        s.status AS session_status, s.class_group_id
      FROM attendance_records r
      INNER JOIN attendance_sessions s ON s.id = r.session_id
      WHERE r.id = ? AND r.tenant_id = ?
      LIMIT 1`,
    )
    .bind(input.recordId, access.tenantId)
    .first<{
      class_group_id: string;
      code: AttendanceCode;
      id: string;
      learner_person_id: string;
      note: string;
      session_id: string;
      session_status: AttendanceSessionStatus;
    }>();
  if (!row) {
    throw new DailyOperationsPolicyError(
      "Attendance record was not found.",
    );
  }
  await requireDailyAttendanceScope(access, row.class_group_id);
  if (row.session_status === "draft") {
    await database.batch([
      database
        .prepare(
          `UPDATE attendance_records
          SET code = ?, note = ?, recorded_by_person_id = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND tenant_id = ?`,
        )
        .bind(
          input.code,
          input.note?.trim() ?? "",
          access.actorPersonId,
          row.id,
          access.tenantId,
        ),
      auditStatement(
        database,
        access,
        "attendance.saved",
        "attendance-record",
        row.id,
        { code: input.code },
      ),
    ]);
  } else {
    const correction = correctAttendance(
      {
        code: row.code,
        learnerPersonId: row.learner_person_id,
        note: row.note,
      },
      input.code,
      input.correctionReason ?? "",
    );
    await database.batch([
      database
        .prepare(
          `INSERT INTO attendance_corrections
            (id, tenant_id, attendance_record_id, previous_code, new_code,
             reason, corrected_by_person_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          access.tenantId,
          row.id,
          correction.previousCode,
          correction.record.code,
          correction.reason,
          access.actorPersonId,
        ),
      database
        .prepare(
          `UPDATE attendance_records
          SET code = ?, note = ?, recorded_by_person_id = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND tenant_id = ?`,
        )
        .bind(
          correction.record.code,
          input.note?.trim() ?? row.note,
          access.actorPersonId,
          row.id,
          access.tenantId,
        ),
      database
        .prepare(
          `UPDATE attendance_sessions
          SET status = 'corrected', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND tenant_id = ?`,
        )
        .bind(row.session_id, access.tenantId),
      auditStatement(
        database,
        access,
        "attendance.corrected",
        "attendance-record",
        row.id,
        {
          newCode: correction.record.code,
          previousCode: correction.previousCode,
          reason: correction.reason,
        },
      ),
    ]);
  }
  return getTeacherOperationsWorkspace(access);
}

export async function submitPersistentAttendance(
  access: AccessContext,
  requestedOfferingId?: string,
) {
  requirePermission(access, "attendance:manage");
  await ensureOperationsFoundation();
  const database = await getSchoolDatabase();
  const { scope } = await resolveOperationsScope(
    database,
    access,
    requestedOfferingId,
  );
  await requireDailyAttendanceScope(access, scope.classGroupId);
  const attendance = await loadAttendanceWorkspace(
    database,
    access.tenantId,
    scope.classGroupId,
  );
  if (attendance.status !== "draft") {
    return getTeacherOperationsWorkspace(access, requestedOfferingId);
  }
  const rosterLearnerIds = await loadClassLearnerIds(
    database,
    access.tenantId,
    scope.classGroupId,
  );
  submitAttendanceRegister(
    rosterLearnerIds,
    attendance.rows,
    new Date().toISOString(),
  );
  const alerts = await buildGuardianAlertStatements(
    database,
    access,
    attendance,
  );
  await database.batch([
    database
      .prepare(
        `UPDATE attendance_sessions
        SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ? AND status = 'draft'`,
      )
      .bind(attendance.sessionId, access.tenantId),
    ...alerts.alertStatements,
    auditStatement(
      database,
      access,
      "attendance.submitted",
      "attendance-session",
      attendance.sessionId,
      summarizeAttendance(attendance.rows),
    ),
  ]);

  /* After the register is committed, and never allowed to fail it. A teacher
     whose morning register would not save because an SMTP server was slow is
     a teacher who stops taking the register in the product. */
  for (const notice of alerts.notices) {
    await sendAbsenceNoticeMail(notice);
  }

  return getTeacherOperationsWorkspace(access);
}

export async function releasePersistentRubric(
  access: AccessContext,
  input: ReleaseRubricInput,
) {
  requirePermission(access, "assignment:manage");
  await ensureOperationsFoundation();
  const database = await getSchoolDatabase();
  const submission = await loadSubmissionForMarking(
    database,
    access.tenantId,
    input.submissionId,
  );
  if (!canTeachOffering(access, submission.offering_id)) {
    throw new AuthorizationError(
      "You are not assigned to this assignment's subject offering.",
    );
  }
  const criteria = await loadRubricCriteria(
    database,
    access.tenantId,
    submission.assignment_version_id,
  );
  const released = releaseRubricMark(
    criteria,
    input.scores,
    new Date().toISOString(),
  );
  await database.batch([
    ...input.scores.map((score) =>
      database
        .prepare(
          `INSERT INTO rubric_scores
            (id, tenant_id, submission_id, criterion_id, points, comment,
             marked_by_person_id, marked_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (submission_id, criterion_id)
          DO UPDATE SET points = excluded.points, comment = excluded.comment,
            marked_by_person_id = excluded.marked_by_person_id,
            marked_at = excluded.marked_at`,
        )
        .bind(
          crypto.randomUUID(),
          access.tenantId,
          input.submissionId,
          score.criterionId,
          score.points,
          score.comment?.trim() ?? "",
          access.actorPersonId,
          released.releasedAt,
        ),
    ),
    database
      .prepare(
        `UPDATE assignment_submissions
        SET status = 'released', total_points = ?, feedback = ?,
          marked_by_person_id = ?, marked_at = ?, released_at = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?`,
      )
      .bind(
        released.earnedPoints,
        input.feedback.trim(),
        access.actorPersonId,
        released.releasedAt,
        released.releasedAt,
        input.submissionId,
        access.tenantId,
      ),
    auditStatement(
      database,
      access,
      "assignment.mark_released",
      "assignment-submission",
      input.submissionId,
      {
        earnedPoints: released.earnedPoints,
        maximumPoints: released.maximumPoints,
      },
    ),
  ]);
  return getTeacherOperationsWorkspace(access);
}

export async function changePersistentTimetableEntry(
  access: AccessContext,
  input: {
    entryId: string;
    reason: string;
    status: "cancelled" | "substituted";
    substituteTeacherPersonId?: string;
  },
) {
  requirePermission(access, "timetable:manage");
  await ensureOperationsFoundation();
  const database = await getSchoolDatabase();
  const row = await database
    .prepare(
      `SELECT e.id, e.class_group_id, e.teacher_person_id, e.room, e.weekday,
        e.status, p.starts_at, p.ends_at
      FROM timetable_entries e
      INNER JOIN timetable_periods p ON p.id = e.period_id
      WHERE e.id = ? AND e.tenant_id = ?
      LIMIT 1`,
    )
    .bind(input.entryId, access.tenantId)
    .first<{
      class_group_id: string;
      ends_at: string;
      id: string;
      room: string;
      starts_at: string;
      status: TimetableEntryStatus;
      teacher_person_id: string;
      weekday: number;
    }>();
  if (!row) {
    throw new DailyOperationsPolicyError("Timetable entry was not found.");
  }
  const changed = changeTimetableEntry(
    {
      classGroupId: row.class_group_id,
      endMinute: toMinutes(row.ends_at),
      id: row.id,
      room: row.room,
      startMinute: toMinutes(row.starts_at),
      status: row.status,
      teacherPersonId: row.teacher_person_id,
      weekday: row.weekday,
    },
    input.status,
    input.reason,
    input.substituteTeacherPersonId,
  );
  await database.batch([
    database
      .prepare(
        `UPDATE timetable_entries
        SET status = ?, substitute_teacher_person_id = ?, change_reason = ?
        WHERE id = ? AND tenant_id = ?`,
      )
      .bind(
        changed.status,
        changed.substituteTeacherPersonId ?? null,
        changed.changeReason,
        row.id,
        access.tenantId,
      ),
    auditStatement(
      database,
      access,
      `timetable.${changed.status}`,
      "timetable-entry",
      row.id,
      { reason: changed.changeReason },
    ),
  ]);
  return getTeacherOperationsWorkspace(access);
}

export async function getLearnerSchoolDay(
  access: AccessContext,
  requestedLearnerId?: string,
) {
  await ensureOperationsFoundation();
  const database = await getSchoolDatabase();
  const learnerId = await resolveLearnerId(
    database,
    access,
    requestedLearnerId,
  );
  if (!canAccessLearner(access, learnerId)) {
    throw new AuthorizationError(
      "You are not authorised to view this learner's school day.",
    );
  }
  return buildLearnerSchoolDay(database, access.tenantId, learnerId);
}

export async function submitPersistentLearnerAssignment(
  access: AccessContext,
  input: { assignmentId: string; responseText: string },
) {
  if (access.role !== "learner") {
    throw new AuthorizationError(
      "Only the learner may submit work from this school-day view.",
    );
  }
  await ensureOperationsFoundation();
  const database = await getSchoolDatabase();

  /* Counting is only worth a round trip when there is no written answer to
     accept on its own. */
  assertSubmittableWork({
    attachmentCount: input.responseText.trim()
      ? 1
      : await countSubmissionAttachments(
          database,
          access,
          input.assignmentId,
        ),
    responseText: input.responseText,
  });
  const submission = await database
    .prepare(
      `SELECT s.id, s.status, v.due_at
      FROM assignment_submissions s
      INNER JOIN assignments a ON a.id = s.assignment_id
      INNER JOIN assignment_versions v
        ON v.assignment_id = a.id AND v.version = s.assignment_version
      WHERE s.assignment_id = ? AND s.learner_person_id = ?
        AND s.tenant_id = ? AND a.status = 'published'
      LIMIT 1`,
    )
    .bind(input.assignmentId, access.actorPersonId, access.tenantId)
    .first<{ due_at: string; id: string; status: SubmissionStatus }>();
  if (!submission || submission.status !== "not-started") {
    throw new DailyOperationsPolicyError(
      "This assignment is not available for a new submission.",
    );
  }
  const submittedAt = new Date().toISOString();
  const status =
    new Date(submittedAt) > new Date(submission.due_at)
      ? "late"
      : "submitted";
  await database.batch([
    database
      .prepare(
        `UPDATE assignment_submissions
        SET status = ?, response_text = ?, submitted_at = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ? AND status = 'not-started'`,
      )
      .bind(
        status,
        input.responseText.trim(),
        submittedAt,
        submission.id,
        access.tenantId,
      ),
    auditStatement(
      database,
      access,
      "assignment.submitted",
      "assignment-submission",
      submission.id,
      { status },
    ),
  ]);
  return getLearnerSchoolDay(access);
}

/* ==========================================================================
   Submission attachments

   Handed-in files go through media_assets like every other upload, so they
   inherit its size and type rules and its storage layout. What they do not
   inherit is its access check: media_assets is scoped to a subject offering,
   and every learner in a class shares that offering — serving submissions
   through the ordinary media route would let any classmate read anyone's work
   by guessing an id. Hence the dedicated reader below, which resolves the
   owner before it resolves the bytes.
   ========================================================================== */

/** Where a learner's own draft submission lives, or an error explaining why not. */
async function findOwnOpenSubmission(
  database: SchoolDatabase,
  access: AccessContext,
  assignmentId: string,
) {
  const submission = await database
    .prepare(
      `SELECT s.id, s.status, a.offering_id
      FROM assignment_submissions s
      INNER JOIN assignments a ON a.id = s.assignment_id
      WHERE s.assignment_id = ? AND s.learner_person_id = ?
        AND s.tenant_id = ? AND a.status = 'published'
      LIMIT 1`,
    )
    .bind(assignmentId, access.actorPersonId, access.tenantId)
    .first<{ id: string; offering_id: string; status: SubmissionStatus }>();
  if (!submission) {
    throw new DailyOperationsPolicyError("That assignment is not open to you.");
  }
  return submission;
}

async function countSubmissionAttachments(
  database: SchoolDatabase,
  access: AccessContext,
  assignmentId: string,
): Promise<number> {
  const submission = await findOwnOpenSubmission(
    database,
    access,
    assignmentId,
  );
  const row = await database
    .prepare(
      `SELECT COUNT(*) AS total FROM submission_attachments
      WHERE tenant_id = ? AND submission_id = ?`,
    )
    .bind(access.tenantId, submission.id)
    .first<{ total: number }>();
  return Number(row?.total ?? 0);
}

/**
 * Attaches a file to the learner's own submission.
 *
 * Only before it is handed in: once a submission is submitted or marked, its
 * contents are what the teacher is looking at, and quietly adding a page to it
 * afterwards is not something a marker could see.
 */
export async function attachLearnerSubmissionFile(
  access: AccessContext,
  input: { assignmentId: string; file: File },
): Promise<LearnerSchoolDayWorkspace> {
  if (access.role !== "learner") {
    throw new AuthorizationError(
      "Only the learner may attach work to their own submission.",
    );
  }
  await ensureOperationsFoundation();
  const database = await getSchoolDatabase();
  const submission = await findOwnOpenSubmission(
    database,
    access,
    input.assignmentId,
  );
  if (submission.status !== "not-started") {
    throw new DailyOperationsPolicyError(
      "This assignment has already been handed in.",
    );
  }

  const existing = await database
    .prepare(
      `SELECT COUNT(*) AS total FROM submission_attachments
      WHERE tenant_id = ? AND submission_id = ?`,
    )
    .bind(access.tenantId, submission.id)
    .first<{ total: number }>();
  if (Number(existing?.total ?? 0) >= MAX_SUBMISSION_ATTACHMENTS) {
    throw new DailyOperationsPolicyError(
      `A submission can carry at most ${MAX_SUBMISSION_ATTACHMENTS} files.`,
    );
  }

  const contentType = input.file.type || "application/octet-stream";
  /* Handed-in work is a document or a photograph of one; the kind is inferred
     rather than taken from the client, which has no business choosing how its
     own upload gets validated. */
  const kind: MediaKind = contentType.startsWith("image/")
    ? "image"
    : "document";
  const validated = validateUpload({
    contentType,
    filename: input.file.name,
    kind,
    sizeBytes: input.file.size,
  });
  /* Read once, checked, then written from the same bytes. Handed-in work is
     the upload path a school has least control over — it is whatever a learner
     had on their phone. */
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  await scanUpload({ bytes, extension: validated.extension, kind });

  const assetId = crypto.randomUUID();
  const objectKey = [
    access.tenantId,
    submission.offering_id,
    `${assetId}.${validated.extension}`,
  ].join("/");
  const bucket = await getMediaStore();
  /* The bytes already read for the scan, rather than a second pass over
     the same 25 MB. */
  await bucket.put(objectKey, bytes, {
    customMetadata: {
      assetId,
      offeringId: submission.offering_id,
      tenantId: access.tenantId,
    },
    httpMetadata: { contentType },
  });

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
          submission.offering_id,
          access.actorPersonId,
          kind,
          validated.filename,
          contentType,
          input.file.size,
          objectKey,
        ),
      database
        .prepare(
          `INSERT INTO submission_attachments
            (id, tenant_id, submission_id, media_asset_id, uploaded_at)
          VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          access.tenantId,
          submission.id,
          assetId,
          new Date().toISOString(),
        ),
      auditStatement(
        database,
        access,
        "assignment.attachment-added",
        "assignment-submission",
        submission.id,
        { assetId },
      ),
    ]);
  } catch (error) {
    /* The bytes landed but the rows did not, so the object would otherwise sit
       in storage with nothing pointing at it. */
    await bucket.delete(objectKey).catch(() => undefined);
    throw error;
  }

  return getLearnerSchoolDay(access);
}

/** Removes one of the learner's own attachments, before it is handed in. */
export async function removeLearnerSubmissionFile(
  access: AccessContext,
  attachmentId: string,
): Promise<LearnerSchoolDayWorkspace> {
  if (access.role !== "learner") {
    throw new AuthorizationError(
      "Only the learner may remove their own attachment.",
    );
  }
  await ensureOperationsFoundation();
  const database = await getSchoolDatabase();
  const row = await database
    .prepare(
      `SELECT t.id, t.media_asset_id, m.object_key, s.status, s.id AS submission_id
      FROM submission_attachments t
      INNER JOIN assignment_submissions s ON s.id = t.submission_id
      INNER JOIN media_assets m ON m.id = t.media_asset_id
      WHERE t.id = ? AND t.tenant_id = ? AND s.learner_person_id = ?
      LIMIT 1`,
    )
    .bind(attachmentId, access.tenantId, access.actorPersonId)
    .first<{
      id: string;
      media_asset_id: string;
      object_key: string;
      status: SubmissionStatus;
      submission_id: string;
    }>();
  if (!row) {
    throw new DailyOperationsPolicyError("That attachment is not yours.");
  }
  if (row.status !== "not-started") {
    throw new DailyOperationsPolicyError(
      "Work that has been handed in cannot be changed.",
    );
  }

  await database.batch([
    database
      .prepare(
        `DELETE FROM submission_attachments WHERE id = ? AND tenant_id = ?`,
      )
      .bind(row.id, access.tenantId),
    /* The asset row is marked rather than deleted so the audit trail still
       resolves the filename it is talking about. */
    database
      .prepare(
        `UPDATE media_assets SET status = 'deleted'
        WHERE id = ? AND tenant_id = ?`,
      )
      .bind(row.media_asset_id, access.tenantId),
    auditStatement(
      database,
      access,
      "assignment.attachment-removed",
      "assignment-submission",
      row.submission_id,
      { assetId: row.media_asset_id },
    ),
  ]);
  const bucket = await getMediaStore();
  await bucket.delete(row.object_key).catch(() => undefined);
  return getLearnerSchoolDay(access);
}

/**
 * Streams one attachment to someone entitled to read it.
 *
 * Entitled means the learner who handed it in, or a teacher assigned to the
 * offering the assignment belongs to. Guardians are deliberately not included
 * yet: nothing in the product shows them submitted work, and widening the read
 * here would be the only place it were possible.
 */
export async function getSubmissionAttachmentResponse(
  access: AccessContext,
  attachmentId: string,
): Promise<Response> {
  await ensureOperationsFoundation();
  const database = await getSchoolDatabase();
  const row = await database
    .prepare(
      `SELECT m.object_key, m.content_type, m.original_filename, m.size_bytes,
        s.learner_person_id, a.offering_id
      FROM submission_attachments t
      INNER JOIN assignment_submissions s ON s.id = t.submission_id
      INNER JOIN assignments a ON a.id = s.assignment_id
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
    throw new AuthorizationError(
      "You are not authorised to read this submission.",
    );
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

/** Attachments for a set of submissions, in one query rather than per row. */
async function loadSubmissionAttachments(
  database: SchoolDatabase,
  tenantId: string,
  submissionIds: string[],
): Promise<Map<string, SubmissionAttachmentView[]>> {
  const bySubmission = new Map<string, SubmissionAttachmentView[]>();
  if (submissionIds.length === 0) return bySubmission;

  const placeholders = submissionIds.map(() => "?").join(", ");
  const result = await database
    .prepare(
      `SELECT t.id, t.submission_id, t.uploaded_at, m.original_filename,
        m.content_type, m.size_bytes
      FROM submission_attachments t
      INNER JOIN media_assets m ON m.id = t.media_asset_id
      WHERE t.tenant_id = ? AND m.status = 'ready'
        AND t.submission_id IN (${placeholders})
      ORDER BY t.uploaded_at`,
    )
    .bind(tenantId, ...submissionIds)
    .all<{
      content_type: string;
      id: string;
      original_filename: string;
      size_bytes: number;
      submission_id: string;
      uploaded_at: string;
    }>();

  for (const row of result.results) {
    const list = bySubmission.get(row.submission_id) ?? [];
    list.push({
      contentType: row.content_type,
      filename: row.original_filename,
      id: row.id,
      sizeBytes: Number(row.size_bytes),
      uploadedAt: row.uploaded_at,
    });
    bySubmission.set(row.submission_id, list);
  }
  return bySubmission;
}

export async function getGuardianSchoolDay(
  access: AccessContext,
  requestedLearnerId?: string,
): Promise<GuardianSchoolDayWorkspace> {
  await ensureOperationsFoundation();
  const database = await getSchoolDatabase();
  const linkedChildren = await loadAccessibleChildren(database, access);
  /* An administrator previewing a family's view gets their own id and is
     refused unless they may see it, rather than being handed one particular
     demo learner by name. */
  const defaultLearnerId =
    access.role === "guardian"
      ? linkedChildren[0]?.id
      : access.role === "learner"
        ? access.actorPersonId
        : access.actorPersonId;
  const learnerId =
    requestedLearnerId ?? defaultLearnerId ?? access.actorPersonId;
  if (!canAccessLearner(access, learnerId)) {
    throw new AuthorizationError(
      "You are not authorised to view this learner's school day.",
    );
  }
  const schoolDay = await buildLearnerSchoolDay(
    database,
    access.tenantId,
    learnerId,
  );
  return {
    ...schoolDay,
    alerts: await loadGuardianAlerts(
      database,
      access.tenantId,
      learnerId,
      access.role === "guardian" ? access.actorPersonId : undefined,
    ),
    linkedChildren:
      linkedChildren.length > 0
        ? linkedChildren
        : [{ id: schoolDay.learner.id, name: schoolDay.learner.name }],
  };
}

export async function ensureOperationsFoundation() {
  await ensurePeopleSeed();
  await ensureReportingFoundation();
  /* A school's timetable, its registers and its homework are its own. */
  if (!demoSchoolEnabled()) return;

  const database = await getSchoolDatabase();
  /* A timetable entry names its offering, and the homework below is Integrated
     Science's, so both reach only what the learning seed created — see
     seededDemoOfferingIds(). */
  const seeded = await seededDemoOfferingIds();
  await database.batch([
    ...seedTimetablePeriods(database),
    ...seedTimetableEntries(database, seeded),
    ...(seeded.has(SCIENCE_OFFERING_ID) ? seedAssignments(database) : []),
    ...seedAttendance(database),
  ]);
}

function seedAssignments(database: SchoolDatabase) {
  const statements: SchoolStatement[] = [
    database
      .prepare(
        `INSERT OR IGNORE INTO assignments
          (id, tenant_id, offering_id, author_person_id, status, current_version)
        VALUES ('assignment-body-systems', ?, ?, 'person-grace', 'published', 1)`,
      )
      .bind(TENANT_ID, SCIENCE_OFFERING_ID),
    database
      .prepare(
        `INSERT OR IGNORE INTO assignment_versions
          (id, tenant_id, assignment_id, version, title, brief, opens_at,
           due_at, maximum_points, submission_mode, status, published_at,
           created_by_person_id)
        VALUES ('assignment-body-systems:v1', ?, 'assignment-body-systems', 1,
          'Body systems model', ?, '2026-07-20T08:00:00Z',
          '2026-07-28T16:00:00Z', 20, 'text', 'published',
          '2026-07-20T08:00:00Z', 'person-grace')`,
      )
      .bind(
        TENANT_ID,
        "Build or draw a labelled model showing how two body systems work together. Explain the connection in 150 words.",
      ),
  ];
  const criteria = [
    {
      description: "Labels, functions, and scientific relationships are correct.",
      id: "criterion-science-accuracy",
      maximumPoints: 12,
      name: "Scientific accuracy",
    },
    {
      description: "The model and explanation communicate the idea clearly.",
      id: "criterion-science-communication",
      maximumPoints: 8,
      name: "Communication",
    },
  ];
  criteria.forEach((criterion, index) => {
    statements.push(
      ...seedCriterionWithLevels(
        database,
        TENANT_ID,
        "assignment-body-systems:v1",
        criterion.id,
        criterion,
        index + 1,
      ),
    );
  });
  const submissions = [
    {
      id: "submission-body-kwame",
      learnerId: "person-kwame",
      response:
        "My model connects the digestive and circulatory systems. Nutrients pass through the small intestine into the blood, which carries them to body cells.",
      status: "submitted",
      submittedAt: "2026-07-23T15:14:00Z",
    },
    {
      id: "submission-body-ama",
      learnerId: "person-ama",
      response:
        "I linked the respiratory and circulatory systems and labelled how oxygen travels from the lungs to cells.",
      status: "submitted",
      submittedAt: "2026-07-23T13:42:00Z",
    },
    {
      id: "submission-body-kojo",
      learnerId: "person-kojo",
      response: "",
      status: "not-started",
      submittedAt: null,
    },
  ] as const;
  submissions.forEach((submission) => {
    statements.push(
      database
        .prepare(
          `INSERT OR IGNORE INTO assignment_submissions
            (id, tenant_id, assignment_id, assignment_version,
             learner_person_id, status, response_text, submitted_at)
          VALUES (?, ?, 'assignment-body-systems', 1, ?, ?, ?, ?)`,
        )
        .bind(
          submission.id,
          TENANT_ID,
          submission.learnerId,
          submission.status,
          submission.response,
          submission.submittedAt,
        ),
    );
  });
  return statements;
}

function seedCriterionWithLevels(
  database: SchoolDatabase,
  tenantId: string,
  versionId: string,
  criterionId: string,
  criterion: {
    description: string;
    maximumPoints: number;
    name: string;
  },
  position: number,
) {
  return [
    database
      .prepare(
        `INSERT OR IGNORE INTO rubric_criteria
          (id, tenant_id, assignment_version_id, position, name,
           description, maximum_points)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        criterionId,
        tenantId,
        versionId,
        position,
        criterion.name.trim(),
        criterion.description.trim(),
        criterion.maximumPoints,
      ),
    ...[
      ["Excellent", criterion.maximumPoints, "Complete, accurate, and independent evidence."],
      ["Secure", Math.round(criterion.maximumPoints * 0.75), "Mostly accurate evidence with minor gaps."],
      ["Developing", Math.round(criterion.maximumPoints * 0.5), "Partial evidence that needs further support."],
      ["Beginning", Math.round(criterion.maximumPoints * 0.25), "Limited evidence of the expected outcome."],
    ].map(([name, points, descriptor], index) =>
      database
        .prepare(
          `INSERT OR IGNORE INTO rubric_levels
            (id, tenant_id, criterion_id, position, name, points, descriptor)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          `${criterionId}:level-${index + 1}`,
          tenantId,
          criterionId,
          index + 1,
          name,
          points,
          descriptor,
        ),
    ),
  ];
}

function seedTimetablePeriods(database: SchoolDatabase) {
  return demoPeriods.map((period) =>
    database
      .prepare(
        `INSERT OR IGNORE INTO timetable_periods
          (id, tenant_id, name, position, starts_at, ends_at, kind)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        period.id,
        TENANT_ID,
        period.name,
        period.position,
        period.startsAt,
        period.endsAt,
        period.kind,
      ),
  );
}

function seedTimetableEntries(
  database: SchoolDatabase,
  seeded: Set<string>,
) {
  /* Every entry now carries the offering it belongs to, so a learner can open
     the subject from their timetable — three of the four could not before —
     and the teacher on it is the teacher who owns the subject. An entry whose
     offering was not seeded is left off rather than pointed at nothing. */
  return demoTimetable
    .filter((entry) => !entry.offeringId || seeded.has(entry.offeringId))
    .map((entry) =>
    database
      .prepare(
        `INSERT OR IGNORE INTO timetable_entries
          (id, tenant_id, period_id, weekday, class_group_id, offering_id,
           teacher_person_id, subject_name, room, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
      )
      .bind(
        entry.id,
        TENANT_ID,
        entry.periodId,
        entry.weekday,
        CLASS_GROUP_ID,
        entry.offeringId,
        entry.teacherPersonId,
        entry.subjectName,
        entry.room,
      ),
  );
}

function seedAttendance(database: SchoolDatabase) {
  const statements: SchoolStatement[] = [];
  /* The last four school days, ending today. These were four fixed dates in
     July 2026, so a demo opened in any other week showed a register nobody
     could take and three days of history that had already passed.

     The run skips weekends, so a Monday reaches back to the previous
     Wednesday. Today's register is a draft — it is the one waiting to be
     taken — and the days before it are submitted.

     Every statement is INSERT OR IGNORE, so a register a teacher has already
     submitted is never reset by the next boot. A day that came and went
     without anybody taking it stays a draft, which is what happened. */
  /* Three completed days, plus today's if the school is open. Asking for a
     fourth day only when there is a today to spend it on: on a Saturday the
     run still has to end on the Friday just gone, and dropping that entry
     instead would lose a real school day's register. */
  const openToday = isSchoolDay();
  const days = recentSchoolDays(openToday ? 4 : 3);
  const today = openToday ? days.pop() : undefined;
  const marks = [
    ["present", "present", "late"],
    ["present", "absent", "present"],
    ["present", "present", "present"],
  ];

  const sessions = [
    ...days.map((date, index) => ({
      date,
      records: marks[index % marks.length],
      status: "submitted",
    })),
    /* Today's is the one waiting to be taken. Never seeded on a day the
       school is shut, which would ask a teacher to mark a day that did not
       happen. */
    ...(today
      ? [
          {
            date: today,
            records: ["present", "present", "late"],
            status: "draft",
          },
        ]
      : []),
  ].map((session) => ({ ...session, id: `attendance-${session.date}` }));
  const learnerIds = demoLearners.map((learner) => learner.id);
  sessions.forEach((session) => {
    statements.push(
      database
        .prepare(
          `INSERT OR IGNORE INTO attendance_sessions
            (id, tenant_id, class_group_id, session_date, mode, status,
             taken_by_person_id, submitted_at)
          VALUES (?, ?, ?, ?, 'daily', ?, 'person-emmanuel', ?)`,
        )
        .bind(
          session.id,
          TENANT_ID,
          CLASS_GROUP_ID,
          session.date,
          session.status,
          session.status === "submitted"
            ? `${session.date}T08:20:00Z`
            : null,
        ),
    );
    learnerIds.forEach((learnerId, index) => {
      statements.push(
        database
          .prepare(
            `INSERT OR IGNORE INTO attendance_records
              (id, tenant_id, session_id, learner_person_id, code, note,
               recorded_by_person_id)
            VALUES (?, ?, ?, ?, ?, '', 'person-emmanuel')`,
          )
          .bind(
            `${session.id}:${learnerId}`,
            TENANT_ID,
            session.id,
            learnerId,
            session.records[index],
          ),
      );
    });
  });
  /* The alert that follows the absence seeded above, on whichever day that
     now falls. Its id moves with the date so a new week's alert is a new row
     rather than one that silently kept July's wording. */
  const absenceDate = days[1];
  statements.push(
    database
      .prepare(
        `INSERT OR IGNORE INTO guardian_alerts
          (id, tenant_id, guardian_person_id, learner_person_id, source_type,
           source_id, kind, title, message, status, issued_at)
        VALUES (?, ?, 'person-efua', 'person-kwame', 'attendance', ?,
          'absence', 'Kwame was marked absent', ?, 'issued', ?)`,
      )
      .bind(
        `alert-kwame-absence-${absenceDate}`,
        TENANT_ID,
        `attendance-${absenceDate}:person-kwame`,
        `Kwame was marked absent from ${CLASS_NAME} on ${absenceDate}. Please contact the school if this record needs clarification.`,
        `${absenceDate}T08:22:00Z`,
      ),
  );
  return statements;
}

async function loadTeacherAssignments(
  database: SchoolDatabase,
  tenantId: string,
  offeringId?: string,
) {
  /* A class teacher who teaches no subject has no assignments, which is not
     the same as an error. */
  if (!offeringId) return [];
  const result = await database
    .prepare(
      `SELECT a.id, a.status, v.id AS version_id, v.title, v.due_at,
        v.maximum_points,
        COUNT(s.id) AS submission_count,
        SUM(CASE WHEN s.status IN ('submitted', 'late') THEN 1 ELSE 0 END)
          AS needs_marking
      FROM assignments a
      INNER JOIN assignment_versions v
        ON v.assignment_id = a.id AND v.version = a.current_version
      LEFT JOIN assignment_submissions s ON s.assignment_id = a.id
      WHERE a.tenant_id = ? AND a.offering_id = ?
        AND a.status != 'archived'
      GROUP BY a.id, v.id
      ORDER BY v.due_at`,
    )
    .bind(tenantId, offeringId)
    .all<{
      due_at: string;
      id: string;
      maximum_points: number;
      needs_marking: number;
      status: string;
      submission_count: number;
      title: string;
      version_id: string;
    }>();
  return Promise.all(
    result.results.map(async (row) => ({
      dueAt: row.due_at,
      id: row.id,
      maximumPoints: row.maximum_points,
      needsMarking: Number(row.needs_marking ?? 0),
      rubric: await loadRubricCriteria(database, tenantId, row.version_id),
      status: row.status,
      submissionCount: Number(row.submission_count),
      title: row.title,
    })),
  );
}

async function loadMarkingQueue(
  database: SchoolDatabase,
  tenantId: string,
  offeringId?: string,
) {
  if (!offeringId) return [];
  const result = await database
    .prepare(
      `SELECT s.id, s.status, s.response_text, s.submitted_at,
        p.id AS learner_id, p.first_name || ' ' || p.last_name AS learner_name,
        p.student_number,
        a.id AS assignment_id, v.id AS version_id, v.title
      FROM assignment_submissions s
      INNER JOIN people p ON p.id = s.learner_person_id
      INNER JOIN assignments a ON a.id = s.assignment_id
      INNER JOIN assignment_versions v
        ON v.assignment_id = a.id AND v.version = s.assignment_version
      /* Scoped to the offering. This asked only for the tenant, so every
         teacher's marking queue held every other teacher's submissions. */
      WHERE s.tenant_id = ? AND a.offering_id = ?
        AND s.status IN ('submitted', 'late')
      ORDER BY s.submitted_at`,
    )
    .bind(tenantId, offeringId)
    .all<{
      assignment_id: string;
      id: string;
      learner_id: string;
      learner_name: string;
      response_text: string;
      student_number: string | null;
      status: SubmissionStatus;
      submitted_at: string;
      title: string;
      version_id: string;
    }>();
  const attachments = await loadSubmissionAttachments(
    database,
    tenantId,
    result.results.map((row) => row.id),
  );
  return Promise.all(
    result.results.map(async (row) => ({
      assignmentId: row.assignment_id,
      assignmentTitle: row.title,
      attachments: attachments.get(row.id) ?? [],
      criteria: await loadRubricCriteria(
        database,
        tenantId,
        row.version_id,
      ),
      id: row.id,
      learnerName: row.learner_name,
      responseText: row.response_text,
      status: row.status,
      studentId: row.student_number ?? "",
      submittedAt: row.submitted_at,
    })),
  );
}

async function loadRubricCriteria(
  database: SchoolDatabase,
  tenantId: string,
  versionId: string,
) {
  const result = await database
    .prepare(
      `SELECT id, name, description, maximum_points
      FROM rubric_criteria
      WHERE tenant_id = ? AND assignment_version_id = ?
      ORDER BY position`,
    )
    .bind(tenantId, versionId)
    .all<{
      description: string;
      id: string;
      maximum_points: number;
      name: string;
    }>();
  return result.results.map((row) => ({
    description: row.description,
    id: row.id,
    maximumPoints: row.maximum_points,
    name: row.name,
  }));
}

async function loadAttendanceWorkspace(
  database: SchoolDatabase,
  tenantId: string,
  classGroupId: string,
) {
  const session = await database
    .prepare(
      `SELECT id, session_date, status
      FROM attendance_sessions
      WHERE tenant_id = ? AND class_group_id = ? AND session_date = ?
        AND mode = 'daily'
      LIMIT 1`,
    )
    .bind(tenantId, classGroupId, schoolDate())
    .first<{
      id: string;
      session_date: string;
      status: AttendanceSessionStatus;
    }>();
  /* A class with no register taken today has an empty one, not an error. Only
     the seeded class has a session, so throwing here is what made every other
     class's daily workspace unopenable. */
  if (!session) {
    return {
      date: schoolDate(),
      rows: [],
      sessionId: "",
      status: "draft" as AttendanceSessionStatus,
      summary: summarizeAttendance([]),
    };
  }
  const result = await database
    .prepare(
      `SELECT r.id, r.learner_person_id, r.code, r.note, p.student_number,
        p.first_name || ' ' || p.last_name AS learner_name
      FROM attendance_records r
      INNER JOIN people p ON p.id = r.learner_person_id
      WHERE r.tenant_id = ? AND r.session_id = ?
      ORDER BY p.first_name, p.last_name`,
    )
    .bind(tenantId, session.id)
    .all<{
      code: AttendanceCode;
      id: string;
      learner_name: string;
      learner_person_id: string;
      note: string;
      student_number: string | null;
    }>();
  const rows: AttendanceRow[] = result.results.map((row) => ({
    code: row.code,
    learnerName: row.learner_name,
    learnerPersonId: row.learner_person_id,
    note: row.note,
    recordId: row.id,
    studentId: row.student_number ?? "",
  }));
  return {
    date: session.session_date,
    rows,
    sessionId: session.id,
    status: session.status,
    summary: summarizeAttendance(rows),
  };
}

async function loadPeriods(database: SchoolDatabase, tenantId: string) {
  const result = await database
    .prepare(
      `SELECT id, name, position, starts_at, ends_at, kind
      FROM timetable_periods WHERE tenant_id = ? ORDER BY position`,
    )
    .bind(tenantId)
    .all<{
      ends_at: string;
      id: string;
      kind: TimetablePeriodView["kind"];
      name: string;
      position: number;
      starts_at: string;
    }>();
  return result.results.map((row) => ({
    endsAt: row.ends_at,
    id: row.id,
    kind: row.kind,
    name: row.name,
    position: row.position,
    startsAt: row.starts_at,
  }));
}

async function loadTimetable(
  database: SchoolDatabase,
  tenantId: string,
  classGroupId: string,
) {
  const result = await database
    .prepare(
      `SELECT e.id, e.period_id, e.weekday, e.subject_name, e.room, e.status,
        e.change_reason,
        COALESCE(t.first_name || ' ' || t.last_name, 'School team') AS teacher_name,
        CASE WHEN st.id IS NULL THEN NULL
          ELSE st.first_name || ' ' || st.last_name END AS substitute_name
      FROM timetable_entries e
      LEFT JOIN people t ON t.id = e.teacher_person_id
      LEFT JOIN people st ON st.id = e.substitute_teacher_person_id
      WHERE e.tenant_id = ? AND e.class_group_id = ?
      ORDER BY e.weekday, e.period_id`,
    )
    .bind(tenantId, classGroupId)
    .all<{
      change_reason: string | null;
      id: string;
      period_id: string;
      room: string;
      status: TimetableEntryStatus;
      subject_name: string;
      substitute_name: string | null;
      teacher_name: string;
      weekday: number;
    }>();
  return result.results.map((row) => ({
    changeReason: row.change_reason,
    id: row.id,
    periodId: row.period_id,
    room: row.room,
    status: row.status,
    subjectName: row.subject_name,
    substituteTeacherName: row.substitute_name,
    teacherName: row.teacher_name,
    weekday: row.weekday,
  }));
}

async function buildLearnerSchoolDay(
  database: SchoolDatabase,
  tenantId: string,
  learnerId: string,
): Promise<LearnerSchoolDayWorkspace> {
  const learner = await database
    .prepare(
      `SELECT id, student_number, first_name || ' ' || last_name AS name
      FROM people WHERE id = ? AND tenant_id = ? AND kind = 'learner'
      LIMIT 1`,
    )
    .bind(learnerId, tenantId)
    .first<{ id: string; name: string; student_number: string | null }>();
  if (!learner) {
    throw new DailyOperationsPolicyError("Learner was not found.");
  }
  /* The learner's own class, so their school day is their timetable rather
     than JHS 2 Gold's. */
  const placement = await loadLearnerPlacement(database, tenantId, learnerId);
  const learnerClassGroupId = placement?.id ?? CLASS_GROUP_ID;
  const [assignments, attendanceRecords, periods, timetable] =
    await Promise.all([
      loadLearnerAssignments(database, tenantId, learnerId),
      loadLearnerAttendance(database, tenantId, learnerId),
      loadPeriods(database, tenantId),
      loadTimetable(database, tenantId, learnerClassGroupId),
    ]);
  const currentRecord = attendanceRecords.find(
    (record) => record.sessionDate === schoolDate() && record.submitted,
  );
  return {
    assignments,
    attendance: {
      currentCode: currentRecord?.code ?? null,
      summary: summarizeAttendance(
        attendanceRecords
          .filter((record) => record.submitted)
          .map((record) => ({
            code: record.code,
            learnerPersonId: learnerId,
          })),
      ),
    },
    currentDate: schoolDate(),
    learner: {
      /* The class this learner is actually placed in. CLASS_NAME — the
         demo school's "JHS 2 Gold" — stood here, so every learner's school
         day claimed the same class whatever their placement said. */
      className: placement?.name ?? "",
      id: learner.id,
      name: learner.name,
      studentId: learner.student_number ?? "",
    },
    periods,
    timetable: timetable.filter(
      (entry) => entry.weekday === schoolWeekday(),
    ),
  };
}

async function loadLearnerAssignments(
  database: SchoolDatabase,
  tenantId: string,
  learnerId: string,
) {
  const result = await database
    .prepare(
      `SELECT a.id, v.title, v.due_at, v.maximum_points, s.status,
        s.total_points, s.feedback, s.id AS submission_id
      FROM assignments a
      INNER JOIN assignment_versions v
        ON v.assignment_id = a.id AND v.version = a.current_version
      INNER JOIN assignment_submissions s
        ON s.assignment_id = a.id AND s.assignment_version = v.version
      WHERE a.tenant_id = ? AND s.learner_person_id = ?
        AND a.status = 'published'
      ORDER BY v.due_at`,
    )
    .bind(tenantId, learnerId)
    .all<{
      due_at: string;
      feedback: string | null;
      id: string;
      maximum_points: number;
      status: SubmissionStatus;
      submission_id: string;
      title: string;
      total_points: number | null;
    }>();
  const attachments = await loadSubmissionAttachments(
    database,
    tenantId,
    result.results.map((row) => row.submission_id),
  );
  return result.results.map((row) => ({
    attachments: attachments.get(row.submission_id) ?? [],
    dueAt: row.due_at,
    feedback: row.feedback,
    id: row.id,
    maximumPoints: row.maximum_points,
    score: row.total_points,
    status: row.status,
    subjectName: "Integrated Science",
    title: row.title,
  }));
}

async function loadLearnerAttendance(
  database: SchoolDatabase,
  tenantId: string,
  learnerId: string,
) {
  const result = await database
    .prepare(
      `SELECT r.code, s.session_date,
        CASE WHEN s.status IN ('submitted', 'corrected') THEN 1 ELSE 0 END
          AS submitted
      FROM attendance_records r
      INNER JOIN attendance_sessions s ON s.id = r.session_id
      WHERE r.tenant_id = ? AND r.learner_person_id = ?
      ORDER BY s.session_date`,
    )
    .bind(tenantId, learnerId)
    .all<{
      code: AttendanceCode;
      session_date: string;
      submitted: number;
    }>();
  return result.results.map((row) => ({
    code: row.code,
    sessionDate: row.session_date,
    submitted: Boolean(row.submitted),
  }));
}

async function loadAccessibleChildren(
  database: SchoolDatabase,
  access: AccessContext,
) {
  if (access.role === "guardian") {
    const result = await database
      .prepare(
        `SELECT p.id, p.first_name || ' ' || p.last_name AS name
        FROM guardian_relationships g
        INNER JOIN people p ON p.id = g.learner_person_id
        WHERE g.tenant_id = ? AND g.guardian_person_id = ?
          AND g.status = 'active'
        ORDER BY p.first_name, p.last_name`,
      )
      .bind(access.tenantId, access.actorPersonId)
      .all<{ id: string; name: string }>();
    return result.results;
  }
  if (access.role === "learner") {
    const learner = await database
      .prepare(
        `SELECT id, first_name || ' ' || last_name AS name
        FROM people WHERE id = ? AND tenant_id = ? LIMIT 1`,
      )
      .bind(access.actorPersonId, access.tenantId)
      .first<{ id: string; name: string }>();
    return learner ? [learner] : [];
  }
  const result = await database
    .prepare(
      `SELECT id, first_name || ' ' || last_name AS name
      FROM people WHERE tenant_id = ? AND kind = 'learner'
      ORDER BY first_name, last_name`,
    )
    .bind(access.tenantId)
    .all<{ id: string; name: string }>();
  return result.results;
}

async function loadGuardianAlerts(
  database: SchoolDatabase,
  tenantId: string,
  learnerId: string,
  guardianPersonId?: string,
) {
  const result = await database
    .prepare(
      /* The cast is load-bearing. A bare `? IS NULL` gives PostgreSQL nothing
         to infer the parameter's type from — it raises "could not determine
         data type of parameter $3" and the whole guardian school day fails.
         SQLite inferred it, so this survived the port unnoticed behind the
         view's fixture fallback. */
      `SELECT id, title, message, status, issued_at
      FROM guardian_alerts
      WHERE tenant_id = ? AND learner_person_id = ?
        AND (?::text IS NULL OR guardian_person_id = ?)
      ORDER BY issued_at DESC`,
    )
    .bind(
      tenantId,
      learnerId,
      guardianPersonId ?? null,
      guardianPersonId ?? null,
    )
    .all<{
      id: string;
      issued_at: string;
      message: string;
      status: GuardianAlertView["status"];
      title: string;
    }>();
  return result.results.map((row) => ({
    id: row.id,
    issuedAt: row.issued_at,
    message: row.message,
    status: row.status,
    title: row.title,
  }));
}

async function loadSubmissionForMarking(
  database: SchoolDatabase,
  tenantId: string,
  submissionId: string,
) {
  const row = await database
    .prepare(
      `SELECT s.id, a.offering_id, v.id AS assignment_version_id
      FROM assignment_submissions s
      INNER JOIN assignments a ON a.id = s.assignment_id
      INNER JOIN assignment_versions v
        ON v.assignment_id = a.id AND v.version = s.assignment_version
      WHERE s.id = ? AND s.tenant_id = ?
        AND s.status IN ('submitted', 'late', 'marked')
      LIMIT 1`,
    )
    .bind(submissionId, tenantId)
    .first<{
      assignment_version_id: string;
      id: string;
      offering_id: string;
    }>();
  if (!row) {
    throw new DailyOperationsPolicyError(
      "Markable assignment submission was not found.",
    );
  }
  return row;
}

async function buildGuardianAlertStatements(
  database: SchoolDatabase,
  access: AccessContext,
  attendance: AttendanceWorkspace,
) {
  const alertStatements: SchoolStatement[] = [];
  const notices: Array<{
    date: string;
    learnerName: string;
    learnerPersonId: string;
    tenantId: string;
  }> = [];
  /* Resolved per learner rather than from the module constant. This message
     said "was marked absent from JHS 2 Gold" to every guardian in every
     school, naming the demo school's class whoever the child was — with
     classNameOf() sitting directly below it, unused. */
  const classNames = new Map<string, string>();
  for (const row of attendance.rows) {
    if (!shouldCreateGuardianAlert("submitted", row)) continue;
    if (!classNames.has(row.learnerPersonId)) {
      const placement = await loadLearnerPlacement(
        database,
        access.tenantId,
        row.learnerPersonId,
      );
      classNames.set(row.learnerPersonId, placement?.name ?? "");
    }
    /* A learner whose placement cannot be resolved gets a sentence that reads
       without it, rather than one with a hole or a borrowed class in it. */
    const className = classNames.get(row.learnerPersonId) ?? "";
    const from = className ? ` from ${className}` : "";
    /* The alert is in the app; this is the message that reaches a parent who
       is not going to open it. A family finding out their child was absent on
       their next sign-in is a family that finds out weeks later. */
    notices.push({
      date: attendance.date,
      learnerName: row.learnerName,
      learnerPersonId: row.learnerPersonId,
      tenantId: access.tenantId,
    });
    const guardians = await database
      .prepare(
        `SELECT guardian_person_id
        FROM guardian_relationships
        WHERE tenant_id = ? AND learner_person_id = ? AND status = 'active'`,
      )
      .bind(access.tenantId, row.learnerPersonId)
      .all<{ guardian_person_id: string }>();
    guardians.results.forEach((guardian) => {
      alertStatements.push(
        database
          .prepare(
            `INSERT OR IGNORE INTO guardian_alerts
              (id, tenant_id, guardian_person_id, learner_person_id,
               source_type, source_id, kind, title, message, status)
            VALUES (?, ?, ?, ?, 'attendance', ?, 'absence', ?, ?, 'issued')`,
          )
          .bind(
            crypto.randomUUID(),
            access.tenantId,
            guardian.guardian_person_id,
            row.learnerPersonId,
            row.recordId,
            `${row.learnerName} was marked absent`,
            `${row.learnerName} was marked absent${from} on ${attendance.date}. Please contact the school if this record needs clarification.`,
          ),
      );
    });
  }
  return { alertStatements, notices };
}

async function classNameOf(
  database: SchoolDatabase,
  classGroupId: string,
): Promise<string> {
  const group = await database
    .prepare(`SELECT name FROM class_groups WHERE id = ? LIMIT 1`)
    .bind(classGroupId)
    .first<{ name: string }>();
  return group?.name ?? classGroupId;
}

async function loadClassLearnerIds(
  database: SchoolDatabase,
  tenantId: string,
  classGroupId: string,
) {
  const result = await database
    .prepare(
      /* first_name is selected as well as ordered by. PostgreSQL rejects a
         SELECT DISTINCT ordered by an expression that is not in the select
         list — "for SELECT DISTINCT, ORDER BY expressions must appear in
         select list" — so this raised on every register submission, which is
         the one thing a class teacher does every morning. SQLite allowed it,
         and nothing had run the statement against PostgreSQL. */
      `SELECT DISTINCT p.id, p.first_name
      FROM people p
      INNER JOIN tenant_memberships m ON m.person_id = p.id
      WHERE p.tenant_id = ? AND p.kind = 'learner'
        AND m.status = 'active' AND m.scope_type = 'class'
        AND (m.scope_id = ? OR m.scope_id = ?)
      ORDER BY p.first_name`,
    )
    /* Name or id, as everywhere a class membership is matched. */
    .bind(tenantId, classGroupId, await classNameOf(database, classGroupId))
    .all<{ id: string }>();
  return result.results.map((row) => row.id);
}

/**
 * Whose school day this is.
 *
 * The last line returned the string "person-kwame" — one learner from the
 * demo school. A guardian who did not name a child got that child, which in
 * a real school is a learner who does not exist, and in the demo school is
 * somebody else's. The refusal below caught it, so the guardian met an
 * authorisation error instead of their own child's day.
 *
 * A guardian's first linked child is the answer; anyone else who did not ask
 * for a learner gets their own id and is refused by canAccessLearner if that
 * is not a learner they may see.
 */
async function resolveLearnerId(
  database: SchoolDatabase,
  access: AccessContext,
  requestedLearnerId?: string,
): Promise<string> {
  if (requestedLearnerId) return requestedLearnerId;
  if (access.role === "learner") return access.actorPersonId;
  if (access.role === "guardian") {
    const children = await loadAccessibleChildren(database, access);
    return children[0]?.id ?? access.actorPersonId;
  }
  return access.actorPersonId;
}

function requireTeacherOperationsAccess(access: AccessContext) {
  requirePermission(access, "assignment:manage");
  requirePermission(access, "attendance:manage");
}

async function requireDailyAttendanceScope(
  access: AccessContext,
  classGroupId: string,
) {
  if (
    access.role === "school-admin" ||
    access.role === "academic-admin"
  ) {
    return;
  }
  if (access.role !== "class-teacher") {
    throw new AuthorizationError(
      "Daily class attendance is restricted to class teachers and school leadership.",
    );
  }
  const database = await getSchoolDatabase();
  const membership = await database
    .prepare(
      `SELECT person_id
      FROM tenant_memberships
      WHERE tenant_id = ? AND person_id = ? AND role = 'class-teacher'
        AND status = 'active' AND scope_type = 'class'
        AND (scope_id = ? OR scope_id = ?)
      LIMIT 1`,
    )
    /* A membership's scope_id holds a class name or a class group id
       depending on how it was written, so both are matched — as
       loadAccessScopes() does. */
    .bind(
      access.tenantId,
      access.actorPersonId,
      classGroupId,
      (
        await database
          .prepare(`SELECT name FROM class_groups WHERE id = ? LIMIT 1`)
          .bind(classGroupId)
          .first<{ name: string }>()
      )?.name ?? classGroupId,
    )
    .first<{ person_id: string }>();
  if (!membership) {
    throw new AuthorizationError(
      "You are not the assigned class teacher for this register.",
    );
  }
}

function requirePermission(
  access: AccessContext,
  permission: Parameters<typeof canPerform>[1],
) {
  if (!canPerform(access, permission)) {
    throw new AuthorizationError(
      "Your school role does not allow this operation.",
    );
  }
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

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}
