import Link from "next/link";
import { getChatGPTUser } from "./chatgpt-auth";

const schoolJourneys = [
  {
    description:
      "Configure the school, guide admissions, invite staff, and see what needs attention.",
    label: "School leadership",
    number: "01",
  },
  {
    description:
      "Plan today, create rich lessons, take attendance, assess, and give useful feedback.",
    label: "Teachers",
    number: "02",
  },
  {
    description:
      "See the next lesson, due work, timetable, feedback, and steady progress in one place.",
    label: "Students",
    number: "03",
  },
  {
    description:
      "Follow attendance, learning, results, school notices, and released reports for each child.",
    label: "Families",
    number: "04",
  },
];

const admissionSteps = [
  "Create a verified applicant account",
  "Complete the guided school application",
  "Upload documents and track requirements",
  "Receive and respond to the school’s decision",
];

export default async function PublicHomePage() {
  const user = await getChatGPTUser();

  return (
    <div className="public-site">
      <header className="public-header">
        <Link className="public-brand" href="/">
          <span aria-hidden="true">LH</span>
          <span>
            <strong>Learners Hub</strong>
            <small>Greenfield Academy</small>
          </span>
        </Link>
        <nav aria-label="Public navigation">
          <a href="#how-it-works">How it works</a>
          <Link href="/admissions">Admissions</Link>
          <a href="#school-community">Our community</a>
        </nav>
        <Link
          className="public-signin"
          href={user ? "/app" : "/signin-with-chatgpt?return_to=/app"}
        >
          {user ? "Open my workspace" : "Sign in"}
        </Link>
      </header>

      <main>
        <section className="public-hero">
          <div className="public-hero-copy">
            <p className="public-kicker">
              One dependable digital home for school
            </p>
            <h1>
              Every school day,
              <span>clearly connected.</span>
            </h1>
            <p className="public-hero-lead">
              Admissions, teaching, learning, assessment, records, and family
              updates work together around the class—not around disconnected
              systems.
            </p>
            <div className="public-hero-actions">
              <Link className="public-primary-action" href="/admissions">
                Apply for admission
              </Link>
              <Link
                className="public-secondary-action"
                href={user ? "/app" : "/signin-with-chatgpt?return_to=/app"}
              >
                {user ? "Continue to my workspace" : "Sign in to Learners Hub"}
              </Link>
            </div>
            <div className="public-proof" aria-label="Platform commitments">
              <span>Built for Ghanaian schools</span>
              <span>Mobile and low-data conscious</span>
              <span>Private by role and relationship</span>
            </div>
          </div>

          <div className="public-hero-board" aria-label="A connected school day">
            <div className="board-heading">
              <span>Today at Greenfield</span>
              <strong>Everything has a clear next step</strong>
            </div>
            <article className="board-feature">
              <span className="board-time">08:00</span>
              <div>
                <small>Next lesson</small>
                <strong>Integrated Science</strong>
                <p>JHS 2 Gold · Science Lab</p>
              </div>
              <b>Ready</b>
            </article>
            <div className="board-grid">
              <article>
                <small>Admissions</small>
                <strong>8</strong>
                <span>applications need review</span>
              </article>
              <article>
                <small>Teaching</small>
                <strong>12</strong>
                <span>lessons prepared today</span>
              </article>
              <article>
                <small>Families</small>
                <strong>96%</strong>
                <span>attendance this week</span>
              </article>
              <article className="board-progress">
                <small>School readiness</small>
                <strong>6 of 7 steps complete</strong>
                <span>
                  <i />
                </span>
              </article>
            </div>
          </div>
        </section>

        <section className="public-role-band" id="school-community">
          <p>One school record. A workspace that makes sense for each person.</p>
          <div>
            <span>Administration</span>
            <span>Teachers</span>
            <span>Students</span>
            <span>Guardians</span>
            <span>Applicants</span>
          </div>
        </section>

        <section className="public-journeys" id="how-it-works">
          <header>
            <p className="public-kicker">Designed around real responsibilities</p>
            <h2>Everyone sees what they need—and nothing they should not.</h2>
            <p>
              One sign-in opens the right workspace. People with more than one
              role can switch deliberately without mixing permissions.
            </p>
          </header>
          <div className="public-journey-grid">
            {schoolJourneys.map((journey) => (
              <article key={journey.number}>
                <span>{journey.number}</span>
                <h3>{journey.label}</h3>
                <p>{journey.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="public-admissions-section">
          <div>
            <p className="public-kicker">2026 / 2027 admissions</p>
            <h2>A calmer application from first question to first school day.</h2>
            <p>
              Save your application, return when ready, follow document
              requirements, and receive decisions in one secure place.
            </p>
            <Link className="public-primary-action" href="/admissions">
              View admission information
            </Link>
          </div>
          <ol>
            {admissionSteps.map((step, index) => (
              <li key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{step}</strong>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="public-footer">
        <Link className="public-brand" href="/">
          <span aria-hidden="true">LH</span>
          <span>
            <strong>Learners Hub</strong>
            <small>Learning built around your class.</small>
          </span>
        </Link>
        <p>Greenfield Academy · Accra Campus</p>
        <div>
          <Link href="/admissions">Admissions</Link>
          <Link href={user ? "/app" : "/signin-with-chatgpt?return_to=/app"}>
            {user ? "My workspace" : "Sign in"}
          </Link>
        </div>
      </footer>
    </div>
  );
}
