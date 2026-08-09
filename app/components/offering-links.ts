/* ==========================================================================
   Carrying the chosen subject between screens

   Five teacher screens are about one subject at a time — the daily classes,
   the lesson library, the content library, the assessments and the markbook.
   The chosen subject travels between them in the query string, so the links
   that lead there have to carry it.

   Pure, and deliberately not marked "use client": the sidebar and the mobile
   nav both need it, and so does anything server-rendered that later wants to
   link into a subject.
   ========================================================================== */

export const OFFERING_AWARE_HREFS = new Set([
  "/teacher/assessments",
  "/teacher/content",
  "/teacher/gradebook",
  "/teacher/operations",
  "/teacher/subjects",
]);

/**
 * A nav link with the current subject attached, where that means something.
 *
 * Today and Messages are left alone rather than carrying a query string that
 * claims a scope the page does not have — a URL should describe its page.
 * The cost is that a detour through one of them drops the selection, which is
 * the honest trade: those are destinations, not part of working in a subject.
 */
export function withOffering(href: string, offeringId?: string): string {
  if (!offeringId || !OFFERING_AWARE_HREFS.has(href)) return href;
  return `${href}?offeringId=${encodeURIComponent(offeringId)}`;
}
