import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { PublicShell } from "./public-shell";
import {
  toDraft,
  type ApplicantApplication,
} from "../../../db/applicant-repository";
import { applicationCompletion } from "../../../domain/admissions/application-form";
import { applicationReference } from "../../../server/mail/admissions-mail";
import type { SchoolProfile } from "../../../domain/school/public-profile";
import type { PublicIntakeState } from "../../../db/intake-repository";
import "../../admissions/admissions.css";

const STAGES: Array<{
  detail: string;
  label: string;
  reached: (status?: ApplicantApplication["status"]) => boolean;
}> = [
  {
    detail: "The form is saved and can be edited until you send it.",
    label: "Application started",
    reached: (status) => Boolean(status),
  },
  {
    detail: "It is with the admissions office.",
    label: "Submitted",
    reached: (status) =>
      Boolean(status) && status !== "draft",
  },
  {
    detail: "An officer is reading it. We may write with questions.",
    label: "Under review",
    reached: (status) =>
      status === "under-review" ||
      status === "offered" ||
      status === "accepted" ||
      status === "rejected" ||
      status === "enrolled",
  },
  {
    detail: "The school's decision is published to this page.",
    label: "Decision",
    reached: (status) =>
      status === "offered" ||
      status === "accepted" ||
      status === "rejected" ||
      status === "enrolled",
  },
];

/**
 * The applicant's account page.
 *
 * Presentation only — the route above resolves the session and loads the
 * application, so this renders anywhere, including without a database.
 */
export function ApplicantAccount({
  application,
  displayName,
  email,
  intake,
  referencePrefix,
  school,
  signOut,
}: {
  application: ApplicantApplication | null;
  displayName: string;
  email: string;
  intake: PublicIntakeState;
  /* The school's own prefix, so the reference shown here is the one quoted in
     the confirmation email. It used to be the literal "GA-" in both. */
  referencePrefix?: string;
  school: SchoolProfile;
  signOut: ReactNode;
}) {
  const user = { displayName, email };

  const status = application?.status;
  const completion = application ? applicationCompletion(toDraft(application)) : 0;
  const isDraft = !application || status === "draft";
  const currentStage = STAGES.filter((stage) => stage.reached(status)).length;

  return (
    <PublicShell
      headerAside={
        <>
          <span>{user.displayName}</span>
          {signOut}
        </>
      }
      school={school}
    >
      <div className="acct-head">
        <p className="adm-kicker">{intake.intake?.label ?? "Admissions"}</p>
        <h1>Your application to {school.name}</h1>
        <p>
          Everything about this application lives here — the form itself, where
          it has got to, and anything the school sends you.
        </p>
      </div>

      <section className="acct-status">
        <div>
          <small>
            {application
              ? `Reference ${applicationReference(application.id, referencePrefix)}`
              : "Not started"}
          </small>
          <strong>{describeStatus(status)}</strong>
          <p>{statusExplanation(status, application)}</p>
          {isDraft ? (
            <span className="acct-status-progress" aria-hidden="true">
              <i style={{ width: `${completion}%` }} />
            </span>
          ) : null}
        </div>
        <Link className="acct-cta" href="/admissions/apply">
          {!application
            ? "Start the form"
            : isDraft
              ? `Continue — ${completion}% done`
              : "View my answers"}
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>

      <div className="acct-grid">
        <section className="acct-card">
          <h2>Where it has got to</h2>
          <ol className="acct-timeline">
            {STAGES.map((stage, index) => (
              <li
                className={
                  index < currentStage - 1
                    ? "is-done"
                    : index === currentStage - 1
                      ? "is-current"
                      : undefined
                }
                key={stage.label}
              >
                <i aria-hidden="true" />
                <div>
                  <strong>{stage.label}</strong>
                  <small>{stage.detail}</small>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="acct-card" id="messages">
          <h2>Messages from the school</h2>
          <div className="acct-empty">
            <strong>Nothing yet</strong>
            <p>
              Questions from the admissions office and the final decision will
              appear here, and we will email {user.email} at the same time.
            </p>
          </div>
          <p>
            If you need to change something you have already sent, call the
            office on {school.contact.telephone} — an application cannot be
            edited once it is with them.
          </p>
        </section>
      </div>
    </PublicShell>
  );
}

function describeStatus(status?: ApplicantApplication["status"]): string {
  if (!status) return "Not started";
  const labels: Record<ApplicantApplication["status"], string> = {
    accepted: "Place accepted",
    draft: "Draft — not yet sent",
    enrolled: "Enrolled",
    offered: "A place has been offered",
    rejected: "Not offered a place",
    submitted: "With the school",
    "under-review": "Being reviewed",
  };
  return labels[status];
}

function statusExplanation(
  status: ApplicantApplication["status"] | undefined,
  application: ApplicantApplication | null,
): string {
  if (!status || !application) {
    return "The form takes about twenty minutes and saves as you go, so you can stop whenever you need to.";
  }
  switch (status) {
    case "draft":
      return "Nobody at the school can see this yet. It is sent only when you press submit on the review step.";
    case "submitted":
      return "We have it, and nothing further is needed from you today. Applications are read in the order they arrive.";
    case "under-review":
      return "An admissions officer is going through it now. If they need anything, they will write to you.";
    case "offered":
      return "The school has offered a place. Check your email for what happens next and by when.";
    case "accepted":
      return "You have accepted the place. The school will be in touch about enrolment.";
    case "rejected":
      return "The school was not able to offer a place for this intake. You are welcome to apply again next year.";
    case "enrolled":
      return "Enrolment is complete — your child's learner account takes over from here.";
  }
}
