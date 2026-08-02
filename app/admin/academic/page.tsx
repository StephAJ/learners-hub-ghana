import { WorkspaceShell } from "../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import { AcademicView } from "./academic-view";

export const dynamic = "force-dynamic";

export default async function AcademicPage() {
  const user = await requireWorkspaceUser("admin", "/admin/academic");

  return (
    <WorkspaceShell
      activeHref="/admin/academic"
      eyebrow="Administration"
      title="Academics"
      user={user}
      workspace="admin"
    >
      <AcademicView />
    </WorkspaceShell>
  );
}
