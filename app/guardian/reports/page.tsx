import { WorkspaceShell } from "../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import { ReportsView } from "./reports-view";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await requireWorkspaceUser("guardian", "/guardian/reports");

  return (
    <WorkspaceShell
      activeHref="/guardian/reports"
      eyebrow="Guardian"
      title="Reports"
      user={user}
      workspace="guardian"
    >
      <ReportsView />
    </WorkspaceShell>
  );
}
