import type { SubjectRequirement } from "./types";

/* ==========================================================================
   The rules a school's structure has to obey

   Kept away from the repository so they can be read and tested without a
   database, and so the same rule cannot be enforced one way by the API and a
   different way by a form. Everything here is a pure function over plain
   values.

   The rules themselves are deliberately thin. A school knows what its own
   classes are called and which stages it teaches; almost nothing here is a
   judgement about that. What it does refuse is the small set of things that
   are silently destructive later: a blank name, a duplicate that a case
   difference hides, a year that ends before it starts, an intake whose dates
   contradict the status it is being given.
   ========================================================================== */

export class SchoolStructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchoolStructureError";
  }
}

export type AcademicYearStatus = "planned" | "current" | "closed";
export type ClassGroupStatus = "active" | "archived";
export type IntakeStatus = "draft" | "open" | "closed";

export type AcademicYear = {
  endsOn: string;
  id: string;
  name: string;
  startsOn: string;
  status: AcademicYearStatus;
  tenantId: string;
};

export type ClassGroup = {
  academicYearId: string;
  classTeacherPersonId: string | null;
  /** Learners placed in this class. Counted by the repository, not stored. */
  learnerCount: number;
  id: string;
  level: string;
  name: string;
  room: string;
  status: ClassGroupStatus;
  tenantId: string;
};

export type Subject = {
  code: string;
  description: string;
  id: string;
  name: string;
  tenantId: string;
};

export type ClassOffering = {
  classGroupId: string;
  id: string;
  requirement: SubjectRequirement;
  status: "active" | "closed";
  subjectCode: string;
  subjectId: string;
  subjectName: string;
};

export type AdmissionIntake = {
  academicYearId: string;
  capacity: number;
  closesOn: string;
  id: string;
  label: string;
  opensOn: string;
  status: IntakeStatus;
  tenantId: string;
};

export type CreateAcademicYearCommand = {
  endsOn: string;
  name: string;
  startsOn: string;
};

export type CreateClassGroupCommand = {
  academicYearId: string;
  classTeacherPersonId?: string | null;
  level?: string;
  name: string;
  room?: string;
};

export type CreateSubjectCommand = {
  code: string;
  description?: string;
  name: string;
};

export type CreateIntakeCommand = {
  academicYearId: string;
  capacity?: number;
  closesOn: string;
  label: string;
  opensOn: string;
};

/* A code is what a timetable, a report card and a markbook column all have
   room for, so it is short, upper-cased and has no spaces in it. Normalising
   rather than rejecting: an administrator typing "ma " into a form meant MA,
   and telling them off for it helps nobody. */
const SUBJECT_CODE_PATTERN = /^[A-Z0-9]{2,6}$/;

export function normaliseAcademicYear(
  command: CreateAcademicYearCommand,
  existing: ReadonlyArray<Pick<AcademicYear, "id" | "name">> = [],
  ignoreId?: string,
): CreateAcademicYearCommand {
  const name = requireText(command.name, "The academic year needs a name.");
  requireUniqueName(name, existing, ignoreId, (duplicate) =>
    `This school already has an academic year called ${duplicate}.`,
  );

  const startsOn = requireDate(
    command.startsOn,
    "The academic year needs a start date.",
  );
  const endsOn = requireDate(
    command.endsOn,
    "The academic year needs an end date.",
  );
  if (endsOn <= startsOn) {
    throw new SchoolStructureError(
      "The academic year has to end after it starts.",
    );
  }

  return { endsOn, name, startsOn };
}

export function normaliseClassGroup(
  command: CreateClassGroupCommand,
  existing: ReadonlyArray<Pick<ClassGroup, "academicYearId" | "id" | "name">> = [],
  ignoreId?: string,
): Required<CreateClassGroupCommand> {
  const name = requireText(command.name, "The class needs a name.");
  requireText(
    command.academicYearId,
    "A class has to belong to an academic year.",
  );

  /* Scoped to the year: "JHS 1 Blue" is a different class every September,
     and a school reusing the name is doing the normal thing. */
  requireUniqueName(
    name,
    existing.filter((item) => item.academicYearId === command.academicYearId),
    ignoreId,
    (duplicate) => `This year already has a class called ${duplicate}.`,
  );

  return {
    academicYearId: command.academicYearId,
    classTeacherPersonId: command.classTeacherPersonId?.trim() || null,
    level: command.level?.trim() ?? "",
    name,
    room: command.room?.trim() ?? "",
  };
}

export function normaliseSubject(
  command: CreateSubjectCommand,
  existing: ReadonlyArray<Pick<Subject, "code" | "id">> = [],
  ignoreId?: string,
): Required<CreateSubjectCommand> {
  const name = requireText(command.name, "The subject needs a name.");
  const code = command.code.trim().toUpperCase();

  if (!SUBJECT_CODE_PATTERN.test(code)) {
    throw new SchoolStructureError(
      "A subject code is two to six letters or numbers, like MA or ENG.",
    );
  }

  const clash = existing.find(
    (item) => item.code.toUpperCase() === code && item.id !== ignoreId,
  );
  if (clash) {
    throw new SchoolStructureError(
      `The code ${code} is already used by another subject.`,
    );
  }

  return { code, description: command.description?.trim() ?? "", name };
}

export function normaliseIntake(
  command: CreateIntakeCommand,
  existing: ReadonlyArray<Pick<AdmissionIntake, "id" | "label">> = [],
  ignoreId?: string,
): Required<CreateIntakeCommand> {
  const label = requireText(command.label, "The intake needs a name.");
  requireText(
    command.academicYearId,
    "An intake has to be for an academic year.",
  );
  requireUniqueName(label, existing, ignoreId, (duplicate) =>
    `This school already has an intake called ${duplicate}.`,
  );

  const opensOn = requireDate(
    command.opensOn,
    "The intake needs an opening date.",
  );
  const closesOn = requireDate(
    command.closesOn,
    "The intake needs a closing date.",
  );
  if (closesOn <= opensOn) {
    throw new SchoolStructureError(
      "The intake has to close after it opens.",
    );
  }

  const capacity = command.capacity ?? 0;
  if (!Number.isInteger(capacity) || capacity < 0) {
    throw new SchoolStructureError(
      "Places available has to be a whole number, or zero if the school has not decided.",
    );
  }

  return { academicYearId: command.academicYearId, capacity, closesOn, label, opensOn };
}

/**
 * Whether an intake is taking applications right now.
 *
 * Status and dates both have to agree. A school that opens an intake and then
 * lets the closing date pass has closed it in every sense that matters to a
 * family looking at the form, and the public site should say so without
 * waiting for someone to press a button. The reverse is also true: an intake
 * whose dates have arrived is still shut until it is deliberately opened.
 */
export function isIntakeAcceptingApplications(
  intake: Pick<AdmissionIntake, "closesOn" | "opensOn" | "status">,
  today: string,
): boolean {
  if (intake.status !== "open") return false;
  return today >= intake.opensOn && today <= intake.closesOn;
}

/**
 * Why an intake is not accepting applications, in words a family should read.
 *
 * Returns null when it is open. The public form shows this instead of the
 * fields, so it is deliberately about what the applicant can do next rather
 * than about the record's state.
 */
export function intakeClosedReason(
  intake: Pick<AdmissionIntake, "closesOn" | "opensOn" | "status">,
  today: string,
): string | null {
  if (isIntakeAcceptingApplications(intake, today)) return null;
  if (intake.status === "closed" || today > intake.closesOn) {
    return "Applications for this intake have closed. The school office can tell you when the next one opens.";
  }
  if (today < intake.opensOn) {
    return `Applications open on ${formatDate(intake.opensOn)}.`;
  }
  return "Applications are not open at the moment. The school office can tell you when the next intake opens.";
}

/**
 * The steps a school still has to complete before it can teach a term.
 *
 * The admin home used to show a hardcoded four-of-five checklist that said
 * the same thing to a school on its first day as to one halfway through the
 * year. This derives the same list from what actually exists, so finishing a
 * step is what ticks it off.
 */
export function schoolReadiness(state: {
  classesWithTeacher: number;
  classGroupCount: number;
  hasCurrentYear: boolean;
  hasOpenIntake: boolean;
  hasProfile: boolean;
  offeringCount: number;
  teacherCount: number;
  /* Subject offerings nobody is assigned to teach. Distinct from a class
     without a class teacher: a class can have a form tutor and still have
     three subjects with nobody down to teach them, and a learner opening
     one of those finds an empty subject. */
  unstaffedOfferingCount: number;
}): Array<{ complete: boolean; detail: string; label: string }> {
  return [
    {
      complete: state.hasProfile,
      detail: "The name, contact details and programmes the public site shows.",
      label: "School profile and contact details",
    },
    {
      complete: state.hasCurrentYear,
      detail: "One year marked current, with its start and end dates.",
      label: "Academic year and term dates",
    },
    {
      complete: state.classGroupCount > 0 && state.offeringCount > 0,
      detail: "At least one class, each with the subjects it is taught.",
      label: "Classes and subject policies",
    },
    {
      complete:
        state.teacherCount > 0 &&
        state.classGroupCount > 0 &&
        state.classesWithTeacher === state.classGroupCount &&
        state.offeringCount > 0 &&
        state.unstaffedOfferingCount === 0,
      detail:
        state.unstaffedOfferingCount > 0 && state.classesWithTeacher === state.classGroupCount
          ? `${state.unstaffedOfferingCount} ${state.unstaffedOfferingCount === 1 ? "subject has" : "subjects have"} nobody assigned to teach them.`
          : "Every class needs a class teacher, and every subject a teacher.",
      label: "Staff and teaching assignments",
    },
    {
      complete: state.hasOpenIntake,
      detail: "Families cannot apply until an intake is open.",
      label: "Open the public admissions intake",
    },
  ];
}

function requireText(value: string | undefined, message: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new SchoolStructureError(message);
  return trimmed;
}

function requireDate(value: string | undefined, message: string): string {
  const trimmed = requireText(value, message);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new SchoolStructureError(message);
  }
  if (Number.isNaN(Date.parse(`${trimmed}T00:00:00.000Z`))) {
    throw new SchoolStructureError(`${trimmed} is not a real date.`);
  }
  return trimmed;
}

/* Case- and space-insensitive, because "JHS 2 Gold" and "jhs 2  gold" are one
   class to everyone except a unique index. The database constraint is exact,
   so without this a school creates the duplicate it was trying to avoid and
   only finds out when two registers appear. */
function requireUniqueName(
  name: string,
  existing: ReadonlyArray<{ id: string; label?: string; name?: string }>,
  ignoreId: string | undefined,
  message: (duplicate: string) => string,
): void {
  const comparable = comparableName(name);
  const clash = existing.find((item) => {
    if (item.id === ignoreId) return false;
    const candidate = item.name ?? item.label ?? "";
    return comparableName(candidate) === comparable;
  });
  if (clash) {
    throw new SchoolStructureError(message(clash.name ?? clash.label ?? name));
  }
}

function comparableName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}
