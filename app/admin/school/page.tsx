import { WorkspaceShell } from "../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import { SchoolProfileView } from "./school-profile-view";

export const dynamic = "force-dynamic";

export default async function SchoolProfilePage() {
  const user = await requireWorkspaceUser("admin", "/admin/school");

  return (
    <WorkspaceShell
      activeHref="/admin/school"
      eyebrow="Administration"
      title="School details"
      user={user}
      workspace="admin"
    >
      <SchoolProfileView />
    </WorkspaceShell>
  );
}
