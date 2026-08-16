import { listLibrary } from "../../../db/library-repository";
import { listSubjects } from "../../../db/academic-repository";
import { WorkspaceShell } from "../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import { LibraryManager } from "./library-manager";

export const dynamic = "force-dynamic";

export default async function TeacherLibraryPage() {
  const user = await requireWorkspaceUser("teacher", "/teacher/library");
  const [shelf, subjects] = await Promise.all([
    listLibrary(user.access),
    listSubjects(user.access),
  ]);

  return (
    <WorkspaceShell
      activeHref="/teacher/library"
      eyebrow="Library"
      title="Books and papers"
      user={user}
      workspace="teacher"
    >
      <LibraryManager
        initial={shelf}
        subjects={subjects.map((subject) => ({
          id: subject.id,
          name: subject.name,
        }))}
      />
    </WorkspaceShell>
  );
}
