import type { Pool } from "pg";
import { demoPeople } from "../domain/demo/greenfield";
import { SCHOOL_TENANT_ID } from "../server/school-tenant";

/** The tenant the demo cast joins: this deployment's own. */
const GREENFIELD_TENANT_ID = SCHOOL_TENANT_ID;

/* ==========================================================================
   The school's people

   Lifted out of people-repository.ts so that server/platform-ready.ts can run
   it during startup without importing the repository — which imports
   ensurePlatformReady() in turn, and a module cycle through the one function
   every request awaits is not a thing to leave lying around.

   Ordering is the point. seedDemoAccounts() attaches sign-in identities to
   these person rows by id, and identity_accounts.person_id is a foreign key.
   While this only ran lazily, on the first authenticated request, a fresh
   database with DEMO_ACCOUNTS=true failed every single request with
   "insert or update on table identity_accounts violates foreign key
   constraint" — the demo seed ran during startup, and the people it referred
   to were not created until something asked for them, which nothing could,
   because startup had already failed.

   Takes the pool as an argument rather than reaching for it, so the caller
   decides which database this is written to.
   ========================================================================== */

export async function seedSchoolPeople(database: Pool): Promise<void> {
  /* The tenant is ensureSchoolTenant()'s to create, and it runs first. This
     used to insert it here, named "Greenfield Academy" whoever was deploying,
     because bootstrapAdministrator() only created one when INITIAL_ADMIN_EMAIL
     was configured and every row below needs one to exist. */

  /* The cast comes from the shared demo dataset so the staff who own subjects
     there are the same staff who exist here. When these were two lists they
     disagreed: Mathematics and English had teachers in the UI who had no
     person record at all. */
  for (const person of demoPeople) {
    await database.query(
      /* photo_url is refreshed on every boot rather than left to the insert,
         so a deployment seeded before photographs existed picks them up. */
      `INSERT INTO people
        (id, tenant_id, kind, first_name, last_name, email, phone, photo_url,
         status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
       ON CONFLICT (id) DO UPDATE SET photo_url = EXCLUDED.photo_url`,
      [
        person.id,
        GREENFIELD_TENANT_ID,
        person.kind,
        person.firstName,
        person.lastName,
        person.email,
        person.phone ?? null,
        person.photoUrl ?? null,
      ],
    );
  }

  for (const person of demoPeople) {
    await database.query(
      `INSERT INTO tenant_memberships
        (id, tenant_id, person_id, role, status, scope_type, scope_id, accepted_at)
       VALUES ($1, $2, $3, $4, 'active', $5, $6, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO NOTHING`,
      [
        `membership-${person.id.replace(/^person-/, "")}`,
        GREENFIELD_TENANT_ID,
        person.id,
        person.role,
        person.scopeType,
        person.scopeId ?? null,
      ],
    );
  }

  await database.query(
    `INSERT INTO guardian_relationships
      (id, tenant_id, guardian_person_id, learner_person_id, relationship)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [
      "guardian-link-efua-kwame",
      GREENFIELD_TENANT_ID,
      "person-efua",
      "person-kwame",
      "Mother",
    ],
  );
}
