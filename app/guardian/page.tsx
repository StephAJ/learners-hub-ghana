import Link from "next/link";
import { WorkspaceShell } from "../components/workspace-shell";
import { requireWorkspaceUser } from "../../server/workspace-auth";
import { schoolDateLabel } from "../school-time";

export default async function GuardianHomePage() {
  const user = await requireWorkspaceUser("guardian", "/guardian");

  return (
    <WorkspaceShell
      activeHref="/guardian"
      description="3 pieces of work due this week and 2 new school notices."
      eyebrow={schoolDateLabel()}
      title="Kwame Agyeman · JHS 2 Gold"
      user={user}
      workspace="guardian"
    >
      <section className="guardian-child-card">
        <div className="guardian-child-identity">
          <span>KA</span>
          <div>
            <small>Viewing child</small>
            <h2>Kwame Agyeman</h2>
            <p>JHS 2 Gold · Greenfield Academy</p>
          </div>
        </div>
        <button type="button">Switch child</button>
      </section>

      <section className="workspace-metric-grid" aria-label="Child summary">
        <article>
          <small>Attendance this term</small>
          <strong>96%</strong>
          <Link href="/guardian/school-day">View attendance</Link>
        </article>
        <article>
          <small>Work due this week</small>
          <strong>3</strong>
          <Link href="/guardian/school-day">View school day</Link>
        </article>
        <article>
          <small>Current average</small>
          <strong>82%</strong>
          <span>Across released results</span>
        </article>
        <article>
          <small>New school notices</small>
          <strong>2</strong>
          <span>One needs a reply</span>
        </article>
      </section>

      <div className="workspace-dashboard-grid">
        <section className="workspace-panel">
          <header>
            <div>
              <p className="workspace-eyebrow">Learning</p>
              <h2>Recent progress</h2>
            </div>
            <Link href="/guardian/reports">Open reports</Link>
          </header>
          <div className="attention-list">
            <div>
              <span>Integrated Science</span>
              <strong>Digestive system knowledge check · 84%</strong>
              <small>Teacher feedback released yesterday</small>
            </div>
            <div>
              <span>English Language</span>
              <strong>Comprehension exercise submitted</strong>
              <small>Awaiting teacher feedback</small>
            </div>
            <div>
              <span>Mathematics</span>
              <strong>Algebraic expressions · 78%</strong>
              <small>Improved by 6 percentage points</small>
            </div>
          </div>
        </section>

        <section className="workspace-panel">
          <header>
            <div>
              <p className="workspace-eyebrow">School updates</p>
              <h2>Notices and alerts</h2>
            </div>
          </header>
          <div className="attention-list">
            <Link href="/guardian/school-day">
              <span>Attendance</span>
              <strong>All attendance registers are complete</strong>
              <small>No unresolved absence alerts</small>
            </Link>
            <div>
              <span>Class teacher</span>
              <strong>Project materials are needed on Friday</strong>
              <small>Posted by Mrs. E. Aidoo</small>
            </div>
            <Link href="/guardian/reports">
              <span>Reports</span>
              <strong>Term report is available</strong>
              <small>Approved and released by the school</small>
            </Link>
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
