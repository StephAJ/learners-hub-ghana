import type { AuthenticatedUser } from "../app/auth";
import { AuthorizationError, canPerform } from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import { ensurePlatformReady } from "../server/platform-ready";
import { getPostgresPool } from "./postgres";

const GREENFIELD_TENANT_ID = "tenant-greenfield";
const CURRENT_INTAKE_ID = "2026-2027";

export type ApplicantApplication = {
  applicantEmail: string;
  applicantFirstName: string;
  applicantLastName: string;
  dateOfBirth: string;
  desiredClass: string;
  guardianEmail: string;
  guardianName: string;
  guardianPhone: string;
  id: string;
  previousSchool: string;
  status:
    | "draft"
    | "submitted"
    | "under-review"
    | "offered"
    | "accepted"
    | "rejected"
    | "enrolled";
  submittedAt?: string;
  supportNeeds: string;
  updatedAt: string;
};

export type SaveApplicantApplicationInput = Omit<
  ApplicantApplication,
  "applicantEmail" | "id" | "status" | "submittedAt" | "updatedAt"
>;

export type ManagedAdmissionStatus = Exclude<
  ApplicantApplication["status"],
  "draft" | "submitted"
>;

export async function getApplicantApplication(
  user: AuthenticatedUser,
): Promise<ApplicantApplication | null> {
  await ensurePlatformReady();
  const result = await getPostgresPool().query<ApplicantApplicationRow>(
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
  const result = await getPostgresPool().query<ApplicantApplicationRow>(
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
  validateApplication(input, submit);
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
  const submittedAt = submit ? new Date().toISOString() : null;

  await database.query(
    `INSERT INTO admission_application_records
      (
        id, tenant_id, intake_id, applicant_email, applicant_first_name,
        applicant_last_name, date_of_birth, guardian_name, guardian_email,
        guardian_phone, previous_school, desired_class, support_needs,
        status, submitted_at
      )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
     )
     ON CONFLICT (tenant_id, intake_id, applicant_email)
     DO UPDATE SET
       applicant_first_name = EXCLUDED.applicant_first_name,
       applicant_last_name = EXCLUDED.applicant_last_name,
       date_of_birth = EXCLUDED.date_of_birth,
       guardian_name = EXCLUDED.guardian_name,
       guardian_email = EXCLUDED.guardian_email,
       guardian_phone = EXCLUDED.guardian_phone,
       previous_school = EXCLUDED.previous_school,
       desired_class = EXCLUDED.desired_class,
       support_needs = EXCLUDED.support_needs,
       status = EXCLUDED.status,
       submitted_at = COALESCE(EXCLUDED.submitted_at, admission_application_records.submitted_at),
       updated_at = CURRENT_TIMESTAMP`,
    [
      applicationId,
      GREENFIELD_TENANT_ID,
      CURRENT_INTAKE_ID,
      email,
      input.applicantFirstName.trim(),
      input.applicantLastName.trim(),
      input.dateOfBirth,
      input.guardianName.trim(),
      input.guardianEmail.trim().toLowerCase(),
      input.guardianPhone.trim(),
      input.previousSchool.trim(),
      input.desiredClass,
      input.supportNeeds.trim(),
      status,
      submittedAt,
    ],
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
  const currentResult = await database.query<ApplicantApplicationRow>(
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
    const updated = await client.query<ApplicantApplicationRow>(
      `UPDATE admission_application_records
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $2 AND intake_id = $3 AND id = $4
       RETURNING
         id,
         applicant_email,
         applicant_first_name,
         applicant_last_name,
         date_of_birth,
         guardian_name,
         guardian_email,
         guardian_phone,
         previous_school,
         desired_class,
         support_needs,
         status,
         submitted_at::text,
         updated_at::text`,
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

export class ApplicantApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicantApplicationError";
  }
}

type ApplicantApplicationRow = {
  applicant_email: string;
  applicant_first_name: string;
  applicant_last_name: string;
  date_of_birth: string;
  desired_class: string;
  guardian_email: string;
  guardian_name: string;
  guardian_phone: string;
  id: string;
  previous_school: string;
  status: ApplicantApplication["status"];
  submitted_at: string | null;
  support_needs: string;
  updated_at: string;
};

const applicationSelect = `
  SELECT
    id,
    applicant_email,
    applicant_first_name,
    applicant_last_name,
    date_of_birth,
    guardian_name,
    guardian_email,
    guardian_phone,
    previous_school,
    desired_class,
    support_needs,
    status,
    submitted_at::text,
    updated_at::text
  FROM admission_application_records`;

function mapApplication(row: ApplicantApplicationRow): ApplicantApplication {
  return {
    applicantEmail: row.applicant_email,
    applicantFirstName: row.applicant_first_name,
    applicantLastName: row.applicant_last_name,
    dateOfBirth: row.date_of_birth,
    desiredClass: row.desired_class,
    guardianEmail: row.guardian_email,
    guardianName: row.guardian_name,
    guardianPhone: row.guardian_phone,
    id: row.id,
    previousSchool: row.previous_school,
    status: row.status,
    submittedAt: row.submitted_at ?? undefined,
    supportNeeds: row.support_needs,
    updatedAt: row.updated_at,
  };
}

function validateApplication(
  input: SaveApplicantApplicationInput,
  submit: boolean,
) {
  if (!submit) return;
  const requiredValues = [
    input.applicantFirstName,
    input.applicantLastName,
    input.dateOfBirth,
    input.guardianName,
    input.guardianEmail,
    input.guardianPhone,
    input.desiredClass,
  ];
  if (requiredValues.some((value) => !value.trim())) {
    throw new ApplicantApplicationError(
      "Complete every required section before submitting your application.",
    );
  }
  if (!input.guardianEmail.includes("@")) {
    throw new ApplicantApplicationError(
      "Enter a valid guardian email address.",
    );
  }
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
