import { WorkspaceShell } from "../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import { PeopleView } from "./people-view";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const user = await requireWorkspaceUser("admin", "/admin/people");

  return (
    <WorkspaceShell
      activeHref="/admin/people"
      description="Staff, learners and guardians, and what each of them can reach."
      eyebrow="Administration"
      title="People"
      user={user}
      workspace="admin"
    >
      <PeopleView />
    </WorkspaceShell>
  );
}
