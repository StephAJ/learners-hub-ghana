import { MessagesView } from "../../components/messaging/messages-view";
import { WorkspaceShell } from "../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../server/workspace-auth";

export const dynamic = "force-dynamic";

/**
 * A guardian's inbox.
 *
 * Guardians were excluded from messaging outright, so the guardian workspace
 * had no inbox and a parent with a question telephoned the school. What made
 * their conversations a different thing — a different audit expectation, a
 * child who is named but not a party — is modelled on the thread now rather
 * than used as a reason to leave this screen out.
 */
export default async function GuardianMessagesPage() {
  const user = await requireWorkspaceUser("guardian", "/guardian/messages");

  return (
    <WorkspaceShell
      activeHref="/guardian/messages"
      eyebrow="Guardian"
      title="Messages"
      user={user}
      workspace="guardian"
    >
      <MessagesView viewerRole="guardian" />
    </WorkspaceShell>
  );
}
