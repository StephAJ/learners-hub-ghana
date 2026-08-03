import Link from "next/link";
import { ArrowRight, Check, Mail, Phone } from "lucide-react";
import { PublicShell } from "./public-shell";
import { greenfieldProfile } from "../../../domain/school/public-profile";
import { registrationPath } from "../../auth";
import "../../admissions/admissions.css";

const CHECKLIST = [
  {
    detail:
      "The learner's full name as it appears on their birth certificate, date of birth and home address.",
    title: "The learner's details",
  },
  {
    detail:
      "Where they are now, the last class they completed, and why they are moving.",
    title: "Their current school",
  },
  {
    detail:
      "A phone number and email address we can reach you on, and a second contact for emergencies.",
    title: "Two contacts",
  },
  {
    detail:
      "Allergies, conditions and anything a class teacher should know in the first week. Nothing here affects the decision.",
    title: "Health and support notes",
  },
  {
    detail:
      "Birth certificate, the last two terminal reports and a passport photograph. Photos of the originals are fine — bring them to the campus visit if it is easier.",
    title: "Documents, when you have them",
  },
];

/**
 * The public admissions page.
 *
 * Presentation only, so it renders without a session lookup — the route above
 * decides whether the visitor is signed in and hands the answer down.
 */
export function AdmissionsInfo({ signedIn }: { signedIn: boolean }) {
  const school = greenfieldProfile;
  const applyHref = signedIn
    ? "/admissions/apply"
    : registrationPath("/admissions/apply");

  return (
    <PublicShell
      headerAside={
        <Link href={signedIn ? "/applicant" : "/sign-in"}>
          {signedIn ? "My application" : "Sign in"}
        </Link>
      }
    >
      <section className="adm-hero">
        <div>
          <p className="adm-kicker">{school.admissions.intakeLabel}</p>
          <h1>Apply for a place at {school.name}.</h1>
          <p>
            Kindergarten through JHS 3, for entry from September 2026. The form
            is in five short steps, it saves as you go, and you can stop and
            come back to it whenever you like.
          </p>
          <div className="adm-hero-actions">
            <Link className="apply-button apply-button-solid" href={applyHref}>
              {signedIn ? "Continue my application" : "Start an application"}
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
            <a className="apply-button apply-button-ghost" href="#checklist">
              What you will need
            </a>
          </div>
        </div>

        <aside className="adm-deadline">
          <small>Applications close</small>
          <strong>{formatDate(school.admissions.closesOn)}</strong>
          <span>For entry from September 2026</span>
          <dl>
            <div>
              <dt>Cost to apply</dt>
              <dd>Free</dd>
            </div>
            <div>
              <dt>Time to complete</dt>
              <dd>About 20 minutes</dd>
            </div>
            <div>
              <dt>Save and return</dt>
              <dd>Yes</dd>
            </div>
            <div>
              <dt>Decision by</dt>
              <dd>Late September</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className="adm-section">
        <header>
          <h2>How it works</h2>
          <p>{school.admissions.note}</p>
        </header>
        <ol className="adm-steps">
          {school.admissions.steps.map((step, index) => (
            <li key={step.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="adm-section" id="checklist">
        <header>
          <h2>What you will need</h2>
          <p>
            You do not need all of it to begin. Start the form, save a draft,
            and fill in the rest when you have it.
          </p>
        </header>
        <ul className="adm-checklist">
          {CHECKLIST.map((item) => (
            <li key={item.title}>
              <Check aria-hidden="true" size={17} />
              <div>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="adm-help">
        <h2>Rather talk to someone?</h2>
        <p>
          The admissions office answers the phone {school.contact.officeHours}.
          If you would prefer to fill the form in with help, say so and we will
          book you a slot at one of the open mornings.
        </p>
        <div className="adm-help-contacts">
          <a href={`tel:${school.contact.telephone.replace(/\s/g, "")}`}>
            <Phone aria-hidden="true" size={16} />
            {school.contact.telephone}
          </a>
          <a href={`mailto:${school.contact.email}`}>
            <Mail aria-hidden="true" size={16} />
            {school.contact.email}
          </a>
        </div>
      </section>
    </PublicShell>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}
