"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/* ==========================================================================
   Which tab a screen is on

   Tabs held in component state cannot be linked to. "Take attendance" on the
   teacher's Today screen pointed at /teacher/operations, which always opened
   on Today — so the one action named after a tab was the one that would not
   take you to it.

   Put in the query string for the same reasons the chosen subject is (see
   offering-param.ts): it survives the back button, it can be linked to from
   elsewhere in the product, and a teacher who reloads stays where they were.

   replace() rather than push(), so a teacher who looked at three tabs does
   not need three presses of Back to leave the screen.
   ========================================================================== */

export function useTabParam<Tab extends string>(
  tabs: readonly Tab[],
  fallback: Tab,
): { setTab: (tab: Tab) => void; tab: Tab } {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const requested = params.get("tab");
  /* An unknown tab — a stale link, a typo — opens the screen's own default
     rather than a blank panel. */
  const tab = tabs.includes(requested as Tab) ? (requested as Tab) : fallback;

  const setTab = useCallback(
    (next: Tab) => {
      /* Built from the existing query so changing tab does not drop the
         subject the screen is showing. */
      const query = new URLSearchParams(params.toString());
      query.set("tab", next);
      router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  return { setTab, tab };
}
