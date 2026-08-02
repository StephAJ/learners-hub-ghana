import { WorkspaceShell } from "../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import { TeacherSubjectsView } from "./teacher-subjects-view";

export const dynamic = "force-dynamic";

export default async function TeacherSubjectsPage() {
  const user = await requireWorkspaceUser("teacher", "/teacher/subjects");

  return (
    <WorkspaceShell
      activeHref="/teacher/subjects"
      description="Curriculum units, lessons and the standards each one covers."
      eyebrow="Teaching"
      title="My subjects"
      user={user}
      workspace="teacher"
    >
      <TeacherSubjectsView />
    </WorkspaceShell>
  );
}
