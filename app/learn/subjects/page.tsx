import Link from "next/link";
import {
  ChartIcon,
  CheckIcon,
  PlayCircleIcon,
  SparkIcon,
} from "../../components/icons";
import { SubjectCoverArt } from "../../components/subject-cover-art";
import { WorkspaceShell } from "../../components/workspace-shell";
import { listLearnerSubjects } from "../../../db/learning-repository";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import { subjectHue } from "../../../domain/school/subject-hue";
import "./subject-index.css";

export const dynamic = "force-dynamic";

/* This screen called demoSubjectCards(), so every learner in every school
   opened their subjects and saw Greenfield Academy's four demo subjects,
   with demo teachers and invented progress, linking into demo lessons.
   There was no request to fail and no error to notice — the page simply was
   not about them. */
export default async function LearnerSubjectsPage() {
  const user = await requireWorkspaceUser("student", "/learn/subjects");
  const subjects = await listLearnerSubjects(user.access);

  return (
    <WorkspaceShell
      activeHref="/learn/subjects"
      eyebrow="Learning"
      title="My subjects"
      user={user}
      workspace="student"
    >
      {subjects.length === 0 ? (
        <p className="subject-index-empty">
          You have no subjects yet. They appear here once the school places you
          in a class and sets its subjects.
        </p>
      ) : (
      <ul className="subject-card-grid">
        {subjects.map((subject) => (
          /* The hue sits on the list item, not the card, so the practice
             link beside it takes the same colour. */
          <li data-hue={subjectHue(subject.subjectName)} key={subject.offeringId}>
            <Link
              className="subject-card"
              data-progress={subject.progressPercent}
              href={`/learn/subjects/${subject.offeringId}`}
            >
              <span className="subject-card-cover">
                {/* The school's own photograph when it has one. The generated
                    artwork is the fallback rather than the only option now
                    that there is somewhere to upload a cover. */}
                {subject.coverAssetId ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    alt=""
                    src={`/api/school/media?assetId=${encodeURIComponent(subject.coverAssetId)}`}
                  />
                ) : (
                  <SubjectCoverArt seed={subject.offeringId} />
                )}
                {/* Which year the material is pitched at. The stream ("Gold")
                    is deliberately dropped: it says which room a learner sits
                    in, not what the subject is for. */}
                <span className="subject-card-year">{subject.yearGroup}</span>
              </span>

              <span className="subject-card-body">
                <span className="subject-card-identity">
                  <strong>{subject.subjectName}</strong>
                  <small>{subject.teacherName}</small>
                </span>

                {/* What the school says the subject covers. Stored since the
                    table was written and shown to nobody until now. */}
                {subject.description ? (
                  <span className="subject-card-description">
                    {subject.description}
                  </span>
                ) : null}

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

            {/* Overlaid on the card's own foot rather than floating under it.

                They were two buttons sitting outside the card, which made the
                subject read as three stacked objects instead of one. They
                cannot be nested inside the <Link> — a link inside a link is
                not something a browser can resolve — so the list item is the
                card's frame and these sit in the space it leaves for them. */}
            <div className="subject-actions">
              <Link href={`/learn/practice/${subject.offeringId}`}>
                <SparkIcon size={14} />
                Practise
              </Link>
              <Link href={`/learn/progress/${subject.offeringId}`}>
                <ChartIcon size={14} />
                My progress
              </Link>
            </div>
          </li>
        ))}
      </ul>
      )}
    </WorkspaceShell>
  );
}
