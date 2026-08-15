import { WorkspaceShell } from "../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import { TimetableView } from "./timetable-view";

export const dynamic = "force-dynamic";

/**
 * The school's week.
 *
 * `timetable_periods` and `timetable_entries` were written by the operations
 * seed and by nothing else, so the timetable every learner and guardian read
 * — the one their school day is built from — was the demo school's four
 * periods, whatever school they were in. A teacher could cancel a lesson or
 * arrange a substitute; nobody could create one.
 */
export default async function TimetablePage() {
  const user = await requireWorkspaceUser("admin", "/admin/timetable");

  return (
    <WorkspaceShell
      activeHref="/admin/timetable"
      eyebrow="Academic structure"
      title="Timetable"
      user={user}
      workspace="admin"
    >
      <TimetableView />
    </WorkspaceShell>
  );
}
