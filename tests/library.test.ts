import { describe, expect, it } from "vitest";
import {
  LIBRARY_CATEGORIES,
  LIBRARY_CATEGORY_LABELS,
  LibraryError,
  cleanLibraryResource,
  isLibraryCategory,
  matchesSearch,
} from "../domain/library/library";

/* ==========================================================================
   Cataloguing a resource

   The listing is what a learner searches and scans, so what it will and will
   not accept decides whether the shelf is usable a term from now.
   ========================================================================== */

const base = { category: "past-paper", description: "", title: "BECE 2024" };

describe("cleanLibraryResource", () => {
  it("keeps a straightforward listing", () => {
    expect(
      cleanLibraryResource({
        category: "past-paper",
        description: "The 2024 paper with the marking scheme.",
        subjectId: "subject-science",
        title: "BECE Integrated Science 2024",
        yearGroup: "JHS 3",
      }),
    ).toEqual({
      category: "past-paper",
      description: "The 2024 paper with the marking scheme.",
      subjectId: "subject-science",
      title: "BECE Integrated Science 2024",
      yearGroup: "JHS 3",
    });
  });

  it("refuses a listing with no title", () => {
    expect(() => cleanLibraryResource({ ...base, title: "   " })).toThrow(
      LibraryError,
    );
  });

  it("refuses a category it does not have a shelf for", () => {
    expect(() =>
      cleanLibraryResource({ ...base, category: "miscellaneous" }),
    ).toThrow(/what kind of resource/i);
  });

  /* Both are filters, not permissions: a dictionary belongs to no subject and
     to every year, and forcing one would file it under whichever offering
     happened to come first. */
  it("allows a resource that belongs to no subject and no year", () => {
    const clean = cleanLibraryResource(base);
    expect(clean.subjectId).toBeUndefined();
    expect(clean.yearGroup).toBeUndefined();
  });

  it("treats a blank subject or year as absent rather than empty", () => {
    const clean = cleanLibraryResource({
      ...base,
      subjectId: "  ",
      yearGroup: "  ",
    });
    expect(clean.subjectId).toBeUndefined();
    expect(clean.yearGroup).toBeUndefined();
  });

  it("collapses the whitespace a paste brings with it", () => {
    expect(
      cleanLibraryResource({
        ...base,
        description: "Two   lines\n\nrun together.",
        title: "  BECE   2024  ",
      }),
    ).toMatchObject({
      description: "Two lines run together.",
      title: "BECE 2024",
    });
  });

  it("refuses a title or description too long to scan", () => {
    expect(() =>
      cleanLibraryResource({ ...base, title: "a".repeat(200) }),
    ).toThrow(/too long/i);
    expect(() =>
      cleanLibraryResource({ ...base, description: "a".repeat(700) }),
    ).toThrow(/too long/i);
  });
});

describe("categories", () => {
  it("has a label for every one", () => {
    for (const category of LIBRARY_CATEGORIES) {
      expect(LIBRARY_CATEGORY_LABELS[category]).toBeTruthy();
    }
  });

  it("recognises its own and nothing else", () => {
    expect(isLibraryCategory("past-paper")).toBe(true);
    expect(isLibraryCategory("homework")).toBe(false);
    expect(isLibraryCategory(undefined)).toBe(false);
  });
});

describe("matchesSearch", () => {
  const resource = {
    description: "Covers fractions and ratio.",
    title: "BECE Mathematics 2024",
    yearGroup: "JHS 3",
  };

  it("matches nothing typed", () => {
    expect(matchesSearch(resource, "")).toBe(true);
    expect(matchesSearch(resource, "   ")).toBe(true);
  });

  it("matches the title", () => {
    expect(matchesSearch(resource, "mathematics")).toBe(true);
  });

  /* A learner searching "2024" means the year on the paper; one searching
     "fractions" means the word in the description. Both have to work. */
  it("matches the description and the year group", () => {
    expect(matchesSearch(resource, "fractions")).toBe(true);
    expect(matchesSearch(resource, "JHS 3")).toBe(true);
  });

  it("ignores case and surrounding space", () => {
    expect(matchesSearch(resource, "  BECE  ")).toBe(true);
  });

  it("does not match something absent", () => {
    expect(matchesSearch(resource, "chemistry")).toBe(false);
  });
});
