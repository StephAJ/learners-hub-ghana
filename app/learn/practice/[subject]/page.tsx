import { buildPracticeSet } from "../../../../db/practice-repository";
import { WorkspaceShell } from "../../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../../server/workspace-auth";
import { PracticeRunner } from "./practice-runner";

export const dynamic = "force-dynamic";

/* ==========================================================================
   Practising a subject

   Rendered on the server like every other learner screen, so the first
   question is on the page before any JavaScript runs — this is used on
   connections where the difference is several seconds.

   The set is built against the learner's own access, so a learner opening
   another class's offering id gets an authorisation error rather than that
   class's questions.
   ========================================================================== */
export default async function PracticePage({
  params,
}: {
  params: Promise<{ subject: string }>;
}) {
  const { subject } = await params;
  const user = await requireWorkspaceUser("student", `/learn/practice/${subject}`);
  const set = await buildPracticeSet(user.access, { offeringId: subject });

  return (
    <WorkspaceShell
      activeHref="/learn/subjects"
      contentClassName="workspace-content-flush"
      eyebrow="Practice"
      hideTopbar
      title={set.subjectName}
      user={user}
      workspace="student"
    >
      <PracticeRunner initial={set} />
    </WorkspaceShell>
  );
}
