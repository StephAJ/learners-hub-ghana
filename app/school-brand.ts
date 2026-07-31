import type { CSSProperties } from "react";
import type { SchoolBrand } from "../domain/identity/types";

/* ==========================================================================
   Per-school brand

   Every school enrolled on Learners Hub gets one colour, and that colour has
   to hold across every surface a person can reach: the student's Today page,
   the teacher's markbook, the guardian's reports, the lesson player. A learner
   and their teacher are looking at the same school, so they see the same
   school.

   A tenant therefore owns exactly two values. Everything else in the ramp —
   hover states, tinted panels, borders, text on the dark ground — is derived
   in CSS with color-mix() from these two, so a school cannot end up with a
   half-applied palette. See the brand block in app/globals.css.
   ========================================================================== */

export type { SchoolBrand };

/** Greenfield Academy's colours, and the fallback for any school without a
 *  brand of its own. Matches the defaults in globals.css. */
export const defaultSchoolBrand: SchoolBrand = {
  brand: "#0d5f55",
  brandDeep: "#123f3a",
};

/**
 * Custom properties to spread onto a shell element, re-skinning everything
 * inside it.
 *
 * Returns an empty object for the default brand so the common case ships no
 * inline style at all and the stylesheet stays authoritative.
 *
 * Once schools carry their own colours in the tenant record, read them in the
 * server component that renders the shell and pass them straight through:
 *
 *   <div style={schoolBrandStyle(user.brand)}>
 */
export function schoolBrandStyle(
  brand?: Partial<SchoolBrand> | null,
): CSSProperties {
  const resolved = resolveSchoolBrand(brand);
  if (
    resolved.brand === defaultSchoolBrand.brand &&
    resolved.brandDeep === defaultSchoolBrand.brandDeep
  ) {
    return {};
  }
  return {
    "--brand": resolved.brand,
    "--brand-deep": resolved.brandDeep,
  } as CSSProperties;
}

/** Fills in the default for anything missing or not a plain hex colour. */
export function resolveSchoolBrand(
  brand?: Partial<SchoolBrand> | null,
): SchoolBrand {
  return {
    brand: hexOrDefault(brand?.brand, defaultSchoolBrand.brand),
    brandDeep: hexOrDefault(brand?.brandDeep, defaultSchoolBrand.brandDeep),
  };
}

/* Brand colours reach the DOM as inline custom properties, so a stored value
   is only ever allowed through if it is a literal hex colour. Anything else
   falls back rather than being interpolated into the style attribute. */
function hexOrDefault(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const candidate = value.trim().toLowerCase();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(candidate)
    ? candidate
    : fallback;
}
