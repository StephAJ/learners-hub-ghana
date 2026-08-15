import {
  AuthorizationError,
  canPerform,
} from "../domain/identity/authorization";
import type {
  AccessContext,
  DirectoryPerson,
  SchoolRole,
} from "../domain/identity/types";
import type { ImportRowInput } from "../domain/identity/bulk-import";
import { ensurePlatformReady } from "../server/platform-ready";
import { inviteDirectoryPerson } from "./people-repository";
import { getPostgresPool } from "./postgres";

/* ==========================================================================
   Correcting the register

   The directory was invite-only. `listDirectoryPeople` and
   `inviteDirectoryPerson` were the whole write surface, which meant a person
   invited into the wrong role stayed in it for ever, a member of staff who
   left stayed active, a learner moved to another class kept the old one, and
   a typed-wrong email address could never be fixed. Setting a school up meant
   inviting learners one form at a time and getting every one of them right
   first time.

   Nothing here deletes a person. A school's records are the point of the
   product, and the integrity rules say plainly that historical enrolments,
   attempts, marks and reports are never hard-deleted through ordinary UI.
   Offboarding revokes the membership: the person keeps their record, their
   work stays attached to it, and they stop being able to sign in or appear on
   a roster.
   ========================================================================== */

export class DirectoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DirectoryError";
  }
}

export type UpdatePersonInput = {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: SchoolRole;
  scopeId?: string;
  scopeType?: "tenant" | "class" | "subject" | "learner";
};

export async function updateDirectoryPerson(
  access: AccessContext,
  personId: string,
  input: UpdatePersonInput,
): Promise<void> {
  requirePermission(access, "people:invite");
  await ensurePlatformReady();

  const firstName = requireText(input.firstName, "A first name is required.");
  const lastName = requireText(input.lastName, "A last name is required.");
  const email = input.email.trim().toLowerCase();
  if (email && !email.includes("@")) {
    throw new DirectoryError(`${input.email} does not look like an email address.`);
  }

  const person = await requirePerson(access, personId);
  const database = getPostgresPool();
  const client = await database.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE people
       SET first_name = $3, last_name = $4, email = $5, phone = $6
       WHERE id = $1 AND tenant_id = $2`,
      [
        personId,
        access.tenantId,
        firstName,
        lastName,
        email || null,
        input.phone?.trim() || null,
      ],
    );
    /* The membership carries the role and the scope, and both are what an
       administrator is usually here to correct: a teacher given the wrong
       class, a learner placed in the wrong one. */
    await client.query(
      `UPDATE tenant_memberships
       SET role = $3, scope_type = $4, scope_id = $5
       WHERE person_id = $1 AND tenant_id = $2`,
      [
        personId,
        access.tenantId,
        input.role,
        input.scopeType ?? "tenant",
        input.scopeId?.trim() || null,
      ],
    );
    await client.query(
      `INSERT INTO audit_events
        (id, tenant_id, actor_person_id, action, entity_type, entity_id,
         metadata)
       VALUES ($1, $2, $3, 'people.updated', 'person', $4, $5::jsonb)`,
      [
        crypto.randomUUID(),
        access.tenantId,
        access.actorPersonId,
        personId,
        JSON.stringify({
          from: { name: person.name, role: person.role },
          to: { name: `${firstName} ${lastName}`, role: input.role },
        }),
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

/**
 * Takes somebody off the roster without taking their record off the system.
 *
 * A revoked membership is what every access check reads — `canPerform()`
 * refuses anything at all unless the status is active — so this is the whole
 * of "they no longer work here" without touching a single mark they gave or
 * a report they signed.
 */
export async function offboardDirectoryPerson(
  access: AccessContext,
  personId: string,
  reason: string,
): Promise<void> {
  requirePermission(access, "people:invite");
  await ensurePlatformReady();

  if (personId === access.actorPersonId) {
    throw new DirectoryError(
      "You cannot remove your own access. Ask another administrator.",
    );
  }
  const person = await requirePerson(access, personId);

  const database = getPostgresPool();
  await database.query(
    `UPDATE tenant_memberships SET status = 'revoked'
     WHERE person_id = $1 AND tenant_id = $2`,
    [personId, access.tenantId],
  );
  await database.query(
    `UPDATE people SET status = 'inactive' WHERE id = $1 AND tenant_id = $2`,
    [personId, access.tenantId],
  );
  await database.query(
    `INSERT INTO audit_events
      (id, tenant_id, actor_person_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, 'people.offboarded', 'person', $4, $5::jsonb)`,
    [
      crypto.randomUUID(),
      access.tenantId,
      access.actorPersonId,
      personId,
      JSON.stringify({ name: person.name, reason: reason.trim() }),
    ],
  );
}

/** Puts a revoked membership back, for somebody who returns. */
export async function reinstateDirectoryPerson(
  access: AccessContext,
  personId: string,
): Promise<void> {
  requirePermission(access, "people:invite");
  await ensurePlatformReady();
  const person = await requirePerson(access, personId);

  const database = getPostgresPool();
  await database.query(
    `UPDATE tenant_memberships SET status = 'active', accepted_at = CURRENT_TIMESTAMP
     WHERE person_id = $1 AND tenant_id = $2`,
    [personId, access.tenantId],
  );
  await database.query(
    `UPDATE people SET status = 'active' WHERE id = $1 AND tenant_id = $2`,
    [personId, access.tenantId],
  );
  await database.query(
    `INSERT INTO audit_events
      (id, tenant_id, actor_person_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, 'people.reinstated', 'person', $4, $5::jsonb)`,
    [
      crypto.randomUUID(),
      access.tenantId,
      access.actorPersonId,
      personId,
      JSON.stringify({ name: person.name }),
    ],
  );
}

/* ==========================================================================
   Guardians and the children they answer for

   `guardian_relationships` rows were written by enrolApplicant() and by the
   demo seed, and by nothing else. So a guardian could only ever be linked to
   a child by admitting that child through admissions — there was no way to
   link a parent to a learner already on roll, no way to correct a wrong link,
   and no way to revoke one.

   The integrity rules require guardian access to be "relationship-based,
   time-aware, and revocable", and the guardian portal requires that a change
   takes effect immediately and is audited. Revoking sets the status every read
   path now filters on, so it does.
   ========================================================================== */

export type GuardianLink = {
  guardianId: string;
  guardianName: string;
  learnerId: string;
  learnerName: string;
  linkId: string;
  relationship: string;
  status: "active" | "revoked";
};

export async function listGuardianLinks(
  access: AccessContext,
): Promise<GuardianLink[]> {
  requirePermission(access, "people:read");
  await ensurePlatformReady();

  const result = await getPostgresPool().query<{
    guardian_name: string;
    guardian_person_id: string;
    id: string;
    learner_name: string;
    learner_person_id: string;
    relationship: string;
    status: GuardianLink["status"];
  }>(
    `SELECT
       link.id,
       link.guardian_person_id,
       link.learner_person_id,
       link.relationship,
       link.status,
       guardian.first_name || ' ' || guardian.last_name AS guardian_name,
       learner.first_name || ' ' || learner.last_name AS learner_name
     FROM guardian_relationships link
     INNER JOIN people guardian ON guardian.id = link.guardian_person_id
     INNER JOIN people learner ON learner.id = link.learner_person_id
     WHERE link.tenant_id = $1
     ORDER BY learner.first_name, guardian.first_name`,
    [access.tenantId],
  );

  return result.rows.map((row) => ({
    guardianId: row.guardian_person_id,
    guardianName: row.guardian_name,
    learnerId: row.learner_person_id,
    learnerName: row.learner_name,
    linkId: row.id,
    relationship: row.relationship,
    status: row.status,
  }));
}

export async function linkGuardianToLearner(
  access: AccessContext,
  input: { guardianId: string; learnerId: string; relationship: string },
): Promise<void> {
  requirePermission(access, "people:invite");
  await ensurePlatformReady();

  const guardian = await requirePerson(access, input.guardianId);
  const learner = await requirePerson(access, input.learnerId);
  if (guardian.kind !== "guardian") {
    throw new DirectoryError(`${guardian.name} is not a guardian account.`);
  }
  if (learner.kind !== "learner") {
    throw new DirectoryError(`${learner.name} is not a learner.`);
  }

  const database = getPostgresPool();
  /* Re-linking somebody whose link was revoked reactivates it rather than
     creating a second row: the unique index would refuse the insert, and two
     rows for one relationship is a question about which one is authoritative
     that nobody should ever have to answer. */
  await database.query(
    `INSERT INTO guardian_relationships
      (id, tenant_id, guardian_person_id, learner_person_id, relationship,
       status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     ON CONFLICT (tenant_id, guardian_person_id, learner_person_id)
     DO UPDATE SET relationship = EXCLUDED.relationship,
                   status = 'active',
                   revoked_at = NULL,
                   revoked_by_person_id = NULL,
                   revoked_reason = ''`,
    [
      crypto.randomUUID(),
      access.tenantId,
      input.guardianId,
      input.learnerId,
      input.relationship.trim() || "Guardian",
    ],
  );
  await database.query(
    `INSERT INTO audit_events
      (id, tenant_id, actor_person_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, 'guardian.linked', 'person', $4, $5::jsonb)`,
    [
      crypto.randomUUID(),
      access.tenantId,
      access.actorPersonId,
      input.learnerId,
      JSON.stringify({
        guardian: guardian.name,
        learner: learner.name,
        relationship: input.relationship,
      }),
    ],
  );
}

export async function revokeGuardianLink(
  access: AccessContext,
  linkId: string,
  reason: string,
): Promise<void> {
  requirePermission(access, "people:invite");
  await ensurePlatformReady();

  const trimmed = reason.trim();
  if (!trimmed) {
    throw new DirectoryError(
      "Say why this link is being removed. It is recorded against the child's file.",
    );
  }

  const database = getPostgresPool();
  const link = await database.query<{
    guardian_person_id: string;
    learner_person_id: string;
  }>(
    `SELECT guardian_person_id, learner_person_id
     FROM guardian_relationships
     WHERE id = $1 AND tenant_id = $2
     LIMIT 1`,
    [linkId, access.tenantId],
  );
  if (link.rowCount === 0) {
    throw new AuthorizationError("That link belongs to another school.");
  }

  await database.query(
    `UPDATE guardian_relationships
     SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP,
         revoked_by_person_id = $3, revoked_reason = $4
     WHERE id = $1 AND tenant_id = $2`,
    [linkId, access.tenantId, access.actorPersonId, trimmed],
  );
  await database.query(
    `INSERT INTO audit_events
      (id, tenant_id, actor_person_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, 'guardian.revoked', 'person', $4, $5::jsonb)`,
    [
      crypto.randomUUID(),
      access.tenantId,
      access.actorPersonId,
      link.rows[0].learner_person_id,
      JSON.stringify({
        guardianId: link.rows[0].guardian_person_id,
        reason: trimmed,
      }),
    ],
  );
}

/* ==========================================================================
   Importing a roll

   The parse is domain/identity/bulk-import.ts, which decides accepted or
   rejected for every line before anything is written. This is the other half:
   it writes the accepted rows and reports what happened to each one.

   Not a transaction over the whole import, deliberately. A hundred and twenty
   learners where one clashes with somebody already on the roll should leave a
   hundred and nineteen imported and one named in the reconciliation, rather
   than rolling back an afternoon's work over one duplicate. The scope calls
   this a "complete success/error reconciliation", and that is what comes back.
   ========================================================================== */

export type ImportOutcome = {
  failed: Array<{ email: string; name: string; problem: string }>;
  imported: number;
};

export async function importDirectoryPeople(
  access: AccessContext,
  rows: ImportRowInput[],
): Promise<ImportOutcome> {
  requirePermission(access, "people:invite");
  await ensurePlatformReady();

  const failed: ImportOutcome["failed"] = [];
  let imported = 0;

  for (const row of rows) {
    try {
      await inviteDirectoryPerson(access, {
        email: row.email,
        firstName: row.firstName,
        kind: row.kind,
        lastName: row.lastName,
        phone: row.phone || undefined,
        role: row.role,
        scopeId: row.className || undefined,
        scopeType: row.className ? "class" : "tenant",
      });
      imported += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "This row could not be saved.";
      failed.push({
        email: row.email,
        name: `${row.firstName} ${row.lastName}`,
        problem: /duplicate key|unique constraint/i.test(message)
          ? "Somebody with this email address is already on the roll."
          : message,
      });
    }
  }

  await getPostgresPool().query(
    `INSERT INTO audit_events
      (id, tenant_id, actor_person_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, 'people.imported', 'tenant', $2, $4::jsonb)`,
    [
      crypto.randomUUID(),
      access.tenantId,
      access.actorPersonId,
      JSON.stringify({ failed: failed.length, imported }),
    ],
  );

  return { failed, imported };
}

async function requirePerson(
  access: AccessContext,
  personId: string,
): Promise<{ kind: DirectoryPerson["kind"]; name: string; role: SchoolRole }> {
  const result = await getPostgresPool().query<{
    kind: DirectoryPerson["kind"];
    name: string;
    role: SchoolRole;
  }>(
    `SELECT
       p.kind,
       p.first_name || ' ' || p.last_name AS name,
       m.role
     FROM people p
     LEFT JOIN tenant_memberships m
       ON m.person_id = p.id AND m.tenant_id = p.tenant_id
     WHERE p.id = $1 AND p.tenant_id = $2
     LIMIT 1`,
    [personId, access.tenantId],
  );
  if (result.rowCount === 0) {
    throw new AuthorizationError("That person belongs to another school.");
  }
  return result.rows[0];
}

function requireText(value: string, message: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new DirectoryError(message);
  return trimmed;
}

function requirePermission(
  access: AccessContext,
  permission: Parameters<typeof canPerform>[1],
) {
  if (!canPerform(access, permission)) {
    throw new AuthorizationError("Your school role does not allow this action.");
  }
}
