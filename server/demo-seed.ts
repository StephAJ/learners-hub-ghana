import type { Pool } from "pg";
import {
  demoAdmissionApplication,
  demoPeople,
  DEMO_TENANT_ID,
  type DemoPerson,
} from "../domain/demo/greenfield";
import { auth } from "./auth-config";

/* ==========================================================================
   Demo accounts

   Creates sign-in-able identities for the Greenfield demo cast — a teacher, a
   learner, their guardian, an academic administrator and an admissions officer
   — plus one submitted application waiting in the review queue, so every role
   can be walked end to end.

   Off unless DEMO_ACCOUNTS=true and DEMO_PASSWORD are both set. These accounts
   share a single known password: that is fine for a staging box being demoed
   and unacceptable anywhere real, so it has to be switched on deliberately
   rather than shipped on by default. Production leaves both unset and nothing
   below runs.

   Everything here targets PostgreSQL, which is the database the VPS container
   actually has. The learning content these people teach and study still lives
   in the D1-backed repositories and is served from the demo dataset in the
   browser until those move across.
   ========================================================================== */

const DEMO_PASSWORD_MINIMUM = 10;

export type DemoSeedOutcome =
  | { reason: string; status: "skipped" }
  | { accounts: string[]; status: "seeded" };

export async function seedDemoAccounts(
  database: Pool,
): Promise<DemoSeedOutcome> {
  if (process.env.DEMO_ACCOUNTS?.trim().toLowerCase() !== "true") {
    return { reason: "DEMO_ACCOUNTS is not true", status: "skipped" };
  }

  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < DEMO_PASSWORD_MINIMUM) {
    /* Refusing is deliberate. A demo seed that quietly invents a password
       would put accounts on a public host that nobody knows to remove. */
    throw new Error(
      `DEMO_ACCOUNTS is enabled but DEMO_PASSWORD is missing or shorter than ${DEMO_PASSWORD_MINIMUM} characters.`,
    );
  }

  const accounts: string[] = [];
  for (const person of demoPeople) {
    const created = await ensureDemoIdentity(database, person, password);
    if (created) accounts.push(person.email);
  }

  await ensureReviewableApplication(database);

  return { accounts, status: "seeded" };
}

/**
 * Links a Better Auth user to the school person record of the same email.
 *
 * The person and membership rows already exist from the people seed; what is
 * missing is the identity that lets someone actually sign in as them. Returns
 * true when this call created the login.
 */
async function ensureDemoIdentity(
  database: Pool,
  person: DemoPerson,
  password: string,
): Promise<boolean> {
  const email = person.email.trim().toLowerCase();
  const name = `${person.firstName} ${person.lastName}`;

  const existingUser = await database.query<{ id: string }>(
    `SELECT id FROM "user" WHERE lower(email) = $1 LIMIT 1`,
    [email],
  );

  let created = false;
  if (existingUser.rowCount === 0) {
    await auth.api.signUpEmail({ body: { email, name, password } });
    created = true;
  }

  const userResult = await database.query<{ id: string }>(
    `SELECT id FROM "user" WHERE lower(email) = $1 LIMIT 1`,
    [email],
  );
  const userId = userResult.rows[0]?.id;
  if (!userId) {
    throw new Error(`The demo account for ${email} could not be created.`);
  }

  /* The person row is seeded separately and keyed by a stable id, so the
     identity is attached to that rather than to whatever row happens to match
     the address. */
  await database.query(
    `INSERT INTO identity_accounts (id, person_id, provider, provider_subject, email)
     VALUES ($1, $2, 'better-auth', $3, $4)
     ON CONFLICT (provider, provider_subject) DO NOTHING`,
    [`identity-demo-${person.id}`, person.id, userId, email],
  );

  return created;
}

/**
 * Puts one submitted application in front of the admissions officer.
 *
 * Written as an upsert on status so a demo that has already been walked
 * through — accepted, rejected, whatever — resets to "awaiting review" on the
 * next boot and can be demonstrated again.
 */
async function ensureReviewableApplication(database: Pool): Promise<void> {
  const application = demoAdmissionApplication;
  await database.query(
    `INSERT INTO admission_application_records
       (id, tenant_id, intake_id, applicant_email, applicant_first_name,
        applicant_last_name, date_of_birth, guardian_name, guardian_email,
        guardian_phone, previous_school, desired_class, support_needs,
        status, submitted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (tenant_id, intake_id, applicant_email)
     DO UPDATE SET status = EXCLUDED.status,
                   submitted_at = EXCLUDED.submitted_at,
                   updated_at = CURRENT_TIMESTAMP`,
    [
      application.id,
      DEMO_TENANT_ID,
      application.intakeId,
      application.applicantEmail,
      application.applicantFirstName,
      application.applicantLastName,
      application.dateOfBirth,
      application.guardianName,
      application.guardianEmail,
      application.guardianPhone,
      application.previousSchool,
      application.desiredClass,
      application.supportNeeds,
      application.status,
      application.submittedAt,
    ],
  );
}
