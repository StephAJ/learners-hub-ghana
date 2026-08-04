import Link from "next/link";
import type { ReactNode } from "react";
import type { AuthenticatedSchoolUser } from "../../db/people-repository";
import type { SchoolRole } from "../../domain/identity/types";
import { BrandMark } from "./brand-mark";
import { schoolBrandStyle } from "../school-brand";
import { SIDEBAR_STORAGE_KEY } from "./sidebar-state";
import { WorkspaceSidebar, type SidebarNavItem } from "./workspace-sidebar";
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
    { href: "/learn/messages", icon: "messages", label: "Messages" },
  ],
  teacher: [
    { href: "/teacher", icon: "home", label: "Today" },
    { href: "/teacher/operations", icon: "classes", label: "My classes" },
    { href: "/teacher/subjects", icon: "subjects", label: "My subjects" },
    { href: "/teacher/content", icon: "content", label: "Content library" },
    { href: "/teacher/assessments", icon: "assessments", label: "Assessments" },
    { href: "/teacher/gradebook", icon: "markbook", label: "Markbook" },
    { href: "/teacher/messages", icon: "messages", label: "Messages" },
  ],
};

/* Runs before first paint so a collapsed sidebar is already collapsed when the
   page appears, instead of opening wide and then snapping shut. Reading one
   key from localStorage is cheap enough to be worth doing synchronously. */
const restoreSidebarState = `try{if(localStorage.getItem(${JSON.stringify(
  SIDEBAR_STORAGE_KEY,
)})==="true"){document.documentElement.dataset.sidebar="collapsed"}}catch(e){}`;

export function WorkspaceShell({
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
  user: AuthenticatedSchoolUser;
  workspace: WorkspaceKind | "applicant";
}) {
  const roleWorkspaces = uniqueWorkspaces(user.availableRoles);
  const items = navigation[workspace];

  return (
    <div
      className={`workspace-shell workspace-${workspace}`}
      style={schoolBrandStyle(user.brand)}
    >
      <script dangerouslySetInnerHTML={{ __html: restoreSidebarState }} />
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
        <div className={contentClassName ?? "workspace-content"}>{children}</div>
      </main>

      <nav className="workspace-mobile-nav" aria-label="Mobile workspace navigation">
        {items.slice(0, 5).map((item) => (
          <Link
            aria-current={item.href === activeHref ? "page" : undefined}
            className={item.href === activeHref ? "is-active" : undefined}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
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

