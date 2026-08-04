import { MessagesView } from "../../components/messaging/messages-view";
import { WorkspaceShell } from "../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../server/workspace-auth";

export const dynamic = "force-dynamic";

export default async function LearnerMessagesPage() {
  const user = await requireWorkspaceUser("student", "/learn/messages");

  return (
    <WorkspaceShell
      activeHref="/learn/messages"
      eyebrow="Learning"
      title="Messages"
      user={user}
      workspace="student"
    >
      <MessagesView viewerRole="learner" />
    </WorkspaceShell>
  );
}
