import Link from "next/link";
import { requireChatGPTUser } from "../chatgpt-auth";
import { getApplicantApplication } from "../../db/applicant-repository";

export const dynamic = "force-dynamic";

export default async function ApplicantHomePage() {
  const user = await requireChatGPTUser("/applicant");
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
          <Link href="/signout-with-chatgpt?return_to=/">Sign out</Link>
        </div>
      </header>
      <main>
        <section className="applicant-welcome">
          <p className="public-kicker">2026 / 2027 admissions</p>
          <h1>Your application, clearly organised.</h1>
          <p>
            Continue your form, follow requirements, and return here for
            decisions and next steps.
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
                : "Complete the standard application when you are ready."}
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
