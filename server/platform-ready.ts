import { Client } from "pg";
import { getMigrations } from "better-auth/db/migration";
import { seedAcademicStructure } from "../db/academic-seed";
import { seedSchoolPeople } from "../db/people-seed";
import { migrateLearnersHubSchema, getPostgresPool } from "../db/postgres";
import { auth } from "./auth-config";
import { demoSchoolEnabled } from "./demo-school";
import { seedDemoAccounts } from "./demo-seed";
import {
  initialSchoolName,
  SCHOOL_TENANT_ID,
  schoolSlug,
} from "./school-tenant";

/* ==========================================================================
   Preparing the platform exactly once

   This was `let readiness` at module scope, which is once per *module
   instance* rather than once per process. Next gives route handlers, server
   components and the client-reference graph their own instances, so several
   copies of this ran concurrently — each opening the whole schema migration
   against the same database.

   On an existing deployment that is invisible: every CREATE TABLE IF NOT
   EXISTS is a no-op and the overlap costs milliseconds. On the first boot of a
   fresh one it is not, because the DDL is doing real work — the copies take
   locks on the same tables in the same order, and the deployment blocks on
   its own first request. That is the one boot a school cannot retry past.

   Two changes fix it. The promise is memoised on globalThis, so instances of
   this module share one. And the migration itself is wrapped in a PostgreSQL
   advisory lock, so two *processes* — a second container, a restarted worker —
   serialise instead of racing.
   ========================================================================== */

const globalReadiness = globalThis as typeof globalThis & {
  learnersHubReadiness?: Promise<void>;
};

/* An arbitrary constant, and it only has to be the same everywhere. */
const MIGRATION_LOCK_KEY = 0x1ea45e25;

export function ensurePlatformReady(): Promise<void> {
  globalReadiness.learnersHubReadiness ??= preparePlatform().catch((error) => {
    globalReadiness.learnersHubReadiness = undefined;
    throw error;
  });
  return globalReadiness.learnersHubReadiness;
}

async function preparePlatform(): Promise<void> {
  await withMigrationLock(async () => {
    const migrations = await getMigrations(auth.options);
    await migrations.runMigrations();
    await migrateLearnersHubSchema();
  });
  /* Before the administrator, because their membership names the tenant across
     a foreign key, and before the demo, because the demo joins the same one. */
  await ensureSchoolTenant();
  await bootstrapAdministrator();

  if (!demoSchoolEnabled()) return;

  /* Before the demo accounts, not after and not lazily: seedDemoAccounts()
     attaches identities to these person rows by id, across a foreign key. */
  await seedSchoolPeople(getPostgresPool());
  await seedDemoAccounts(getPostgresPool());
  /* After the people, because a class group names one of them as its class
     teacher across a foreign key. */
  await seedAcademicStructure(getPostgresPool());
}

/**
 * Runs the schema work with a lock nobody else in the cluster holds.
 *
 * On a connection of its own, opened outside the pool, and that is the whole
 * point rather than a detail. Holding a *pooled* client while waiting for the
 * lock starves the pool the migration itself draws from: several module
 * instances each take a client, each waits for the lock, and the one holding
 * it cannot get a client to run a single statement. The deployment then blocks
 * on its own first request with no error to read — which is exactly what this
 * was written to prevent.
 *
 * An advisory lock is held by the session rather than the transaction, so the
 * connection is ended in a finally. A leaked one would block every later boot.
 */
async function withMigrationLock(run: () => Promise<void>): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    await run();
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * The one school this deployment serves.
 *
 * Created here rather than by whichever seed happened to run first, so a
 * deployment with no administrator configured and the demo switched off still
 * has a tenant for its public site to read a profile from — and so the row is
 * named after the school rather than after the demo.
 *
 * DO NOTHING on conflict: the name and slug are the school's to change on
 * /admin/school, and a boot must never undo that edit.
 */
async function ensureSchoolTenant(): Promise<void> {
  const name = initialSchoolName(demoSchoolEnabled());
  await getPostgresPool().query(
    `INSERT INTO tenants (id, name, slug)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [SCHOOL_TENANT_ID, name, schoolSlug(name)],
  );
}

async function bootstrapAdministrator(): Promise<void> {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const name = process.env.INITIAL_ADMIN_NAME?.trim() || "School Administrator";

  if (!email || !password) return;

  const database = getPostgresPool();
  const existingUser = await database.query<{ id: string }>(
    `SELECT id FROM "user" WHERE lower(email) = $1 LIMIT 1`,
    [email],
  );

  if (existingUser.rowCount === 0) {
    await auth.api.signUpEmail({
      body: { email, name, password },
    });
  }

  const userResult = await database.query<{ id: string }>(
    `SELECT id FROM "user" WHERE lower(email) = $1 LIMIT 1`,
    [email],
  );
  const userId = userResult.rows[0]?.id;
  if (!userId) {
    throw new Error("The initial administrator account could not be created.");
  }

  let personId = await stableId("person", email);
  const identityId = await stableId("identity", userId);
  const membershipId = await stableId("membership", email);
  const auditId = await stableId("audit", email);
  const [firstName, ...remainingNames] = name.split(/\s+/);
  const lastName = remainingNames.join(" ") || "Administrator";

  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const existingPerson = await client.query<{ id: string }>(
      `SELECT id FROM people WHERE tenant_id = $1 AND lower(email) = $2 LIMIT 1`,
      [SCHOOL_TENANT_ID, email],
    );
    if (existingPerson.rowCount === 0) {
      await client.query(
        `INSERT INTO people
          (id, tenant_id, kind, first_name, last_name, email, status)
         VALUES ($1, $2, 'staff', $3, $4, $5, 'active')
         ON CONFLICT (id) DO NOTHING`,
        [personId, SCHOOL_TENANT_ID, firstName, lastName, email],
      );
    } else {
      personId = existingPerson.rows[0].id;
    }
    await client.query(
      `INSERT INTO identity_accounts
        (id, person_id, provider, provider_subject, email)
       VALUES ($1, $2, 'better-auth', $3, $4)
       ON CONFLICT (provider, provider_subject) DO NOTHING`,
      [identityId, personId, userId, email],
    );
    /* Looked up rather than upserted. ON CONFLICT has to name a constraint
       that exists exactly, and this table's is
       (tenant_id, person_id, role, scope_type, scope_id) — five columns, the
       last of them nullable, so PostgreSQL would not treat two tenant-scoped
       rows as conflicting anyway. Naming three of those columns raised "there
       is no unique or exclusion constraint matching the ON CONFLICT
       specification" out of bootstrapAdministrator(), which every request
       waits on through ensurePlatformReady(), so the whole authenticated app
       returned 500. Selecting first depends on no constraint at all, and
       matches how the person row above is handled. */
    const existingMembership = await client.query<{ id: string }>(
      `SELECT id
       FROM tenant_memberships
       WHERE tenant_id = $1 AND person_id = $2 AND role = 'school-admin'
       LIMIT 1`,
      [SCHOOL_TENANT_ID, personId],
    );
    if (existingMembership.rowCount === 0) {
      await client.query(
        `INSERT INTO tenant_memberships
          (id, tenant_id, person_id, role, status, scope_type, accepted_at)
         VALUES ($1, $2, $3, 'school-admin', 'active', 'tenant', CURRENT_TIMESTAMP)`,
        [membershipId, SCHOOL_TENANT_ID, personId],
      );
    }
    await client.query(
      `INSERT INTO tenant_bootstrap (tenant_id, claimed_by_identity_id)
       VALUES ($1, $2)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [SCHOOL_TENANT_ID, identityId],
    );
    await client.query(
      `INSERT INTO audit_events
        (id, tenant_id, actor_person_id, action, entity_type, entity_id, metadata)
       VALUES (
         $1, $2, $3, 'tenant.admin_bootstrapped', 'person', $3,
         $4::jsonb
       )
       ON CONFLICT (id) DO NOTHING`,
      [
        auditId,
        SCHOOL_TENANT_ID,
        personId,
        JSON.stringify({ provider: "better-auth" }),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function stableId(prefix: string, value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${prefix}:${value}`),
  );
  const suffix = Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}-${suffix}`;
}
