import Link from "next/link";
import type { ReactNode } from "react";
import { countUnreadMessages } from "../../db/messaging-repository";
import { countReportsAwaitingApproval } from "../../db/reporting-repository";
import type { AuthenticatedSchoolUser } from "../../db/people-repository";
import type { SchoolRole } from "../../domain/identity/types";
import { BrandMark } from "./brand-mark";
import { schoolBrandStyle } from "../school-brand";
import { WorkspaceSidebar, type SidebarNavItem } from "./workspace-sidebar";
import { WorkspaceMobileNav } from "./workspace-mobile-nav";
import {
  workspaceHrefForRole,
  workspaceLabelForRole,
  type WorkspaceKind,
} from "../../server/workspace-auth";

const navigation: Record<WorkspaceKind | "applicant", SidebarNavItem[]> = {
  admin: [
    { href: "/admin", icon: "home", label: "Home" },
    { href: "/admin/admissions", icon: "admissions", label: "Admissions" },
    { href: "/admin/people", icon: "classes", label: "People" },
    { href: "/admin/academic", icon: "academics", label: "Academics" },
    /* The timetable was seed rows and nothing else, so every school read the
       demo's four periods. */
    { href: "/admin/timetable", icon: "schoolDay", label: "Timetable" },
    { href: "/admin/reports", icon: "markbook", label: "Report cards" },
    { href: "/admin/school", icon: "school", label: "School details" },
    /* Twelve repositories wrote audit events and nothing read one, so the
       record existed for a future incident and could answer no question
       today. */
    { href: "/admin/audit", icon: "content", label: "Activity log" },
    { href: "/admin/messages", icon: "messages", label: "Reported" },
  ],
  applicant: [
    { href: "/applicant", icon: "home", label: "Overview" },
    { href: "/admissions/apply", icon: "content", label: "Application" },
    { href: "/applicant#documents", icon: "content", label: "Documents" },
    { href: "/applicant#messages", icon: "admissions", label: "Messages" },
  ],
  guardian: [
    { href: "/guardian", icon: "home", label: "Overview" },
    { href: "/guardian/school-day", icon: "schoolDay", label: "School day" },
    { href: "/guardian/reports", icon: "markbook", label: "Reports" },
    /* Guardians were excluded from messaging outright, so a parent with a
       question telephoned the school. */
    { href: "/guardian/messages", icon: "messages", label: "Messages" },
  ],
  student: [
    { href: "/student", icon: "home", label: "Today" },
    { href: "/learn/subjects", icon: "subjects", label: "My subjects" },
    { href: "/learn/school-day", icon: "schoolDay", label: "School day" },
    {
      href: "/learn/assessments",
      icon: "assessments",
      label: "Assessments",
    },
    /* A learner's own report card. The role has held `report:read` since
       permissions were written and there was no screen behind it, so the one
       document a learner most wants was readable by their parent and not by
       them. */
    /* The shelf: past papers, textbooks, worksheets. Distinct from a
       subject's own lesson resources, which are reached by working through
       the lesson that uses them. */
    { href: "/learn/library", icon: "content", label: "Library" },
    { href: "/learn/reports", icon: "markbook", label: "My reports" },
    { href: "/learn/messages", icon: "messages", label: "Messages" },
  ],
  teacher: [
    { href: "/teacher", icon: "home", label: "Today" },
    { href: "/teacher/operations", icon: "classes", label: "My classes" },
    { href: "/teacher/subjects", icon: "subjects", label: "My subjects" },
    { href: "/teacher/content", icon: "content", label: "Lesson media" },
    { href: "/teacher/library", icon: "content", label: "Library" },
    { href: "/teacher/assessments", icon: "assessments", label: "Assessments" },
    { href: "/teacher/gradebook", icon: "markbook", label: "Markbook" },
    { href: "/teacher/messages", icon: "messages", label: "Messages" },
  ],
};

export async function WorkspaceShell({
  activeHref,
  children,
  contentClassName,
  eyebrow,
  hideTopbar,
  title,
  toolbar,
  user,
  workspace,
}: {
  activeHref: string;
  children: ReactNode;
  /* Lets a page opt out of the standard padded column — the lesson player
     needs the full width for its outline and stage. */
  contentClassName?: string;
  eyebrow: string;
  /* Lets a page own its own sticky header instead — the lesson player builds
     one around the lesson it is showing rather than the subject shell. */
  hideTopbar?: boolean;
  title: string;
  /* Optional controls that belong beside the page title rather than in it. */
  toolbar?: ReactNode;
  user: AuthenticatedSchoolUser & { twoFactorAsked?: boolean };
  workspace: WorkspaceKind | "applicant";
}) {
  const roleWorkspaces = uniqueWorkspaces(user.availableRoles);
  const items = await withUnreadBadges(navigation[workspace], user, workspace);

  return (
    <div
      className={`workspace-shell workspace-${workspace}`}
      style={schoolBrandStyle(user.brand)}
    >
      <a className="skip-link" href="#workspace-content">
        Skip to content
      </a>

      <WorkspaceSidebar
        activeHref={activeHref}
        contextLabel={
          workspace === "applicant"
            ? "Admissions"
            : workspaceLabelForRole(user.access.role)
        }
        items={items}
        personName={user.name}
        personPhotoUrl={user.photoUrl}
        personRole={humaniseRole(user.access.role)}
        schoolName={user.schoolName}
        switcher={roleWorkspaces.map((role) => ({
          href: workspaceHrefForRole(role),
          label: workspaceLabelForRole(role),
        }))}
        title={title}
      />

      <main className="workspace-main" id="workspace-content">
        {hideTopbar ? null : (
          <header className="workspace-topbar">
            <Link className="workspace-mobile-brand" href="/" aria-label="Learners Hub">
              <BrandMark size={34} />
            </Link>
            <div className="workspace-topbar-heading">
              <p>{eyebrow}</p>
              <h1>{title}</h1>
            </div>
            {toolbar ? (
              <div className="workspace-topbar-tools">{toolbar}</div>
            ) : null}
          </header>
        )}
        {/* Stated rather than enforced, until the school switches enforcement
            on. An administrator told on the morning they were meant to set the
            school up that they cannot sign in is worse than one asked. */}
        {user.twoFactorAsked ? (
          <p className="workspace-2fa-prompt">
            Your role can read every child&rsquo;s record in this school.{" "}
            <Link href="/account/security">Turn on two-factor sign-in</Link>.
          </p>
        ) : null}
        <div className={contentClassName ?? "workspace-content"}>{children}</div>
      </main>

      <WorkspaceMobileNav activeHref={activeHref} items={items} />
    </div>
  );
}

/**
 * Hangs a count off the link it belongs to: unread messages for the two
 * workspaces with an inbox, reports waiting on the head for the admin one.
 *
 * Done here rather than in each page so the number is visible from wherever
 * the person is, which is the only thing that makes it useful — a count that
 * only appears once you have already opened the screen tells you nothing.
 * Submitted reports had exactly that problem: a teacher's submission wrote an
 * audit event and nothing else, so a head learned that marks were waiting by
 * going and looking.
 *
 * One indexed query per workspace render. A failure is swallowed: an
 * unavailable count is a missing badge, never a page that will not render.
 */
async function withUnreadBadges(
  items: SidebarNavItem[],
  user: AuthenticatedSchoolUser,
  workspace: WorkspaceKind | "applicant",
): Promise<SidebarNavItem[]> {
  if (workspace === "admin") {
    let waiting = 0;
    try {
      waiting = await countReportsAwaitingApproval(user.access);
    } catch {
      return items;
    }
    if (waiting === 0) return items;
    return items.map((item) =>
      item.href === "/admin/reports" ? { ...item, badge: waiting } : item,
    );
  }

  if (
    workspace !== "guardian" &&
    workspace !== "student" &&
    workspace !== "teacher"
  ) {
    return items;
  }
  let unread = 0;
  try {
    unread = await countUnreadMessages(user.access);
  } catch {
    return items;
  }
  if (unread === 0) return items;
  return items.map((item) =>
    item.href.endsWith("/messages") ? { ...item, badge: unread } : item,
  );
}

function uniqueWorkspaces(roles: SchoolRole[]): SchoolRole[] {
  const seen = new Set<string>();
  return roles.filter((role) => {
    const href = workspaceHrefForRole(role);
    if (seen.has(href)) return false;
    seen.add(href);
    return true;
  });
}

function humaniseRole(role: SchoolRole): string {
  return role
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

