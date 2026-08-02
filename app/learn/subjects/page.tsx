import Link from "next/link";
import { CheckIcon, PlayCircleIcon } from "../../components/icons";
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
              data-progress={subject.progressPercent}
              href={`/learn/subjects/${subject.slug}`}
            >
              <span className="subject-card-top">
                <span className="subject-card-identity">
                  <strong>{subject.subjectName}</strong>
                  <small>{subject.teacherName}</small>
                </span>
                <span className="subject-card-code">{subject.code}</span>
              </span>

              <span className="subject-card-body">
                <span className="subject-card-next">
                  {subject.nextLessonTitle ? (
                    <>
                      <PlayCircleIcon size={16} />
                      <span>{subject.nextLessonTitle}</span>
                    </>
                  ) : (
                    <>
                      <CheckIcon size={16} />
                      <span>All lessons complete</span>
                    </>
                  )}
                </span>

                <span className="subject-card-progress">
                  <span className="subject-card-progress-head">
                    <span>{subject.lessonCount} lessons</span>
                    <b>
                      {subject.progressPercent === 0
                        ? "Not started"
                        : `${subject.progressPercent}%`}
                    </b>
                  </span>
                  {/* The figure above carries the value for assistive tech, so
                      the rail itself is decorative. */}
                  <span className="subject-card-track" aria-hidden="true">
                    <i style={{ width: `${subject.progressPercent}%` }} />
                  </span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </WorkspaceShell>
  );
}
