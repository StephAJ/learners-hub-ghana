"use client";

/* ==========================================================================
   Sidebar collapse state

   The collapsed flag lives on <html data-sidebar>, not in React. An inline
   script in the shell sets it from localStorage before first paint, so a
   returning user never sees the sidebar open wide and then snap shut.

   That makes it external state, and React subscribes to it through
   useSyncExternalStore rather than mirroring it in an effect — which would
   render once with the wrong value and then correct itself.
   ========================================================================== */

export { SIDEBAR_STORAGE_KEY } from "./sidebar-storage";
import { SIDEBAR_STORAGE_KEY } from "./sidebar-storage";

const listeners = new Set<() => void>();

export function subscribeToSidebar(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSidebarCollapsed(): boolean {
  return document.documentElement.dataset.sidebar === "collapsed";
}

/** The server has no DOM and no stored preference, so it renders expanded. */
export function getSidebarCollapsedOnServer(): boolean {
  return false;
}

export function setSidebarCollapsed(collapsed: boolean): void {
  document.documentElement.dataset.sidebar = collapsed
    ? "collapsed"
    : "expanded";
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  } catch {
    /* Private browsing, or a full quota. The sidebar still collapses for this
       visit; it just will not be remembered. */
  }
  for (const listener of listeners) listener();
}

/* --------------------------------------------------------------------------
   Focus mode

   The lesson player wants the room, so it collapses the sidebar on the way in
   and restores it on the way out. "Restores" has to mean *what the learner had*
   — if they had already collapsed it themselves, leaving a lesson should not
   spring it open. So the auto-collapse records whether it was the one that
   changed anything, and only undoes its own work.
   -------------------------------------------------------------------------- */

const FOCUS_FLAG = "learnersHubFocusCollapsed";

export function beginFocusMode(): void {
  if (getSidebarCollapsed()) return;
  document.documentElement.dataset[FOCUS_FLAG] = "true";
  setSidebarCollapsed(true);
}

export function endFocusMode(): void {
  if (document.documentElement.dataset[FOCUS_FLAG] !== "true") return;
  delete document.documentElement.dataset[FOCUS_FLAG];
  setSidebarCollapsed(false);
}
