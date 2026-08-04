import { Pool, types } from "pg";
import { learningSchema } from "./learning-schema";

/* ==========================================================================
   bigint comes back as a number

   node-postgres hands int8 (OID 20) back as a *string* by default, because a
   64-bit integer can exceed Number.MAX_SAFE_INTEGER and parsing it would lose
   precision silently.

   Every integer column in the generated schema is int8, because the generator
   maps SQLite's 64-bit INTEGER onto it — so before this, every count, mark,
   version, byte size and epoch value arrived as a string. Nothing failed
   loudly. `questions.reduce((sum, q) => sum + q.marks, 0)` returned "011"
   instead of 2, a learner's total marks read as concatenated digits, and
   `score >= passMark` compared strings lexicographically, where "9" > "10".

   The values this schema actually stores are marks, counts, percentages,
   byte sizes and millisecond timestamps. The largest of those is a timestamp,
   safe as a Number until the year 287396, and a byte size would have to reach
   nine petabytes to matter. Parsing them as numbers is what the schema
   generator's own comment already assumed was happening.
   ========================================================================== */
types.setTypeParser(types.builtins.INT8, (value) => Number(value));

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

  /* Passport photographs. Nullable: every surface falls back to initials, so
     a school part-way through collecting them still reads correctly. */
  ALTER TABLE people
    ADD COLUMN IF NOT EXISTS photo_url text;

  /* A question's diagram and formula. On the version, so changing either
     versions the question the way changing its wording does. */
  ALTER TABLE question_versions
    ADD COLUMN IF NOT EXISTS media text,
    ADD COLUMN IF NOT EXISTS formula text;

  /* The reminder job scans for stale drafts; without this it is a sequential
     scan of every application the school has ever taken. */
  CREATE INDEX IF NOT EXISTS admission_records_draft_reminder_idx
    ON admission_application_records (tenant_id, status, updated_at);

  /* ------------------------------------------------------------------------
     Giving the existing classes a parent row

     Before academic_years and class_groups existed, a class was three
     denormalised columns on subject_offerings pointing at nothing. Any
     database written by an earlier build already holds real offerings with
     real class ids, and the new admin screens read the parent tables — so
     without this backfill an existing school opens Academics and correctly
     sees nothing at all, while its offerings sit there referring to classes
     that have no record.

     Both statements are keyed on the id the offerings already use, so the
     rows that appear are the school's own classes rather than new ones, and
     re-running is a no-op.

     No foreign key is added from subject_offerings onto either table. The
     denormalised columns are read directly by around a hundred prepared
     statements that would have to move with it, and a constraint added here
     would fail the deployment of any school whose offerings disagree with
     this backfill even slightly. Coherence first; enforcement is its own
     change.
     ------------------------------------------------------------------------ */

  /* Name and dates are left as the raw id and empty strings deliberately: the
     year's real name and term dates are things only the school knows, and a
     plausible-looking guess is worse than a blank an administrator is asked
     to fill in. The seeded demo year is corrected by db/academic-seed.ts. */
  INSERT INTO academic_years (id, tenant_id, name, starts_on, ends_on, status)
  SELECT
    offering.academic_year_id,
    MIN(offering.tenant_id),
    offering.academic_year_id,
    '',
    '',
    'current'
  FROM subject_offerings AS offering
  WHERE offering.academic_year_id <> ''
  GROUP BY offering.academic_year_id
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO class_groups
    (id, tenant_id, academic_year_id, name, level, room, status)
  SELECT
    offering.class_group_id,
    MIN(offering.tenant_id),
    MIN(offering.academic_year_id),
    MIN(offering.class_name),
    '',
    '',
    'active'
  FROM subject_offerings AS offering
  WHERE offering.class_group_id <> '' AND offering.academic_year_id <> ''
  GROUP BY offering.class_group_id
  ON CONFLICT (id) DO NOTHING;
`;
