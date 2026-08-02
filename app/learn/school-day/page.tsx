import { WorkspaceShell } from "../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import { schoolDateLabel } from "../../school-time";
import { SchoolDayView } from "./school-day-view";

export const dynamic = "force-dynamic";

/**
 * The learner's school day, inside the workspace shell.
 *
 * It used to render its own full-page chrome with its own brand mark and its
 * own three-item nav, so opening it dropped the app's navigation and replaced
 * it with a different, shorter one. Same school, same person, different
 * furniture — which is the sort of thing that makes a product feel like
 * several products.
 */
export default async function LearnerSchoolDayPage() {
  const user = await requireWorkspaceUser("student", "/learn/school-day");

  return (
    <WorkspaceShell
      activeHref="/learn/school-day"
      description="Your timetable, the work that is due, and your attendance record."
      eyebrow={schoolDateLabel()}
      title="Your school day"
      user={user}
      workspace="student"
    >
      <SchoolDayView />
    </WorkspaceShell>
  );
}
