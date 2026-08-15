import { notFound } from "next/navigation";
import { WorkspaceShell } from "../../../components/workspace-shell";
import { demoLearnerSubject } from "../../../demo-data";
import { demoSubjectBySlug } from "../../../../domain/demo/greenfield";
import { getLearnerSubject } from "../../../../db/learning-repository";
import { demoSchoolEnabled } from "../../../../server/demo-school";
import { requireWorkspaceUser } from "../../../../server/workspace-auth";
import { LessonPlayer } from "./lesson-player";
import "./lesson-player.css";

export const dynamic = "force-dynamic";

/**
 * The lesson player sits inside the workspace shell rather than replacing it.
 *
 * A course player wants a lot of room, which is why it used to take over the
 * whole window — but losing the app navigation on the one screen learners
 * spend most of their time in is exactly the inconsistency that made the rest
 * of the product feel unrelated. The shell's sidebar collapses to a rail
 * instead, so focus is a choice rather than something the page imposes.
 */
export default async function SubjectLessonPlayerPage({
  params,
}: {
  params: Promise<{ subject: string }>;
}) {
  const { subject: key } = await params;
  const user = await requireWorkspaceUser("student", `/learn/subjects/${key}`);

  /* The segment is an offering id, or one of the demo slugs. It used to be
     only the latter — `if (!demoSubject) notFound()` — so a learner could
     open Greenfield's four demo subjects and nothing else. Their own subjects
     404'd, because their offering ids are not demo slugs. */
  /* The database first, and the demo only as a fallback. It used to be the
     other way round: any slug the demo dataset recognised was answered from
     the dataset without the database being asked, so a learner in a school
     that had named a subject "integrated-science" read Greenfield's lessons
     rather than their teacher's. */
  const subject =
    (await getLearnerSubject(user.access, key).catch(() => undefined)) ??
    demoFallback(key);
  if (!subject) notFound();

  return (
    <WorkspaceShell
      activeHref="/learn/subjects"
      contentClassName="workspace-content-flush"
      eyebrow="My subjects"
      hideTopbar
      title={subject.subjectName}
      user={user}
      workspace="student"
    >
      <LessonPlayer fallback={subject} />
    </WorkspaceShell>
  );
}

/**
 * The demo dataset's version of a subject, on a box that carries the demo.
 *
 * Kept because the walkthrough leans on it when the database is briefly
 * unreachable. Off elsewhere: a real learner is better served by a 404 than by
 * another school's lessons.
 */
function demoFallback(key: string) {
  if (!demoSchoolEnabled()) return undefined;
  const demoSubject = demoSubjectBySlug(key);
  return demoSubject ? demoLearnerSubject(demoSubject) : undefined;
}
