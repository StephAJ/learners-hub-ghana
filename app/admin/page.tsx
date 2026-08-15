import Link from "next/link";
import { AnnouncementsPanel } from "../components/announcements/announcements-panel";
import { WorkspaceShell } from "../components/workspace-shell";
import {
  ChevronRightIcon,
  InboxIcon,
  LayersIcon,
  SchoolIcon,
  UsersIcon,
} from "../components/icons";
import { requireWorkspaceUser } from "../../server/workspace-auth";
import { loadAdminOverview } from "../../db/admin-overview";
import { schoolDateLabel, schoolGreeting } from "../school-time";
import "./admin-home.css";

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
      {/* One row of destinations, each carrying the one number that says
          whether it needs opening. This replaced a row of four plain links
          sitting above a row of four bare metrics that named the same four
          places again — eight things to read to learn four. */}
      <section className="admin-launchpad" aria-label="Where to go">
        {destinations(overview).map((destination) => (
          <Link
            className="admin-destination"
            data-hue={destination.hue}
            href={destination.href}
            key={destination.href}
          >
            <span className="admin-destination-glyph" aria-hidden="true">
              <destination.Icon size={20} />
            </span>
            <span className="admin-destination-copy">
              <strong>{destination.label}</strong>
              <small>{destination.detail}</small>
            </span>
            {/* Only where there is something to act on. A pip on every card
                is a pip that means nothing. */}
            {destination.waiting > 0 ? (
              <span className="admin-destination-count">
                {destination.waiting > 99 ? "99+" : destination.waiting}
              </span>
            ) : (
              <span className="admin-destination-go" aria-hidden="true">
                <ChevronRightIcon size={16} />
              </span>
            )}
          </Link>
        ))}
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

        {/* The composer rendered on the teacher, learner and guardian home
            screens and on no administrator's, so "the school tells everyone at
            once" had to be done by a teacher — while school and academic
            admins held announcement:post with nowhere to use it. */}
        <AnnouncementsPanel />
      </div>
    </WorkspaceShell>
  );
}

/**
 * The four places an administrator goes, each with the fact that decides
 * whether it needs opening today.
 *
 * `waiting` is a count of things a person is on the other end of — an unread
 * application, an unaccepted invitation, a class with nobody in front of it.
 * Where it is zero the card shows a chevron instead, so a badge on this
 * screen always means work.
 */
function destinations(overview: Awaited<ReturnType<typeof loadAdminOverview>>) {
  const classesToStaff = overview.classesWithoutTeacher.length;
  const unplacedLearners = overview.learnerCount - overview.placedLearnerCount;

  return [
    {
      detail:
        overview.applicationsAwaitingReview === 0
          ? `${overview.intake?.label ?? "No intake"} · nothing unread`
          : `${overview.applicationsAwaitingReview} waiting to be read`,
      href: "/admin/admissions",
      hue: "amber",
      Icon: InboxIcon,
      label: "Admissions",
      waiting: overview.applicationsAwaitingReview,
    },
    {
      detail:
        overview.pendingInvitations === 0
          ? `${overview.learnerCount} ${
              overview.learnerCount === 1 ? "learner" : "learners"
            } on roll`
          : `${overview.pendingInvitations} ${
              overview.pendingInvitations === 1 ? "invitation" : "invitations"
            } not accepted`,
      href: "/admin/people",
      hue: "blue",
      Icon: UsersIcon,
      label: "People",
      waiting: overview.pendingInvitations,
    },
    {
      detail:
        classesToStaff === 0
          ? `${overview.classGroupCount} ${
              overview.classGroupCount === 1 ? "class" : "classes"
            } · ${unplacedLearners} ${
              unplacedLearners === 1 ? "learner" : "learners"
            } unplaced`
          : `${classesToStaff} ${
              classesToStaff === 1 ? "class needs" : "classes need"
            } a teacher`,
      href: "/admin/academic",
      hue: "teal",
      Icon: LayersIcon,
      label: "Academics",
      waiting: classesToStaff,
    },
    {
      detail: overview.currentYearName ?? "No current academic year",
      href: "/admin/school",
      hue: "violet",
      Icon: SchoolIcon,
      label: "School details",
      waiting: 0,
    },
  ];
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
