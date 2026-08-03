/* ==========================================================================
   The admission application form

   One description of the form, used by both sides. The wizard reads it to
   decide whether a step may be left, and the API reads it to decide whether a
   submission may be accepted — so a field cannot become required in the
   browser and optional on the server, which is how half-empty applications
   reach an admissions office.

   Everything here is pure. It knows nothing about React or Postgres.
   ========================================================================== */

export type ApplicationStepId =
  | "learner"
  | "schooling"
  | "guardian"
  | "wellbeing"
  | "review";

/** Every field the form collects. Strings throughout — it is a form. */
export type ApplicationDraft = {
  allergies: string;
  applicantFirstName: string;
  applicantLastName: string;
  applicantMiddleName: string;
  dateOfBirth: string;
  desiredClass: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelationship: string;
  entryTerm: string;
  gender: string;
  guardianAddress: string;
  guardianEmail: string;
  guardianName: string;
  guardianOccupation: string;
  guardianPhone: string;
  guardianRelationship: string;
  homeAddress: string;
  lastClassCompleted: string;
  medicalConditions: string;
  medications: string;
  nationality: string;
  placeOfBirth: string;
  previousSchool: string;
  previousSchoolLocation: string;
  reasonForLeaving: string;
  secondGuardianName: string;
  secondGuardianPhone: string;
  supportNeeds: string;
};

export type ApplicationField = keyof ApplicationDraft;

/** A problem to show against a specific field. */
export type ApplicationIssue = {
  field: ApplicationField;
  message: string;
};

export const APPLICATION_STEPS: ReadonlyArray<{
  description: string;
  id: ApplicationStepId;
  title: string;
}> = [
  {
    description: "Who is applying, and where they live.",
    id: "learner",
    title: "Learner",
  },
  {
    description: "Where they are coming from, and what they are joining.",
    id: "schooling",
    title: "Schooling",
  },
  {
    description: "Who we contact about this application.",
    id: "guardian",
    title: "Parent or guardian",
  },
  {
    description: "What the school needs to know to look after them.",
    id: "wellbeing",
    title: "Health and support",
  },
  {
    description: "Check everything before it goes to the school.",
    id: "review",
    title: "Review",
  },
];

/* Which fields belong to which step. The review step owns none of its own —
   it re-reports whatever the four before it left outstanding. */
const STEP_FIELDS: Record<
  Exclude<ApplicationStepId, "review">,
  ApplicationField[]
> = {
  guardian: [
    "guardianName",
    "guardianRelationship",
    "guardianEmail",
    "guardianPhone",
    "guardianOccupation",
    "guardianAddress",
    "secondGuardianName",
    "secondGuardianPhone",
  ],
  learner: [
    "applicantFirstName",
    "applicantMiddleName",
    "applicantLastName",
    "dateOfBirth",
    "gender",
    "nationality",
    "placeOfBirth",
    "homeAddress",
  ],
  schooling: [
    "desiredClass",
    "entryTerm",
    "previousSchool",
    "previousSchoolLocation",
    "lastClassCompleted",
    "reasonForLeaving",
  ],
  wellbeing: [
    "emergencyName",
    "emergencyRelationship",
    "emergencyPhone",
    "allergies",
    "medicalConditions",
    "medications",
    "supportNeeds",
  ],
};

const REQUIRED: ReadonlyArray<{ field: ApplicationField; label: string }> = [
  { field: "applicantFirstName", label: "the learner's first name" },
  { field: "applicantLastName", label: "the learner's last name" },
  { field: "dateOfBirth", label: "the learner's date of birth" },
  { field: "gender", label: "the learner's gender" },
  { field: "homeAddress", label: "the home address" },
  { field: "desiredClass", label: "the class being applied for" },
  { field: "entryTerm", label: "the term they would start" },
  { field: "guardianName", label: "the parent or guardian's name" },
  { field: "guardianRelationship", label: "their relationship to the learner" },
  { field: "guardianEmail", label: "the parent or guardian's email" },
  { field: "guardianPhone", label: "the parent or guardian's phone number" },
  { field: "emergencyName", label: "an emergency contact name" },
  { field: "emergencyPhone", label: "an emergency contact phone number" },
];

export function emptyApplicationDraft(): ApplicationDraft {
  return {
    allergies: "",
    applicantFirstName: "",
    applicantLastName: "",
    applicantMiddleName: "",
    dateOfBirth: "",
    desiredClass: "",
    emergencyName: "",
    emergencyPhone: "",
    emergencyRelationship: "",
    entryTerm: "",
    gender: "",
    guardianAddress: "",
    guardianEmail: "",
    guardianName: "",
    guardianOccupation: "",
    guardianPhone: "",
    guardianRelationship: "",
    homeAddress: "",
    lastClassCompleted: "",
    medicalConditions: "",
    medications: "",
    nationality: "",
    placeOfBirth: "",
    previousSchool: "",
    previousSchoolLocation: "",
    reasonForLeaving: "",
    secondGuardianName: "",
    secondGuardianPhone: "",
    supportNeeds: "",
  };
}

/**
 * Everything wrong with the application as it stands.
 *
 * Returns issues rather than throwing on the first one: a guardian filling in
 * a long form deserves to see all of what is missing at once, not to be sent
 * back five times.
 */
export function validateApplication(
  draft: ApplicationDraft,
): ApplicationIssue[] {
  const issues: ApplicationIssue[] = [];

  for (const { field, label } of REQUIRED) {
    if (!draft[field].trim()) {
      issues.push({ field, message: `Please give ${label}.` });
    }
  }

  if (draft.guardianEmail.trim() && !looksLikeEmail(draft.guardianEmail)) {
    issues.push({
      field: "guardianEmail",
      message: "That email address does not look right.",
    });
  }

  for (const field of ["guardianPhone", "emergencyPhone"] as const) {
    if (draft[field].trim() && !looksLikePhone(draft[field])) {
      issues.push({
        field,
        message: "A phone number needs at least nine digits.",
      });
    }
  }

  if (draft.dateOfBirth.trim()) {
    const issue = dateOfBirthIssue(draft.dateOfBirth);
    if (issue) issues.push({ field: "dateOfBirth", message: issue });
  }

  /* An emergency contact who is also the only guardian is not a second point
     of contact — it is the same phone ringing out twice. */
  if (
    draft.emergencyPhone.trim() &&
    digitsOf(draft.emergencyPhone) === digitsOf(draft.guardianPhone)
  ) {
    issues.push({
      field: "emergencyPhone",
      message:
        "Give a different number from the parent or guardian's, so there is a second person to reach.",
    });
  }

  return issues;
}

/** The issues belonging to one step, for the wizard's per-step gate. */
export function validateApplicationStep(
  step: ApplicationStepId,
  draft: ApplicationDraft,
): ApplicationIssue[] {
  const all = validateApplication(draft);
  if (step === "review") return all;
  const fields = new Set<ApplicationField>(STEP_FIELDS[step]);
  return all.filter((issue) => fields.has(issue.field));
}

export function isApplicationSubmittable(draft: ApplicationDraft): boolean {
  return validateApplication(draft).length === 0;
}

/** Which step a given field lives on, so an issue can link back to it. */
export function stepForField(
  field: ApplicationField,
): ApplicationStepId | undefined {
  for (const [step, fields] of Object.entries(STEP_FIELDS)) {
    if (fields.includes(field)) return step as ApplicationStepId;
  }
  return undefined;
}

/**
 * How complete the application is, as a percentage.
 *
 * Counts required fields only. Progress that moves when an optional field is
 * filled tells a guardian nothing about whether they can submit yet.
 */
export function applicationCompletion(draft: ApplicationDraft): number {
  const done = REQUIRED.filter(({ field }) => draft[field].trim()).length;
  return Math.round((done / REQUIRED.length) * 100);
}

function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  /* Deliberately loose. The confirmation email is what actually proves an
     address works, and a strict pattern mostly rejects valid unusual ones. */
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(trimmed);
}

function digitsOf(value: string): string {
  return value.replace(/\D/g, "");
}

function looksLikePhone(value: string): boolean {
  return digitsOf(value).length >= 9;
}

function dateOfBirthIssue(value: string): string | undefined {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "That date does not look right.";
  const now = new Date();
  if (date.getTime() > now.getTime()) {
    return "The date of birth cannot be in the future.";
  }
  const years =
    (now.getTime() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  /* Wide on purpose: this is a typo check, not an admissions policy. Whether
     a particular age suits a particular class is the school's call. */
  if (years > 25) {
    return "Please check the year — that would make the learner over 25.";
  }
  if (years < 2) {
    return "Please check the year — that would make the learner under 2.";
  }
  return undefined;
}
