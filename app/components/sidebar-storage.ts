/* ==========================================================================
   The sidebar preference, and the script that restores it

   Split out of sidebar-state.ts, which is a client module: this is read by
   the root layout, and a server component importing a "use client" file to
   get one string pulls a client chunk in behind it.

   The script itself runs before first paint so a returning user never sees
   the sidebar open wide and then snap shut. It is deliberately tiny and
   deliberately wrapped: one localStorage read is cheap enough to do
   synchronously, and a browser in private mode throwing on that read must
   not take the page down with it.
   ========================================================================== */

export const SIDEBAR_STORAGE_KEY = "learners-hub.sidebar-collapsed";

export const restoreSidebarState = `try{if(localStorage.getItem(${JSON.stringify(
  SIDEBAR_STORAGE_KEY,
)})==="true"){document.documentElement.dataset.sidebar="collapsed"}}catch(e){}`;
