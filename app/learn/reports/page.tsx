import { WorkspaceShell } from "../../components/workspace-shell";
import { requireWorkspaceUser } from "../../../server/workspace-auth";
import { ReportsView } from "../../guardian/reports/reports-view";

export const dynamic = "force-dynamic";

/**
 * A learner's own report cards.
 *
 * There was no such page. The learner workspace was Today, My subjects,
 * School day, Assessments and Messages — so a learner's report card was
 * readable by their guardian and not by them, despite the learner role holding
 * `report:read` all along.
 *
 * The document itself is the same one a guardian reads, rendered by the same
 * component. A second copy of a report card is a second thing to keep in step
 * with the school's template, and the two would disagree the first time one
 * was changed.
 */
export default async function LearnerReportsPage() {
  const user = await requireWorkspaceUser("student", "/learn/reports");

  return (
    <WorkspaceShell
      activeHref="/learn/reports"
      eyebrow="Learning"
      title="My reports"
      user={user}
      workspace="student"
    >
      <ReportsView audience="learner" />
    </WorkspaceShell>
  );
}
