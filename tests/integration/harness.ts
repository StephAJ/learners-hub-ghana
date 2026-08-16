import type { Pool } from "pg";
import type { AccessContext, SchoolRole } from "../../domain/identity/types";

/* ==========================================================================
   Driving the repositories against a real PostgreSQL

   Every one of the 306 tests this project had was a pure-domain test or a
   check on generated SQL text. That left roughly twelve thousand lines of
   repository code — where every authorisation check and every tenant scope
   actually executes — with no test at all, and the go-live scenarios the
   product scope lists are all integration-shaped: "tenant A data never appears
   in tenant B", "a guardian cannot reach an unlinked learner".

   tests/postgres-port.test.ts explained the absence as "there is no PostgreSQL
   in the development environment". There is: the learners-hub-pg container on
   5432. These tests use a database of their own on it, so a failing run can
   never damage the development school.

   Nothing here signs anybody in. An AccessContext is the whole of what a
   repository is told about the caller, so building one directly tests exactly
   what the repository trusts — and lets a test hold two schools at once, which
   is the only way to check that neither can see the other.
   ========================================================================== */

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://learners_hub:learners_hub@127.0.0.1:5432/learners_hub_test";

/**
 * Points the process at the test database before anything opens a pool.
 *
 * db/postgres.ts reads DATABASE_URL the first time getPostgresPool() is
 * called and caches the pool on globalThis, so this has to run before the
 * first repository import rather than inside a test.
 */
export function pointAtTestDatabase(): void {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.BETTER_AUTH_SECRET ??= "integration-tests-secret-value-32-chars";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
  /* Anything that stores an uploaded file needs somewhere to put it, and the
     store refuses to guess. Under outputs/, which is gitignored, so a test run
     leaves nothing behind in the tree. */
  process.env.MEDIA_STORAGE_DIR ??= "./outputs/test-media";
  /* The demo school would otherwise seed itself into every test's fixtures and
     make "which rows exist" unanswerable. */
  delete process.env.DEMO_SCHOOL;
  delete process.env.DEMO_ACCOUNTS;
  delete process.env.INITIAL_ADMIN_EMAIL;
  delete process.env.INITIAL_ADMIN_PASSWORD;
}

/**
 * Empties every application table, keeping the schema.
 *
 * TRUNCATE ... CASCADE rather than DROP SCHEMA: the migrations are slow enough
 * that running them per file is felt, and the tables are the only state.
 */
export async function resetTestDatabase(database: Pool): Promise<void> {
  const tables = await database.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  if (tables.rowCount === 0) return;
  const names = tables.rows
    .map((row) => `"${row.tablename}"`)
    .join(", ");
  await database.query(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

export type TestSchool = {
  /** A class group, with the learners placed in it. */
  addClass(input: { id: string; name: string }): Promise<void>;
  addLearner(input: {
    classGroupId?: string;
    id: string;
    name: string;
  }): Promise<void>;
  addStaff(input: {
    id: string;
    name: string;
    role: SchoolRole;
    scopeId?: string;
  }): Promise<void>;
  /** Links a guardian to a learner, the way enrolApplicant() does. */
  linkGuardian(input: {
    guardianId: string;
    id: string;
    learnerId: string;
  }): Promise<void>;
  addGuardian(input: { id: string; name: string }): Promise<void>;
  /** A subject taught to a class, optionally with a teacher assigned. */
  addOffering(input: {
    classGroupId: string;
    className: string;
    id: string;
    subjectCode: string;
    subjectName: string;
    teacherPersonId?: string;
  }): Promise<void>;
  /** A draft register for a class, with one row per learner. */
  addRegister(input: {
    classGroupId: string;
    date: string;
    marks: Array<{ code: string; learnerId: string }>;
    sessionId: string;
    takenByPersonId: string;
  }): Promise<void>;
  tenantId: string;
};

/** Creates a school with a tenant row, ready to be populated. */
export async function makeSchool(
  database: Pool,
  tenantId: string,
  name: string,
): Promise<TestSchool> {
  await database.query(
    `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [tenantId, name, tenantId],
  );

  /* A class group carries a year across a foreign key, so every school needs
     one before it can have a class. One current year is enough for what these
     tests ask; a test about rollover would make its own. */
  const yearId = `${tenantId}-year`;
  await database.query(
    `INSERT INTO academic_years
      (id, tenant_id, name, starts_on, ends_on, status)
     VALUES ($1, $2, '2026 / 2027', '2026-09-08', '2027-07-24', 'current')
     ON CONFLICT (id) DO NOTHING`,
    [yearId, tenantId],
  );

  async function addPerson(
    id: string,
    kind: "staff" | "learner" | "guardian",
    fullName: string,
  ) {
    const [first, ...rest] = fullName.split(" ");
    await database.query(
      `INSERT INTO people (id, tenant_id, kind, first_name, last_name, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       ON CONFLICT (id) DO NOTHING`,
      [id, tenantId, kind, first, rest.join(" ") || first],
    );
  }

  /* Class id to class name, for the membership scope above. */
  const classNames = new Map<string, string>();

  async function addMembership(
    personId: string,
    role: SchoolRole,
    scopeType: "tenant" | "class",
    scopeId: string | null,
  ) {
    await database.query(
      `INSERT INTO tenant_memberships
        (id, tenant_id, person_id, role, status, scope_type, scope_id,
         accepted_at)
       VALUES ($1, $2, $3, $4, 'active', $5, $6, CURRENT_TIMESTAMP)`,
      [crypto.randomUUID(), tenantId, personId, role, scopeType, scopeId],
    );
  }

  return {
    async addClass({ id, name: className }) {
      classNames.set(id, className);
      await database.query(
        `INSERT INTO class_groups
          (id, tenant_id, academic_year_id, name, level, room, status)
         VALUES ($1, $2, $3, $4, 'JHS', 'Room 1', 'active')
         ON CONFLICT (id) DO NOTHING`,
        [id, tenantId, yearId, className],
      );
    },
    async addGuardian({ id, name: personName }) {
      await addPerson(id, "guardian", personName);
      await addMembership(id, "guardian", "tenant", null);
    },
    async addLearner({ classGroupId, id, name: personName }) {
      await addPerson(id, "learner", personName);
      /* A class-scoped membership stores the class *name*, not its id. That is
         what production writes, and what requireOfferingContentAccess joins
         against subject_offerings.class_name — so a learner given the id here
         could not reach their own subject's content, which is a shape no real
         learner is ever in. Falls back to the id for a class the harness was
         never told the name of. */
      await addMembership(
        id,
        "learner",
        classGroupId ? "class" : "tenant",
        classGroupId ? (classNames.get(classGroupId) ?? classGroupId) : null,
      );
    },
    async addStaff({ id, name: personName, role, scopeId }) {
      await addPerson(id, "staff", personName);
      await addMembership(
        id,
        role,
        scopeId ? "class" : "tenant",
        scopeId ?? null,
      );
    },
    async addOffering({
      classGroupId,
      className,
      id,
      subjectCode,
      subjectName,
      teacherPersonId,
    }) {
      const subjectId = `${tenantId}-subject-${subjectCode.toLowerCase()}`;
      await database.query(
        `INSERT INTO subjects (id, tenant_id, code, name)
         VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
        [subjectId, tenantId, subjectCode, subjectName],
      );
      await database.query(
        `INSERT INTO subject_offerings
          (id, tenant_id, subject_id, class_group_id, class_name,
           academic_year_id, requirement, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'compulsory', 'active')
         ON CONFLICT (id) DO NOTHING`,
        [id, tenantId, subjectId, classGroupId, className, yearId],
      );
      if (teacherPersonId) {
        await database.query(
          `INSERT INTO teacher_assignments
            (id, tenant_id, offering_id, teacher_person_id, status)
           VALUES ($1, $2, $3, $4, 'active')
           ON CONFLICT (id) DO NOTHING`,
          [crypto.randomUUID(), tenantId, id, teacherPersonId],
        );
      }
    },
    async addRegister({
      classGroupId,
      date,
      marks,
      sessionId,
      takenByPersonId,
    }) {
      await database.query(
        `INSERT INTO attendance_sessions
          (id, tenant_id, class_group_id, session_date, mode, status,
           taken_by_person_id)
         VALUES ($1, $2, $3, $4, 'daily', 'draft', $5)
         ON CONFLICT (id) DO NOTHING`,
        [sessionId, tenantId, classGroupId, date, takenByPersonId],
      );
      for (const mark of marks) {
        await database.query(
          `INSERT INTO attendance_records
            (id, tenant_id, session_id, learner_person_id, code,
             recorded_by_person_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (session_id, learner_person_id) DO NOTHING`,
          [
            crypto.randomUUID(),
            tenantId,
            sessionId,
            mark.learnerId,
            mark.code,
            takenByPersonId,
          ],
        );
      }
    },
    async linkGuardian({ guardianId, id, learnerId }) {
      await database.query(
        `INSERT INTO guardian_relationships
          (id, tenant_id, guardian_person_id, learner_person_id, relationship,
           status)
         VALUES ($1, $2, $3, $4, 'Parent', 'active')
         ON CONFLICT (id) DO NOTHING`,
        [id, tenantId, guardianId, learnerId],
      );
    },
    tenantId,
  };
}

/**
 * An AccessContext with everything a repository reads already resolved.
 *
 * Deliberately explicit rather than derived: a test that wants to prove a
 * guardian cannot reach an unlinked learner has to be able to hand over a
 * context that claims otherwise.
 */
export function accessFor(
  tenantId: string,
  role: SchoolRole,
  actorPersonId: string,
  scopes: Partial<
    Pick<
      AccessContext,
      "classGroupIds" | "classLearnerIds" | "linkedLearnerIds" | "subjectOfferingIds"
    >
  > = {},
): AccessContext {
  return {
    actorPersonId,
    classGroupIds: scopes.classGroupIds ?? [],
    classLearnerIds: scopes.classLearnerIds ?? [],
    linkedLearnerIds: scopes.linkedLearnerIds ?? [],
    membershipStatus: "active",
    role,
    subjectOfferingIds: scopes.subjectOfferingIds ?? [],
    tenantId,
  };
}
