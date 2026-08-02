import { WorkspaceShell } from "../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import { GradebookView } from "./gradebook-view";

export const dynamic = "force-dynamic";

export default async function GradebookPage() {
  const user = await requireWorkspaceUser("teacher", "/teacher/gradebook");

  return (
    <WorkspaceShell
      activeHref="/teacher/gradebook"
      description="Grades, weighting and end-of-term report progress."
      eyebrow="Teaching"
      title="Markbook"
      user={user}
      workspace="teacher"
    >
      <GradebookView />
    </WorkspaceShell>
  );
}
