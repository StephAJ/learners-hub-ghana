/* ==========================================================================
   The library

   A catalogue of the things a school hands out: past papers, textbooks,
   worksheets, reading. Deliberately separate from lesson resources, which
   belong to one lesson in one subject and are reached by working through it.
   A learner looking for last year's paper the week before an examination is
   browsing a shelf, not following a lesson, and the two want different
   screens.

   The categories are the ones a Ghanaian basic school actually keeps, in the
   order a learner is likely to want them — past papers first, because that is
   what most of the traffic is for the fortnight before an examination.
   ========================================================================== */

export class LibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryError";
  }
}

export const LIBRARY_CATEGORIES = [
  "past-paper",
  "textbook",
  "worksheet",
  "reading",
  "reference",
] as const;

export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number];

export const LIBRARY_CATEGORY_LABELS: Record<LibraryCategory, string> = {
  "past-paper": "Past papers",
  reading: "Reading",
  reference: "Reference",
  textbook: "Textbooks",
  worksheet: "Worksheets",
};

export function isLibraryCategory(value: unknown): value is LibraryCategory {
  return LIBRARY_CATEGORIES.includes(value as LibraryCategory);
}

export type LibraryResourceInput = {
  category: string;
  description: string;
  /** Optional: a resource with no subject is a school-wide one. */
  subjectId?: string;
  title: string;
  /** Optional: a resource with no year group is for anybody. */
  yearGroup?: string;
};

export type CleanLibraryResource = {
  category: LibraryCategory;
  description: string;
  subjectId?: string;
  title: string;
  yearGroup?: string;
};

const TITLE_MAXIMUM = 160;
const DESCRIPTION_MAXIMUM = 600;

/**
 * What a listing needs before it is worth putting on a shelf.
 *
 * A title and a category, and nothing else required. The subject and the year
 * group are filters rather than permissions — a school-wide dictionary belongs
 * to no subject, and forcing one would file it under whichever offering
 * happened to be first in the list.
 *
 * The description is optional but capped: this is a catalogue entry a learner
 * scans, not the resource itself, and a paragraph that runs past the card is
 * a paragraph nobody reads.
 */
export function cleanLibraryResource(
  input: LibraryResourceInput,
): CleanLibraryResource {
  const title = collapse(input.title);
  if (!title) {
    throw new LibraryError("Give the resource a title learners will recognise.");
  }
  if (title.length > TITLE_MAXIMUM) {
    throw new LibraryError(
      `That title is too long. Keep it under ${TITLE_MAXIMUM} characters.`,
    );
  }
  if (!isLibraryCategory(input.category)) {
    throw new LibraryError("Choose what kind of resource this is.");
  }

  const description = collapse(input.description);
  if (description.length > DESCRIPTION_MAXIMUM) {
    throw new LibraryError(
      `That description is too long. Keep it under ${DESCRIPTION_MAXIMUM} characters.`,
    );
  }

  return {
    category: input.category,
    description,
    subjectId: input.subjectId?.trim() || undefined,
    title,
    yearGroup: collapse(input.yearGroup ?? "") || undefined,
  };
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Whether a search term matches a listing.
 *
 * Title, description and year group together, because a learner searching
 * "2024" means the year printed on a past paper and a learner searching
 * "fractions" means the word in the description. Case and spacing are
 * normalised so neither has to be typed exactly.
 */
export function matchesSearch(
  resource: { description: string; title: string; yearGroup?: string },
  search: string,
): boolean {
  const term = collapse(search).toLowerCase();
  if (!term) return true;
  return [resource.title, resource.description, resource.yearGroup ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(term);
}
