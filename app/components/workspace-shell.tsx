import Link from "next/link";
import type { ReactNode } from "react";
import type { AuthenticatedSchoolUser } from "../../db/people-repository";
import type { SchoolRole } from "../../domain/identity/types";
import {
  workspaceHrefForRole,
  workspaceLabelForRole,
  type WorkspaceKind,
} from "../../server/workspace-auth";

type NavigationItem = {
  href: string;
  label: string;
};

const navigation: Record<WorkspaceKind | "applicant", NavigationItem[]> = {
  admin: [
    { href: "/admin", label: "Home" },
    { href: "/admin/admissions", label: "Admissions" },
    { href: "/admin/people", label: "People" },
    { href: "/admin/academic", label: "Academics" },
  ],
  applicant: [
    { href: "/applicant", label: "Overview" },
    { href: "/admissions/apply", label: "Application" },
    { href: "/applicant#documents", label: "Documents" },
    { href: "/applicant#messages", label: "Messages" },
  ],
  guardian: [
    { href: "/guardian", label: "Overview" },
    { href: "/guardian/school-day", label: "School day" },
    { href: "/guardian/reports", label: "Reports" },
  ],
  student: [
    { href: "/student", label: "Today" },
    { href: "/learn/subjects/integrated-science", label: "Subjects" },
    { href: "/learn/school-day", label: "School day" },
    {
      href: "/learn/assessments/digestive-system-check",
      label: "Assessments",
    },
  ],
  teacher: [
    { href: "/teacher", label: "Today" },
    { href: "/teacher/operations", label: "My classes" },
    { href: "/teacher/subjects", label: "My subjects" },
    { href: "/teacher/content", label: "Content library" },
    { href: "/teacher/assessments", label: "Assessments" },
    { href: "/teacher/gradebook", label: "Markbook" },
  ],
};

export function WorkspaceShell({
  activeHref,
  children,
  description,
  eyebrow,
  title,
  user,
  workspace,
}: {
  activeHref: string;
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
  user: AuthenticatedSchoolUser;
  workspace: WorkspaceKind | "applicant";
}) {
  const roleWorkspaces = uniqueWorkspaces(user.availableRoles);

  return (
    <div className={`workspace-shell workspace-${workspace}`}>
      <a className="skip-link" href="#workspace-content">
        Skip to content
      </a>
      <aside className="workspace-sidebar">
        <Link className="workspace-brand" href="/">
          <span aria-hidden="true">LH</span>
          <span>
            <strong>Learners Hub</strong>
            <small>{user.schoolName}</small>
          </span>
        </Link>

        <div className="workspace-context">
          <small>Active workspace</small>
          <strong>
            {workspace === "applicant"
              ? "Admissions"
              : workspaceLabelForRole(user.access.role)}
          </strong>
        </div>

        <nav aria-label={`${title} navigation`}>
          {navigation[workspace].map((item) => (
            <Link
              aria-current={item.href === activeHref ? "page" : undefined}
              className={item.href === activeHref ? "is-active" : undefined}
              href={item.href}
              key={item.href}
            >
              <span aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="workspace-sidebar-footer">
          {roleWorkspaces.length > 1 ? (
            <details className="workspace-switcher">
              <summary>Switch workspace</summary>
              <div>
                {roleWorkspaces.map((role) => (
                  <Link href={workspaceHrefForRole(role)} key={role}>
                    {workspaceLabelForRole(role)}
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
          <div className="workspace-person">
            <span>{initials(user.name)}</span>
            <span>
              <strong>{user.name}</strong>
              <small>{humaniseRole(user.access.role)}</small>
            </span>
          </div>
          <Link
            className="workspace-signout"
            href="/signout-with-chatgpt?return_to=/"
          >
            Sign out
          </Link>
        </div>
      </aside>

      <main className="workspace-main" id="workspace-content">
        <header className="workspace-topbar">
          <Link className="workspace-mobile-brand" href="/">
            LH
          </Link>
          <div>
            <p>{eyebrow}</p>
            <h1>{title}</h1>
            <span>{description}</span>
          </div>
          <div className="workspace-topbar-person">
            <small>{workspaceLabelForRole(user.access.role)}</small>
            <strong>{user.name}</strong>
          </div>
        </header>
        <div className="workspace-content">{children}</div>
      </main>

      <nav className="workspace-mobile-nav" aria-label="Mobile workspace navigation">
        {navigation[workspace].slice(0, 5).map((item) => (
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
