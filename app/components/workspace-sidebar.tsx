"use client";

import Link from "next/link";
import { BrandMark } from "./brand-mark";
import { useSyncExternalStore, type ReactNode } from "react";
import {
  BooksIcon,
  CalendarIcon,
  ChartIcon,
  ChevronLeftIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  HomeIcon,
  InboxIcon,
  MessagesIcon,
  LayersIcon,
  PanelCollapseIcon,
  SchoolIcon,
  SignOutIcon,
  UsersIcon,
} from "./icons";
import {
  getSidebarCollapsed,
  getSidebarCollapsedOnServer,
  setSidebarCollapsed,
  subscribeToSidebar,
} from "./sidebar-state";
import { PersonAvatar } from "./person-avatar";
import { SignOutButton } from "./sign-out-button";

/* ==========================================================================
   Workspace sidebar

   Client-side because collapsing is a preference the person sets and expects
   to still be set tomorrow. The choice is written to localStorage and read
   back before first paint by an inline script in the shell, so a returning
   user does not watch the sidebar snap shut after the page loads.

   Collapsed, it keeps its icons and its meaning: labels move to tooltips and
   accessible names rather than disappearing.
   ========================================================================== */

export type SidebarNavItem = {
  /** Unread items behind this link. Omitted or 0 renders no badge. */
  badge?: number;
  href: string;
  icon: string;
  label: string;
};

const icons: Record<string, (props: { size?: number }) => ReactNode> = {
  academics: LayersIcon,
  admissions: InboxIcon,
  assessments: ClipboardCheckIcon,
  classes: UsersIcon,
  content: FileTextIcon,
  home: HomeIcon,
  markbook: ChartIcon,
  messages: MessagesIcon,
  school: SchoolIcon,
  schoolDay: CalendarIcon,
  subjects: BooksIcon,
};

export function WorkspaceSidebar({
  activeHref,
  contextLabel,
  items,
  personName,
  personPhotoUrl,
  personRole,
  schoolName,
  switcher,
  title,
}: {
  activeHref: string;
  contextLabel: string;
  items: SidebarNavItem[];
  personName: string;
  personPhotoUrl?: string | null;
  personRole: string;
  schoolName: string;
  switcher: Array<{ href: string; label: string }>;
  title: string;
}) {
  const collapsed = useSyncExternalStore(
    subscribeToSidebar,
    getSidebarCollapsed,
    getSidebarCollapsedOnServer,
  );

  return (
    <aside className="workspace-sidebar">
      <div className="workspace-sidebar-head">
        <Link className="workspace-brand" href="/" title="Learners Hub">
          <BrandMark className="workspace-brand-mark" size={36} />
          <span className="workspace-brand-name">
            <strong>Learners Hub</strong>
            <small>{schoolName}</small>
          </span>
        </Link>
        <button
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="workspace-collapse"
          aria-expanded={!collapsed}
          onClick={() => setSidebarCollapsed(!collapsed)}
          type="button"
        >
          {collapsed ? <PanelCollapseIcon size={18} /> : <ChevronLeftIcon size={18} />}
        </button>
      </div>

      <p className="workspace-context">{contextLabel}</p>

      <nav aria-label={`${title} navigation`}>
        {items.map((item) => {
          const IconComponent = icons[item.icon] ?? HomeIcon;
          const isActive = item.href === activeHref;
          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={isActive ? "is-active" : undefined}
              href={item.href}
              key={item.href}
              title={item.label}
            >
              <span className="workspace-nav-icon" aria-hidden="true">
                <IconComponent size={20} />
                {/* Repeated on the icon so the count survives the collapsed
                    rail, where the label is not rendered at all. */}
                {item.badge ? <i className="workspace-nav-pip" /> : null}
              </span>
              <span className="workspace-nav-label">{item.label}</span>
              {item.badge ? (
                <span
                  aria-label={`${item.badge} unread`}
                  className="workspace-nav-badge"
                  role="status"
                >
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="workspace-sidebar-footer">
        {switcher.length > 1 ? (
          <details className="workspace-switcher">
            <summary title="Switch hub">
              <span className="workspace-nav-icon" aria-hidden="true">
                <LayersIcon size={20} />
              </span>
              <span className="workspace-nav-label">Switch hub</span>
            </summary>
            <div>
              {switcher.map((option) => (
                <Link href={option.href} key={option.href}>
                  {option.label}
                </Link>
              ))}
            </div>
          </details>
        ) : null}

        <div className="workspace-person" title={`${personName} · ${personRole}`}>
          <PersonAvatar
            className="workspace-avatar"
            name={personName}
            photoUrl={personPhotoUrl}
            size={36}
          />
          <span className="workspace-nav-label">
            <strong>{personName}</strong>
            <small>{personRole}</small>
          </span>
        </div>

        <SignOutButton className="workspace-signout">
          <span className="workspace-nav-icon" aria-hidden="true">
            <SignOutIcon size={18} />
          </span>
          <span className="workspace-nav-label">Sign out</span>
        </SignOutButton>
      </div>
    </aside>
  );
}
