/* ==========================================================================
   A colour per subject

   globals.css has carried six hue pairs — teal, blue, violet, amber, rose,
   lime — each a soft ground with an ink that reads on it. Almost nothing used
   them, so the learner's side of the product was one green from the subject
   list to the last question of a paper, and every subject looked like every
   other one.

   A hue is derived rather than stored. That means no column, no migration, no
   setting for a headteacher to fill in before their school looks right, and
   the same colour on every device without a fetch. The trade is that a school
   cannot choose "Mathematics is blue" — worth it for now, and a stored
   override can be added later without changing anything that reads this.

   Keyed on the subject's name, not its offering id, so a subject keeps its
   colour across classes: Mathematics is the same hue in JHS 1 as in JHS 3,
   which is the whole point for a learner who navigates by colour before they
   read fluently.
   ========================================================================== */

export const SUBJECT_HUES = [
  "teal",
  "blue",
  "violet",
  "amber",
  "rose",
  "lime",
] as const;

export type SubjectHue = (typeof SUBJECT_HUES)[number];

/**
 * The hue for a subject, stable for a given name.
 *
 * FNV-1a rather than summing character codes: a sum gives anagrams and
 * same-length names the same bucket, and a school's subject list is full of
 * near-identical strings ("Social Studies", "Creative Arts"). Case and spacing
 * are normalised so "Integrated Science" and "integrated science" cannot drift
 * apart between two screens that spell it differently.
 */
export function subjectHue(subjectName: string): SubjectHue {
  const key = subjectName.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return SUBJECT_HUES[0];

  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    /* The FNV prime, by shift-and-add. Math.imul keeps it in 32 bits, which
       plain multiplication would overflow into a float. */
    hash = Math.imul(hash, 0x01000193);
  }

  return SUBJECT_HUES[Math.abs(hash) % SUBJECT_HUES.length];
}
