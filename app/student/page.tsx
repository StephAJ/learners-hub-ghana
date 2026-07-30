import Link from "next/link";
import { WorkspaceShell } from "../components/workspace-shell";
import { requireWorkspaceUser } from "../../server/workspace-auth";
import { firstName, schoolDateLabel, schoolGreeting } from "../school-time";

const subjects = [
  { name: "Integrated Science", progress: "82%", teacher: "Ms. Asante" },
  { name: "Mathematics", progress: "76%", teacher: "Mr. Mensah" },
  { name: "English Language", progress: "64%", teacher: "Mrs. Owusu" },
  { name: "Social Studies", progress: "58%", teacher: "Mr. Addo" },
];

export default async function StudentHomePage() {
  const user = await requireWorkspaceUser("student", "/student");

  return (
    <WorkspaceShell
      activeHref="/student"
      description="3 pieces of work are due and 2 have new feedback."
      eyebrow={schoolDateLabel()}
      title={schoolGreeting(firstName(user.name))}
      user={user}
      workspace="student"
    >
      <section className="student-continue-card">
        <div>
          <p className="workspace-eyebrow">Continue learning · 82% complete</p>
          <h2>The human digestive system</h2>
          <p>Integrated Science · Ms. Asante · Lesson 6 of 8</p>
          <Link href="/learn/subjects/integrated-science">Continue lesson</Link>
        </div>
        <div className="student-continue-progress" aria-label="82 percent complete">
          <strong>82%</strong>
          <span>Lesson 6 of 8</span>
        </div>
      </section>

      <section className="workspace-metric-grid" aria-label="Learning summary">
        <article>
          <small>Attendance</small>
          <strong>96%</strong>
          <span>Up 2% this term</span>
        </article>
        <article>
          <small>Work due</small>
          <strong>3</strong>
          <Link href="/learn/school-day">Next due tomorrow</Link>
        </article>
        <article>
          <small>Overall average</small>
          <strong>82%</strong>
          <span>Across 4 subjects</span>
        </article>
        <article>
          <small>New feedback</small>
          <strong>2</strong>
          <Link href="/learn/school-day">Read feedback</Link>
        </article>
      </section>

      <div className="workspace-dashboard-grid">
        <section className="workspace-panel">
          <header>
            <div>
              <p className="workspace-eyebrow">My subjects</p>
              <h2>Learning progress</h2>
            </div>
            <Link href="/learn/subjects/integrated-science">Open subjects</Link>
          </header>
          <div className="student-subject-list">
            {subjects.map((subject) => (
              <article key={subject.name}>
                <span>{subject.name.slice(0, 2).toUpperCase()}</span>
                <div>
                  <strong>{subject.name}</strong>
                  <small>{subject.teacher}</small>
                </div>
                <b>{subject.progress}</b>
              </article>
            ))}
          </div>
        </section>

        <section className="workspace-panel">
          <header>
            <div>
              <p className="workspace-eyebrow">Coming up</p>
              <h2>Today and tomorrow</h2>
            </div>
            <Link href="/learn/school-day">Full school day</Link>
          </header>
          <div className="attention-list">
            <Link href="/learn/assessments/digestive-system-check">
              <span>Assessment · Tomorrow</span>
              <strong>Digestive system knowledge check</strong>
              <small>Integrated Science · 20 minutes</small>
            </Link>
            <Link href="/learn/school-day">
              <span>Assignment · Friday</span>
              <strong>Comprehension exercise</strong>
              <small>English Language</small>
            </Link>
            <div>
              <span>Teacher note</span>
              <strong>Bring your project materials on Friday</strong>
              <small>Mrs. E. Aidoo · Class teacher</small>
            </div>
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
