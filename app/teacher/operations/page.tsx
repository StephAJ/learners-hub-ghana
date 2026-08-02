import { WorkspaceShell } from "../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import { OperationsView } from "./operations-view";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const user = await requireWorkspaceUser("teacher", "/teacher/operations");

  return (
    <WorkspaceShell
      activeHref="/teacher/operations"
      eyebrow="Teaching"
      title="My classes"
      user={user}
      workspace="teacher"
    >
      <OperationsView />
    </WorkspaceShell>
  );
}
