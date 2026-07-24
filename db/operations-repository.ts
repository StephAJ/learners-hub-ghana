import {
  AuthorizationError,
  canAccessLearner,
  canPerform,
  canTeachOffering,
} from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import {
  changeTimetableEntry,
  correctAttendance,
  DailyOperationsPolicyError,
  preparePublishedAssignment,
  releaseRubricMark,
  shouldCreateGuardianAlert,
  submitAttendanceRegister,
  summarizeAttendance,
} from "../domain/operations/daily-operations";
import type {
  AttendanceCode,
  AttendanceRecord,
  AttendanceSessionStatus,
  RubricCriterion,
  RubricScore,
  SubmissionStatus,
  TimetableEntryStatus,
} from "../domain/operations/types";
import { ensureReportingFoundation } from "./reporting-repository";
import { getD1Database } from "./index";
import { SCIENCE_OFFERING_ID } from "./learning-repository";

const TENANT_ID = "tenant-greenfield";
const CLASS_GROUP_ID = "class-jhs2-gold";
const CLASS_NAME = "JHS 2 Gold";
const CURRENT_DATE = "2026-07-24";
const CURRENT_WEEKDAY = 5;

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
  periods: TimetablePeriodView[];
  subjectName: string;
  timetable: TimetableEntryView[];
};

export type LearnerAssignmentView = {
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

export async function getTeacherOperationsWorkspace(
  access: AccessContext,
): Promise<TeacherOperationsWorkspace> {
  requireTeacherOperationsAccess(access);
  await ensureOperationsFoundation();
  if (access.role === "class-teacher") {
    await requireDailyAttendanceScope(access);
  }
  const scopedAccess = await withTeacherAssignments(access);
  if (
    access.role !== "class-teacher" &&
    !canTeachOffering(scopedAccess, SCIENCE_OFFERING_ID)
  ) {
    throw new AuthorizationError(
      "You are not assigned to this subject offering.",
    );
  }
  const database = await getD1Database();
  const [assignments, attendance, periods, timetable] = await Promise.all([
    loadTeacherAssignments(database, access.tenantId),
    loadAttendanceWorkspace(database, access.tenantId),
    loadPeriods(database, access.tenantId),
    loadTimetable(database, access.tenantId),
  ]);
  return {
    assignments,
    attendance,
    className: CLASS_NAME,
    currentDate: CURRENT_DATE,
    markingQueue: await loadMarkingQueue(database, access.tenantId),
    periods,
    subjectName: "Integrated Science",
    timetable,
  };
}

export async function createPersistentAssignment(
  access: AccessContext,
  input: CreateAssignmentInput,
) {
  requirePermission(access, "assignment:manage");
  await ensureOperationsFoundation();
  const scopedAccess = await withTeacherAssignments(access);
  if (!canTeachOffering(scopedAccess, SCIENCE_OFFERING_ID)) {
    throw new AuthorizationError(
      "You are not assigned to this subject offering.",
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
  const database = await getD1Database();
  const assignmentId = crypto.randomUUID();
  const versionId = `${assignmentId}:v1`;
  const criterionIds = input.criteria.map(() => crypto.randomUUID());
  const learners = await loadClassLearnerIds(database, access.tenantId);
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
        SCIENCE_OFFERING_ID,
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
  await requireDailyAttendanceScope(access);
  const database = await getD1Database();
  const row = await database
    .prepare(
      `SELECT r.id, r.learner_person_id, r.code, r.note, s.id AS session_id,
        s.status AS session_status
      FROM attendance_records r
      INNER JOIN attendance_sessions s ON s.id = r.session_id
      WHERE r.id = ? AND r.tenant_id = ?
      LIMIT 1`,
    )
    .bind(input.recordId, access.tenantId)
    .first<{
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

export async function submitPersistentAttendance(access: AccessContext) {
  requirePermission(access, "attendance:manage");
  await ensureOperationsFoundation();
  await requireDailyAttendanceScope(access);
  const database = await getD1Database();
  const attendance = await loadAttendanceWorkspace(
    database,
    access.tenantId,
  );
  if (attendance.status !== "draft") {
    return getTeacherOperationsWorkspace(access);
  }
  const rosterLearnerIds = await loadClassLearnerIds(
    database,
    access.tenantId,
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
    ...alerts,
    auditStatement(
      database,
      access,
      "attendance.submitted",
      "attendance-session",
      attendance.sessionId,
      summarizeAttendance(attendance.rows),
    ),
  ]);
  return getTeacherOperationsWorkspace(access);
}

export async function releasePersistentRubric(
  access: AccessContext,
  input: ReleaseRubricInput,
) {
  requirePermission(access, "assignment:manage");
  await ensureOperationsFoundation();
  const database = await getD1Database();
  const submission = await loadSubmissionForMarking(
    database,
    access.tenantId,
    input.submissionId,
  );
  const scopedAccess = await withTeacherAssignments(access);
  if (!canTeachOffering(scopedAccess, submission.offering_id)) {
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
  const database = await getD1Database();
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
  const learnerId = resolveLearnerId(access, requestedLearnerId);
  if (!canAccessLearner(access, learnerId)) {
    throw new AuthorizationError(
      "You are not authorised to view this learner's school day.",
    );
  }
  const database = await getD1Database();
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
  if (!input.responseText.trim()) {
    throw new DailyOperationsPolicyError(
      "Write a response before submitting the assignment.",
    );
  }
  await ensureOperationsFoundation();
  const database = await getD1Database();
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

export async function getGuardianSchoolDay(
  access: AccessContext,
  requestedLearnerId?: string,
): Promise<GuardianSchoolDayWorkspace> {
  await ensureOperationsFoundation();
  const database = await getD1Database();
  const linkedChildren = await loadAccessibleChildren(database, access);
  const defaultLearnerId =
    access.role === "guardian"
      ? linkedChildren[0]?.id
      : access.role === "learner"
        ? access.actorPersonId
        : "person-kwame";
  const learnerId =
    requestedLearnerId ?? defaultLearnerId ?? access.actorPersonId;
  const scopedAccess = {
    ...access,
    linkedLearnerIds: linkedChildren.map((child) => child.id),
  };
  if (!canAccessLearner(scopedAccess, learnerId)) {
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
  await ensureReportingFoundation();
  const database = await getD1Database();
  await database.batch([
    ...seedTimetablePeriods(database),
    ...seedTimetableEntries(database),
    ...seedAssignments(database),
    ...seedAttendance(database),
  ]);
}

function seedAssignments(database: D1Database) {
  const statements: D1PreparedStatement[] = [
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
  database: D1Database,
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

function seedTimetablePeriods(database: D1Database) {
  const periods = [
    ["period-1", "Period 1", 1, "08:00", "09:00", "lesson"],
    ["period-2", "Period 2", 2, "09:10", "10:10", "lesson"],
    ["period-break", "Break", 3, "10:10", "10:35", "break"],
    ["period-3", "Period 3", 4, "10:35", "11:35", "lesson"],
    ["period-4", "Period 4", 5, "11:45", "12:45", "lesson"],
  ] as const;
  return periods.map(([id, name, position, startsAt, endsAt, kind]) =>
    database
      .prepare(
        `INSERT OR IGNORE INTO timetable_periods
          (id, tenant_id, name, position, starts_at, ends_at, kind)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, TENANT_ID, name, position, startsAt, endsAt, kind),
  );
}

function seedTimetableEntries(database: D1Database) {
  const lessons = [
    ["Integrated Science", "Science Lab", "person-grace", SCIENCE_OFFERING_ID],
    ["English Language", "Block A · Room 4", "person-mary", null],
    ["Mathematics", "Block A · Room 4", "person-emmanuel", null],
    ["Social Studies", "Block B · Room 2", "person-emmanuel", null],
  ] as const;
  const periodIds = ["period-1", "period-2", "period-3", "period-4"];
  const statements: D1PreparedStatement[] = [];
  for (let weekday = 1; weekday <= 5; weekday += 1) {
    lessons.forEach((lesson, index) => {
      const rotated = lessons[(index + weekday - 1) % lessons.length];
      statements.push(
        database
          .prepare(
            `INSERT OR IGNORE INTO timetable_entries
              (id, tenant_id, period_id, weekday, class_group_id, offering_id,
               teacher_person_id, subject_name, room, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
          )
          .bind(
            `timetable-${weekday}-${index + 1}`,
            TENANT_ID,
            periodIds[index],
            weekday,
            CLASS_GROUP_ID,
            rotated[3],
            rotated[2],
            rotated[0],
            rotated[1],
          ),
      );
    });
  }
  return statements;
}

function seedAttendance(database: D1Database) {
  const statements: D1PreparedStatement[] = [];
  const sessions = [
    {
      date: "2026-07-21",
      id: "attendance-2026-07-21",
      records: ["present", "present", "late"],
      status: "submitted",
    },
    {
      date: "2026-07-22",
      id: "attendance-2026-07-22",
      records: ["present", "absent", "present"],
      status: "submitted",
    },
    {
      date: "2026-07-23",
      id: "attendance-2026-07-23",
      records: ["present", "present", "present"],
      status: "submitted",
    },
    {
      date: CURRENT_DATE,
      id: "attendance-2026-07-24",
      records: ["present", "present", "late"],
      status: "draft",
    },
  ] as const;
  const learnerIds = ["person-ama", "person-kwame", "person-kojo"];
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
  statements.push(
    database
      .prepare(
        `INSERT OR IGNORE INTO guardian_alerts
          (id, tenant_id, guardian_person_id, learner_person_id, source_type,
           source_id, kind, title, message, status, issued_at)
        VALUES ('alert-kwame-absence-2026-07-22', ?, 'person-efua',
          'person-kwame', 'attendance', 'attendance-2026-07-22:person-kwame',
          'absence', 'Kwame was marked absent', ?,
          'issued', '2026-07-22T08:22:00Z')`,
      )
      .bind(
        TENANT_ID,
        "Kwame was marked absent from JHS 2 Gold on 22 July. Please contact the school if this record needs clarification.",
      ),
  );
  return statements;
}

async function loadTeacherAssignments(
  database: D1Database,
  tenantId: string,
) {
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
    .bind(tenantId, SCIENCE_OFFERING_ID)
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
  database: D1Database,
  tenantId: string,
) {
  const result = await database
    .prepare(
      `SELECT s.id, s.status, s.response_text, s.submitted_at,
        p.id AS learner_id, p.first_name || ' ' || p.last_name AS learner_name,
        a.id AS assignment_id, v.id AS version_id, v.title
      FROM assignment_submissions s
      INNER JOIN people p ON p.id = s.learner_person_id
      INNER JOIN assignments a ON a.id = s.assignment_id
      INNER JOIN assignment_versions v
        ON v.assignment_id = a.id AND v.version = s.assignment_version
      WHERE s.tenant_id = ? AND s.status IN ('submitted', 'late')
      ORDER BY s.submitted_at`,
    )
    .bind(tenantId)
    .all<{
      assignment_id: string;
      id: string;
      learner_id: string;
      learner_name: string;
      response_text: string;
      status: SubmissionStatus;
      submitted_at: string;
      title: string;
      version_id: string;
    }>();
  return Promise.all(
    result.results.map(async (row) => ({
      assignmentId: row.assignment_id,
      assignmentTitle: row.title,
      criteria: await loadRubricCriteria(
        database,
        tenantId,
        row.version_id,
      ),
      id: row.id,
      learnerName: row.learner_name,
      responseText: row.response_text,
      status: row.status,
      studentId: studentNumber(row.learner_id),
      submittedAt: row.submitted_at,
    })),
  );
}

async function loadRubricCriteria(
  database: D1Database,
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
  database: D1Database,
  tenantId: string,
) {
  const session = await database
    .prepare(
      `SELECT id, session_date, status
      FROM attendance_sessions
      WHERE tenant_id = ? AND class_group_id = ? AND session_date = ?
        AND mode = 'daily'
      LIMIT 1`,
    )
    .bind(tenantId, CLASS_GROUP_ID, CURRENT_DATE)
    .first<{
      id: string;
      session_date: string;
      status: AttendanceSessionStatus;
    }>();
  if (!session) {
    throw new DailyOperationsPolicyError(
      "Today's attendance register was not found.",
    );
  }
  const result = await database
    .prepare(
      `SELECT r.id, r.learner_person_id, r.code, r.note,
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
    }>();
  const rows: AttendanceRow[] = result.results.map((row) => ({
    code: row.code,
    learnerName: row.learner_name,
    learnerPersonId: row.learner_person_id,
    note: row.note,
    recordId: row.id,
    studentId: studentNumber(row.learner_person_id),
  }));
  return {
    date: session.session_date,
    rows,
    sessionId: session.id,
    status: session.status,
    summary: summarizeAttendance(rows),
  };
}

async function loadPeriods(database: D1Database, tenantId: string) {
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

async function loadTimetable(database: D1Database, tenantId: string) {
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
    .bind(tenantId, CLASS_GROUP_ID)
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
  database: D1Database,
  tenantId: string,
  learnerId: string,
): Promise<LearnerSchoolDayWorkspace> {
  const learner = await database
    .prepare(
      `SELECT id, first_name || ' ' || last_name AS name
      FROM people WHERE id = ? AND tenant_id = ? AND kind = 'learner'
      LIMIT 1`,
    )
    .bind(learnerId, tenantId)
    .first<{ id: string; name: string }>();
  if (!learner) {
    throw new DailyOperationsPolicyError("Learner was not found.");
  }
  const [assignments, attendanceRecords, periods, timetable] =
    await Promise.all([
      loadLearnerAssignments(database, tenantId, learnerId),
      loadLearnerAttendance(database, tenantId, learnerId),
      loadPeriods(database, tenantId),
      loadTimetable(database, tenantId),
    ]);
  const currentRecord = attendanceRecords.find(
    (record) => record.sessionDate === CURRENT_DATE && record.submitted,
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
    currentDate: CURRENT_DATE,
    learner: {
      className: CLASS_NAME,
      id: learner.id,
      name: learner.name,
      studentId: studentNumber(learner.id),
    },
    periods,
    timetable: timetable.filter(
      (entry) => entry.weekday === CURRENT_WEEKDAY,
    ),
  };
}

async function loadLearnerAssignments(
  database: D1Database,
  tenantId: string,
  learnerId: string,
) {
  const result = await database
    .prepare(
      `SELECT a.id, v.title, v.due_at, v.maximum_points, s.status,
        s.total_points, s.feedback
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
      title: string;
      total_points: number | null;
    }>();
  return result.results.map((row) => ({
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
  database: D1Database,
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
  database: D1Database,
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
  database: D1Database,
  tenantId: string,
  learnerId: string,
  guardianPersonId?: string,
) {
  const result = await database
    .prepare(
      `SELECT id, title, message, status, issued_at
      FROM guardian_alerts
      WHERE tenant_id = ? AND learner_person_id = ?
        AND (? IS NULL OR guardian_person_id = ?)
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
  database: D1Database,
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
  database: D1Database,
  access: AccessContext,
  attendance: AttendanceWorkspace,
) {
  const alertStatements: D1PreparedStatement[] = [];
  for (const row of attendance.rows) {
    if (!shouldCreateGuardianAlert("submitted", row)) continue;
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
            `${row.learnerName} was marked absent from ${CLASS_NAME} on ${attendance.date}. Please contact the school if this record needs clarification.`,
          ),
      );
    });
  }
  return alertStatements;
}

async function loadClassLearnerIds(
  database: D1Database,
  tenantId: string,
) {
  const result = await database
    .prepare(
      `SELECT DISTINCT p.id
      FROM people p
      INNER JOIN tenant_memberships m ON m.person_id = p.id
      WHERE p.tenant_id = ? AND p.kind = 'learner'
        AND m.status = 'active' AND m.scope_type = 'class'
        AND (m.scope_id = ? OR m.scope_id = ?)
      ORDER BY p.first_name`,
    )
    .bind(tenantId, CLASS_NAME, CLASS_GROUP_ID)
    .all<{ id: string }>();
  return result.results.map((row) => row.id);
}

async function withTeacherAssignments(access: AccessContext) {
  if (access.role === "school-admin" || access.role === "academic-admin") {
    return access;
  }
  const database = await getD1Database();
  const result = await database
    .prepare(
      `SELECT offering_id FROM teacher_assignments
      WHERE tenant_id = ? AND teacher_person_id = ? AND status = 'active'`,
    )
    .bind(access.tenantId, access.actorPersonId)
    .all<{ offering_id: string }>();
  return {
    ...access,
    subjectOfferingIds: result.results.map((row) => row.offering_id),
  };
}

function resolveLearnerId(
  access: AccessContext,
  requestedLearnerId?: string,
) {
  if (requestedLearnerId) return requestedLearnerId;
  if (access.role === "learner") return access.actorPersonId;
  return "person-kwame";
}

function requireTeacherOperationsAccess(access: AccessContext) {
  requirePermission(access, "assignment:manage");
  requirePermission(access, "attendance:manage");
}

async function requireDailyAttendanceScope(access: AccessContext) {
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
  const database = await getD1Database();
  const membership = await database
    .prepare(
      `SELECT person_id
      FROM tenant_memberships
      WHERE tenant_id = ? AND person_id = ? AND role = 'class-teacher'
        AND status = 'active' AND scope_type = 'class'
        AND (scope_id = ? OR scope_id = ?)
      LIMIT 1`,
    )
    .bind(
      access.tenantId,
      access.actorPersonId,
      CLASS_NAME,
      CLASS_GROUP_ID,
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
  database: D1Database,
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

function studentNumber(personId: string) {
  if (personId === "person-kwame") return "LH-260138";
  if (personId === "person-ama") return "LH-260112";
  return "LH-260145";
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}
