export type AssignmentStatus =
  | "draft"
  | "published"
  | "closed"
  | "archived";

export type SubmissionStatus =
  | "not-started"
  | "submitted"
  | "late"
  | "marked"
  | "released";

export type RubricCriterion = {
  id: string;
  maximumPoints: number;
  name: string;
};

export type RubricScore = {
  comment?: string;
  criterionId: string;
  points: number;
};

export type AttendanceCode =
  | "present"
  | "absent"
  | "late"
  | "excused"
  | "sick"
  | "school-activity"
  | "remote";

export type AttendanceRecord = {
  code: AttendanceCode;
  learnerPersonId: string;
  note?: string;
};

export type AttendanceSessionStatus = "draft" | "submitted" | "corrected";

export type TimetableEntryStatus =
  | "scheduled"
  | "substituted"
  | "cancelled"
  | "completed";

export type TimetableEntry = {
  classGroupId: string;
  endMinute: number;
  id: string;
  room: string;
  startMinute: number;
  status: TimetableEntryStatus;
  teacherPersonId: string;
  weekday: number;
};

export type TimetableClash = {
  entryId: string;
  resource: "class" | "teacher" | "room";
};
