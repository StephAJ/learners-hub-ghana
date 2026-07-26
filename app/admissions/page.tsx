import Link from "next/link";
import { getChatGPTUser } from "../chatgpt-auth";

const requirements = [
  "Applicant and guardian contact details",
  "Previous school information",
  "Birth certificate or accepted identity document",
  "Most recent school report",
  "Passport-size photograph",
];

export default async function PublicAdmissionsPage() {
  const user = await getChatGPTUser();

  return (
    <div className="admissions-public-page">
      <header className="admissions-public-header">
        <Link className="public-brand" href="/">
          <span aria-hidden="true">LH</span>
          <span>
            <strong>Learners Hub</strong>
            <small>Greenfield Academy</small>
          </span>
        </Link>
        <Link href="/">Back to school home</Link>
      </header>

      <main>
        <section className="admissions-public-hero">
          <div>
            <p className="public-kicker">2026 / 2027 admissions</p>
            <h1>Your child’s next chapter starts with a clear application.</h1>
            <p>
              Apply for JHS and SHS entry, save your progress, follow document
              requirements, and receive updates from the admissions team.
            </p>
            <div>
              <Link
                className="public-primary-action"
                href={
                  user
                    ? "/admissions/apply"
                    : "/signin-with-chatgpt?return_to=/admissions/apply"
                }
              >
                {user ? "Continue my application" : "Start an application"}
              </Link>
              <a className="public-secondary-action" href="#requirements">
                Check requirements
              </a>
            </div>
          </div>
          <aside>
            <small>Applications close</small>
            <strong>14 August 2026</strong>
            <span>For September 2026 entry</span>
            <dl>
              <div>
                <dt>Application</dt>
                <dd>Free</dd>
              </div>
              <div>
                <dt>Typical completion</dt>
                <dd>15–20 minutes</dd>
              </div>
              <div>
                <dt>Save and return</dt>
                <dd>Available</dd>
              </div>
            </dl>
          </aside>
        </section>

        <section className="admissions-requirements" id="requirements">
          <div>
            <p className="public-kicker">Prepare before you begin</p>
            <h2>What you will need</h2>
            <p>
              You can save a draft and return later if a document is not ready.
            </p>
          </div>
          <ol>
            {requirements.map((requirement, index) => (
              <li key={requirement}>
                <span>{index + 1}</span>
                <strong>{requirement}</strong>
              </li>
            ))}
          </ol>
        </section>

        <section className="admissions-help">
          <div>
            <p className="public-kicker">Need assistance?</p>
            <h2>The admissions team can help.</h2>
          </div>
          <p>
            Call +233 30 200 4812 on weekdays from 8:00 to 16:00, or email
            admissions@greenfield.edu.gh.
          </p>
        </section>
      </main>
    </div>
  );
}
