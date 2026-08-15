import { WorkspaceShell } from "../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import { AuditView } from "./audit-view";

export const dynamic = "force-dynamic";

/**
 * What the school has done, and who did it.
 *
 * Twelve repositories write audit events and, until this, nothing read one.
 * The record existed for a future incident and could not answer a question
 * today — who changed this mark, when did that guardian lose access, who
 * released this report — which is most of what an audit trail is for.
 */
export default async function AuditPage() {
  const user = await requireWorkspaceUser("admin", "/admin/audit");

  return (
    <WorkspaceShell
      activeHref="/admin/audit"
      eyebrow="School records"
      title="Activity log"
      user={user}
      workspace="admin"
    >
      <AuditView />
    </WorkspaceShell>
  );
}
