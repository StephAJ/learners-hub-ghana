import { getMigrations } from "better-auth/db/migration";
import { migrateLearnersHubSchema, getPostgresPool } from "../db/postgres";
import { auth } from "./auth-config";
import { seedDemoAccounts } from "./demo-seed";

const GREENFIELD_TENANT_ID = "tenant-greenfield";

let readiness: Promise<void> | undefined;

export function ensurePlatformReady(): Promise<void> {
  readiness ??= preparePlatform().catch((error) => {
    readiness = undefined;
    throw error;
  });
  return readiness;
}

async function preparePlatform(): Promise<void> {
  const migrations = await getMigrations(auth.options);
  await migrations.runMigrations();
  await migrateLearnersHubSchema();
  await bootstrapAdministrator();
  await seedDemoAccounts(getPostgresPool());
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
    await client.query(
      `INSERT INTO tenants (id, name, slug)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [GREENFIELD_TENANT_ID, "Greenfield Academy", "greenfield-academy"],
    );
    const existingPerson = await client.query<{ id: string }>(
      `SELECT id FROM people WHERE tenant_id = $1 AND lower(email) = $2 LIMIT 1`,
      [GREENFIELD_TENANT_ID, email],
    );
    if (existingPerson.rowCount === 0) {
      await client.query(
        `INSERT INTO people
          (id, tenant_id, kind, first_name, last_name, email, status)
         VALUES ($1, $2, 'staff', $3, $4, $5, 'active')
         ON CONFLICT (id) DO NOTHING`,
        [personId, GREENFIELD_TENANT_ID, firstName, lastName, email],
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
    await client.query(
      `INSERT INTO tenant_memberships
        (id, tenant_id, person_id, role, status, scope_type, accepted_at)
       VALUES ($1, $2, $3, 'school-admin', 'active', 'tenant', CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO NOTHING`,
      [membershipId, GREENFIELD_TENANT_ID, personId],
    );
    await client.query(
      `INSERT INTO tenant_bootstrap (tenant_id, claimed_by_identity_id)
       VALUES ($1, $2)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [GREENFIELD_TENANT_ID, identityId],
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
        GREENFIELD_TENANT_ID,
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
