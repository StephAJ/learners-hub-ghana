import { getPostgresPool } from "../../db/postgres";
import { loadSchoolProfile } from "../../db/school-profile-repository";
import { SCHOOL_TENANT_ID } from "../school-tenant";
import {
  absenceNoticeEmail,
  announcementEmail,
  reportReleasedEmail,
  type SchoolContext,
} from "./templates";
import { sendAll } from "./transport";

/* ==========================================================================
   Mail for the things a school does

   Two senders existed, both in admissions. Nothing was sent when a report
   card was released, when a child was marked absent, or when the school made
   an announcement — so each of those was invisible until the person next
   happened to sign in, which for a parent may be never. A school that has
   just released the term's reports has told nobody.

   Everything here is best-effort and none of it throws. Releasing a report is
   an academic act with an audit trail behind it; it must not fail because an
   SMTP server was slow. The mail is the notification, not the record.

   Addressed to guardians only. A learner's inbox is not somewhere a school
   should be putting attendance notices without a policy decision it has not
   been asked to make.
   ========================================================================== */

async function schoolContext(): Promise<SchoolContext> {
  const school = await loadSchoolProfile(SCHOOL_TENANT_ID);
  return {
    origin:
      process.env.BETTER_AUTH_URL?.trim() ||
      process.env.LEARNERS_HUB_ORIGIN?.trim() ||
      "http://localhost:3000",
    schoolEmail: school.contact.email,
    schoolName: school.name,
    schoolPhone: school.contact.telephone,
  };
}

/** Active guardians of one learner, with an address to write to. */
async function guardiansOf(
  tenantId: string,
  learnerPersonId: string,
): Promise<Array<{ email: string; name: string }>> {
  const result = await getPostgresPool().query<{
    email: string;
    name: string;
  }>(
    `SELECT guardian.email, guardian.first_name || ' ' || guardian.last_name AS name
     FROM guardian_relationships link
     INNER JOIN people guardian ON guardian.id = link.guardian_person_id
     WHERE link.tenant_id = $1
       AND link.learner_person_id = $2
       AND link.status = 'active'
       AND guardian.email IS NOT NULL
       AND guardian.email <> ''`,
    [tenantId, learnerPersonId],
  );
  return result.rows;
}

export async function sendReportReleasedMail(input: {
  learnerName: string;
  learnerPersonId: string;
  periodName: string;
  tenantId: string;
}): Promise<void> {
  try {
    const guardians = await guardiansOf(input.tenantId, input.learnerPersonId);
    if (guardians.length === 0) return;
    const school = await schoolContext();
    const message = reportReleasedEmail({
      learnerName: input.learnerName,
      periodName: input.periodName,
      school,
    });
    await sendAll(
      guardians.map((guardian) => ({
        ...message,
        replyTo: school.schoolEmail || undefined,
        to: guardian.email,
      })),
    );
  } catch (error) {
    console.error("[mail] report release notice failed", error);
  }
}

export async function sendAbsenceNoticeMail(input: {
  date: string;
  learnerName: string;
  learnerPersonId: string;
  tenantId: string;
}): Promise<void> {
  try {
    const guardians = await guardiansOf(input.tenantId, input.learnerPersonId);
    if (guardians.length === 0) return;
    const school = await schoolContext();
    const message = absenceNoticeEmail({
      date: input.date,
      learnerName: input.learnerName,
      school,
    });
    await sendAll(
      guardians.map((guardian) => ({
        ...message,
        replyTo: school.schoolEmail || undefined,
        to: guardian.email,
      })),
    );
  } catch (error) {
    console.error("[mail] absence notice failed", error);
  }
}

/**
 * Sends an announcement to the people it was posted to.
 *
 * Whole-school notices reach every guardian; a class notice reaches the
 * guardians of that class. Staff are not mailed: they are in the product
 * daily and the panel is on their home screen, and a school that mails its
 * own staff every notice trains them to ignore the ones that matter.
 */
export async function sendAnnouncementMail(input: {
  authorName: string;
  body: string;
  scopeId: string | null;
  scopeType: "tenant" | "class" | "subject";
  tenantId: string;
  title: string;
}): Promise<void> {
  try {
    /* A subject-scoped notice is not mailed. Its audience is a set of
       learners rather than a class, and resolving that to families reliably
       needs the enrolment work the elective rules will bring. */
    if (input.scopeType === "subject") return;

    const recipients = await getPostgresPool().query<{
      email: string;
    }>(
      input.scopeType === "tenant"
        ? `SELECT DISTINCT guardian.email
           FROM guardian_relationships link
           INNER JOIN people guardian ON guardian.id = link.guardian_person_id
           WHERE link.tenant_id = $1 AND link.status = 'active'
             AND guardian.email IS NOT NULL AND guardian.email <> ''`
        : `SELECT DISTINCT guardian.email
           FROM guardian_relationships link
           INNER JOIN people guardian ON guardian.id = link.guardian_person_id
           INNER JOIN tenant_memberships placement
             ON placement.person_id = link.learner_person_id
               AND placement.tenant_id = link.tenant_id
               AND placement.status = 'active'
               AND placement.scope_type = 'class'
           INNER JOIN class_groups class_group
             ON class_group.tenant_id = link.tenant_id
               AND (placement.scope_id = class_group.id
                    OR placement.scope_id = class_group.name)
           WHERE link.tenant_id = $1 AND link.status = 'active'
             AND class_group.id = $2
             AND guardian.email IS NOT NULL AND guardian.email <> ''`,
      input.scopeType === "tenant"
        ? [input.tenantId]
        : [input.tenantId, input.scopeId],
    );
    if (recipients.rowCount === 0) return;

    const school = await schoolContext();
    const message = announcementEmail({
      authorName: input.authorName,
      bodyText: input.body,
      school,
      title: input.title,
    });
    await sendAll(
      recipients.rows.map((row) => ({
        ...message,
        replyTo: school.schoolEmail || undefined,
        to: row.email,
      })),
    );
  } catch (error) {
    console.error("[mail] announcement could not be sent", error);
  }
}
