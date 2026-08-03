import { Pool } from "pg";
import { learningSchema } from "./learning-schema";

const globalDatabase = globalThis as typeof globalThis & {
  learnersHubPostgresPool?: Pool;
};

export function getPostgresPool(): Pool {
  if (!globalDatabase.learnersHubPostgresPool) {
    globalDatabase.learnersHubPostgresPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
    });
  }

  return globalDatabase.learnersHubPostgresPool;
}

export async function migrateLearnersHubSchema(): Promise<void> {
  const database = getPostgresPool();
  await database.query(applicationSchema);
  /* The learning tables reference tenants and people, so they go second.
     Generated from db/schema.ts — see scripts/generate-learning-schema.ts. */
  await database.query(learningSchema);
  /* Last, because these alter tables the two above have just guaranteed. */
  await database.query(additiveMigrations);
}

const applicationSchema = `
  CREATE TABLE IF NOT EXISTS tenants (
    id text PRIMARY KEY,
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS people (
    id text PRIMARY KEY,
    tenant_id text NOT NULL REFERENCES tenants(id),
    kind text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text,
    phone text,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, email)
  );

  CREATE TABLE IF NOT EXISTS identity_accounts (
    id text PRIMARY KEY,
    person_id text NOT NULL REFERENCES people(id),
    provider text NOT NULL,
    provider_subject text NOT NULL,
    email text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider, provider_subject)
  );

  CREATE TABLE IF NOT EXISTS tenant_memberships (
    id text PRIMARY KEY,
    tenant_id text NOT NULL REFERENCES tenants(id),
    person_id text NOT NULL REFERENCES people(id),
    role text NOT NULL,
    status text NOT NULL DEFAULT 'invited',
    scope_type text NOT NULL DEFAULT 'tenant',
    scope_id text,
    invited_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accepted_at timestamptz,
    UNIQUE (tenant_id, person_id, role, scope_type, scope_id)
  );

  CREATE TABLE IF NOT EXISTS tenant_bootstrap (
    tenant_id text PRIMARY KEY REFERENCES tenants(id),
    claimed_by_identity_id text NOT NULL REFERENCES identity_accounts(id),
    claimed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS guardian_relationships (
    id text PRIMARY KEY,
    tenant_id text NOT NULL REFERENCES tenants(id),
    guardian_person_id text NOT NULL REFERENCES people(id),
    learner_person_id text NOT NULL REFERENCES people(id),
    relationship text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, guardian_person_id, learner_person_id)
  );

  CREATE TABLE IF NOT EXISTS audit_events (
    id text PRIMARY KEY,
    tenant_id text NOT NULL REFERENCES tenants(id),
    actor_person_id text REFERENCES people(id),
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admission_application_records (
    id text PRIMARY KEY,
    tenant_id text NOT NULL REFERENCES tenants(id),
    intake_id text NOT NULL,
    applicant_email text NOT NULL,
    applicant_first_name text NOT NULL DEFAULT '',
    applicant_last_name text NOT NULL DEFAULT '',
    date_of_birth text NOT NULL DEFAULT '',
    guardian_name text NOT NULL DEFAULT '',
    guardian_email text NOT NULL DEFAULT '',
    guardian_phone text NOT NULL DEFAULT '',
    previous_school text NOT NULL DEFAULT '',
    desired_class text NOT NULL DEFAULT '',
    support_needs text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'draft',
    submitted_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, intake_id, applicant_email)
  );

  CREATE INDEX IF NOT EXISTS admission_records_tenant_status_idx
    ON admission_application_records (tenant_id, status);
`;

/* ==========================================================================
   Additive migrations

   Everything above is CREATE TABLE IF NOT EXISTS, which does nothing at all to
   a table that already exists — so a column added to an existing deployment
   has to be stated here as well. ADD COLUMN IF NOT EXISTS is idempotent, so
   this runs on every boot like the rest of the schema.

   Columns only. Anything that rewrites or drops data does not belong in a
   migration that runs unattended on startup.
   ========================================================================== */
const additiveMigrations = `
  ALTER TABLE admission_application_records
    ADD COLUMN IF NOT EXISTS applicant_middle_name text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS nationality text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS place_of_birth text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS home_address text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS previous_school_location text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS last_class_completed text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS reason_for_leaving text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS entry_term text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS guardian_relationship text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS guardian_occupation text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS guardian_address text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS second_guardian_name text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS second_guardian_phone text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS emergency_name text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS emergency_phone text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS emergency_relationship text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS allergies text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS medical_conditions text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS medications text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS declaration_accepted_at timestamptz,
    ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz;

  /* The reminder job scans for stale drafts; without this it is a sequential
     scan of every application the school has ever taken. */
  CREATE INDEX IF NOT EXISTS admission_records_draft_reminder_idx
    ON admission_application_records (tenant_id, status, updated_at);
`;
