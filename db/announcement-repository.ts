import {
  AnnouncementError,
  canPostTo,
  isLive,
  validateAnnouncement,
  type Announcement,
  type AnnouncementScope,
  type AnnouncementScopeType,
  type NewAnnouncement,
} from "../domain/announcements/announcements";
import {
  AuthorizationError,
  canPerform,
} from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import { getSchoolDatabase } from "./index";
import { ensurePeopleSeed } from "./people-repository";
import { sendAnnouncementMail } from "../server/mail/notification-mail";
import type { SchoolDatabase } from "./school-database";

/* ==========================================================================
   Announcements

   Who sees a notice is decided by the scopes the reader already has, which
   are resolved once per request in loadAccessScopes(). A learner placed in
   JHS 2 Gold and taking Integrated Science sees tenant notices, that class's
   notices, and that offering's notices — and nothing else — without this
   module holding any idea of audience beyond the three scope columns.

   A guardian is the one indirection: they see what the children linked to
   them see. That is the whole reason a class notice reaches families.
   ========================================================================== */

export type AnnouncementWorkspace = {
  /* What the reader may post to, empty for those who may not post. */
  canPost: AnnouncementScope[];
  announcements: Announcement[];
};

type AnnouncementRow = {
  author_name: string;
  author_person_id: string;
  body: string;
  expires_at: string | null;
  id: string;
  publish_at: string;
  scope_id: string | null;
  scope_type: AnnouncementScopeType;
  title: string;
};

/* The class groups and offerings whose notices this person should receive.

   Which offerings those are depends on why the person is in the class, and
   the two answers are genuinely different:

   A teacher receives notices for the subjects they teach. Deriving theirs
   from their classes instead would hand the science teacher every notice sent
   to that class's mathematics, which is not their business.

   A learner receives notices for every subject their class is taught, because
   that is what they sit. subjectOfferingIds is resolved from
   teacher_assignments and is therefore empty for them — reading it here is
   what stopped "the test moves to Thursday" ever reaching the learners
   sitting the test.

   A guardian receives what their children receive. Theirs is the one
   indirection: the AccessContext carries linkedLearnerIds, and the classes
   follow from those. */
async function audienceScopes(
  database: SchoolDatabase,
  access: AccessContext,
): Promise<{ classGroupIds: string[]; offeringIds: string[] }> {
  if (access.role === "guardian") {
    const classGroupIds = await classesOf(
      database,
      access.tenantId,
      access.linkedLearnerIds,
    );
    return {
      classGroupIds,
      offeringIds: await offeringsOf(database, access.tenantId, classGroupIds),
    };
  }

  if (access.role === "learner") {
    return {
      classGroupIds: access.classGroupIds,
      offeringIds: await offeringsOf(
        database,
        access.tenantId,
        access.classGroupIds,
      ),
    };
  }

  return {
    classGroupIds: access.classGroupIds,
    offeringIds: access.subjectOfferingIds,
  };
}

/* The class groups these people are placed in. A membership's scope_id holds
   a class name or a class group id depending on how the placement was made,
   so both are matched — as loadAccessScopes() does. */
async function classesOf(
  database: SchoolDatabase,
  tenantId: string,
  personIds: string[],
): Promise<string[]> {
  if (personIds.length === 0) return [];
  const result = await database
    .prepare(
      `SELECT DISTINCT class_group.id AS class_group_id
      FROM class_groups AS class_group
      INNER JOIN tenant_memberships AS membership
        ON membership.tenant_id = class_group.tenant_id
          AND membership.status = 'active'
          AND membership.scope_type = 'class'
          AND (
            membership.scope_id = class_group.id
            OR membership.scope_id = class_group.name
          )
      WHERE class_group.tenant_id = ?
        AND membership.person_id IN (${placeholders(personIds)})`,
    )
    .bind(tenantId, ...personIds)
    .all<{ class_group_id: string }>();
  return result.results.map((row) => row.class_group_id);
}

/* Every subject these classes are taught. */
async function offeringsOf(
  database: SchoolDatabase,
  tenantId: string,
  classGroupIds: string[],
): Promise<string[]> {
  if (classGroupIds.length === 0) return [];
  const result = await database
    .prepare(
      `SELECT id FROM subject_offerings
      WHERE tenant_id = ? AND status = 'active'
        AND class_group_id IN (${placeholders(classGroupIds)})`,
    )
    .bind(tenantId, ...classGroupIds)
    .all<{ id: string }>();
  return result.results.map((row) => row.id);
}

function placeholders(values: string[]): string {
  return values.map(() => "?").join(", ");
}

export async function listAnnouncements(
  access: AccessContext,
): Promise<AnnouncementWorkspace> {
  await ensurePeopleSeed();
  const database = await getSchoolDatabase();
  const { classGroupIds, offeringIds } = await audienceScopes(database, access);

  /* Whole-school notices always, plus the scopes this reader is in. The
     scope_id lists are bound rather than interpolated. */
  const scopeClauses = ["(a.scope_type = 'tenant')"];
  const bindings: string[] = [access.tenantId];
  if (classGroupIds.length > 0) {
    scopeClauses.push(
      `(a.scope_type = 'class' AND a.scope_id IN (${placeholders(classGroupIds)}))`,
    );
    bindings.push(...classGroupIds);
  }
  if (offeringIds.length > 0) {
    scopeClauses.push(
      `(a.scope_type = 'subject' AND a.scope_id IN (${placeholders(offeringIds)}))`,
    );
    bindings.push(...offeringIds);
  }

  const result = await database
    .prepare(
      `SELECT
        a.id,
        a.author_person_id,
        a.scope_type,
        a.scope_id,
        a.title,
        a.body,
        a.publish_at,
        a.expires_at,
        author.first_name || ' ' || author.last_name AS author_name
      FROM announcements a
      INNER JOIN people author ON author.id = a.author_person_id
      WHERE a.tenant_id = ? AND (${scopeClauses.join(" OR ")})
      ORDER BY a.publish_at DESC
      LIMIT 100`,
    )
    .bind(...bindings)
    .all<AnnouncementRow>();

  /* Live-ness is decided in the domain rather than in SQL. publish_at and
     expires_at are ISO strings written by this process; CURRENT_TIMESTAMP
     elsewhere in the schema renders a different format, and comparing the two
     in SQL would sort wrongly the moment anything else wrote one. */
  const now = new Date().toISOString();
  const announcements = result.results
    .map(toAnnouncement)
    .filter((announcement) => isLive(announcement, now));

  return {
    announcements,
    canPost: await postableScopes(database, access),
  };
}

/* What this person may post to, as the composer's options. */
export async function postableScopes(
  database: SchoolDatabase,
  access: AccessContext,
): Promise<AnnouncementScope[]> {
  if (!canPerform(access, "announcement:post")) return [];

  const scopes: AnnouncementScope[] = [];
  if (canPostTo(access, "tenant", null)) {
    scopes.push({ id: null, label: "The whole school", type: "tenant" });
  }

  const isAdministrator =
    access.role === "school-admin" || access.role === "academic-admin";

  /* An empty list must not reach the query: `id IN ()` is a syntax error, not
     an empty result. A class teacher whose class was not resolved simply has
     no class to post to. */
  if (isAdministrator || access.classGroupIds.length > 0) {
    const classRows = await database
      .prepare(
        isAdministrator
          ? `SELECT id, name FROM class_groups WHERE tenant_id = ? ORDER BY name`
          : `SELECT id, name FROM class_groups
             WHERE tenant_id = ?
               AND id IN (${placeholders(access.classGroupIds)})
             ORDER BY name`,
      )
      .bind(
        ...(isAdministrator
          ? [access.tenantId]
          : [access.tenantId, ...access.classGroupIds]),
      )
      .all<{ id: string; name: string }>();

    for (const row of classRows.results) {
      scopes.push({ id: row.id, label: row.name, type: "class" });
    }
  }

  if (isAdministrator || access.subjectOfferingIds.length > 0) {
    const offeringRows = await database
      .prepare(
        isAdministrator
          ? `SELECT offering.id, offering.class_name, subject.name AS subject_name
             FROM subject_offerings AS offering
             INNER JOIN subjects AS subject ON subject.id = offering.subject_id
             WHERE offering.tenant_id = ? AND offering.status = 'active'
             ORDER BY offering.class_name, subject.name`
          : `SELECT offering.id, offering.class_name, subject.name AS subject_name
             FROM subject_offerings AS offering
             INNER JOIN subjects AS subject ON subject.id = offering.subject_id
             WHERE offering.tenant_id = ? AND offering.status = 'active'
               AND offering.id IN (${placeholders(access.subjectOfferingIds)})
             ORDER BY offering.class_name, subject.name`,
      )
      .bind(
        ...(isAdministrator
          ? [access.tenantId]
          : [access.tenantId, ...access.subjectOfferingIds]),
      )
      .all<{ class_name: string; id: string; subject_name: string }>();

    for (const row of offeringRows.results) {
      scopes.push({
        id: row.id,
        label: `${row.subject_name} · ${row.class_name}`,
        type: "subject",
      });
    }
  }

  return scopes;
}

export async function createAnnouncement(
  access: AccessContext,
  input: NewAnnouncement,
): Promise<AnnouncementWorkspace> {
  validateAnnouncement(input);
  const scopeId = input.scopeType === "tenant" ? null : (input.scopeId ?? null);
  if (!canPostTo(access, input.scopeType, scopeId)) {
    throw new AuthorizationError(
      "You are not authorised to post an announcement to that audience.",
    );
  }

  await ensurePeopleSeed();
  const database = await getSchoolDatabase();

  /* Both timestamps written here, in one format. See the note on the table. */
  const publishAt = input.publishAt ?? new Date().toISOString();
  const expiresAt = input.expiresAt ?? null;
  if (expiresAt && expiresAt <= publishAt) {
    throw new AnnouncementError(
      "An announcement cannot stop showing before it starts.",
    );
  }

  await database
    .prepare(
      `INSERT INTO announcements
        (id, tenant_id, author_person_id, scope_type, scope_id, title, body,
         publish_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      access.tenantId,
      access.actorPersonId,
      input.scopeType,
      scopeId,
      input.title.trim(),
      input.body.trim(),
      publishAt,
      expiresAt,
    )
    .run();

  /* Posted notices reached the panel on somebody's home screen and nowhere
     else, so "the school tells everyone at once" only reached the people who
     happened to sign in that week. Guardians are mailed; staff are not, since
     they are in the product daily and a school that mails its own staff every
     notice trains them to ignore the ones that matter.

     After the insert and never allowed to fail it: the announcement is the
     record, the mail is the notice. */
  if (!publishAt || publishAt <= new Date().toISOString()) {
    await sendAnnouncementMail({
      authorName: await authorName(database, access),
      body: input.body.trim(),
      scopeId,
      scopeType: input.scopeType,
      tenantId: access.tenantId,
      title: input.title.trim(),
    });
  }

  return listAnnouncements(access);
}

/** Who posted it, for the mail. The panel reads this from the join. */
async function authorName(
  database: SchoolDatabase,
  access: AccessContext,
): Promise<string> {
  const row = await database
    .prepare(
      `SELECT first_name || ' ' || last_name AS name
      FROM people WHERE id = ? AND tenant_id = ? LIMIT 1`,
    )
    .bind(access.actorPersonId, access.tenantId)
    .first<{ name: string }>();
  return row?.name ?? "The school office";
}

function toAnnouncement(row: AnnouncementRow): Announcement {
  return {
    authorName: row.author_name,
    authorPersonId: row.author_person_id,
    body: row.body,
    expiresAt: row.expires_at,
    id: row.id,
    publishAt: row.publish_at,
    scopeId: row.scope_id,
    scopeLabel: scopeLabel(row.scope_type),
    scopeType: row.scope_type,
    title: row.title,
  };
}

/* The reader is already inside the scope, so the useful thing to say is how
   widely it was sent — a school-wide closure reads differently from a note to
   one class. */
function scopeLabel(scopeType: AnnouncementScopeType): string {
  if (scopeType === "tenant") return "Whole school";
  if (scopeType === "class") return "Your class";
  return "Your subject";
}
