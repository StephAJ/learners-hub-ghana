import { canPerform, AuthorizationError } from "../domain/identity/authorization";
import type {
  AccessContext,
  DirectoryPerson,
  SchoolRole,
} from "../domain/identity/types";
import type { ChatGPTUser } from "../app/chatgpt-auth";
import { getD1Database } from "./index";

const GREENFIELD_TENANT_ID = "tenant-greenfield";

export type AuthenticatedSchoolUser = {
  access: AccessContext;
  availableRoles: SchoolRole[];
  email: string;
  name: string;
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
  role: SchoolRole;
  school_name: string;
  tenant_id: string;
};

export async function resolveAuthenticatedSchoolUser(
  user: ChatGPTUser,
  preferredRoles: SchoolRole[] = [],
): Promise<AuthenticatedSchoolUser> {
  await ensurePeopleSeed();
  const email = user.email.trim().toLowerCase();
  let identities = await findIdentities(email);

  if (identities.length === 0) {
    await bootstrapFirstAdministrator(user, email);
    identities = await findIdentities(email);
  }

  if (identities.length === 0) {
    throw new AuthorizationError(
      "Your signed-in identity is not a member of this school.",
    );
  }

  const primaryIdentity = identities[0];
  const identity =
    identities.find((membership) =>
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
      user.fullName ??
      `${identity.first_name} ${identity.last_name}`.trim() ??
      identity.email,
    primaryRole: primaryIdentity.role,
    schoolName: identity.school_name,
  };
}

export async function listDirectoryPeople(
  access: AccessContext,
): Promise<DirectoryPerson[]> {
  requirePermission(access, "people:read");
  const database = await getD1Database();
  const result = await database
    .prepare(
      `SELECT
        p.id,
        p.kind,
        p.first_name || ' ' || p.last_name AS name,
        p.email,
        p.phone,
        m.role,
        m.status,
        m.scope_type,
        m.scope_id
      FROM people p
      INNER JOIN tenant_memberships m
        ON m.person_id = p.id AND m.tenant_id = p.tenant_id
      WHERE p.tenant_id = ?
      ORDER BY
        CASE p.kind WHEN 'staff' THEN 1 WHEN 'learner' THEN 2 ELSE 3 END,
        p.first_name,
        p.last_name`,
    )
    .bind(access.tenantId)
    .all<{
      email: string | null;
      id: string;
      kind: DirectoryPerson["kind"];
      name: string;
      phone: string | null;
      role: SchoolRole;
      scope_id: string | null;
      scope_type: string;
      status: DirectoryPerson["status"];
    }>();

  return result.results.map((person) => ({
    email: person.email,
    id: person.id,
    kind: person.kind,
    name: person.name,
    phone: person.phone,
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

  const database = await getD1Database();
  const personId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  const scopeType = input.scopeType ?? "tenant";
  const scopeId = input.scopeId?.trim() || null;
  const email = input.email.trim().toLowerCase();

  await database.batch([
    database
      .prepare(
        `INSERT INTO people
          (id, tenant_id, kind, first_name, last_name, email, phone, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'invited')`,
      )
      .bind(
        personId,
        access.tenantId,
        input.kind,
        input.firstName.trim(),
        input.lastName.trim(),
        email,
        input.phone?.trim() || null,
      ),
    database
      .prepare(
        `INSERT INTO tenant_memberships
          (id, tenant_id, person_id, role, status, scope_type, scope_id)
        VALUES (?, ?, ?, ?, 'invited', ?, ?)`,
      )
      .bind(
        membershipId,
        access.tenantId,
        personId,
        input.role,
        scopeType,
        scopeId,
      ),
    database
      .prepare(
        `INSERT INTO audit_events
          (id, tenant_id, actor_person_id, action, entity_type, entity_id, metadata)
        VALUES (?, ?, ?, 'people.invited', 'person', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        access.tenantId,
        access.actorPersonId,
        personId,
        JSON.stringify({ email, role: input.role, scopeType, scopeId }),
      ),
  ]);

  return {
    email,
    id: personId,
    kind: input.kind,
    name: `${input.firstName.trim()} ${input.lastName.trim()}`,
    phone: input.phone?.trim() || null,
    role: input.role,
    scopeLabel: formatScope(scopeType, scopeId),
    status: "invited",
  };
}

async function ensurePeopleSeed() {
  const database = await getD1Database();
  const statements = [
    database
      .prepare(
        "INSERT OR IGNORE INTO tenants (id, name, slug) VALUES (?, ?, ?)",
      )
      .bind(GREENFIELD_TENANT_ID, "Greenfield Academy", "greenfield-academy"),
    seedPerson(
      database,
      "person-mary",
      "staff",
      "Mary",
      "Asante",
      "mary.asante@greenfield.edu.gh",
      "+233 24 401 2278",
    ),
    seedPerson(
      database,
      "person-joseph",
      "staff",
      "Joseph",
      "Kumi",
      "joseph.kumi@greenfield.edu.gh",
      "+233 20 785 4301",
    ),
    seedPerson(
      database,
      "person-grace",
      "staff",
      "Grace",
      "Mensah",
      "grace.mensah@greenfield.edu.gh",
      "+233 27 330 1842",
    ),
    seedPerson(
      database,
      "person-emmanuel",
      "staff",
      "Emmanuel",
      "Ofori",
      "emmanuel.ofori@greenfield.edu.gh",
      "+233 55 681 0913",
    ),
    seedPerson(
      database,
      "person-kwame",
      "learner",
      "Kwame",
      "Agyeman",
      "kwame.agyeman@student.greenfield.edu.gh",
      null,
    ),
    seedPerson(
      database,
      "person-efua",
      "guardian",
      "Efua",
      "Agyeman",
      "efua.agyeman@example.com",
      "+233 24 665 8031",
    ),
    seedMembership(
      database,
      "membership-mary",
      "person-mary",
      "academic-admin",
      "tenant",
      null,
    ),
    seedMembership(
      database,
      "membership-joseph",
      "person-joseph",
      "admissions-officer",
      "tenant",
      null,
    ),
    seedMembership(
      database,
      "membership-grace",
      "person-grace",
      "teacher",
      "subject",
      "Integrated Science",
    ),
    seedMembership(
      database,
      "membership-emmanuel",
      "person-emmanuel",
      "class-teacher",
      "class",
      "JHS 2 Gold",
    ),
    seedMembership(
      database,
      "membership-kwame",
      "person-kwame",
      "learner",
      "class",
      "JHS 2 Gold",
    ),
    seedMembership(
      database,
      "membership-efua",
      "person-efua",
      "guardian",
      "learner",
      "Kwame Agyeman",
    ),
    database
      .prepare(
        `INSERT OR IGNORE INTO guardian_relationships
          (id, tenant_id, guardian_person_id, learner_person_id, relationship)
        VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        "guardian-link-efua-kwame",
        GREENFIELD_TENANT_ID,
        "person-efua",
        "person-kwame",
        "Mother",
      ),
  ];

  await database.batch(statements);
}

function seedPerson(
  database: D1Database,
  id: string,
  kind: DirectoryPerson["kind"],
  firstName: string,
  lastName: string,
  email: string,
  phone: string | null,
) {
  return database
    .prepare(
      `INSERT OR IGNORE INTO people
        (id, tenant_id, kind, first_name, last_name, email, phone, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
    )
    .bind(
      id,
      GREENFIELD_TENANT_ID,
      kind,
      firstName,
      lastName,
      email,
      phone,
    );
}

function seedMembership(
  database: D1Database,
  id: string,
  personId: string,
  role: SchoolRole,
  scopeType: string,
  scopeId: string | null,
) {
  return database
    .prepare(
      `INSERT OR IGNORE INTO tenant_memberships
        (id, tenant_id, person_id, role, status, scope_type, scope_id, accepted_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, CURRENT_TIMESTAMP)`,
    )
    .bind(
      id,
      GREENFIELD_TENANT_ID,
      personId,
      role,
      scopeType,
      scopeId,
    );
}

async function findIdentities(email: string): Promise<IdentityRow[]> {
  const database = await getD1Database();
  const result = await database
    .prepare(
      `SELECT
        i.email,
        p.first_name,
        p.last_name,
        p.id AS person_id,
        m.tenant_id,
        m.role,
        m.status AS membership_status,
        t.name AS school_name
      FROM identity_accounts i
      INNER JOIN people p ON p.id = i.person_id
      INNER JOIN tenant_memberships m ON m.person_id = p.id
      INNER JOIN tenants t ON t.id = m.tenant_id
      WHERE i.provider = 'chatgpt' AND i.provider_subject = ?
      ORDER BY
        CASE m.status WHEN 'active' THEN 1 WHEN 'invited' THEN 2 ELSE 3 END,
        m.accepted_at ASC,
        m.invited_at ASC`,
    )
    .bind(email)
    .all<IdentityRow>();

  return result.results;
}

async function bootstrapFirstAdministrator(
  user: ChatGPTUser,
  email: string,
) {
  const database = await getD1Database();
  const identityId = await stableId("identity", email);
  const existingPerson = await database
    .prepare("SELECT id FROM people WHERE tenant_id = ? AND email = ? LIMIT 1")
    .bind(GREENFIELD_TENANT_ID, email)
    .first<{ id: string }>();
  const personId = existingPerson?.id ?? (await stableId("person", email));
  const [firstName, ...remainingNames] = (
    user.fullName ?? user.displayName ?? "School Administrator"
  ).split(" ");
  const lastName = remainingNames.join(" ") || "Administrator";

  if (!existingPerson) {
    await database
      .prepare(
        `INSERT OR IGNORE INTO people
          (id, tenant_id, kind, first_name, last_name, email, status)
        VALUES (?, ?, 'staff', ?, ?, ?, 'active')`,
      )
      .bind(
        personId,
        GREENFIELD_TENANT_ID,
        firstName,
        lastName,
        email,
      )
      .run();
  }

  await database.batch([
    database
      .prepare(
        `INSERT OR IGNORE INTO identity_accounts
          (id, person_id, provider, provider_subject, email)
        VALUES (?, ?, 'chatgpt', ?, ?)`,
      )
      .bind(identityId, personId, email, email),
    database
      .prepare(
        `INSERT OR IGNORE INTO tenant_bootstrap
          (tenant_id, claimed_by_identity_id)
        VALUES (?, ?)`,
      )
      .bind(GREENFIELD_TENANT_ID, identityId),
  ]);

  const claim = await database
    .prepare(
      "SELECT claimed_by_identity_id FROM tenant_bootstrap WHERE tenant_id = ?",
    )
    .bind(GREENFIELD_TENANT_ID)
    .first<{ claimed_by_identity_id: string }>();

  if (claim?.claimed_by_identity_id !== identityId) {
    throw new AuthorizationError(
      "Your signed-in identity is not a member of this school.",
    );
  }

  await database.batch([
    database
      .prepare(
        `INSERT OR IGNORE INTO tenant_memberships
          (id, tenant_id, person_id, role, status, scope_type, accepted_at)
        VALUES (?, ?, ?, 'school-admin', 'active', 'tenant', CURRENT_TIMESTAMP)`,
      )
      .bind(
        await stableId("membership", email),
        GREENFIELD_TENANT_ID,
        personId,
      ),
    database
      .prepare(
        `INSERT OR IGNORE INTO audit_events
          (id, tenant_id, actor_person_id, action, entity_type, entity_id, metadata)
        VALUES (?, ?, ?, 'tenant.admin_bootstrapped', 'person', ?, ?)`,
      )
      .bind(
        await stableId("audit", email),
        GREENFIELD_TENANT_ID,
        personId,
        personId,
        JSON.stringify({ provider: "chatgpt" }),
      ),
  ]);
}

async function stableId(prefix: string, value: string) {
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
