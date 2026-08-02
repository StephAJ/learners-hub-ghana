import { WorkspaceShell } from "../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import { TeacherAssessmentsView } from "./teacher-assessments-view";

export const dynamic = "force-dynamic";

export default async function TeacherAssessmentsPage() {
  const user = await requireWorkspaceUser("teacher", "/teacher/assessments");

  return (
    <WorkspaceShell
      activeHref="/teacher/assessments"
      eyebrow="Teaching"
      title="Assessments"
      user={user}
      workspace="teacher"
    >
      <TeacherAssessmentsView />
    </WorkspaceShell>
  );
}
