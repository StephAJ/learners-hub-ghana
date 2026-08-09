import { notFound } from "next/navigation";
import { WorkspaceShell } from "../../../components/workspace-shell";
import { demoLearnerSubject } from "../../../demo-data";
import { demoSubjectBySlug } from "../../../../domain/demo/greenfield";
import { getLearnerSubject } from "../../../../db/learning-repository";
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
  const demoSubject = demoSubjectBySlug(key);
  const subject = demoSubject
    ? demoLearnerSubject(demoSubject)
    : await getLearnerSubject(user.access, key).catch(() => undefined);
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
