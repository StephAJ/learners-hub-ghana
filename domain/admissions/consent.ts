/* ==========================================================================
   What an applicant actually agreed to

   The declaration used to be a sentence in the form's markup, naming
   Greenfield Academy whichever school was taking the application, and nothing
   about it was stored. So the record of consent was a timestamp against text
   nobody had kept — and the moment the wording changed, every earlier
   timestamp silently referred to a sentence that no longer existed.

   The text lives here, versioned, and both the screen that shows it and the
   repository that stores it read it from this one function. They cannot drift,
   which is the whole property that makes the stored copy worth anything.

   Bump CONSENT_VERSION whenever the wording changes. Applications keep the
   version and the exact sentence they were submitted under; nothing rewrites
   an agreement that has already been given.
   ========================================================================== */

export const CONSENT_VERSION = "2026-08-1";

export function admissionsConsentStatement(schoolName: string): string {
  const school = schoolName.trim() || "the school";
  return (
    `The information in this application is true to the best of my knowledge, ` +
    `and I agree that ${school} may use it to assess this application and to ` +
    `contact me about it.`
  );
}
