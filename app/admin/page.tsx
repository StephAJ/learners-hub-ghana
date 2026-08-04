import Link from "next/link";
import { WorkspaceShell } from "../components/workspace-shell";
import { requireWorkspaceUser } from "../../server/workspace-auth";
import { loadAdminOverview } from "../../db/admin-overview";
import { schoolDateLabel, schoolGreeting } from "../school-time";

export const dynamic = "force-dynamic";

/* ==========================================================================
   The administrator's home

   Every number on this page used to be a literal: 34 applications, 4
   invitations, 11 of 12 classes ready, a readiness checklist with four ticks
   already drawn in, and a priority queue naming "JHS 1 Blue needs a class
   teacher" whether or not it did. It congratulated a school that had just
   signed up for finishing four steps it had not started, and it listed
   "Open the public admissions intake" as the next one — a thing nothing in
   the product could do.

   All of it now comes from db/admin-overview.ts. The consequence worth
   noticing is that this page is sometimes discouraging, which is correct: a
   school with no classes should be told it has no classes.
   ========================================================================== */

export default async function AdminHomePage() {
  const user = await requireWorkspaceUser("admin", "/admin");
  const overview = await loadAdminOverview(user.access);

  const completedSteps = overview.readiness.filter(
    (step) => step.complete,
  ).length;
  const attention = attentionItems(overview);

  return (
    <WorkspaceShell
      activeHref="/admin"
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
        <Link href="/admin/school">Edit school details</Link>
      </section>

      <section className="workspace-metric-grid" aria-label="School summary">
        <article>
          <small>Applications awaiting review</small>
          <strong>{overview.applicationsAwaitingReview}</strong>
          <Link href="/admin/admissions">Open admissions</Link>
        </article>
        <article>
          <small>Invitations not yet accepted</small>
          <strong>{overview.pendingInvitations}</strong>
          <Link href="/admin/people">Open people</Link>
        </article>
        <article>
          <small>Classes with a teacher</small>
          <strong>
            {overview.classGroupCount - overview.classesWithoutTeacher.length} /{" "}
            {overview.classGroupCount}
          </strong>
          <Link href="/admin/academic">Review classes</Link>
        </article>
        <article>
          <small>Learners placed in a class</small>
          <strong>
            {overview.placedLearnerCount} / {overview.learnerCount}
          </strong>
          <span>{overview.currentYearName ?? "No current year"}</span>
        </article>
      </section>

      <div className="workspace-dashboard-grid">
        <section className="workspace-panel">
          <header>
            <div>
              <p className="workspace-eyebrow">School readiness</p>
              <h2>Complete the setup path</h2>
            </div>
            <strong>
              {completedSteps} of {overview.readiness.length}
            </strong>
          </header>
          <ol className="readiness-list">
            {overview.readiness.map((step) => (
              <li
                className={step.complete ? "is-complete" : undefined}
                key={step.label}
              >
                <span aria-hidden="true" />
                <strong>{step.label}</strong>
                <small>{step.complete ? "Complete" : "Next step"}</small>
                {/* Only for a step still to do. A finished step needs no
                    instructions, and repeating them under every tick would
                    turn the list into a wall. */}
                {!step.complete && <em>{step.detail}</em>}
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
            {attention.map((item) => (
              <Link href={item.href} key={item.headline}>
                <span>{item.area}</span>
                <strong>{item.headline}</strong>
                <small>{item.detail}</small>
              </Link>
            ))}
            {attention.length === 0 && (
              <p className="attention-empty">
                Nothing is waiting. Every class has a teacher, every
                invitation has been accepted, and no application is unread.
              </p>
            )}
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}

/**
 * The things actually waiting, most blocking first.
 *
 * Only items that are true are built, so an empty list is a real answer and
 * the panel says so rather than inventing a task.
 */
function attentionItems(overview: Awaited<ReturnType<typeof loadAdminOverview>>) {
  const items: Array<{
    area: string;
    detail: string;
    headline: string;
    href: string;
  }> = [];

  if (!overview.currentYearName) {
    items.push({
      area: "Academics",
      detail: "Classes, subjects and intakes all hang off an academic year.",
      headline: "This school has no current academic year",
      href: "/admin/academic",
    });
  }

  if (overview.intake?.status !== "open") {
    items.push({
      area: "Admissions",
      detail: overview.intake
        ? `${overview.intake.label} is not open, so the public form is refusing applications.`
        : "No intake exists yet, so nobody can apply.",
      headline: "Families cannot apply at the moment",
      href: "/admin/admissions",
    });
  }

  if (overview.applicationsAwaitingReview > 0) {
    items.push({
      area: "Admissions",
      detail: "Each one is a family waiting to hear back.",
      headline: `${overview.applicationsAwaitingReview} ${
        overview.applicationsAwaitingReview === 1
          ? "application has"
          : "applications have"
      } not been opened`,
      href: "/admin/admissions",
    });
  }

  if (overview.classesWithoutTeacher.length > 0) {
    const [first] = overview.classesWithoutTeacher;
    items.push({
      area: "Academics",
      detail: "A class without a teacher has nobody to take its register.",
      headline:
        overview.classesWithoutTeacher.length === 1
          ? `${first.name} needs a class teacher`
          : `${overview.classesWithoutTeacher.length} classes need a class teacher`,
      href: "/admin/academic",
    });
  }

  /* Above the membership-scope check below, because it is the more concrete
     of the two: "three subjects have nobody teaching them" names something an
     administrator can go and fix on the Academics screen. */
  if (overview.unstaffedOfferingCount > 0) {
    items.push({
      area: "Academics",
      detail: "Learners taking them open a subject with no teacher behind it.",
      headline: `${overview.unstaffedOfferingCount} ${
        overview.unstaffedOfferingCount === 1 ? "subject has" : "subjects have"
      } nobody assigned to teach them`,
      href: "/admin/academic",
    });
  }

  if (overview.staffWithoutSubject > 0) {
    items.push({
      area: "People",
      detail: "They cannot plan lessons until this is set.",
      headline: `${overview.staffWithoutSubject} ${
        overview.staffWithoutSubject === 1 ? "teacher has" : "teachers have"
      } no subject or class`,
      href: "/admin/people",
    });
  }

  if (overview.pendingInvitations > 0) {
    items.push({
      area: "People",
      detail: "An invitation that is never accepted is an empty seat.",
      headline: `${overview.pendingInvitations} ${
        overview.pendingInvitations === 1 ? "invitation" : "invitations"
      } not yet accepted`,
      href: "/admin/people",
    });
  }

  return items;
}
