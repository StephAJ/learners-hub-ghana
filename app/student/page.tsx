import Link from "next/link";
import { WorkspaceShell } from "../components/workspace-shell";
import { demoSubjectCards } from "../demo-data";
import { requireWorkspaceUser } from "../../server/workspace-auth";
import { firstName, schoolDateLabel, schoolGreeting } from "../school-time";

export default async function StudentHomePage() {
  const user = await requireWorkspaceUser("student", "/student");

  /* One source of truth with the subject index and the lesson player, so the
     percentage on this card is the percentage the learner sees when they open
     the lesson. The old hardcoded list disagreed with both. */
  const subjects = demoSubjectCards();
  const overallProgress = Math.round(
    subjects.reduce((total, subject) => total + subject.progressPercent, 0) /
      Math.max(1, subjects.length),
  );
  /* Pick up wherever the learner left off: the least-finished subject that is
     actually started, falling back to the first unstarted one. */
  const resume =
    subjects
      .filter(
        (subject) =>
          subject.nextLessonTitle && subject.progressPercent > 0,
      )
      .sort((a, b) => a.progressPercent - b.progressPercent)[0] ??
    subjects.find((subject) => subject.nextLessonTitle);

  return (
    <WorkspaceShell
      activeHref="/student"
      description="3 pieces of work are due and 2 have new feedback."
      eyebrow={schoolDateLabel()}
      title={schoolGreeting(firstName(user.name))}
      user={user}
      workspace="student"
    >
      {resume ? (
        <section className="student-continue-card">
          <div>
            <p className="workspace-eyebrow">
              Continue learning · {resume.progressPercent}% complete
            </p>
            <h2>{resume.nextLessonTitle}</h2>
            <p>
              {resume.subjectName} · {resume.teacherName}
            </p>
            <Link href={`/learn/subjects/${resume.slug}`}>Continue lesson</Link>
          </div>
          <div
            className="student-continue-progress"
            aria-label={`${resume.progressPercent} percent complete`}
          >
            <strong>{resume.progressPercent}%</strong>
            <span>{resume.subjectName}</span>
          </div>
        </section>
      ) : null}

      <section className="workspace-metric-grid" aria-label="Learning summary">
        <article>
          <small>Attendance</small>
          <strong>96%</strong>
          <span>Up 2% this term</span>
        </article>
        <article>
          <small>Work due</small>
          <strong>3</strong>
          <Link href="/learn/school-day#assignments">Next due tomorrow</Link>
        </article>
        <article>
          <small>Course progress</small>
          <strong>{overallProgress}%</strong>
          <span>Across {subjects.length} subjects</span>
        </article>
        <article>
          <small>New feedback</small>
          <strong>2</strong>
          <Link href="/learn/school-day#assignments">Read feedback</Link>
        </article>
      </section>

      <div className="workspace-dashboard-grid">
        <section className="workspace-panel">
          <header>
            <div>
              <p className="workspace-eyebrow">My subjects</p>
              <h2>Learning progress</h2>
            </div>
            <Link href="/learn/subjects">Open subjects</Link>
          </header>
          <div className="student-subject-list">
            {subjects.map((subject) => (
              <Link href={`/learn/subjects/${subject.slug}`} key={subject.slug}>
                <span>{subject.code}</span>
                <div>
                  <strong>{subject.subjectName}</strong>
                  <small>{subject.teacherName}</small>
                </div>
                <b>{subject.progressPercent}%</b>
              </Link>
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
            <Link href="/learn/school-day#assignments">
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
