import type { SchoolRole } from "../domain/identity/types";

/* ==========================================================================
   Who has to have two-factor on

   The non-functional requirements make MFA mandatory for platform and school
   administrators, "strongly recommended or configurable for teachers". So the
   rule is about roles, and roles are the application's business rather than
   the auth library's — better-auth knows about users, not about who runs a
   school.

   Two dials rather than one hard-coded rule. A school being onboarded needs a
   grace period in which the requirement is stated and not yet enforced,
   because the alternative is an administrator locked out of the product on the
   morning they were meant to start setting it up. TWO_FACTOR_ENFORCED=true is
   what a school turns on once its administrators have enrolled.
   ========================================================================== */

/** Roles the product asks to protect with a second factor. */
const REQUIRED_ROLES: SchoolRole[] = ["school-admin", "academic-admin"];

export function twoFactorExpectedFor(role: SchoolRole): boolean {
  return REQUIRED_ROLES.includes(role);
}

/**
 * Whether a missing second factor should stop somebody, or only ask them.
 *
 * Off by default. Enforcing on a deployment whose administrators have not yet
 * enrolled locks the school out of itself, and there is no support desk behind
 * this product to let them back in.
 */
export function twoFactorEnforced(): boolean {
  return process.env.TWO_FACTOR_ENFORCED?.trim().toLowerCase() === "true";
}

export type TwoFactorStanding =
  | { state: "not-expected" }
  | { state: "satisfied" }
  /* Expected, not enrolled, and not yet being enforced: say so, loudly, and
     let them work. */
  | { state: "asked" }
  /* Expected, not enrolled, and enforced: they set it up before going on. */
  | { state: "required" };

export function twoFactorStanding(input: {
  enabled: boolean;
  role: SchoolRole;
}): TwoFactorStanding {
  if (!twoFactorExpectedFor(input.role)) return { state: "not-expected" };
  if (input.enabled) return { state: "satisfied" };
  return { state: twoFactorEnforced() ? "required" : "asked" };
}
