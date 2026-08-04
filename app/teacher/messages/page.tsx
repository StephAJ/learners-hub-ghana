import { MessagesView } from "../../components/messaging/messages-view";
import { WorkspaceShell } from "../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../server/workspace-auth";

export const dynamic = "force-dynamic";

export default async function TeacherMessagesPage() {
  const user = await requireWorkspaceUser("teacher", "/teacher/messages");

  return (
    <WorkspaceShell
      activeHref="/teacher/messages"
      eyebrow="Teaching"
      title="Messages"
      user={user}
      workspace="teacher"
    >
      <MessagesView viewerRole="teacher" />
    </WorkspaceShell>
  );
}
