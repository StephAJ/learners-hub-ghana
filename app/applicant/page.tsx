import Link from "next/link";
import { requireAuthenticatedUser } from "../auth";
import { SignOutButton } from "../components/sign-out-button";
import { getApplicantApplication } from "../../db/applicant-repository";

export const dynamic = "force-dynamic";

export default async function ApplicantHomePage() {
  const user = await requireAuthenticatedUser("/applicant");
  const application = await getApplicantApplication(user);

  return (
    <div className="applicant-workspace">
      <header className="applicant-topbar">
        <Link className="public-brand" href="/">
          <span aria-hidden="true">LH</span>
          <span>
            <strong>Learners Hub</strong>
            <small>Applicant workspace</small>
          </span>
        </Link>
        <div>
          <span>{user.displayName}</span>
          <SignOutButton />
        </div>
      </header>
      <main>
        <section className="applicant-welcome">
          <p className="public-kicker">2026 / 2027 admissions</p>
          <h1>Your application to Greenfield Academy</h1>
          <p>
            Pick up the form where you left it. Document requests and the
            school’s decision arrive on this page.
          </p>
        </section>

        <section className="applicant-status-card">
          <div>
            <small>Application status</small>
            <strong>
              {application ? humaniseStatus(application.status) : "Not started"}
            </strong>
            <p>
              {application?.status === "submitted"
                ? "Greenfield Academy has received your application."
                : "The form takes about 20 minutes and saves as you go."}
            </p>
          </div>
          <Link href="/admissions/apply">
            {application ? "Open application" : "Start application"}
          </Link>
        </section>

        <div className="applicant-grid">
          <section id="documents">
            <header>
              <p className="public-kicker">Documents</p>
              <h2>Required evidence</h2>
            </header>
            <ul>
              <li><span />Birth certificate <small>Not uploaded</small></li>
              <li><span />Previous school report <small>Not uploaded</small></li>
              <li><span />Passport photograph <small>Not uploaded</small></li>
            </ul>
            <p>Secure document uploads will open after the form is submitted.</p>
          </section>
          <section id="messages">
            <header>
              <p className="public-kicker">Messages</p>
              <h2>Admissions updates</h2>
            </header>
            <div className="applicant-empty">
              <strong>No messages yet</strong>
              <p>The admissions team’s requests and decisions will appear here.</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function humaniseStatus(status: string): string {
  return status
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
