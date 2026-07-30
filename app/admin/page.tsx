import Link from "next/link";
import { WorkspaceShell } from "../components/workspace-shell";
import { requireWorkspaceUser } from "../../server/workspace-auth";
import { schoolDateLabel, schoolGreeting } from "../school-time";

const readinessSteps = [
  { complete: true, label: "School profile and campus" },
  { complete: true, label: "Academic year and terms" },
  { complete: true, label: "Classes and subject policies" },
  { complete: true, label: "Staff and teaching assignments" },
  { complete: false, label: "Open the public admissions intake" },
];

export default async function AdminHomePage() {
  const user = await requireWorkspaceUser("admin", "/admin");

  return (
    <WorkspaceShell
      activeHref="/admin"
      description="34 applications, 4 staff invitations, and 2 reports are waiting."
      eyebrow={schoolDateLabel()}
      title={schoolGreeting()}
      user={user}
      workspace="admin"
    >
      <section className="workspace-action-row" aria-label="Common actions">
        <Link className="workspace-primary-action" href="/admin/people#invite">
          Add a teacher
        </Link>
        <Link href="/admin/admissions">Review admissions</Link>
        <Link href="/admin/academic">Configure academics</Link>
      </section>

      <section className="workspace-metric-grid" aria-label="School summary">
        <article>
          <small>Applications awaiting review</small>
          <strong>34</strong>
          <Link href="/admin/admissions">Open admissions</Link>
        </article>
        <article>
          <small>Staff invitations pending</small>
          <strong>4</strong>
          <Link href="/admin/people">Open people</Link>
        </article>
        <article>
          <small>Classes ready for term</small>
          <strong>11 / 12</strong>
          <Link href="/admin/academic">Review classes</Link>
        </article>
        <article>
          <small>Reports awaiting approval</small>
          <strong>2</strong>
          <span>Academic review queue</span>
        </article>
      </section>

      <div className="workspace-dashboard-grid">
        <section className="workspace-panel">
          <header>
            <div>
              <p className="workspace-eyebrow">School readiness</p>
              <h2>Complete the setup path</h2>
            </div>
            <strong>4 of 5</strong>
          </header>
          <ol className="readiness-list">
            {readinessSteps.map((step) => (
              <li className={step.complete ? "is-complete" : undefined} key={step.label}>
                <span aria-hidden="true" />
                <strong>{step.label}</strong>
                <small>{step.complete ? "Complete" : "Next step"}</small>
              </li>
            ))}
          </ol>
        </section>

        <section className="workspace-panel">
          <header>
            <div>
              <p className="workspace-eyebrow">Priority queue</p>
              <h2>Work that is waiting</h2>
            </div>
          </header>
          <div className="attention-list">
            <Link href="/admin/admissions">
              <span>Admissions</span>
              <strong>8 applications are missing review assignments</strong>
              <small>Assign reviewers before Friday</small>
            </Link>
            <Link href="/admin/people">
              <span>People</span>
              <strong>2 teachers have no subject assignment</strong>
              <small>They cannot plan lessons until this is set</small>
            </Link>
            <Link href="/admin/academic">
              <span>Academics</span>
              <strong>JHS 1 Blue needs a class teacher</strong>
              <small>Class setup is otherwise complete</small>
            </Link>
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
