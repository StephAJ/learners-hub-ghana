import { canPerform } from "../identity/authorization";
import type { AccessContext } from "../identity/types";

/* ==========================================================================
   Announcements

   Messaging is one learner and one teacher. Telling thirty-eight families
   that Thursday's trip is cancelled is a different act, and doing it through
   thirty-eight private threads is not a workaround anyone will use.

   Three scopes, and they are deliberately the ones tenant_memberships already
   uses, so this needs no new idea of who can reach whom:

     tenant   — the whole school. Term dates, closures, fee deadlines.
     class    — one class and its guardians. The trip, the uniform reminder.
     subject  — the learners taking one subject offering. A moved test.

   What bounds reach is the scope, not the permission. A subject teacher holds
   announcement:post exactly as the headteacher does; what differs is that
   canPostTo() will only agree to the offerings they actually teach.
   ========================================================================== */

export type AnnouncementScopeType = "tenant" | "class" | "subject";

export type AnnouncementScope = {
  id: string | null;
  label: string;
  type: AnnouncementScopeType;
};

export type Announcement = {
  authorName: string;
  authorPersonId: string;
  body: string;
  /* Null means it stands until someone takes it down. A notice about Thursday
     is given a Friday, so it stops showing by itself. */
  expiresAt: string | null;
  id: string;
  publishAt: string;
  scopeId: string | null;
  scopeLabel: string;
  scopeType: AnnouncementScopeType;
  title: string;
};

export type NewAnnouncement = {
  body: string;
  expiresAt?: string | null;
  publishAt?: string;
  scopeId?: string | null;
  scopeType: AnnouncementScopeType;
  title: string;
};

export class AnnouncementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnnouncementError";
  }
}

const TITLE_LIMIT = 120;
const BODY_LIMIT = 2000;

/* Reaching the whole school is an administrator's power. A subject teacher
   with a genuine school-wide notice asks the office, which is the same answer
   the paper noticeboard gives. */
function reachesWholeSchool(access: AccessContext): boolean {
  return access.role === "school-admin" || access.role === "academic-admin";
}

export function canPostTo(
  access: AccessContext,
  scopeType: AnnouncementScopeType,
  scopeId: string | null,
): boolean {
  if (!canPerform(access, "announcement:post")) return false;

  if (scopeType === "tenant") return reachesWholeSchool(access);
  if (!scopeId) return false;
  if (reachesWholeSchool(access)) return true;
  if (scopeType === "class") return access.classGroupIds.includes(scopeId);
  return access.subjectOfferingIds.includes(scopeId);
}

/* Whether a notice is showing at a given moment. Kept here rather than in SQL
   so the learner home, the guardian home and the teacher's own list cannot
   disagree about it, and so the boundaries are testable.

   publishAt is inclusive and expiresAt is exclusive: a notice given an expiry
   of Friday 08:00 is gone at Friday 08:00, not lingering through it. */
export function isLive(announcement: Announcement, now: string): boolean {
  if (announcement.publishAt > now) return false;
  return announcement.expiresAt === null || announcement.expiresAt > now;
}

export function validateAnnouncement(input: NewAnnouncement): void {
  const title = input.title.trim();
  const body = input.body.trim();

  if (!title) throw new AnnouncementError("An announcement needs a title.");
  if (title.length > TITLE_LIMIT) {
    throw new AnnouncementError(
      `A title is at most ${TITLE_LIMIT} characters.`,
    );
  }
  if (!body) throw new AnnouncementError("An announcement needs something to say.");
  if (body.length > BODY_LIMIT) {
    throw new AnnouncementError(
      `An announcement is at most ${BODY_LIMIT} characters. Longer than that is a letter, not a notice.`,
    );
  }
  if (input.scopeType !== "tenant" && !input.scopeId) {
    throw new AnnouncementError(
      "Choose the class or subject this announcement is for.",
    );
  }
  if (
    input.expiresAt &&
    input.publishAt &&
    input.expiresAt <= input.publishAt
  ) {
    throw new AnnouncementError(
      "An announcement cannot stop showing before it starts.",
    );
  }
}
