import { WorkspaceShell } from "../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import { ReportedMessagesView } from "./reported-messages-view";

export const dynamic = "force-dynamic";

export default async function AdminMessagesPage() {
  const user = await requireWorkspaceUser("admin", "/admin/messages");

  return (
    <WorkspaceShell
      activeHref="/admin/messages"
      eyebrow="Administration"
      title="Reported conversations"
      user={user}
      workspace="admin"
    >
      <ReportedMessagesView />
    </WorkspaceShell>
  );
}
