import type { AuthenticatedUser } from "../app/auth";
import {
  emptyApplicationDraft,
  isApplicationSubmittable,
  validateApplication as validateApplicationDraft,
  type ApplicationDraft,
} from "../domain/admissions/application-form";
import { AuthorizationError, canPerform } from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import { ensurePlatformReady } from "../server/platform-ready";
import { getPostgresPool } from "./postgres";

const GREENFIELD_TENANT_ID = "tenant-greenfield";
const CURRENT_INTAKE_ID = "2026-2027";

export type ApplicantApplication = ApplicationDraft & {
  applicantEmail: string;
  /** Set when the guardian ticked the declaration on the review step. */
  declarationAcceptedAt?: string;
  id: string;
  lastReminderAt?: string;
  status:
    | "draft"
    | "submitted"
    | "under-review"
    | "offered"
    | "accepted"
    | "rejected"
    | "enrolled";
  submittedAt?: string;
  updatedAt: string;
};

/** What the form sends back. Exactly the draft — the rest is the server's. */
export type SaveApplicantApplicationInput = ApplicationDraft;

export type ManagedAdmissionStatus = Exclude<
  ApplicantApplication["status"],
  "draft" | "submitted"
>;

/** A draft that has gone quiet, for the reminder job. */
export type AbandonedDraft = {
  applicantFirstName: string;
  daysSinceUpdate: number;
  draft: ApplicationDraft;
  guardianEmail: string;
  guardianName: string;
  id: string;
};

/* ==========================================================================
   One list of columns

   The draft's fields appear in the select list, the insert column list, the
   insert placeholders, the upsert's SET clause and the row mapper. Written out
   five times they drift, and the failure is silent: a column missing from the
   SET clause simply never saves, and the guardian watches their answer
   disappear on reload. Everything below is derived from this array.
   ========================================================================== */
const DRAFT_COLUMNS: ReadonlyArray<[keyof ApplicationDraft, string]> = [
  ["applicantFirstName", "applicant_first_name"],
  ["applicantMiddleName", "applicant_middle_name"],
  ["applicantLastName", "applicant_last_name"],
  ["dateOfBirth", "date_of_birth"],
  ["gender", "gender"],
  ["nationality", "nationality"],
  ["placeOfBirth", "place_of_birth"],
  ["homeAddress", "home_address"],
  ["desiredClass", "desired_class"],
  ["entryTerm", "entry_term"],
  ["previousSchool", "previous_school"],
  ["previousSchoolLocation", "previous_school_location"],
  ["lastClassCompleted", "last_class_completed"],
  ["reasonForLeaving", "reason_for_leaving"],
  ["guardianName", "guardian_name"],
  ["guardianRelationship", "guardian_relationship"],
  ["guardianEmail", "guardian_email"],
  ["guardianPhone", "guardian_phone"],
  ["guardianOccupation", "guardian_occupation"],
  ["guardianAddress", "guardian_address"],
  ["secondGuardianName", "second_guardian_name"],
  ["secondGuardianPhone", "second_guardian_phone"],
  ["emergencyName", "emergency_name"],
  ["emergencyRelationship", "emergency_relationship"],
  ["emergencyPhone", "emergency_phone"],
  ["allergies", "allergies"],
  ["medicalConditions", "medical_conditions"],
  ["medications", "medications"],
  ["supportNeeds", "support_needs"],
];

/* Lower-cased as well as trimmed on the way in. */
const LOWERCASED = new Set<keyof ApplicationDraft>(["guardianEmail"]);

const draftColumnList = DRAFT_COLUMNS.map(([, column]) => column).join(
  ",\n    ",
);

const applicationColumns = `
    id,
    applicant_email,
    ${draftColumnList},
    status,
    submitted_at::text,
    declaration_accepted_at::text,
    last_reminder_at::text,
    updated_at::text`;

const applicationSelect = `
  SELECT${applicationColumns}
  FROM admission_application_records`;

export async function getApplicantApplication(
  user: AuthenticatedUser,
): Promise<ApplicantApplication | null> {
  await ensurePlatformReady();
  const result = await getPostgresPool().query<ApplicationRow>(
    `${applicationSelect}
     WHERE tenant_id = $1 AND intake_id = $2 AND applicant_email = $3
     LIMIT 1`,
    [
      GREENFIELD_TENANT_ID,
      CURRENT_INTAKE_ID,
      user.email.trim().toLowerCase(),
    ],
  );
  const row = result.rows[0];
  return row ? mapApplication(row) : null;
}

export async function listApplicantApplications(
  access: AccessContext,
): Promise<ApplicantApplication[]> {
  if (!canPerform(access, "admissions:manage")) {
    throw new AuthorizationError(
      "You do not have permission to manage admissions.",
    );
  }

  await ensurePlatformReady();
  const result = await getPostgresPool().query<ApplicationRow>(
    `${applicationSelect}
     WHERE tenant_id = $1 AND intake_id = $2 AND status <> 'draft'
     ORDER BY COALESCE(submitted_at, updated_at) DESC`,
    [access.tenantId, CURRENT_INTAKE_ID],
  );
  return result.rows.map(mapApplication);
}

export async function saveApplicantApplication(
  user: AuthenticatedUser,
  input: SaveApplicantApplicationInput,
  submit: boolean,
): Promise<ApplicantApplication> {
  /* The same check the wizard runs, so a client that skipped a step — or
     posted straight at the API — cannot submit an incomplete application. */
  if (submit && !isApplicationSubmittable(input)) {
    const [first] = validateApplicationDraft(input);
    throw new ApplicantApplicationError(
      first?.message ??
        "Complete every required section before submitting your application.",
    );
  }

  await ensurePlatformReady();

  const database = getPostgresPool();
  const email = user.email.trim().toLowerCase();
  const existing = await database.query<{
    id: string;
    status: ApplicantApplication["status"];
  }>(
    `SELECT id, status
     FROM admission_application_records
     WHERE tenant_id = $1 AND intake_id = $2 AND applicant_email = $3
     LIMIT 1`,
    [GREENFIELD_TENANT_ID, CURRENT_INTAKE_ID, email],
  );
  const current = existing.rows[0];

  if (current && current.status !== "draft" && current.status !== "submitted") {
    throw new ApplicantApplicationError(
      "This application is already being processed. Contact admissions to request a correction.",
    );
  }

  const applicationId = current?.id ?? crypto.randomUUID();
  const status = submit ? "submitted" : current?.status ?? "draft";
  const now = new Date().toISOString();
  const submittedAt = submit ? now : null;
  const declarationAcceptedAt = submit ? now : null;

  const values = [
    applicationId,
    GREENFIELD_TENANT_ID,
    CURRENT_INTAKE_ID,
    email,
    ...DRAFT_COLUMNS.map(([field]) => normalise(field, input[field])),
    status,
    submittedAt,
    declarationAcceptedAt,
  ];

  const insertColumns = [
    "id",
    "tenant_id",
    "intake_id",
    "applicant_email",
    ...DRAFT_COLUMNS.map(([, column]) => column),
    "status",
    "submitted_at",
    "declaration_accepted_at",
  ].join(", ");
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  const updateAssignments = [
    ...DRAFT_COLUMNS.map(([, column]) => `${column} = EXCLUDED.${column}`),
    "status = EXCLUDED.status",
    /* COALESCE so re-saving never clears the original timestamps. */
    "submitted_at = COALESCE(EXCLUDED.submitted_at, admission_application_records.submitted_at)",
    "declaration_accepted_at = COALESCE(EXCLUDED.declaration_accepted_at, admission_application_records.declaration_accepted_at)",
    /* Editing a draft makes it active again, so the reminder may fire once
       more if it goes quiet a second time. */
    "last_reminder_at = NULL",
    "updated_at = CURRENT_TIMESTAMP",
  ].join(",\n       ");

  await database.query(
    `INSERT INTO admission_application_records (${insertColumns})
     VALUES (${placeholders})
     ON CONFLICT (tenant_id, intake_id, applicant_email)
     DO UPDATE SET
       ${updateAssignments}`,
    values,
  );

  const saved = await getApplicantApplication(user);
  if (!saved) {
    throw new ApplicantApplicationError(
      "The application could not be loaded after saving.",
    );
  }
  return saved;
}

export async function updateApplicantApplicationStatus(
  access: AccessContext,
  applicationId: string,
  nextStatus: ManagedAdmissionStatus,
): Promise<ApplicantApplication> {
  if (!canPerform(access, "admissions:manage")) {
    throw new AuthorizationError(
      "You do not have permission to manage admissions.",
    );
  }

  await ensurePlatformReady();
  const database = getPostgresPool();
  const currentResult = await database.query<ApplicationRow>(
    `${applicationSelect}
     WHERE tenant_id = $1 AND intake_id = $2 AND id = $3
     LIMIT 1`,
    [access.tenantId, CURRENT_INTAKE_ID, applicationId],
  );
  const current = currentResult.rows[0];
  if (!current) {
    throw new ApplicantApplicationError("The application could not be found.");
  }
  if (!isAllowedStatusChange(current.status, nextStatus)) {
    throw new ApplicantApplicationError(
      `An application cannot move from ${current.status} to ${nextStatus}.`,
    );
  }

  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query<ApplicationRow>(
      `UPDATE admission_application_records
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $2 AND intake_id = $3 AND id = $4
       RETURNING${applicationColumns}`,
      [nextStatus, access.tenantId, CURRENT_INTAKE_ID, applicationId],
    );
    await client.query(
      `INSERT INTO audit_events
        (id, tenant_id, actor_person_id, action, entity_type, entity_id, metadata)
       VALUES (
         $1, $2, $3, 'admissions.status_changed', 'admission_application', $4,
         $5::jsonb
       )`,
      [
        crypto.randomUUID(),
        access.tenantId,
        access.actorPersonId,
        applicationId,
        JSON.stringify({ from: current.status, to: nextStatus }),
      ],
    );
    await client.query("COMMIT");
    return mapApplication(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Drafts nobody has touched for `quietDays`, that have not been reminded yet.
 *
 * Drafts only: a submitted application is the school's problem now, not the
 * family's. `last_reminder_at IS NULL` is what makes this send once rather
 * than on every run of the job.
 */
export async function listAbandonedDrafts(
  quietDays: number,
): Promise<AbandonedDraft[]> {
  await ensurePlatformReady();
  const result = await getPostgresPool().query<
    ApplicationRow & { days_since_update: number }
  >(
    `SELECT${applicationColumns},
      EXTRACT(DAY FROM (CURRENT_TIMESTAMP - updated_at))::int AS days_since_update
     FROM admission_application_records
     WHERE tenant_id = $1
       AND intake_id = $2
       AND status = 'draft'
       AND last_reminder_at IS NULL
       AND updated_at < CURRENT_TIMESTAMP - make_interval(days => $3::int)
       AND guardian_email <> ''
     ORDER BY updated_at`,
    [GREENFIELD_TENANT_ID, CURRENT_INTAKE_ID, quietDays],
  );

  return result.rows.map((row) => {
    const application = mapApplication(row);
    return {
      applicantFirstName: application.applicantFirstName,
      daysSinceUpdate: Number(row.days_since_update),
      draft: toDraft(application),
      guardianEmail: application.guardianEmail,
      guardianName: application.guardianName,
      id: application.id,
    };
  });
}

/** Records that the one reminder has gone out. */
export async function markDraftReminderSent(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await ensurePlatformReady();
  await getPostgresPool().query(
    `UPDATE admission_application_records
     SET last_reminder_at = CURRENT_TIMESTAMP
     WHERE tenant_id = $1 AND id = ANY($2::text[])`,
    [GREENFIELD_TENANT_ID, ids],
  );
}

export class ApplicantApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicantApplicationError";
  }
}

type ApplicationRow = Record<string, string | null> & {
  applicant_email: string;
  id: string;
  status: ApplicantApplication["status"];
  updated_at: string;
};

function normalise(field: keyof ApplicationDraft, value: string): string {
  const trimmed = (value ?? "").trim();
  return LOWERCASED.has(field) ? trimmed.toLowerCase() : trimmed;
}

function mapApplication(row: ApplicationRow): ApplicantApplication {
  const draft = emptyApplicationDraft();
  for (const [field, column] of DRAFT_COLUMNS) {
    draft[field] = row[column] ?? "";
  }
  return {
    ...draft,
    applicantEmail: row.applicant_email,
    declarationAcceptedAt: row.declaration_accepted_at ?? undefined,
    id: row.id,
    lastReminderAt: row.last_reminder_at ?? undefined,
    status: row.status,
    submittedAt: row.submitted_at ?? undefined,
    updatedAt: row.updated_at,
  };
}

/** Strips the server-owned fields back off, for the form and the templates. */
export function toDraft(application: ApplicantApplication): ApplicationDraft {
  const draft = emptyApplicationDraft();
  for (const [field] of DRAFT_COLUMNS) {
    draft[field] = application[field];
  }
  return draft;
}

function isAllowedStatusChange(
  currentStatus: ApplicantApplication["status"],
  nextStatus: ManagedAdmissionStatus,
): boolean {
  const allowedTransitions: Partial<
    Record<ApplicantApplication["status"], ManagedAdmissionStatus[]>
  > = {
    accepted: ["enrolled"],
    offered: ["accepted"],
    submitted: ["under-review"],
    "under-review": ["offered", "rejected"],
  };
  return allowedTransitions[currentStatus]?.includes(nextStatus) ?? false;
}
