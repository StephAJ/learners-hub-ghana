import { AuthorizationError } from "../identity/authorization";
import type { AccessContext, SchoolRole } from "../identity/types";
import type { MessageAuthorRole } from "./types";

/* ==========================================================================
   Who may message whom

   A school messaging feature is only safe if the answer to that question is
   narrow and stated in one place. The rule here is deliberately the smallest
   one that is useful:

     A learner may write to a teacher who teaches them.
     A teacher may write to a learner they teach.

   Nothing else. Learners cannot message each other — a school inbox that
   carries pupil-to-pupil messages is a safeguarding surface the school has
   not asked for and cannot moderate. Guardians are excluded for now for the
   same reason: a guardian conversation is a different thing, with a different
   audit expectation, and folding it in here would make both worse.

   "Teaches them" is resolved from the same data the timetable uses: a teacher
   is assigned to a subject offering, an offering names a class, and a learner
   belongs to a class through their membership scope. There is no separate
   roster table to drift from.
   ========================================================================== */

export const MESSAGE_MAX_LENGTH = 4000;

export class MessagingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessagingError";
  }
}

const LEARNER_ROLES: SchoolRole[] = ["learner"];
const TEACHER_ROLES: SchoolRole[] = ["teacher", "class-teacher"];
const GUARDIAN_ROLES: SchoolRole[] = ["guardian"];

/**
 * Which side of a conversation this person is on.
 *
 * Throws rather than returning undefined: every entry point needs this, and a
 * caller that forgot to check would otherwise treat an administrator as a
 * learner and hand them a learner's inbox.
 */
export function messagingRoleFor(access: AccessContext): MessageAuthorRole {
  if (LEARNER_ROLES.includes(access.role)) return "learner";
  if (TEACHER_ROLES.includes(access.role)) return "teacher";
  if (GUARDIAN_ROLES.includes(access.role)) return "guardian";
  throw new AuthorizationError(
    "Messages are between a teacher and the learners they teach or those learners' guardians.",
  );
}

export function requireActiveMessagingMembership(access: AccessContext): void {
  if (access.membershipStatus !== "active") {
    throw new AuthorizationError(
      "An active school membership is required to send messages.",
    );
  }
}

/**
 * Checks a message before it is stored.
 *
 * Length is capped because this is a school inbox rather than a document
 * store, and an unbounded body is a denial-of-service on every list that
 * renders a preview of it.
 */
export function validateMessageBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new MessagingError("Write a message before sending it.");
  }
  if (trimmed.length > MESSAGE_MAX_LENGTH) {
    throw new MessagingError(
      `A message can be at most ${MESSAGE_MAX_LENGTH} characters.`,
    );
  }
  return trimmed;
}

/**
 * The first line of a thread list entry.
 *
 * Collapses whitespace so a message that begins with several blank lines does
 * not render as an empty preview, and cuts on a word boundary so the list does
 * not show half a word followed by an ellipsis.
 */
export function messagePreview(body: string, limit = 120): string {
  const flattened = body.replace(/\s+/g, " ").trim();
  if (flattened.length <= limit) return flattened;
  const cut = flattened.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > limit * 0.6 ? lastSpace : limit).trimEnd()}…`;
}

/**
 * Whether `access` is a participant in a thread between these two people.
 *
 * Both sides are checked against the actor rather than trusting the role: a
 * teacher is a participant in their own threads, not in every thread in the
 * school.
 */
export function isThreadParticipant(
  access: AccessContext,
  thread: {
    guardianPersonId?: string | null;
    learnerPersonId: string;
    teacherPersonId: string;
  },
): boolean {
  if (access.actorPersonId === thread.teacherPersonId) return true;
  /* A guardian thread names the child but the child is not in it. Reading
     `learnerPersonId` as a participant regardless would put a learner inside
     their parent's conversation with their teacher. */
  if (thread.guardianPersonId) {
    return access.actorPersonId === thread.guardianPersonId;
  }
  return access.actorPersonId === thread.learnerPersonId;
}

export function requireThreadParticipant(
  access: AccessContext,
  thread: {
    guardianPersonId?: string | null;
    learnerPersonId: string;
    teacherPersonId: string;
  },
): void {
  if (!isThreadParticipant(access, thread)) {
    throw new AuthorizationError("This conversation is not yours to read.");
  }
}
