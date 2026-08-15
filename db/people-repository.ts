import type { AuthenticatedUser } from "../app/auth";
import { AuthorizationError, canPerform } from "../domain/identity/authorization";
import type {
  AccessContext,
  DirectoryPerson,
  SchoolBrand,
  SchoolRole,
} from "../domain/identity/types";
import { ensurePlatformReady } from "../server/platform-ready";
import { getPostgresPool } from "./postgres";

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
  await ensurePlatformReady();
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

  const scopes = await loadAccessScopes(
    identity.tenant_id,
    identity.person_id,
  );

  return {
    access: {
      actorPersonId: identity.person_id,
      classGroupIds: scopes.classGroupIds,
      classLearnerIds: scopes.classLearnerIds,
      linkedLearnerIds: scopes.linkedLearnerIds,
      membershipStatus: identity.membership_status,
      role: identity.role,
      subjectOfferingIds: scopes.subjectOfferingIds,
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

/* The one place record scope is resolved. See the note on AccessContext.

   Asked of everybody rather than switched on role. A role is not a reliable
   guide to which lists matter — an academic administrator may also teach two
   subjects, a class teacher is a teacher, and a member of staff may be a
   parent at the same school. Branching on role here would answer those cases
   by accident. Each list is simply empty for someone it does not apply to,
   which is also the correct answer.

   One round trip. Four correlated subqueries cost less than the four
   sequential awaits they replace, and this sits in front of every
   authenticated request. */
async function loadAccessScopes(
  tenantId: string,
  personId: string,
): Promise<{
  classGroupIds: string[];
  classLearnerIds: string[];
  linkedLearnerIds: string[];
  subjectOfferingIds: string[];
}> {
  const result = await getPostgresPool().query<{
    class_group_ids: string[];
    class_learner_ids: string[];
    learner_ids: string[];
    offering_ids: string[];
  }>(
    `SELECT
       COALESCE((
         SELECT array_agg(DISTINCT assignment.offering_id)
         FROM teacher_assignments AS assignment
         WHERE assignment.tenant_id = $1
           AND assignment.teacher_person_id = $2
           AND assignment.status = 'active'
       ), '{}'::text[]) AS offering_ids,
       COALESCE((
         SELECT array_agg(DISTINCT link.learner_person_id)
         FROM guardian_relationships AS link
         WHERE link.tenant_id = $1
           AND link.guardian_person_id = $2
           /* A revoked link grants nothing. This is the query that fills
              linkedLearnerIds, which canAccessLearner() then trusts, so
              leaving it out here would make revocation cosmetic. */
           AND link.status = 'active'
       ), '{}'::text[]) AS learner_ids,
       COALESCE((
         SELECT array_agg(DISTINCT class_group.id)
         FROM class_groups AS class_group
         WHERE class_group.tenant_id = $1
           AND (
             class_group.id IN (
               SELECT offering.class_group_id
               FROM subject_offerings AS offering
               INNER JOIN teacher_assignments AS assignment
                 ON assignment.offering_id = offering.id
               WHERE assignment.tenant_id = $1
                 AND assignment.teacher_person_id = $2
                 AND assignment.status = 'active'
             )
             OR EXISTS (
               SELECT 1
               FROM tenant_memberships AS membership
               WHERE membership.tenant_id = $1
                 AND membership.person_id = $2
                 AND membership.status = 'active'
                 AND membership.scope_type = 'class'
                 /* A membership's scope_id is whatever the invitation put
                    there, and the invite form takes free text: every class
                    membership in the demo school holds "JHS 2 Gold" rather
                    than class-jhs2-gold. Both are matched because both exist
                    in the wild. Narrowing this to ids belongs with a
                    migration that rewrites the memberships. */
                 AND (
                   membership.scope_id = class_group.id
                   OR membership.scope_id = class_group.name
                 )
             )
           )
       ), '{}'::text[]) AS class_group_ids,
       /* The learners in those classes. A class teacher answers for the
          children in front of them, which canAccessLearner() cannot decide
          from a class id — so the ids come back with the rest of the scope
          rather than costing a query wherever the question is asked.

          Matched on class name as well as id for the same reason the block
          above is: that is what a learner's membership actually holds. */
       COALESCE((
         SELECT array_agg(DISTINCT learner.person_id)
         FROM tenant_memberships AS learner
         INNER JOIN class_groups AS class_group
           ON class_group.tenant_id = learner.tenant_id
           AND (
             learner.scope_id = class_group.id
             OR learner.scope_id = class_group.name
           )
         WHERE learner.tenant_id = $1
           AND learner.role = 'learner'
           AND learner.status = 'active'
           AND learner.scope_type = 'class'
           AND EXISTS (
             SELECT 1
             FROM tenant_memberships AS mine
             WHERE mine.tenant_id = $1
               AND mine.person_id = $2
               AND mine.status = 'active'
               AND mine.scope_type = 'class'
               AND (
                 mine.scope_id = class_group.id
                 OR mine.scope_id = class_group.name
               )
           )
       ), '{}'::text[]) AS class_learner_ids`,
    [tenantId, personId],
  );

  const scopes = result.rows[0];
  return {
    classGroupIds: scopes?.class_group_ids ?? [],
    classLearnerIds: scopes?.class_learner_ids ?? [],
    linkedLearnerIds: scopes?.learner_ids ?? [],
    subjectOfferingIds: scopes?.offering_ids ?? [],
  };
}

export async function listDirectoryPeople(
  access: AccessContext,
): Promise<DirectoryPerson[]> {
  requirePermission(access, "people:read");
  await ensurePlatformReady();

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
  await ensurePlatformReady();

  const personId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  const scopeType = input.scopeType ?? "tenant";
  const scopeId = input.scopeId?.trim() || null;
  const email = input.email?.trim().toLowerCase() ?? "";
  const client = await getPostgresPool().connect();

  try {
    await client.query("BEGIN");
    /* Allocated inside the transaction so two invitations racing cannot be
       handed the same number — the unique index on (tenant_id,
       student_number) is the backstop, and the loser gets a 409 rather than
       a duplicate. */
    const studentNumber =
      input.kind === "learner"
        ? await allocateStudentNumber(client, access.tenantId)
        : null;
    await client.query(
      `INSERT INTO people
        (id, tenant_id, kind, first_name, last_name, email, phone,
         student_number, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'invited')`,
      [
        personId,
        access.tenantId,
        input.kind,
        input.firstName.trim(),
        input.lastName.trim(),
        /* NULL rather than "" for a learner with no address: the unique index
           on (tenant_id, email) treats empty strings as equal and would refuse
           the second such learner, while it tolerates repeated NULLs. */
        email || null,
        input.phone?.trim() || null,
        studentNumber,
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
    email: email || null,
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

/* The people seed now runs during startup, in order, so that the demo
   identities attached to these rows have rows to attach to — see
   db/people-seed.ts. Kept as a named export because four repositories call it
   to say "the school's people must exist before my rows reference them", and
   that is still exactly what it means. */
export { ensurePlatformReady as ensurePeopleSeed };

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

/* Only the people who sign in. A Ghanaian basic school has learners with no
   email address at all, and requiring one of them meant a class could not be
   added — see the note in domain/identity/bulk-import.ts. */
const SIGNS_IN: ReadonlySet<SchoolRole> = new Set<SchoolRole>([
  "academic-admin",
  "admissions-officer",
  "class-teacher",
  "guardian",
  "school-admin",
  "teacher",
]);

function validateInvitation(input: InvitePersonInput) {
  if (!input.firstName.trim() || !input.lastName.trim()) {
    throw new Error("First and last name are required.");
  }
  const email = input.email?.trim() ?? "";
  if (!email && SIGNS_IN.has(input.role)) {
    throw new Error(
      "This role signs in, so it needs an email address.",
    );
  }
  if (email && !email.includes("@")) {
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

/* ==========================================================================
   Student numbers

   The number a school knows a learner by. There was no column for it: both
   the register and the report card computed one from a three-way map of demo
   person ids, so every learner but two carried the same number.

   Generated as LH-YYnnnn — the two-digit year the learner was admitted, then
   a per-tenant sequence. The prefix is a default rather than a standard; the
   column is free text and unique per tenant, so a school with its own
   numbering can hold that instead once there is a screen to enter it.
   ========================================================================== */

export const DEFAULT_STUDENT_NUMBER_PREFIX = "LH";

/**
 * Tidies what a school typed into a prefix a number can be built from.
 *
 * Letters and digits only, upper-cased, and short — it sits in front of a
 * six-digit tail on a document, and a prefix with a hyphen or a space in it
 * would break the pattern the sequence is read back out of.
 */
export function normaliseStudentNumberPrefix(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
  return cleaned || DEFAULT_STUDENT_NUMBER_PREFIX;
}

export async function allocateStudentNumber(
  client: { query: PoolLikeQuery },
  tenantId: string,
): Promise<string> {
  /* The school's own prefix. "LH" is this product's initials and was hard
     coded here; a student number goes on the school's documents, and their
     office already has a convention for it. */
  const school = await client.query(
    `SELECT student_number_prefix FROM tenants WHERE id = $1`,
    [tenantId],
  );
  const prefix = normaliseStudentNumberPrefix(
    String(
      school.rows[0]?.student_number_prefix ?? DEFAULT_STUDENT_NUMBER_PREFIX,
    ),
  );

  /* The maximum is taken only over numbers this generator produced under the
     school's current prefix, so a school that has entered its own format for
     some learners — or has changed its prefix — does not push the sequence
     somewhere strange, or crash it on a non-numeric tail. */
  const result = await client.query(
    `SELECT COALESCE(MAX(substring(student_number from '([0-9]{4})$')::int), 0)
              AS highest
     FROM people
     WHERE tenant_id = $1 AND kind = 'learner'
       AND student_number ~ $2`,
    [tenantId, `^${prefix}-[0-9]{6}$`],
  );
  const next = Number(result.rows[0]?.highest ?? 0) + 1;
  const year = String(new Date().getFullYear()).slice(-2);
  return `${prefix}-${year}${String(next).padStart(4, "0")}`;
}

type PoolLikeQuery = (
  text: string,
  values?: unknown[],
) => Promise<{
  rows: Array<{ highest?: string | number; student_number_prefix?: string }>;
}>;
