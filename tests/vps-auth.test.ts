import { describe, expect, it } from "vitest";
import { safeReturnPath } from "../server/return-path";
import { resolveRequestPath } from "../server/request-path";

/* ==========================================================================
   Coming back to the page you asked for

   A layout cannot learn which page was requested, so every workspace layout
   guarded its section with a hardcoded fallback — and because a layout
   renders above the page it wraps, that fallback is what reached the sign-in
   screen. Following a link to a lesson while signed out landed you on the
   workspace root, with the query string gone.

   proxy.ts now puts the real path on a header. These cover what happens to
   that header on the way back out.
   ========================================================================== */

describe("returning to the requested page", () => {
  it("prefers the page actually asked for over the section root", () => {
    expect(
      resolveRequestPath("/teacher/subjects?offeringId=maths", "/teacher"),
    ).toBe("/teacher/subjects?offeringId=maths");
  });

  /* A route the proxy's matcher does not cover has no header, and the
     section root is a better answer than the site root. */
  it("falls back when the proxy did not run", () => {
    expect(resolveRequestPath(null, "/teacher")).toBe("/teacher");
    expect(resolveRequestPath(undefined, "/teacher")).toBe("/teacher");
    expect(resolveRequestPath("", "/teacher")).toBe("/teacher");
  });

  /* The proxy overwrites anything a client sends, so these cannot arrive in
     practice. Checked anyway: this is the first of the two gates, and the
     cost of being wrong is sending someone to another origin after they sign
     in to this one. */
  it("discards anything that is not a local path", () => {
    expect(resolveRequestPath("https://attacker.example", "/teacher")).toBe(
      "/teacher",
    );
    expect(resolveRequestPath("//attacker.example", "/teacher")).toBe(
      "/teacher",
    );
    expect(resolveRequestPath("javascript:alert(1)", "/teacher")).toBe(
      "/teacher",
    );
  });

  /* The two gates in sequence, which is how a real request meets them. A
     reserved destination gets past the first — it is a local path — and the
     second sends it to the site root rather than back to the sign-in screen
     it came from. The property being kept here is that no return path can
     close a loop, not that the fallback wins. */
  it("cannot send someone back to the sign-in screen", () => {
    expect(safeReturnPath(resolveRequestPath("/sign-in", "/teacher"))).toBe("/");
  });
});

describe("VPS authentication return paths", () => {
  it("keeps local application paths", () => {
    expect(safeReturnPath("/admissions/apply?step=guardian")).toBe(
      "/admissions/apply?step=guardian",
    );
  });

  it("rejects absolute and protocol-relative redirects", () => {
    expect(safeReturnPath("https://attacker.example")).toBe("/");
    expect(safeReturnPath("//attacker.example")).toBe("/");
  });

  it("rejects authentication endpoints as return destinations", () => {
    expect(safeReturnPath("/sign-in")).toBe("/");
    expect(safeReturnPath("/api/auth/sign-out")).toBe("/");
  });
});
