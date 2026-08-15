import type { Pool } from "pg";
import type { AuthenticatedUser } from "../app/auth";
import {
  emptyApplicationDraft,
  isApplicationSubmittable,
  validateApplication as validateApplicationDraft,
  type ApplicationDraft,
} from "../domain/admissions/application-form";
import { AuthorizationError, canPerform } from "../domain/identity/authorization";
import {
  admissionsConsentStatement,
  CONSENT_VERSION,
} from "../domain/admissions/consent";
import type { AccessContext } from "../domain/identity/types";
import {
  requireOpenIntakeId,
  resolveCurrentIntakeId,
} from "./intake-repository";
import { allocateStudentNumber } from "./people-repository";
import { ensurePlatformReady } from "../server/platform-ready";
import { getPostgresPool } from "./postgres";

import { SCHOOL_TENANT_ID } from "../server/school-tenant";

/* The one school this deployment serves. Was the literal
   "tenant-greenfield" — the demo school's own id — written out here and
   in five other files. */
const GREENFIELD_TENANT_ID = SCHOOL_TENANT_ID;

/* ==========================================================================
   Which intake an application belongs to

   This was `const CURRENT_INTAKE_ID = "2026-2027"`. Every statement below
   bound it, which meant the year a school was admitting for was decided when
   the bundle was built: opening next year's admissions needed a developer,
   and closing this year's was not possible at all — the form went on
   accepting applications past its own advertised closing date.

   Reads and writes ask different questions of the intake record, and the
   difference matters. A write asks "may this family apply right now", and is
   refused once the intake closes. A read asks "which intake am I looking
   at", and must keep working afterwards: an admissions officer reviews the
   applications for weeks after the door shuts, and a queue that emptied on
   the closing date would lose them the entire year's work.
   ========================================================================== */

export type ApplicantApplication = ApplicationDraft & {
  applicantEmail: string;
  /** Set when the guardian ticked the declaration on the review step. */
  declarationAcceptedAt?: string;
  /** The exact sentence they agreed to, and the version it came from. */
  declarationStatement?: string;
  declarationVersion?: string;
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
    declaration_statement,
    declaration_version,
    last_reminder_at::text,
    updated_at::text`;

const applicationSelect = `
  SELECT${applicationColumns}
  FROM admission_application_records`;

export async function getApplicantApplication(
  user: AuthenticatedUser,
): Promise<ApplicantApplication | null> {
  await ensurePlatformReady();
  const intakeId = await resolveCurrentIntakeId(GREENFIELD_TENANT_ID);
  if (!intakeId) return null;

  const result = await getPostgresPool().query<ApplicationRow>(
    `${applicationSelect}
     WHERE tenant_id = $1 AND intake_id = $2 AND applicant_email = $3
     LIMIT 1`,
    [GREENFIELD_TENANT_ID, intakeId, user.email.trim().toLowerCase()],
  );
  const row = result.rows[0];
  return row ? mapApplication(row) : null;
}

export async function listApplicantApplications(
  access: AccessContext,
  intakeIdOverride?: string,
): Promise<ApplicantApplication[]> {
  if (!canPerform(access, "admissions:manage")) {
    throw new AuthorizationError(
      "You do not have permission to manage admissions.",
    );
  }

  await ensurePlatformReady();
  const intakeId =
    intakeIdOverride ?? (await resolveCurrentIntakeId(access.tenantId));
  if (!intakeId) return [];

  const result = await getPostgresPool().query<ApplicationRow>(
    `${applicationSelect}
     WHERE tenant_id = $1 AND intake_id = $2 AND status <> 'draft'
     ORDER BY COALESCE(submitted_at, updated_at) DESC`,
    [access.tenantId, intakeId],
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

  /* Throws IntakeClosedError when the school is not taking applications. On
     the save path as well as the submit path deliberately: a family part-way
     through the form when the intake closes is stopped at their next save,
     rather than filling in four more sections and being refused at the end. */
  const intakeId = await requireOpenIntakeId(GREENFIELD_TENANT_ID);
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
    [GREENFIELD_TENANT_ID, intakeId, email],
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
  /* Composed here rather than accepted from the request. What an applicant
     agreed to is a record the school has to be able to stand behind, and a
     client-supplied sentence is not one. The same function builds the text the
     form displays, so the two cannot say different things. */
  const declarationStatement = submit
    ? admissionsConsentStatement(await schoolName(database))
    : "";
  const declarationVersion = submit ? CONSENT_VERSION : "";

  const values = [
    applicationId,
    GREENFIELD_TENANT_ID,
    intakeId,
    email,
    ...DRAFT_COLUMNS.map(([field]) => normalise(field, input[field])),
    status,
    submittedAt,
    declarationAcceptedAt,
    declarationStatement,
    declarationVersion,
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
    "declaration_statement",
    "declaration_version",
  ].join(", ");
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  const updateAssignments = [
    ...DRAFT_COLUMNS.map(([, column]) => `${column} = EXCLUDED.${column}`),
    "status = EXCLUDED.status",
    /* COALESCE so re-saving never clears the original timestamps. */
    "submitted_at = COALESCE(EXCLUDED.submitted_at, admission_application_records.submitted_at)",
    "declaration_accepted_at = COALESCE(EXCLUDED.declaration_accepted_at, admission_application_records.declaration_accepted_at)",
    /* Same COALESCE, for the same reason: an agreement already given is never
       rewritten by a later save. */
    "declaration_statement = COALESCE(NULLIF(EXCLUDED.declaration_statement, ''), admission_application_records.declaration_statement)",
    "declaration_version = COALESCE(NULLIF(EXCLUDED.declaration_version, ''), admission_application_records.declaration_version)",
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
  /* Deliberately not scoped to an intake. Reviewing an application is
     something an officer does long after its intake closed, and often after
     the next one has opened — scoping this would make last year's decisions
     unrecordable the moment a new intake began. The tenant check is what
     keeps it safe; the id is already unique. */
  const currentResult = await database.query<ApplicationRow>(
    `${applicationSelect}
     WHERE tenant_id = $1 AND id = $2
     LIMIT 1`,
    [access.tenantId, applicationId],
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
       WHERE tenant_id = $2 AND id = $3
       RETURNING${applicationColumns}`,
      [nextStatus, access.tenantId, applicationId],
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
  /* Nudging someone to finish a draft for an intake that has closed would be
     worse than saying nothing, so a school with no live intake gets no
     reminders sent at all. */
  const intakeId = await resolveCurrentIntakeId(GREENFIELD_TENANT_ID);
  if (!intakeId) return [];

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
    [GREENFIELD_TENANT_ID, intakeId, quietDays],
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
    declarationStatement: row.declaration_statement || undefined,
    declarationVersion: row.declaration_version || undefined,
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

/* ==========================================================================
   Turning an accepted application into a learner

   Moving an application to "enrolled" changed one word in one row. No learner
   was created, no class membership, no guardian link and no student number —
   so a child the school had admitted did not exist in the product. They had
   no subjects, no register entry, no report card, and their guardian had
   nothing to open.

   A parallel domain module used to model this — convertAcceptedApplication()
   and createClassPlacement() — against an application type nothing built and
   a placements table this schema does not have. It was covered by tests and
   called by nothing, which made it look like the authority on a rule it was
   not enforcing. It has been deleted; placement here is a class-scoped tenant
   membership, which is what every scoping query actually reads.

   One transaction. A learner with no guardian link, or a guardian link to a
   learner with no class, is a worse state than an application still waiting.
   ========================================================================== */

export type EnrolApplicantInput = {
  /** The class the learner joins. Its name becomes their membership scope. */
  classGroupId: string;
};

export type EnrolApplicantResult = {
  application: ApplicantApplication;
  guardian: { created: boolean; id: string };
  learner: { className: string; id: string; name: string; studentNumber: string };
};

export async function enrolApplicant(
  access: AccessContext,
  applicationId: string,
  input: EnrolApplicantInput,
): Promise<EnrolApplicantResult> {
  if (!canPerform(access, "admissions:manage")) {
    throw new AuthorizationError(
      "You do not have permission to manage admissions.",
    );
  }
  await ensurePlatformReady();
  const database = getPostgresPool();

  const currentResult = await database.query<ApplicationRow>(
    `${applicationSelect}
     WHERE tenant_id = $1 AND id = $2
     LIMIT 1`,
    [access.tenantId, applicationId],
  );
  const current = currentResult.rows[0];
  if (!current) {
    throw new ApplicantApplicationError("The application could not be found.");
  }
  if (current.status !== "accepted") {
    throw new ApplicantApplicationError(
      `Only an accepted application can become a learner. This one is ${current.status}.`,
    );
  }

  const classGroup = await database.query<{ id: string; name: string }>(
    `SELECT id, name FROM class_groups
     WHERE id = $1 AND tenant_id = $2 AND status = 'active'`,
    [input.classGroupId, access.tenantId],
  );
  const placement = classGroup.rows[0];
  if (!placement) {
    throw new ApplicantApplicationError(
      "Choose a class the school is currently running.",
    );
  }

  const client = await database.connect();
  try {
    await client.query("BEGIN");

    const learnerId = crypto.randomUUID();
    const studentNumber = await allocateStudentNumber(client, access.tenantId);
    await client.query(
      `INSERT INTO people
        (id, tenant_id, kind, first_name, last_name, email, student_number,
         status)
       VALUES ($1, $2, 'learner', $3, $4, $5, $6, 'active')`,
      [
        learnerId,
        access.tenantId,
        current.applicant_first_name,
        current.applicant_last_name,
        current.applicant_email,
        studentNumber,
      ],
    );

    /* The class membership is the placement. scope_id holds the class name
       rather than its id because that is what the offering join matches on —
       see listLearnerSubjects() and loadAccessScopes(). */
    await client.query(
      `INSERT INTO tenant_memberships
        (id, tenant_id, person_id, role, status, scope_type, scope_id)
       VALUES ($1, $2, $3, 'learner', 'active', 'class', $4)`,
      [crypto.randomUUID(), access.tenantId, learnerId, placement.name],
    );

    /* A guardian who already has a person record — a second child at the
       school — is linked rather than duplicated. */
    const guardianEmail = (current.guardian_email ?? "").trim().toLowerCase();
    const existingGuardian = guardianEmail
      ? await client.query<{ id: string }>(
          `SELECT id FROM people
           WHERE tenant_id = $1 AND kind = 'guardian' AND lower(email) = $2
           LIMIT 1`,
          [access.tenantId, guardianEmail],
        )
      : { rows: [] as Array<{ id: string }> };

    let guardianId = existingGuardian.rows[0]?.id;
    const guardianCreated = !guardianId;
    if (!guardianId) {
      guardianId = crypto.randomUUID();
      const [firstName, ...rest] = (current.guardian_name ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      await client.query(
        `INSERT INTO people
          (id, tenant_id, kind, first_name, last_name, email, phone, status)
         VALUES ($1, $2, 'guardian', $3, $4, $5, $6, 'invited')`,
        [
          guardianId,
          access.tenantId,
          firstName ?? "Guardian",
          rest.join(" "),
          guardianEmail || null,
          current.guardian_phone || null,
        ],
      );
      await client.query(
        `INSERT INTO tenant_memberships
          (id, tenant_id, person_id, role, status, scope_type, scope_id)
         VALUES ($1, $2, $3, 'guardian', 'invited', 'tenant', NULL)`,
        [crypto.randomUUID(), access.tenantId, guardianId],
      );
    }

    await client.query(
      `INSERT INTO guardian_relationships
        (id, tenant_id, guardian_person_id, learner_person_id, relationship)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [
        crypto.randomUUID(),
        access.tenantId,
        guardianId,
        learnerId,
        current.guardian_relationship || "guardian",
      ],
    );

    const updated = await client.query<ApplicationRow>(
      `UPDATE admission_application_records
       SET status = 'enrolled', updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $1 AND id = $2
       RETURNING${applicationColumns}`,
      [access.tenantId, applicationId],
    );

    await client.query(
      `INSERT INTO audit_events
        (id, tenant_id, actor_person_id, action, entity_type, entity_id,
         metadata)
       VALUES ($1, $2, $3, 'admissions.enrolled', 'admission_application', $4,
         $5::jsonb)`,
      [
        crypto.randomUUID(),
        access.tenantId,
        access.actorPersonId,
        applicationId,
        JSON.stringify({
          classGroupId: placement.id,
          guardianCreated,
          guardianPersonId: guardianId,
          learnerPersonId: learnerId,
          studentNumber,
        }),
      ],
    );

    await client.query("COMMIT");
    return {
      application: mapApplication(updated.rows[0]),
      guardian: { created: guardianCreated, id: guardianId },
      learner: {
        className: placement.name,
        id: learnerId,
        name: `${current.applicant_first_name} ${current.applicant_last_name}`.trim(),
        studentNumber,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** What this school calls itself, for the declaration an applicant agrees to. */
async function schoolName(database: Pool): Promise<string> {
  const result = await database.query<{ name: string }>(
    `SELECT name FROM tenants WHERE id = $1 LIMIT 1`,
    [GREENFIELD_TENANT_ID],
  );
  return result.rows[0]?.name ?? "";
}
