import { greenfieldProfile } from "../../domain/school/public-profile";
import {
  applicationCompletion,
  type ApplicationDraft,
} from "../../domain/admissions/application-form";
import type { ApplicantApplication } from "../../db/applicant-repository";
import {
  applicationReceivedEmail,
  draftReminderEmail,
  newApplicationEmail,
  type ApplicationSummary,
  type SchoolContext,
} from "./templates";
import { admissionsInbox, sendMail } from "./transport";

/* ==========================================================================
   Admissions mail

   The bridge between an application record and the templates. Nothing here
   throws: a school that cannot send email must still be able to take an
   application, so every send is best-effort and the caller carries on.
   ========================================================================== */

function schoolContext(): SchoolContext {
  const school = greenfieldProfile;
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

/**
 * A short human reference an applicant can quote on the phone.
 *
 * Derived from the id rather than stored, so it needs no column and cannot
 * drift from the record it names. Uppercased because it gets read aloud.
 */
export function applicationReference(id: string): string {
  return `GA-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

function summarise(application: ApplicantApplication): ApplicationSummary {
  const name = [application.applicantFirstName, application.applicantLastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return {
    applicantName: name || "the applicant",
    desiredClass: application.desiredClass,
    entryTerm: application.entryTerm,
    guardianEmail: application.guardianEmail,
    guardianName: application.guardianName,
    guardianPhone: application.guardianPhone,
    reference: applicationReference(application.id),
    submittedAt: formatDateTime(application.submittedAt),
  };
}

/**
 * Confirms a submission to the family and tells the office about it.
 *
 * Sent in parallel and awaited together so a slow mail server delays the
 * response once rather than twice. Failures are logged by the transport and
 * swallowed here — see the note at the top of this file.
 */
export async function sendSubmissionMail(
  application: ApplicantApplication,
): Promise<void> {
  const school = schoolContext();
  const summary = summarise(application);
  const inbox = admissionsInbox();

  const messages = [applicationReceivedEmail(summary, school)];
  if (inbox) {
    messages.push(newApplicationEmail(summary, school, inbox));
  } else {
    console.warn(
      "[mail] no ADMISSIONS_INBOX or INITIAL_ADMIN_EMAIL set — the office was not notified",
    );
  }

  await Promise.all(messages.map((message) => sendMail(message)));
}

/** The single nudge for a draft that has gone quiet. Returns whether it sent. */
export async function sendDraftReminder(options: {
  applicantFirstName: string;
  daysSinceUpdate: number;
  draft: ApplicationDraft;
  guardianEmail: string;
  guardianName: string;
}): Promise<boolean> {
  const school = schoolContext();
  const result = await sendMail(
    draftReminderEmail(
      {
        applicantName: options.applicantFirstName,
        daysSinceUpdate: options.daysSinceUpdate,
        guardianEmail: options.guardianEmail,
        guardianName: options.guardianName,
        percentComplete: applicationCompletion(options.draft),
      },
      school,
      formatDate(greenfieldProfile.admissions.closesOn),
    ),
  );
  return result.delivered;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value?: string): string {
  if (!value) return "just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}
