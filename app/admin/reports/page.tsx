import { WorkspaceShell } from "../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import { ReportApprovalsView } from "./report-approvals-view";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const user = await requireWorkspaceUser("admin", "/admin/reports");

  return (
    <WorkspaceShell
      activeHref="/admin/reports"
      eyebrow="Administration"
      title="Report cards"
      user={user}
      workspace="admin"
    >
      <ReportApprovalsView />
    </WorkspaceShell>
  );
}
