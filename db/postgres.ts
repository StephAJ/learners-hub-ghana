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
    /* The exact sentence agreed to, and the version it came from. There was a
       timestamp here and nothing else, so the record of consent pointed at
       text nobody had kept — and the first edit to the wording would have made
       every earlier timestamp refer to a sentence that no longer existed. */
    ADD COLUMN IF NOT EXISTS declaration_statement text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS declaration_version text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz;

  /* Passport photographs. Nullable: every surface falls back to initials, so
     a school part-way through collecting them still reads correctly. */
  ALTER TABLE people
    ADD COLUMN IF NOT EXISTS photo_url text;

  /* ------------------------------------------------------------------------
     Guardian access, revocable

     Two things were wrong here. The product's integrity rules require guardian
     access to be "relationship-based, time-aware, and revocable", and a row
     that can only be inserted is none of those — an office that linked the
     wrong adult to a child had no way to undo it.

     And the absence-alert query already read this column:

       WHERE tenant_id = ? AND learner_person_id = ? AND status = 'active'

     against a table that did not have it. So submitting a register containing
     an absence raised "column status does not exist" and took the whole
     submission down, while a register where everybody was present saved
     perfectly. Nothing had ever run that path against a database.
     ---------------------------------------------------------------------- */
  /* revoked_by_person_id carries no foreign key deliberately. Adding one here
     takes a ShareLock on the people table while the statements above hold a
     RowExclusiveLock on it, and two workers booting at once deadlocked on
     exactly that pair. Who revoked a link is also recorded in audit_events,
     which does carry the key, so nothing is lost but the lock. */
  ALTER TABLE guardian_relationships
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
    ADD COLUMN IF NOT EXISTS revoked_by_person_id text,
    ADD COLUMN IF NOT EXISTS revoked_reason text NOT NULL DEFAULT '';

  CREATE INDEX IF NOT EXISTS guardian_relationships_learner_idx
    ON guardian_relationships (tenant_id, learner_person_id, status);

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

  /* ------------------------------------------------------------------------
     Folding duplicate conversations together

     startMessageThread() used to insert a new row every time someone pressed
     New, so two people who had written to each other more than once ended up
     with a thread each time and an inbox listing the same name repeatedly.
     The repository now reuses the existing thread, but databases written by
     earlier builds already hold the duplicates, and the unique index below
     cannot be created while they are there.

     Messages move to the oldest thread of each pair, which keeps the whole
     history in one place and in order — messages carry their own sent_at, so
     the merged transcript reads correctly. Re-running finds nothing to move.
     ---------------------------------------------------------------------- */
  UPDATE messages AS message
  SET thread_id = keeper.id
  FROM message_threads AS duplicate
  INNER JOIN LATERAL (
    SELECT oldest.id
    FROM message_threads AS oldest
    WHERE oldest.tenant_id = duplicate.tenant_id
      AND oldest.learner_person_id = duplicate.learner_person_id
      AND oldest.teacher_person_id = duplicate.teacher_person_id
    ORDER BY oldest.created_at, oldest.id
    LIMIT 1
  ) AS keeper ON TRUE
  WHERE message.thread_id = duplicate.id AND duplicate.id <> keeper.id;

  /* The rows the messages have just left. Emptiness is checked rather than
     assumed, so a thread this migration did not touch is never removed. */
  DELETE FROM message_threads AS duplicate
  WHERE NOT EXISTS (
    SELECT 1 FROM messages WHERE messages.thread_id = duplicate.id
  )
  AND EXISTS (
    SELECT 1
    FROM message_threads AS keeper
    WHERE keeper.tenant_id = duplicate.tenant_id
      AND keeper.learner_person_id = duplicate.learner_person_id
      AND keeper.teacher_person_id = duplicate.teacher_person_id
      AND keeper.id <> duplicate.id
  );

  /* ------------------------------------------------------------------------
     Guardians in a conversation

     Messaging was learner-to-teacher only, by an explicit decision: "a
     guardian conversation is a different thing, with a different audit
     expectation". It is — so the difference is modelled rather than used as a
     reason to leave the guardian workspace without an inbox at all.

     A guardian thread names the child it is about in learner_person_id, and
     carries the guardian here. The child is not a party to it: a
     parent-teacher conversation is not the child's to read, and
     isThreadParticipant() enforces that.
     ---------------------------------------------------------------------- */
  ALTER TABLE message_threads
    ADD COLUMN IF NOT EXISTS guardian_person_id text;

  /* Two people, one conversation — enforced here rather than only in the
     repository, so two simultaneous "New message" presses cannot both find
     nothing and both insert.

     Replaced rather than added to: the old index was on the learner and
     teacher alone, which would refuse a guardian's thread about a child whose
     own thread with that teacher already exists. COALESCE because a NULL is
     not equal to another NULL in a unique index, so learner threads would
     stop being deduplicated. */
  DROP INDEX IF EXISTS message_threads_pair_idx;

  CREATE UNIQUE INDEX IF NOT EXISTS message_threads_party_idx
    ON message_threads (
      tenant_id,
      learner_person_id,
      teacher_person_id,
      COALESCE(guardian_person_id, '')
    );

  /* A standard leaves the curriculum without leaving the database. Lessons
     link to standards by id, so deleting one a published lesson covers would
     either fail on the foreign key or quietly drop that lesson's coverage
     claim. Retiring keeps the record and takes it out of what a teacher can
     map new work to. */
  ALTER TABLE curriculum_standards
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

  /* ------------------------------------------------------------------------
     Student numbers that identify a student

     There was no column for this. Both surfaces that show a student number —
     the register and the report card — computed one from a three-way map:

       if (personId === "person-kwame") return "LH-260138";
       if (personId === "person-ama")   return "LH-260112";
       return "LH-260145";

     So in a real school every learner but two carried the identical number,
     printed on the document a school issues to a family. An identifier that
     does not identify is worse than none at all.

     Nullable, so a school that has its own numbering can put it here later
     without a second column, and unique per tenant so two learners cannot
     share one.
     ---------------------------------------------------------------------- */
  ALTER TABLE people
    ADD COLUMN IF NOT EXISTS student_number text;

  /* Backfilled in creation order, which is the order a school admitted them.
     The window covers every learner rather than only the unnumbered ones, so
     a learner who already has a number keeps their place in the sequence and
     the rest fill in around it. */
  UPDATE people AS person
  SET student_number = numbered.assigned
  FROM (
    SELECT
      id,
      'LH-' || to_char(created_at, 'YY') || lpad(
        (row_number() OVER (
          PARTITION BY tenant_id ORDER BY created_at, id
        ))::text, 4, '0') AS assigned
    FROM people
    WHERE kind = 'learner'
  ) AS numbered
  WHERE person.id = numbered.id AND person.student_number IS NULL;

  /* After the backfill, so the first run cannot fail on rows it is about to
     fix. Partial, because everyone who is not a learner has no number. */
  CREATE UNIQUE INDEX IF NOT EXISTS people_student_number_idx
    ON people (tenant_id, student_number)
    WHERE student_number IS NOT NULL;

  /* The school's own prefix for those numbers. "LH" is this product's
     initials, not the school's, and a student number is the school's to
     choose — it goes on their documents and their office already has a
     convention for it. Defaulted rather than nullable so the generator never
     has to decide what an unset prefix means. */
  ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS student_number_prefix text NOT NULL DEFAULT 'LH';

  /* ------------------------------------------------------------------------
     Files handed in as an answer

     A teacher could write a file-upload question and never publish it:
     publishing was refused with "File-response quizzes require secure school
     file storage before publication", and the learner's control read
     "Uploads will be enabled when your school activates file storage".

     That storage exists — it is what assignment attachments and lesson media
     already use. This is the missing join between an attempt's answer and a
     media asset; it mirrors submission_attachments, plus the question the
     file answers.
     ---------------------------------------------------------------------- */
  CREATE TABLE IF NOT EXISTS assessment_response_attachments (
    id text PRIMARY KEY,
    tenant_id text NOT NULL REFERENCES tenants(id),
    attempt_id text NOT NULL,
    question_id text NOT NULL,
    media_asset_id text NOT NULL,
    uploaded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE UNIQUE INDEX IF NOT EXISTS assessment_response_attachment_asset_idx
    ON assessment_response_attachments (attempt_id, media_asset_id);

  CREATE INDEX IF NOT EXISTS assessment_response_attachment_idx
    ON assessment_response_attachments (tenant_id, attempt_id, question_id);

  /* ------------------------------------------------------------------------
     Which standard a question is evidence for.

     Lessons have mapped to standards since the schema was written; questions
     never have. So the only thing the curriculum could report was coverage —
     which lessons touch a standard — and the only thing a learner could be
     told was how much of the material had gone past them.

     "You can do three of the five things this unit asks" needs the other
     half: a question, and a learner's mark on it, tied to the standard it
     tests. This is that half. Mirrors lesson_standard_links, keyed on the
     bank item rather than a version, because a standard is a property of the
     question a teacher wrote and does not change when they fix its wording.
     ---------------------------------------------------------------------- */
  CREATE TABLE IF NOT EXISTS question_standard_links (
    id text PRIMARY KEY,
    tenant_id text NOT NULL REFERENCES tenants(id),
    question_id text NOT NULL,
    standard_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE UNIQUE INDEX IF NOT EXISTS question_standard_link_idx
    ON question_standard_links (question_id, standard_id);

  CREATE INDEX IF NOT EXISTS question_standard_link_standard_idx
    ON question_standard_links (tenant_id, standard_id);

  /* ------------------------------------------------------------------------
     A subject's own face.

     subjects.description has been written on create since the table existed
     and read by nothing, so a school could describe a subject and no learner
     ever saw it. The cover is new: the learner's subject card falls back to
     generated artwork, which was the only thing it could ever show because
     there was nowhere to put a photograph.
     ---------------------------------------------------------------------- */
  ALTER TABLE subjects
    ADD COLUMN IF NOT EXISTS cover_media_asset_id text;

  /* ------------------------------------------------------------------------
     The library.

     A catalogue of things a school hands out — past papers, textbooks,
     worksheets, reading. Distinct from lesson resources, which belong to one
     lesson in one subject and are reached by working through it: a learner
     looking for last year's paper the week before an examination is browsing,
     not following a lesson.

     media_assets carries the file, so the library inherits the upload
     validation, the virus scan and the serving route rather than growing a
     second copy of each. Its offering_id becomes nullable in the same breath
     — a school-wide reading list belongs to no single class's subject, and
     forcing one would have meant filing the dictionary under whichever
     offering happened to be first in the list.
     ---------------------------------------------------------------------- */
  ALTER TABLE media_assets
    ALTER COLUMN offering_id DROP NOT NULL;

  CREATE TABLE IF NOT EXISTS library_resources (
    id text PRIMARY KEY,
    tenant_id text NOT NULL REFERENCES tenants(id),
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    category text NOT NULL,
    /* Both optional, and both are filters rather than permissions: a resource
       with no subject is a school-wide one, and a resource with no year group
       is for anybody. */
    subject_id text,
    year_group text,
    media_asset_id text NOT NULL,
    added_by_person_id text NOT NULL,
    status text NOT NULL DEFAULT 'published',
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS library_resource_browse_idx
    ON library_resources (tenant_id, status, category);

  CREATE INDEX IF NOT EXISTS library_resource_subject_idx
    ON library_resources (tenant_id, subject_id);
`;
