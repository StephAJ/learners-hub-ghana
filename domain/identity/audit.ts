/* ==========================================================================
   The shape of an audit event

   Here rather than in db/audit-repository.ts because the screen that reads
   these is a client component, and importing a *value* from the repository
   pulls its whole server dependency chain into the browser bundle:
   platform-ready → auth-config → the mail transport → nodemailer, which
   requires node:child_process and cannot be bundled for a browser at all.

   The type alone would have been fine — types are erased. `AUDIT_AREAS` is a
   value, and that is the one that broke the build. A pure domain module is
   where a constant both sides need belongs.
   ========================================================================== */

export type AuditEvent = {
  action: string;
  actorName: string;
  at: string;
  entityId: string;
  entityType: string;
  id: string;
  /** The event's own detail, already parsed. Shape varies by action. */
  metadata: Record<string, unknown>;
};

/** The areas the filter offers, matching the prefix each action is written with. */
export const AUDIT_AREAS = [
  "admissions",
  "assessment",
  "attempt",
  "attendance",
  "content",
  "gradebook",
  "guardian",
  "lesson",
  "people",
  "report",
  "school",
  "timetable",
] as const;
