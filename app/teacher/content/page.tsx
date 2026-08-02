import { WorkspaceShell } from "../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import { ContentStudioView } from "./content-studio-view";

export const dynamic = "force-dynamic";

export default async function TeacherContentPage() {
  const user = await requireWorkspaceUser("teacher", "/teacher/content");

  return (
    <WorkspaceShell
      activeHref="/teacher/content"
      eyebrow="Teaching"
      title="Content library"
      user={user}
      workspace="teacher"
    >
      <ContentStudioView />
    </WorkspaceShell>
  );
}
