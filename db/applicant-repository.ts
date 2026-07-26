import type { ChatGPTUser } from "../app/chatgpt-auth";
import { AuthorizationError, canPerform } from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import { getD1Database } from "./index";

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

export async function getApplicantApplication(
  user: ChatGPTUser,
): Promise<ApplicantApplication | null> {
  const database = await getD1Database();
  await ensureAdmissionsTenant(database);
  const row = await database
    .prepare(
      `SELECT
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
        submitted_at,
        updated_at
      FROM admission_application_records
      WHERE tenant_id = ? AND intake_id = ? AND applicant_email = ?
      LIMIT 1`,
    )
    .bind(
      GREENFIELD_TENANT_ID,
      CURRENT_INTAKE_ID,
      user.email.trim().toLowerCase(),
    )
    .first<ApplicantApplicationRow>();

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

  const database = await getD1Database();
  await ensureAdmissionsTenant(database);
  const result = await database
    .prepare(
      `SELECT
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
        submitted_at,
        updated_at
      FROM admission_application_records
      WHERE tenant_id = ? AND intake_id = ? AND status <> 'draft'
      ORDER BY COALESCE(submitted_at, updated_at) DESC`,
    )
    .bind(access.tenantId, CURRENT_INTAKE_ID)
    .all<ApplicantApplicationRow>();

  return result.results.map(mapApplication);
}

export async function saveApplicantApplication(
  user: ChatGPTUser,
  input: SaveApplicantApplicationInput,
  submit: boolean,
): Promise<ApplicantApplication> {
  validateApplication(input, submit);
  const database = await getD1Database();
  await ensureAdmissionsTenant(database);
  const email = user.email.trim().toLowerCase();
  const existing = await database
    .prepare(
      `SELECT id, status
      FROM admission_application_records
      WHERE tenant_id = ? AND intake_id = ? AND applicant_email = ?
      LIMIT 1`,
    )
    .bind(GREENFIELD_TENANT_ID, CURRENT_INTAKE_ID, email)
    .first<{ id: string; status: ApplicantApplication["status"] }>();

  if (
    existing &&
    existing.status !== "draft" &&
    existing.status !== "submitted"
  ) {
    throw new ApplicantApplicationError(
      "This application is already being processed. Contact admissions to request a correction.",
    );
  }

  const applicationId = existing?.id ?? crypto.randomUUID();
  const status = submit ? "submitted" : existing?.status ?? "draft";
  const submittedAt = submit ? new Date().toISOString() : null;

  await database
    .prepare(
      `INSERT INTO admission_application_records
        (
          id, tenant_id, intake_id, applicant_email, applicant_first_name,
          applicant_last_name, date_of_birth, guardian_name, guardian_email,
          guardian_phone, previous_school, desired_class, support_needs,
          status, submitted_at
        )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (tenant_id, intake_id, applicant_email)
      DO UPDATE SET
        applicant_first_name = excluded.applicant_first_name,
        applicant_last_name = excluded.applicant_last_name,
        date_of_birth = excluded.date_of_birth,
        guardian_name = excluded.guardian_name,
        guardian_email = excluded.guardian_email,
        guardian_phone = excluded.guardian_phone,
        previous_school = excluded.previous_school,
        desired_class = excluded.desired_class,
        support_needs = excluded.support_needs,
        status = excluded.status,
        submitted_at = COALESCE(excluded.submitted_at, submitted_at),
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
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
    )
    .run();

  const saved = await getApplicantApplication(user);
  if (!saved) {
    throw new ApplicantApplicationError(
      "The application could not be loaded after saving.",
    );
  }
  return saved;
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

async function ensureAdmissionsTenant(database: D1Database) {
  await database
    .prepare(
      "INSERT OR IGNORE INTO tenants (id, name, slug) VALUES (?, ?, ?)",
    )
    .bind(GREENFIELD_TENANT_ID, "Greenfield Academy", "greenfield-academy")
    .run();
}
