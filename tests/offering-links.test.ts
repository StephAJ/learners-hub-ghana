import { describe, expect, it } from "vitest";
import {
  OFFERING_AWARE_HREFS,
  withOffering,
} from "../app/components/offering-links";

/* ==========================================================================
   Carrying the chosen subject between screens

   The behaviour under test is the one a lower-primary class teacher holding
   eight subjects notices: choosing Mathematics once and still being in
   Mathematics after opening the markbook, rather than being put back on
   whichever subject sorts first on every screen.
   ========================================================================== */

describe("carrying a subject between teacher screens", () => {
  it("attaches the subject to the screens that are about one", () => {
    for (const href of OFFERING_AWARE_HREFS) {
      expect(withOffering(href, "offering-maths-jhs2")).toBe(
        `${href}?offeringId=offering-maths-jhs2`,
      );
    }
  });

  it("covers every screen that has a subject switcher", () => {
    expect([...OFFERING_AWARE_HREFS].sort()).toEqual([
      "/teacher/assessments",
      "/teacher/content",
      "/teacher/gradebook",
      "/teacher/operations",
      "/teacher/subjects",
    ]);
  });

  /* A URL should describe its page. Today and Messages are not about a
     subject, so claiming they are would be a lie in the address bar. */
  it("leaves screens that are not about a subject alone", () => {
    for (const href of ["/teacher", "/teacher/messages", "/admin/reports"]) {
      expect(withOffering(href, "offering-maths-jhs2")).toBe(href);
    }
  });

  it("leaves every link alone before a subject has been chosen", () => {
    for (const href of OFFERING_AWARE_HREFS) {
      expect(withOffering(href, undefined)).toBe(href);
      expect(withOffering(href, "")).toBe(href);
    }
  });

  /* Offering ids are generated, but the query string is built from them
     rather than escaped by the browser, so this is the gate. */
  it("escapes an id that would otherwise break the query string", () => {
    expect(withOffering("/teacher/subjects", "a&b=c d")).toBe(
      "/teacher/subjects?offeringId=a%26b%3Dc%20d",
    );
  });
});
