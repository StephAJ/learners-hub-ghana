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
  ],
  teacher: [
    { href: "/teacher", icon: "home", label: "Today" },
    { href: "/teacher/operations", icon: "classes", label: "My classes" },
    { href: "/teacher/subjects", icon: "subjects", label: "My subjects" },
    { href: "/teacher/content", icon: "content", label: "Content library" },
    { href: "/teacher/assessments", icon: "assessments", label: "Assessments" },
    { href: "/teacher/gradebook", icon: "markbook", label: "Markbook" },
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
  description,
  eyebrow,
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
  description: string;
  eyebrow: string;
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
        personInitials={initials(user.name)}
        personName={user.name}
        personRole={humaniseRole(user.access.role)}
        schoolName={user.schoolName}
        switcher={roleWorkspaces.map((role) => ({
          href: workspaceHrefForRole(role),
          label: workspaceLabelForRole(role),
        }))}
        title={title}
      />

      <main className="workspace-main" id="workspace-content">
        <header className="workspace-topbar">
          <Link className="workspace-mobile-brand" href="/" aria-label="Learners Hub">
            <BrandMark size={34} />
          </Link>
          <div className="workspace-topbar-heading">
            <p>{eyebrow}</p>
            <h1>{title}</h1>
            <span>{description}</span>
          </div>
          {toolbar ? (
            <div className="workspace-topbar-tools">{toolbar}</div>
          ) : null}
        </header>
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

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
