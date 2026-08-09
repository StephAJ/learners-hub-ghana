"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/* ==========================================================================
   Which subject a teacher is looking at

   Five screens are about one subject at a time — the daily classes, the
   lesson library, the content library, the assessments and the markbook —
   and each grew its own switcher holding its own component state. A teacher
   of one subject never noticed. A lower-primary class teacher holding eight
   chose Mathematics on the markbook, opened their lesson library, and was put
   back on whichever subject sorted first: eight screens' worth of re-choosing
   to do one subject's work.

   The selection lives in the address bar instead. That makes it survive
   navigation, the back button, a reload and a shared link, and it means the
   screens agree without any of them knowing about the others.

   replace() rather than push(): a subject is a setting on the screen, not a
   place you travelled to, and pressing Back eight times to leave a markbook
   is not what a teacher means by back.
   ========================================================================== */

export { OFFERING_AWARE_HREFS, withOffering } from "./offering-links";

export function useOfferingParam() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const offeringId = params.get("offeringId") ?? undefined;

  const setOfferingId = useCallback(
    (next: string) => {
      /* Built from the existing query so a screen that later grows a second
         parameter — a tab, a term — does not lose it on every subject
         change. */
      const query = new URLSearchParams(params.toString());
      query.set("offeringId", next);
      router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  return { offeringId, setOfferingId };
}
