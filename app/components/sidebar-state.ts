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

export const SIDEBAR_STORAGE_KEY = "learners-hub.sidebar-collapsed";

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
