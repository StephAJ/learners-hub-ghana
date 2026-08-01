import Link from "next/link";
import { WorkspaceShell } from "../../components/workspace-shell";
import { demoSubjectCards } from "../../demo-data";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import "./subject-index.css";

export const dynamic = "force-dynamic";

export default async function LearnerSubjectsPage() {
  const user = await requireWorkspaceUser("student", "/learn/subjects");
  const subjects = demoSubjectCards();
  const inProgress = subjects.filter(
    (subject) => subject.progressPercent > 0 && subject.progressPercent < 100,
  ).length;

  return (
    <WorkspaceShell
      activeHref="/learn/subjects"
      description={`${subjects.length} subjects this term · ${inProgress} in progress`}
      eyebrow="Learning"
      title="My subjects"
      user={user}
      workspace="student"
    >
      <ul className="subject-card-grid">
        {subjects.map((subject) => (
          <li key={subject.slug}>
            <Link
              className="subject-card"
              href={`/learn/subjects/${subject.slug}`}
            >
              <span className="subject-card-code" aria-hidden="true">
                {subject.code}
              </span>

              <span className="subject-card-identity">
                <strong>{subject.subjectName}</strong>
                <small>{subject.teacherName}</small>
              </span>

              <span className="subject-card-progress">
                <span className="subject-card-progress-head">
                  <small>Progress</small>
                  <b>{subject.progressPercent}%</b>
                </span>
                {/* Native meter semantics would be ideal here, but a meter
                    cannot be styled consistently across browsers, so the value
                    is announced by the label above instead. */}
                <span className="subject-card-track" aria-hidden="true">
                  <i style={{ width: `${subject.progressPercent}%` }} />
                </span>
              </span>

              <span className="subject-card-next">
                {subject.nextLessonTitle ? (
                  <>
                    <small>Next up</small>
                    <span>{subject.nextLessonTitle}</span>
                  </>
                ) : (
                  <small>All lessons complete</small>
                )}
              </span>

              <span className="subject-card-meta">
                {subject.lessonCount} lessons
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </WorkspaceShell>
  );
}
