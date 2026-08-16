import { listLibrary } from "../../../db/library-repository";
import { WorkspaceShell } from "../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import { LibraryView } from "./library-view";

export const dynamic = "force-dynamic";

/* The shelf is rendered on the server so the first listings are on the page
   before any JavaScript runs — the filters need the client, the catalogue
   does not. */
export default async function LearnerLibraryPage() {
  const user = await requireWorkspaceUser("student", "/learn/library");
  const shelf = await listLibrary(user.access);

  return (
    <WorkspaceShell
      activeHref="/learn/library"
      eyebrow="Library"
      title="Books and papers"
      user={user}
      workspace="student"
    >
      <LibraryView initial={shelf} />
    </WorkspaceShell>
  );
}
