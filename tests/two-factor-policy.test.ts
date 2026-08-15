import { afterEach, describe, expect, it } from "vitest";
import {
  twoFactorEnforced,
  twoFactorExpectedFor,
  twoFactorStanding,
} from "../server/two-factor-policy";

/* ==========================================================================
   Who has to have two-factor on

   The non-functional requirements make MFA mandatory for platform and school
   administrators, and the auth config had no plugin at all — a password was
   the whole of the protection on an account that can read every child's
   record in the school.

   The rule these tests pin is the grace period. Enforcing on a deployment
   whose administrators have not yet enrolled locks the school out of itself,
   and there is no support desk behind this product to let them back in — so
   the default is to ask, and enforcement is a switch the school throws once
   its people are set up.
   ========================================================================== */

afterEach(() => {
  delete process.env.TWO_FACTOR_ENFORCED;
});

describe("which roles the school protects", () => {
  it("expects it of the two administrative roles", () => {
    expect(twoFactorExpectedFor("school-admin")).toBe(true);
    expect(twoFactorExpectedFor("academic-admin")).toBe(true);
  });

  it("does not demand it of everybody", () => {
    /* "Strongly recommended or configurable for teachers" — so the screen is
       open to them and the requirement is not. */
    for (const role of [
      "teacher",
      "class-teacher",
      "guardian",
      "learner",
      "admissions-officer",
    ] as const) {
      expect(twoFactorExpectedFor(role)).toBe(false);
    }
  });
});

describe("before a school switches enforcement on", () => {
  it("is off by default", () => {
    expect(twoFactorEnforced()).toBe(false);
  });

  it("asks an administrator rather than stopping them", () => {
    expect(
      twoFactorStanding({ enabled: false, role: "school-admin" }),
    ).toEqual({ state: "asked" });
  });

  it("says nothing to a teacher", () => {
    expect(twoFactorStanding({ enabled: false, role: "teacher" })).toEqual({
      state: "not-expected",
    });
  });
});

describe("once a school switches it on", () => {
  it("stops an administrator who has not enrolled", () => {
    process.env.TWO_FACTOR_ENFORCED = "true";

    expect(
      twoFactorStanding({ enabled: false, role: "academic-admin" }),
    ).toEqual({ state: "required" });
  });

  it("still says nothing to a teacher", () => {
    process.env.TWO_FACTOR_ENFORCED = "true";

    expect(twoFactorStanding({ enabled: false, role: "teacher" })).toEqual({
      state: "not-expected",
    });
  });

  it("lets an enrolled administrator through", () => {
    process.env.TWO_FACTOR_ENFORCED = "true";

    expect(
      twoFactorStanding({ enabled: true, role: "school-admin" }),
    ).toEqual({ state: "satisfied" });
  });
});
