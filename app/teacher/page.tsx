import Link from "next/link";
import { WorkspaceShell } from "../components/workspace-shell";
import { requireWorkspaceUser } from "../../server/workspace-auth";
import { firstName, schoolDateLabel, schoolGreeting } from "../school-time";

const timetable = [
  {
    className: "JHS 2 Gold",
    room: "Science Lab",
    subject: "Integrated Science",
    time: "08:00",
  },
  {
    className: "JHS 2 Blue",
    room: "Room B4",
    subject: "Integrated Science",
    time: "10:20",
  },
  {
    className: "JHS 1 Gold",
    room: "Science Lab",
    subject: "Integrated Science",
    time: "13:10",
  },
];

export default async function TeacherHomePage() {
  const user = await requireWorkspaceUser("teacher", "/teacher");

  return (
    <WorkspaceShell
      activeHref="/teacher"
      eyebrow={schoolDateLabel()}
      title={schoolGreeting(firstName(user.name))}
      user={user}
      workspace="teacher"
    >
      <section className="workspace-action-row" aria-label="Teacher actions">
        <Link className="workspace-primary-action" href="/teacher/subjects#new-lesson">
          Create a lesson
        </Link>
        <Link href="/teacher/operations">Take attendance</Link>
        <Link href="/teacher/gradebook">Open marking queue</Link>
      </section>

      <section className="teacher-next-card">
        <div>
          <p className="workspace-eyebrow">Next class · 08:00</p>
          <h2>Integrated Science with JHS 2 Gold</h2>
          <p>Science Lab · 38 learners · Lesson ready</p>
        </div>
        <div>
          <Link href="/teacher/subjects">Open lesson</Link>
          <Link href="/teacher/operations">Open class register</Link>
        </div>
      </section>

      <section className="workspace-metric-grid" aria-label="Teacher summary">
        <article>
          <small>Classes today</small>
          <strong>3</strong>
          <span>First class at 08:00</span>
        </article>
        <article>
          <small>Submissions to review</small>
          <strong>12</strong>
          <Link href="/teacher/operations">Review work</Link>
        </article>
        <article>
          <small>Lesson drafts</small>
          <strong>2</strong>
          <Link href="/teacher/subjects">Continue authoring</Link>
        </article>
        <article>
          <small>Registers due</small>
          <strong>1</strong>
          <Link href="/teacher/operations">Complete register</Link>
        </article>
      </section>

      <div className="workspace-dashboard-grid">
        <section className="workspace-panel">
          <header>
            <div>
              <p className="workspace-eyebrow">My timetable</p>
              <h2>Today’s teaching</h2>
            </div>
            <Link href="/teacher/operations">Full school day</Link>
          </header>
          <div className="teacher-timetable">
            {timetable.map((entry, index) => (
              <article className={index === 0 ? "is-next" : undefined} key={entry.time}>
                <time>{entry.time}</time>
                <div>
                  <strong>{entry.subject}</strong>
                  <span>{entry.className} · {entry.room}</span>
                </div>
                <small>{index === 0 ? "Next" : "Ready"}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="workspace-panel">
          <header>
            <div>
              <p className="workspace-eyebrow">Teaching queue</p>
              <h2>What needs action</h2>
            </div>
          </header>
          <div className="attention-list">
            <Link href="/teacher/operations">
              <span>Attendance</span>
              <strong>Submit yesterday’s JHS 2 Gold register</strong>
              <small>2 absences need reasons</small>
            </Link>
            <Link href="/teacher/gradebook">
              <span>Marking</span>
              <strong>12 body-systems models are ready</strong>
              <small>Rubric and feedback are prepared</small>
            </Link>
            <Link href="/teacher/subjects">
              <span>Lesson planning</span>
              <strong>Finish “How breathing powers the body”</strong>
              <small>Draft · 4 activities</small>
            </Link>
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
