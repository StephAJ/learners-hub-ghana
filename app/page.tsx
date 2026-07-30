import Link from "next/link";
import { getAuthenticatedUser, signInPath } from "./auth";

export const dynamic = "force-dynamic";

const schoolJourneys = [
  {
    description:
      "Set up classes and terms, review applications, and invite teaching staff.",
    label: "School leaders",
    number: "01",
  },
  {
    description:
      "Plan lessons, take the register, mark work, and write reports.",
    label: "Teachers",
    number: "02",
  },
  {
    description:
      "Open the next lesson, check what is due, and read marked feedback.",
    label: "Students",
    number: "03",
  },
  {
    description:
      "Follow attendance, results, and school notices for each child.",
    label: "Families",
    number: "04",
  },
];

const admissionSteps = [
  "Create an applicant account",
  "Fill in the application form",
  "Upload the required documents",
  "Read and respond to the decision",
];

export default async function PublicHomePage() {
  const user = await getAuthenticatedUser();

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
          href={user ? "/app" : signInPath("/app")}
        >
          {user ? "Open my workspace" : "Sign in"}
        </Link>
      </header>

      <main>
        <section className="public-hero">
          <div className="public-hero-copy">
            <p className="public-kicker">Greenfield Academy · Accra Campus</p>
            <h1>
              One school system.
              <span>Admissions to reports.</span>
            </h1>
            <p className="public-hero-lead">
              Applications, lesson plans, registers, marks, and end-of-term
              reports all attach to the same record for every learner.
            </p>
            <div className="public-hero-actions">
              <Link className="public-primary-action" href="/admissions">
                Apply for admission
              </Link>
              <Link
                className="public-secondary-action"
                href={user ? "/app" : signInPath("/app")}
              >
                {user ? "Continue to my workspace" : "Sign in to Learners Hub"}
              </Link>
            </div>
            <div className="public-proof" aria-label="How the platform works">
              <span>Built for Ghanaian schools</span>
              <span>Works on low-data connections</span>
              <span>Each role sees only its own data</span>
            </div>
          </div>

          <div className="public-hero-board" aria-label="A connected school day">
            <div className="board-heading">
              <span>Today at Greenfield</span>
              <strong>Term 3 · Week 4</strong>
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
          <p>One record per learner. A separate workspace for each role.</p>
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
            <p className="public-kicker">Four workspaces</p>
            <h2>Each role gets its own workspace.</h2>
            <p>
              One sign-in opens the right workspace. Staff who hold more than
              one role switch between them without mixing permissions.
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
            <h2>Apply online and track every requirement.</h2>
            <p>
              Save your progress, upload documents as they are ready, and read
              the school’s decision in the same place. Applying is free and
              takes about 20 minutes.
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
            <small>School management and learning</small>
          </span>
        </Link>
        <p>Greenfield Academy · Accra Campus</p>
        <div>
          <Link href="/admissions">Admissions</Link>
          <Link href={user ? "/app" : signInPath("/app")}>
            {user ? "My workspace" : "Sign in"}
          </Link>
        </div>
      </footer>
    </div>
  );
}
