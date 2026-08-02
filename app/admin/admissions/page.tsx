import { WorkspaceShell } from "../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import { AdmissionsView } from "./admissions-view";

export const dynamic = "force-dynamic";

export default async function AdmissionsPage() {
  const user = await requireWorkspaceUser("admin", "/admin/admissions");

  return (
    <WorkspaceShell
      activeHref="/admin/admissions"
      description="Applications waiting on a decision, and the intake they belong to."
      eyebrow="Administration"
      title="Admissions"
      user={user}
      workspace="admin"
    >
      <AdmissionsView />
    </WorkspaceShell>
  );
}
