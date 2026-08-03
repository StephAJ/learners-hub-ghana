import type { AuthenticatedUser } from "../app/auth";
import { AuthorizationError, canPerform } from "../domain/identity/authorization";
import { demoPeople } from "../domain/demo/greenfield";
import type {
  AccessContext,
  DirectoryPerson,
  SchoolBrand,
  SchoolRole,
} from "../domain/identity/types";
import { ensurePlatformReady } from "../server/platform-ready";
import { getPostgresPool } from "./postgres";

const GREENFIELD_TENANT_ID = "tenant-greenfield";

export type AuthenticatedSchoolUser = {
  access: AccessContext;
  availableRoles: SchoolRole[];
  /* The school's colour, applied to whichever workspace this person opens.
     Undefined until schools carry their own colours in the tenant record; the
     shell falls back to the Learners Hub default. */
  brand?: SchoolBrand;
  email: string;
  name: string;
  /** Passport photograph, for the signed-in person's own sidebar chip. */
  photoUrl: string | null;
  primaryRole: SchoolRole;
  schoolName: string;
};

export type InvitePersonInput = {
  email: string;
  firstName: string;
  kind: DirectoryPerson["kind"];
  lastName: string;
  phone?: string;
  role: SchoolRole;
  scopeId?: string;
  scopeType?: "tenant" | "class" | "subject" | "learner";
};

type IdentityRow = {
  email: string;
  first_name: string;
  last_name: string;
  membership_status: AccessContext["membershipStatus"];
  person_id: string;
  photo_url: string | null;
  role: SchoolRole;
  school_name: string;
  tenant_id: string;
};

export async function resolveAuthenticatedSchoolUser(
  user: AuthenticatedUser,
  preferredRoles: SchoolRole[] = [],
): Promise<AuthenticatedSchoolUser> {
  await ensurePeopleSeed();
  const identities = await findIdentities(user.id);

  if (identities.length === 0) {
    throw new AuthorizationError(
      "Your signed-in identity is not a member of this school.",
    );
  }

  const primaryIdentity = identities[0];
  const identity =
    identities.find(
      (membership) =>
        membership.membership_status === "active" &&
        preferredRoles.includes(membership.role),
    ) ?? primaryIdentity;

  return {
    access: {
      actorPersonId: identity.person_id,
      membershipStatus: identity.membership_status,
      role: identity.role,
      tenantId: identity.tenant_id,
    },
    availableRoles: Array.from(
      new Set(
        identities
          .filter(
            (membership) =>
              membership.membership_status === "active" &&
              membership.tenant_id === identity.tenant_id,
          )
          .map((membership) => membership.role),
      ),
    ),
    email: identity.email,
    name:
      user.fullName ||
      `${identity.first_name} ${identity.last_name}`.trim() ||
      identity.email,
    photoUrl: identity.photo_url,
    primaryRole: primaryIdentity.role,
    schoolName: identity.school_name,
  };
}

export async function listDirectoryPeople(
  access: AccessContext,
): Promise<DirectoryPerson[]> {
  requirePermission(access, "people:read");
  await ensurePeopleSeed();

  const result = await getPostgresPool().query<{
    email: string | null;
    id: string;
    kind: DirectoryPerson["kind"];
    name: string;
    phone: string | null;
    photo_url: string | null;
    role: SchoolRole;
    scope_id: string | null;
    scope_type: string;
    status: DirectoryPerson["status"];
  }>(
    `SELECT
       p.id,
       p.kind,
       p.first_name || ' ' || p.last_name AS name,
       p.email,
       p.phone,
       p.photo_url,
       m.role,
       m.status,
       m.scope_type,
       m.scope_id
     FROM people p
     INNER JOIN tenant_memberships m
       ON m.person_id = p.id AND m.tenant_id = p.tenant_id
     WHERE p.tenant_id = $1
     ORDER BY
       CASE p.kind WHEN 'staff' THEN 1 WHEN 'learner' THEN 2 ELSE 3 END,
       p.first_name,
       p.last_name`,
    [access.tenantId],
  );

  return result.rows.map((person) => ({
    email: person.email,
    id: person.id,
    kind: person.kind,
    name: person.name,
    phone: person.phone,
    photoUrl: person.photo_url,
    role: person.role,
    scopeLabel: formatScope(person.scope_type, person.scope_id),
    status: person.status,
  }));
}

export async function inviteDirectoryPerson(
  access: AccessContext,
  input: InvitePersonInput,
): Promise<DirectoryPerson> {
  requirePermission(access, "people:invite");
  validateInvitation(input);
  await ensurePeopleSeed();

  const personId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  const scopeType = input.scopeType ?? "tenant";
  const scopeId = input.scopeId?.trim() || null;
  const email = input.email.trim().toLowerCase();
  const client = await getPostgresPool().connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO people
        (id, tenant_id, kind, first_name, last_name, email, phone, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'invited')`,
      [
        personId,
        access.tenantId,
        input.kind,
        input.firstName.trim(),
        input.lastName.trim(),
        email,
        input.phone?.trim() || null,
      ],
    );
    await client.query(
      `INSERT INTO tenant_memberships
        (id, tenant_id, person_id, role, status, scope_type, scope_id)
       VALUES ($1, $2, $3, $4, 'invited', $5, $6)`,
      [
        membershipId,
        access.tenantId,
        personId,
        input.role,
        scopeType,
        scopeId,
      ],
    );
    await client.query(
      `INSERT INTO audit_events
        (id, tenant_id, actor_person_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, 'people.invited', 'person', $4, $5::jsonb)`,
      [
        crypto.randomUUID(),
        access.tenantId,
        access.actorPersonId,
        personId,
        JSON.stringify({ email, role: input.role, scopeId, scopeType }),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return {
    email,
    id: personId,
    kind: input.kind,
    name: `${input.firstName.trim()} ${input.lastName.trim()}`,
    phone: input.phone?.trim() || null,
    /* An invited person has not been photographed yet, so every surface shows
       their initials until the school uploads one. */
    photoUrl: null,
    role: input.role,
    scopeLabel: formatScope(scopeType, scopeId),
    status: "invited",
  };
}

let peopleSeed: Promise<void> | undefined;

/* Exported so the learning foundations can depend on it: their seed rows
   carry foreign keys to tenants and people, which PostgreSQL enforces. */
export function ensurePeopleSeed(): Promise<void> {
  peopleSeed ??= seedPeople().catch((error) => {
    peopleSeed = undefined;
    throw error;
  });
  return peopleSeed;
}

async function seedPeople(): Promise<void> {
  await ensurePlatformReady();
  const database = getPostgresPool();

  /* bootstrapAdministrator() creates the school, but only when
     INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD are configured. Every row
     below references the tenant, so a deployment without those variables would
     otherwise fail its very first insert. */
  await database.query(
    `INSERT INTO tenants (id, name, slug)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [GREENFIELD_TENANT_ID, "Greenfield Academy", "greenfield-academy"],
  );

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

async function findIdentities(userId: string): Promise<IdentityRow[]> {
  const result = await getPostgresPool().query<IdentityRow>(
    `SELECT
       i.email,
       p.first_name,
       p.last_name,
       p.id AS person_id,
       p.photo_url,
       m.tenant_id,
       m.role,
       m.status AS membership_status,
       t.name AS school_name
     FROM identity_accounts i
     INNER JOIN people p ON p.id = i.person_id
     INNER JOIN tenant_memberships m ON m.person_id = p.id
     INNER JOIN tenants t ON t.id = m.tenant_id
     WHERE i.provider = 'better-auth' AND i.provider_subject = $1
     ORDER BY
       CASE m.status WHEN 'active' THEN 1 WHEN 'invited' THEN 2 ELSE 3 END,
       m.accepted_at ASC,
       m.invited_at ASC`,
    [userId],
  );
  return result.rows;
}

function requirePermission(
  access: AccessContext,
  permission: Parameters<typeof canPerform>[1],
) {
  if (!canPerform(access, permission)) {
    throw new AuthorizationError(
      "Your school role does not allow this action.",
    );
  }
}

function validateInvitation(input: InvitePersonInput) {
  if (!input.firstName.trim() || !input.lastName.trim()) {
    throw new Error("First and last name are required.");
  }
  if (!input.email.includes("@")) {
    throw new Error("A valid email address is required.");
  }
}

function formatScope(scopeType: string, scopeId: string | null) {
  if (scopeType === "tenant") return "Whole school";
  return scopeId ? `${scopeTypeLabel(scopeType)} · ${scopeId}` : scopeTypeLabel(scopeType);
}

function scopeTypeLabel(scopeType: string) {
  return scopeType.charAt(0).toUpperCase() + scopeType.slice(1);
}
