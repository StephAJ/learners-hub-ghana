import type {
  AttendanceCode,
  AttendanceRecord,
  AttendanceSessionStatus,
  RubricCriterion,
  RubricScore,
  TimetableClash,
  TimetableEntry,
} from "./types";

export class DailyOperationsPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyOperationsPolicyError";
  }
}

export function preparePublishedAssignment(
  assignment: {
    brief: string;
    dueAt: string;
    maximumPoints: number;
    opensAt: string;
    title: string;
  },
  criteria: RubricCriterion[],
) {
  if (!assignment.title.trim() || !assignment.brief.trim()) {
    throw new DailyOperationsPolicyError(
      "Assignment title and brief are required.",
    );
  }
  requireValidTimestamp(assignment.opensAt, "Assignment opening time");
  requireValidTimestamp(assignment.dueAt, "Assignment due time");
  if (new Date(assignment.dueAt) <= new Date(assignment.opensAt)) {
    throw new DailyOperationsPolicyError(
      "Assignment due time must follow its opening time.",
    );
  }
  const rubricMaximum = criteria.reduce(
    (sum, criterion) => sum + criterion.maximumPoints,
    0,
  );
  if (
    assignment.maximumPoints <= 0 ||
    rubricMaximum !== assignment.maximumPoints
  ) {
    throw new DailyOperationsPolicyError(
      "Rubric maximum points must equal the assignment maximum.",
    );
  }
  return { ...assignment, status: "published" as const };
}

export function scoreRubric(
  criteria: RubricCriterion[],
  scores: RubricScore[],
) {
  validateRubric(criteria, scores);
  const earnedPoints = scores.reduce((sum, score) => sum + score.points, 0);
  const maximumPoints = criteria.reduce(
    (sum, criterion) => sum + criterion.maximumPoints,
    0,
  );
  return {
    earnedPoints,
    maximumPoints,
    percentage:
      maximumPoints === 0
        ? 0
        : Math.round((earnedPoints / maximumPoints) * 1000) / 10,
  };
}

export function releaseRubricMark(
  criteria: RubricCriterion[],
  scores: RubricScore[],
  releasedAt: string,
) {
  const total = scoreRubric(criteria, scores);
  requireValidTimestamp(releasedAt, "Rubric release time");
  return { ...total, releasedAt, status: "released" as const };
}

export function summarizeAttendance(records: AttendanceRecord[]) {
  const excused = countCode(records, "excused");
  const late = countCode(records, "late");
  const absent = records.filter(
    (record) => record.code === "absent" || record.code === "sick",
  ).length;
  const presentEquivalent = records.filter((record) =>
    isPresentEquivalent(record.code),
  ).length;
  const totalCounted = records.length - excused;
  return {
    absent,
    excused,
    late,
    percentage:
      totalCounted === 0
        ? 0
        : Math.round((presentEquivalent / totalCounted) * 1000) / 10,
    presentEquivalent,
    totalCounted,
  };
}

export function correctAttendance(
  record: AttendanceRecord,
  code: AttendanceCode,
  reason: string,
) {
  if (!reason.trim()) {
    throw new DailyOperationsPolicyError(
      "A reason is required for an attendance correction.",
    );
  }
  return {
    previousCode: record.code,
    reason: reason.trim(),
    record: { ...record, code },
  };
}

export function submitAttendanceRegister(
  expectedLearnerIds: string[],
  records: AttendanceRecord[],
  submittedAt: string,
) {
  const recordedLearnerIds = new Set(
    records.map((record) => record.learnerPersonId),
  );
  const missingLearners = expectedLearnerIds.filter(
    (learnerId) => !recordedLearnerIds.has(learnerId),
  );
  if (missingLearners.length > 0) {
    throw new DailyOperationsPolicyError(
      "Every rostered learner requires an attendance code.",
    );
  }
  if (recordedLearnerIds.size !== records.length) {
    throw new DailyOperationsPolicyError(
      "A learner cannot appear twice in one attendance register.",
    );
  }
  requireValidTimestamp(submittedAt, "Attendance submission time");
  return { status: "submitted" as const, submittedAt };
}

export function shouldCreateGuardianAlert(
  sessionStatus: AttendanceSessionStatus,
  record: AttendanceRecord,
) {
  return sessionStatus === "submitted" && record.code === "absent";
}

export function findTimetableClashes(
  proposed: TimetableEntry,
  existingEntries: TimetableEntry[],
): TimetableClash[] {
  if (!isActiveTimetableEntry(proposed)) return [];
  const clashes: TimetableClash[] = [];
  for (const existing of existingEntries) {
    if (
      existing.id === proposed.id ||
      existing.weekday !== proposed.weekday ||
      !isActiveTimetableEntry(existing) ||
      !timesOverlap(proposed, existing)
    ) {
      continue;
    }
    if (existing.classGroupId === proposed.classGroupId) {
      clashes.push({ entryId: existing.id, resource: "class" });
    }
    if (existing.teacherPersonId === proposed.teacherPersonId) {
      clashes.push({ entryId: existing.id, resource: "teacher" });
    }
    if (normaliseRoom(existing.room) === normaliseRoom(proposed.room)) {
      clashes.push({ entryId: existing.id, resource: "room" });
    }
  }
  return clashes;
}

export function changeTimetableEntry(
  entry: TimetableEntry,
  status: "cancelled" | "substituted",
  reason: string,
  substituteTeacherPersonId?: string,
) {
  if (!reason.trim()) {
    throw new DailyOperationsPolicyError(
      "A reason is required for a timetable change.",
    );
  }
  if (status === "substituted" && !substituteTeacherPersonId?.trim()) {
    throw new DailyOperationsPolicyError(
      "A substitute teacher is required for a substitution.",
    );
  }
  return {
    ...entry,
    changeReason: reason.trim(),
    status,
    substituteTeacherPersonId:
      status === "substituted" ? substituteTeacherPersonId : undefined,
  };
}

function validateRubric(
  criteria: RubricCriterion[],
  scores: RubricScore[],
) {
  if (criteria.length === 0) {
    throw new DailyOperationsPolicyError(
      "A published assignment requires at least one rubric criterion.",
    );
  }
  const scoreByCriterion = new Map(
    scores.map((score) => [score.criterionId, score]),
  );
  if (
    scoreByCriterion.size !== scores.length ||
    scoreByCriterion.size !== criteria.length
  ) {
    throw new DailyOperationsPolicyError(
      "Every rubric criterion must be scored exactly once.",
    );
  }
  for (const criterion of criteria) {
    const score = scoreByCriterion.get(criterion.id);
    if (!score) {
      throw new DailyOperationsPolicyError(
        `A score is required for rubric criterion ${criterion.name}.`,
      );
    }
    if (
      !Number.isFinite(score.points) ||
      score.points < 0 ||
      score.points > criterion.maximumPoints
    ) {
      throw new DailyOperationsPolicyError(
        `Rubric score for ${criterion.name} must be between 0 and ${criterion.maximumPoints}.`,
      );
    }
  }
}

function isPresentEquivalent(code: AttendanceCode) {
  return (
    code === "present" ||
    code === "late" ||
    code === "school-activity" ||
    code === "remote"
  );
}

function countCode(records: AttendanceRecord[], code: AttendanceCode) {
  return records.filter((record) => record.code === code).length;
}

function requireValidTimestamp(value: string, label: string) {
  if (Number.isNaN(new Date(value).getTime())) {
    throw new DailyOperationsPolicyError(`${label} is invalid.`);
  }
}

function isActiveTimetableEntry(entry: TimetableEntry) {
  return entry.status === "scheduled" || entry.status === "substituted";
}

function timesOverlap(first: TimetableEntry, second: TimetableEntry) {
  return (
    first.startMinute < second.endMinute &&
    first.endMinute > second.startMinute
  );
}

function normaliseRoom(room: string) {
  return room.trim().toLowerCase();
}
