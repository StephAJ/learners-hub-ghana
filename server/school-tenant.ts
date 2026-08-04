/* ==========================================================================
   Which school this deployment serves

   One school per deployment today, so this is a constant rather than a lookup
   on the request host. It exists as a named export because five surfaces had
   the same literal written into them, and a value that appears five times is
   a value that eventually appears four times correctly.

   Serving a second school from one deployment means replacing the callers of
   this with a host lookup. Having them all name the same thing is what makes
   that a findable change rather than a search for a string.
   ========================================================================== */

export const SCHOOL_TENANT_ID = "tenant-greenfield";
