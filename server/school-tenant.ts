/* ==========================================================================
   Which school this deployment serves

   One school per deployment today, so this is configuration rather than a
   lookup on the request host. It exists as a named export because the id had
   been written out as a literal in nine places, and a value that appears nine
   times is a value that eventually appears eight times correctly.

   The id used to be the constant `tenant-greenfield`, which is also the demo
   school's id. That made every real deployment a deployment of the demo: the
   administrator created on first boot joined the tenant the Greenfield seed
   owns, and shared a directory with its cast.

   It defaults to that same value so an existing box keeps its rows, and is
   overridable so a new one does not have to inherit the demo's name for its
   own school. SCHOOL_NAME is what the tenant row is created with; a school
   renames itself afterwards on /admin/school, and that edit wins — the boot
   insert never overwrites a name already there.

   Serving a second school from one deployment means replacing the callers of
   SCHOOL_TENANT_ID with a host lookup. Having them all name the same thing is
   what makes that a findable change rather than a search for a string.
   ========================================================================== */

/** The demo school's own id, and the historical default for every install. */
export const DEMO_TENANT_ID = "tenant-greenfield";

export const SCHOOL_TENANT_ID =
  process.env.SCHOOL_TENANT_ID?.trim() || DEMO_TENANT_ID;

/** The name the demo school goes by, on a box that carries it. */
export const DEMO_SCHOOL_NAME = "Greenfield Academy";

/**
 * What a brand-new tenant row is named.
 *
 * Only read when the row does not exist yet. A school that has renamed itself
 * on /admin/school keeps its name across every subsequent boot.
 *
 * @param demo Whether this deployment carries the demo school, in which case
 * the demo's own name is the honest one for a tenant holding its cast.
 */
export function initialSchoolName(demo: boolean): string {
  const configured = process.env.SCHOOL_NAME?.trim();
  if (configured) return configured;
  return demo ? DEMO_SCHOOL_NAME : "Your School";
}

/** URL-safe form of the school name, for the tenant row's slug column. */
export function schoolSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "school";
}
