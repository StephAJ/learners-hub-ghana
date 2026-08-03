import type { MailMessage } from "./transport";

/* ==========================================================================
   Transactional mail for admissions

   Inline styles and a table-free single column, because school inboxes are a
   long tail of Outlook, Yahoo and whatever the phone shipped with, and none of
   them agree about anything more ambitious. Every message carries a plain-text
   alternative rather than relying on the client to strip tags.

   Everything interpolated is escaped. A guardian's own name is not a threat,
   but it is user input arriving in HTML, and a stray angle bracket breaking
   the layout of an official school email is reason enough on its own.
   ========================================================================== */

const BRAND = "#0d5f55";
const INK = "#1b2927";
const MUTED = "#5d6c69";
const LINE = "#dfe5dd";

export type ApplicationSummary = {
  applicantName: string;
  desiredClass: string;
  entryTerm: string;
  guardianEmail: string;
  guardianName: string;
  guardianPhone: string;
  reference: string;
  submittedAt: string;
};

export type SchoolContext = {
  /** Absolute origin, so links in mail resolve outside the app. */
  origin: string;
  schoolEmail: string;
  schoolName: string;
  schoolPhone: string;
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function layout(options: {
  body: string;
  footer: string;
  heading: string;
  preheader: string;
  school: SchoolContext;
}): string {
  const { body, footer, heading, preheader, school } = options;
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:0;background:#f3f5ef;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <div style="margin:0 auto;max-width:34rem;padding:24px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">
    <div style="background:#ffffff;border:1px solid ${LINE};border-radius:16px;overflow:hidden;">
      <div style="background:${BRAND};padding:20px 24px;">
        <span style="color:#ffffff;font-size:15px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;">${escapeHtml(school.schoolName)}</span>
      </div>
      <div style="padding:24px;">
        <h1 style="margin:0 0 16px;font-size:21px;font-weight:600;line-height:1.25;">${escapeHtml(heading)}</h1>
        ${body}
      </div>
    </div>
    <p style="color:${MUTED};font-size:12px;line-height:1.5;margin:16px 4px 0;">
      ${footer}
    </p>
  </div>
</body></html>`;
}

function detailRows(rows: Array<[string, string]>): string {
  return rows
    .filter(([, value]) => value.trim())
    .map(
      ([label, value]) =>
        `<tr>
          <td style="padding:6px 0;color:${MUTED};font-size:13px;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:6px 0 6px 16px;font-size:14px;vertical-align:top;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join("");
}

function button(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:${BRAND};color:#ffffff;font-size:14px;font-weight:600;padding:12px 22px;border-radius:999px;text-decoration:none;">${escapeHtml(label)}</a>`;
}

/** Sent to the guardian the moment an application is submitted. */
export function applicationReceivedEmail(
  application: ApplicationSummary,
  school: SchoolContext,
): MailMessage {
  const rows = detailRows([
    ["Reference", application.reference],
    ["Applicant", application.applicantName],
    ["Class applied for", application.desiredClass],
    ["Starting", application.entryTerm],
    ["Submitted", application.submittedAt],
  ]);

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Thank you, ${escapeHtml(application.guardianName)}. We have your application for
      <strong>${escapeHtml(application.applicantName)}</strong> and nothing further is needed from you today.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">${rows}</table>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
      We read every application in the order it arrives. If we would like to meet
      your family, we will write to you at this address with a date. You can check
      the status at any time from your applicant account.
    </p>
    <p style="margin:0 0 8px;">${button(`${school.origin}/applicant`, "View my application")}</p>`;

  const text = [
    `Thank you, ${application.guardianName}.`,
    ``,
    `We have your application for ${application.applicantName}. Nothing further is needed from you today.`,
    ``,
    `Reference: ${application.reference}`,
    `Class applied for: ${application.desiredClass}`,
    `Starting: ${application.entryTerm}`,
    `Submitted: ${application.submittedAt}`,
    ``,
    `We read every application in the order it arrives. If we would like to meet your family, we will write to you at this address.`,
    ``,
    `Check the status: ${school.origin}/applicant`,
    ``,
    `${school.schoolName} · ${school.schoolPhone} · ${school.schoolEmail}`,
  ].join("\n");

  return {
    html: layout({
      body,
      footer: `Sent by ${escapeHtml(school.schoolName)}. Questions? Reply to this email or call ${escapeHtml(school.schoolPhone)}.`,
      heading: "We have your application",
      preheader: `Reference ${application.reference} — nothing further is needed today.`,
      school,
    }),
    replyTo: school.schoolEmail,
    subject: `Application received — ${application.applicantName} (${application.reference})`,
    text,
    to: application.guardianEmail,
  };
}

/** Sent to the admissions inbox on every submission. */
export function newApplicationEmail(
  application: ApplicationSummary,
  school: SchoolContext,
  to: string,
): MailMessage {
  const rows = detailRows([
    ["Reference", application.reference],
    ["Applicant", application.applicantName],
    ["Class applied for", application.desiredClass],
    ["Starting", application.entryTerm],
    ["Guardian", application.guardianName],
    ["Email", application.guardianEmail],
    ["Phone", application.guardianPhone],
    ["Submitted", application.submittedAt],
  ]);

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      A new application is waiting in the admissions queue.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">${rows}</table>
    <p style="margin:0 0 8px;">${button(`${school.origin}/admin/admissions`, "Open the review queue")}</p>`;

  const text = [
    `A new application is waiting in the admissions queue.`,
    ``,
    `Reference: ${application.reference}`,
    `Applicant: ${application.applicantName}`,
    `Class applied for: ${application.desiredClass}`,
    `Starting: ${application.entryTerm}`,
    `Guardian: ${application.guardianName}`,
    `Email: ${application.guardianEmail}`,
    `Phone: ${application.guardianPhone}`,
    `Submitted: ${application.submittedAt}`,
    ``,
    `Review it: ${school.origin}/admin/admissions`,
  ].join("\n");

  return {
    html: layout({
      body,
      footer: `Sent by Learners Hub for ${escapeHtml(school.schoolName)}.`,
      heading: "New application to review",
      preheader: `${application.applicantName} — ${application.desiredClass}`,
      school,
    }),
    /* So an officer can reply to the family straight from the notification. */
    replyTo: application.guardianEmail,
    subject: `New application — ${application.applicantName}, ${application.desiredClass}`,
    text,
    to,
  };
}

/** Sent once when a draft has been left untouched for a while. */
export function draftReminderEmail(
  options: {
    applicantName: string;
    daysSinceUpdate: number;
    guardianEmail: string;
    guardianName: string;
    percentComplete: number;
  },
  school: SchoolContext,
  closesOn: string,
): MailMessage {
  const who = options.applicantName.trim() || "your child";
  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      ${escapeHtml(options.guardianName.trim() || "Hello")}, your application for
      <strong>${escapeHtml(who)}</strong> is saved but not yet submitted — it was last
      opened ${options.daysSinceUpdate} days ago and is about ${options.percentComplete}% complete.
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
      Everything you entered is still there. Applications for this intake close on
      <strong>${escapeHtml(closesOn)}</strong>, and we can only consider applications that
      have been submitted.
    </p>
    <p style="margin:0 0 8px;">${button(`${school.origin}/admissions/apply`, "Finish my application")}</p>`;

  const text = [
    `${options.guardianName.trim() || "Hello"},`,
    ``,
    `Your application for ${who} is saved but not yet submitted. It was last opened ${options.daysSinceUpdate} days ago and is about ${options.percentComplete}% complete.`,
    ``,
    `Everything you entered is still there. Applications close on ${closesOn}, and we can only consider applications that have been submitted.`,
    ``,
    `Finish it: ${school.origin}/admissions/apply`,
    ``,
    `If you have decided not to apply, you can ignore this — we will not write again about it.`,
    ``,
    `${school.schoolName} · ${school.schoolPhone} · ${school.schoolEmail}`,
  ].join("\n");

  return {
    html: layout({
      body,
      /* Says plainly that this is the only reminder. A school chasing families
         repeatedly is a school families stop reading. */
      footer: `This is the only reminder we will send about this application. ${escapeHtml(school.schoolName)} · ${escapeHtml(school.schoolPhone)}`,
      heading: "Your application is still unfinished",
      preheader: `Applications close on ${closesOn}.`,
      school,
    }),
    replyTo: school.schoolEmail,
    subject: `Your application for ${who} is not yet submitted`,
    text,
    to: options.guardianEmail,
  };
}
