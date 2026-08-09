import Link from "next/link";
import { AnnouncementsPanel } from "../components/announcements/announcements-panel";
import { WorkspaceShell } from "../components/workspace-shell";
import { loadTeacherOverview } from "../../db/teacher-overview";
import { requireWorkspaceUser } from "../../server/workspace-auth";
import { firstName, schoolDateLabel, schoolGreeting } from "../school-time";

export const dynamic = "force-dynamic";

/* ==========================================================================
   The teacher home

   Written rather than measured until now: a hardcoded timetable of three
   Integrated Science classes, tiles reading 3, 12, 2 and 1, and a queue
   naming yesterday's JHS 2 Gold register and twelve body-systems models.

   Everything here is computed, and it is sometimes empty, which is correct: a
   teacher with nothing waiting should be told they have nothing waiting, not
   handed another teacher's Friday.
   ========================================================================== */

export default async function TeacherHomePage() {
  const user = await requireWorkspaceUser("teacher", "/teacher");
  const overview = await loadTeacherOverview(user.access);

  const next = overview.timetable.find((entry) => entry.status !== "completed");
  const waiting = [
    overview.registersOutstanding > 0
      ? {
          detail:
            overview.registersOutstanding === 1
              ? "One class has no register submitted for today"
              : `${overview.registersOutstanding} classes have no register submitted for today`,
          eyebrow: "Attendance",
          href: "/teacher/operations?tab=attendance",
          title: "Take today’s register",
        }
      : null,
    overview.awaitingMarking > 0
      ? {
          detail: "Handed in, and not yet released back to the learner",
          eyebrow: "Marking",
          href: "/teacher/operations?tab=assignments",
          title:
            overview.awaitingMarking === 1
              ? "One submission is waiting"
              : `${overview.awaitingMarking} submissions are waiting`,
          }
      : null,
    overview.missingMarks > 0
      ? {
          detail: "A markbook cannot be submitted while a mark is missing",
          eyebrow: "Markbook",
          href: "/teacher/gradebook",
          title:
            overview.missingMarks === 1
              ? "One mark is missing"
              : `${overview.missingMarks} marks are missing`,
        }
      : null,
    overview.draftLessons > 0
      ? {
          detail: "Not yet published, so learners cannot open it",
          eyebrow: "Lesson planning",
          href: "/teacher/subjects",
          title:
            overview.draftLessons === 1
              ? "One lesson is still a draft"
              : `${overview.draftLessons} lessons are still drafts`,
        }
      : null,
  ].filter((item) => item !== null);

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
        <Link href="/teacher/operations?tab=attendance">Take attendance</Link>
        <Link href="/teacher/gradebook">Open marking queue</Link>
      </section>

      {/* A teacher holding no subjects saw a full day's teaching belonging to
          somebody else. They now see the reason their workspace is empty, and
          who fixes it. */}
      {overview.subjectCount === 0 ? (
        <div className="workspace-empty">
          <strong>No subjects assigned yet</strong>
          <p>
            Your timetable, markbook and lesson library fill in once an
            administrator assigns you subjects on the Academics screen.
          </p>
        </div>
      ) : next ? (
        <section className="teacher-next-card">
          <div>
            <p className="workspace-eyebrow">Next class · {next.startsAt}</p>
            <h2>
              {next.subjectName} with {next.className}
            </h2>
            <p>{next.room}</p>
          </div>
          <div>
            <Link href="/teacher/subjects">Open lesson</Link>
            <Link href="/teacher/operations?tab=attendance">Open class register</Link>
          </div>
        </section>
      ) : (
        <section className="teacher-next-card">
          <div>
            <p className="workspace-eyebrow">Today</p>
            <h2>No classes on today’s timetable</h2>
            <p>
              {overview.subjectCount === 1
                ? "One subject assigned"
                : `${overview.subjectCount} subjects assigned`}
            </p>
          </div>
          <div>
            <Link href="/teacher/subjects">Open lesson library</Link>
          </div>
        </section>
      )}

      <section className="workspace-metric-grid" aria-label="Teacher summary">
        <article>
          <small>Classes today</small>
          <strong>{overview.classesToday}</strong>
          <span>
            {next ? `First at ${next.startsAt}` : "Nothing scheduled"}
          </span>
        </article>
        <article>
          <small>Submissions to review</small>
          <strong>{overview.awaitingMarking}</strong>
          <Link href="/teacher/operations?tab=assignments">Review work</Link>
        </article>
        <article>
          <small>Lesson drafts</small>
          <strong>{overview.draftLessons}</strong>
          <Link href="/teacher/subjects">Continue authoring</Link>
        </article>
        <article>
          <small>Registers due</small>
          <strong>{overview.registersOutstanding}</strong>
          <Link href="/teacher/operations?tab=attendance">Complete register</Link>
        </article>
      </section>

      <div className="workspace-dashboard-grid">
        <section className="workspace-panel">
          <header>
            <div>
              <p className="workspace-eyebrow">My timetable</p>
              <h2>Today’s teaching</h2>
            </div>
            <Link href="/teacher/operations?tab=timetable">Full school day</Link>
          </header>
          {overview.timetable.length === 0 ? (
            <p className="attention-empty">
              Nothing on today’s timetable.
            </p>
          ) : (
            <div className="teacher-timetable">
              {overview.timetable.map((entry) => (
                <article
                  className={entry.id === next?.id ? "is-next" : undefined}
                  key={entry.id}
                >
                  <time>{entry.startsAt}</time>
                  <div>
                    <strong>{entry.subjectName}</strong>
                    <span>
                      {entry.className} · {entry.room}
                    </span>
                  </div>
                  <small>
                    {entry.id === next?.id
                      ? "Next"
                      : entry.status === "substituted"
                        ? "Substituted"
                        : "Ready"}
                  </small>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="workspace-panel">
          <header>
            <div>
              <p className="workspace-eyebrow">Teaching queue</p>
              <h2>What needs action</h2>
            </div>
          </header>
          {waiting.length === 0 ? (
            /* Sometimes discouraging is correct, and so is sometimes empty. */
            <p className="attention-empty">
              Nothing is waiting on you. Registers are in, submissions are
              released, and no markbook is missing a mark.
            </p>
          ) : (
            <div className="attention-list">
              {waiting.map((item) => (
                <Link href={item.href} key={item.eyebrow}>
                  <span>{item.eyebrow}</span>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <AnnouncementsPanel />
    </WorkspaceShell>
  );
}
