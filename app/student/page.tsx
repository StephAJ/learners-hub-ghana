import { AnnouncementsPanel } from "../components/announcements/announcements-panel";
import Link from "next/link";
import { ProgressDonut } from "../components/progress-donut";
import { WorkspaceShell } from "../components/workspace-shell";
import { listLearnerSubjects } from "../../db/learning-repository";
import { getLearnerSchoolDay } from "../../db/operations-repository";
import { requireWorkspaceUser } from "../../server/workspace-auth";
import { firstName, schoolDateLabel, schoolGreeting } from "../school-time";

export default async function StudentHomePage() {
  const user = await requireWorkspaceUser("student", "/student");

  /* One source of truth with the subject index and the lesson player, so the
     percentage on this card is the percentage the learner sees when they open
     the lesson. This and the index both read demoSubjectCards() until now,
     which made them agree with each other and with nothing else — both showed
     the demo school to every learner. */
  const subjects = await listLearnerSubjects(user.access);
  const overallProgress = Math.round(
    subjects.reduce((total, subject) => total + subject.progressPercent, 0) /
      Math.max(1, subjects.length),
  );

  /* The four cards below read "96%", "3", "2" — typed into the markup, the
     same for every learner in every school, and wrong for all of them. The
     school day already holds the learner's own attendance and assignments,
     so the numbers come from there. A failure leaves the cards blank rather
     than taking the page down: a learner's home screen is not worth losing
     over a count. */
  const schoolDay = await getLearnerSchoolDay(user.access).catch(() => null);
  const outstanding =
    schoolDay?.assignments.filter(
      (assignment) => assignment.status === "not-started",
    ).length ?? null;
  /* Marked and released both mean a teacher has written something back; the
     learner cares that there is feedback to read, not which of the two. */
  const newFeedback =
    schoolDay?.assignments.filter(
      (assignment) =>
        (assignment.status === "marked" || assignment.status === "released") &&
        assignment.feedback,
    ).length ?? null;

  /* What is actually coming, soonest first. */
  const upcoming = (schoolDay?.assignments ?? [])
    .filter((assignment) => assignment.status === "not-started")
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, 3);
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
            <Link href={`/learn/subjects/${resume.offeringId}`}>Continue lesson</Link>
          </div>
          {/* A real donut, not a tinted disc. The subject is already named in
              the copy beside it, so the middle of the ring holds only the
              figure the ring is showing. */}
          <ProgressDonut percent={resume.progressPercent} />
        </section>
      ) : null}

      <section className="workspace-metric-grid" aria-label="Learning summary">
        <article>
          <small>Attendance</small>
          <strong>
            {schoolDay ? `${schoolDay.attendance.summary.percentage}%` : "—"}
          </strong>
          <span>
            {schoolDay
              ? `${schoolDay.attendance.summary.presentEquivalent} of ${schoolDay.attendance.summary.totalCounted} days`
              : "Not available"}
          </span>
        </article>
        <article>
          <small>Work due</small>
          <strong>{outstanding ?? "—"}</strong>
          <Link href="/learn/school-day#assignments">
            {outstanding === 0 ? "Nothing outstanding" : "Open assignments"}
          </Link>
        </article>
        <article>
          <small>Course progress</small>
          <strong>{overallProgress}%</strong>
          <span>
            Across {subjects.length}{" "}
            {subjects.length === 1 ? "subject" : "subjects"}
          </span>
        </article>
        <article>
          <small>New feedback</small>
          <strong>{newFeedback ?? "—"}</strong>
          <Link href="/learn/school-day#assignments">
            {newFeedback === 0 ? "Nothing new" : "Read feedback"}
          </Link>
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
              <Link href={`/learn/subjects/${subject.offeringId}`} key={subject.offeringId}>
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
          {/* Three items typed into the markup stood here: a knowledge check
              "Tomorrow", a comprehension exercise "Friday" and a note from a
              class teacher named Mrs. E. Aidoo. None of them belonged to the
              learner reading them, and the first was a link into a demo
              assessment. What is due is what the school day says is due. */}
          <div className="attention-list">
            {upcoming.length === 0 ? (
              <p className="attention-empty">
                {schoolDay
                  ? "Nothing is due. Your assignments appear here when a teacher sets them."
                  : "Your school day could not be loaded just now."}
              </p>
            ) : (
              upcoming.map((assignment) => (
                <Link href="/learn/school-day#assignments" key={assignment.id}>
                  <span>Assignment · {dueLabel(assignment.dueAt)}</span>
                  <strong>{assignment.title}</strong>
                  <small>{assignment.subjectName}</small>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>

      <AnnouncementsPanel />
    </WorkspaceShell>
  );
}

/* "Tomorrow" and "Friday" read better on a card than a date does, and both are
   what a learner would say. Anything further out is given as its weekday, and
   anything past a week as the date itself. */
function dueLabel(dueAt: string): string {
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "Scheduled";
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round(
    (startOfDay(due) - startOfDay(new Date())) / 86_400_000,
  );
  if (days < 0) return "Overdue";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return due.toLocaleDateString(undefined, { weekday: "long" });
  return due.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
