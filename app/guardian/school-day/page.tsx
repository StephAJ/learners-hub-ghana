import { WorkspaceShell } from "../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import { schoolDateLabel } from "../../school-time";
import { GuardianSchoolDayView } from "./guardian-school-day-view";

export const dynamic = "force-dynamic";

/**
 * The guardian's view of their child's school day, inside the workspace shell.
 *
 * The learner's version of this page had the same problem and was fixed with
 * it: both used to render their own page chrome, so opening either one dropped
 * the app's navigation.
 */
export default async function GuardianSchoolDayPage() {
  const user = await requireWorkspaceUser("guardian", "/guardian/school-day");

  return (
    <WorkspaceShell
      activeHref="/guardian/school-day"
      eyebrow={schoolDateLabel()}
      title="Your child's school day"
      user={user}
      workspace="guardian"
    >
      <GuardianSchoolDayView />
    </WorkspaceShell>
  );
}
