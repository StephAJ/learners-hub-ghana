import { notFound } from "next/navigation";
import { WorkspaceShell } from "../../../components/workspace-shell";
import { demoLearnerSubject } from "../../../demo-data";
import { demoSubjectBySlug } from "../../../../domain/demo/greenfield";
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
  const { subject: slug } = await params;
  const demoSubject = demoSubjectBySlug(slug);
  if (!demoSubject) notFound();

  const user = await requireWorkspaceUser(
    "student",
    `/learn/subjects/${slug}`,
  );
  const subject = demoLearnerSubject(demoSubject);

  return (
    <WorkspaceShell
      activeHref="/learn/subjects"
      contentClassName="workspace-content-flush"
      description={`${subject.className} · ${subject.teacherName}`}
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
