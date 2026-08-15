import { describe, expect, it } from "vitest";
import {
  SUBJECT_HUES,
  subjectHue,
} from "../domain/school/subject-hue";

/* ==========================================================================
   A colour per subject

   Derived rather than stored, which buys no migration and costs the guarantee
   a stored column would give. So the properties that replace that guarantee —
   stability, spread across a real Ghanaian subject list — are what is pinned
   here.
   ========================================================================== */

/* The subjects a JHS actually teaches, which is the list this has to spread
   across — not an arbitrary set of strings. */
const GHANAIAN_JHS = [
  "Integrated Science",
  "Mathematics",
  "English Language",
  "Social Studies",
  "Ghanaian Language",
  "Religious and Moral Education",
  "Creative Arts",
  "Computing",
  "Career Technology",
  "French",
];

describe("subjectHue", () => {
  it("always returns one of the six", () => {
    for (const subject of GHANAIAN_JHS) {
      expect(SUBJECT_HUES).toContain(subjectHue(subject));
    }
  });

  it("gives the same subject the same hue every time", () => {
    for (const subject of GHANAIAN_JHS) {
      expect(subjectHue(subject)).toBe(subjectHue(subject));
    }
  });

  /* The point of keying on the name: Mathematics is one colour whether a
     learner meets it in JHS 1 or JHS 3. */
  it("ignores case and surrounding space, so two screens cannot disagree", () => {
    expect(subjectHue("integrated science")).toBe(subjectHue("Integrated Science"));
    expect(subjectHue("  Mathematics  ")).toBe(subjectHue("Mathematics"));
    expect(subjectHue("English  Language")).toBe(subjectHue("English Language"));
  });

  /* Two names sharing a hue is arithmetic, not a fault — six buckets and ten
     subjects guarantee it. What matters is that the spread does not clump,
     which is where a sum of character codes fails: it maps every anagram and
     every same-length name to one bucket, and a school's subject list is full
     of both. Over a realistic spread of names, every hue should get used. */
  it("uses the whole palette across many subject names", () => {
    const names = [
      ...GHANAIAN_JHS,
      "Core Mathematics",
      "Elective Mathematics",
      "Physics",
      "Chemistry",
      "Biology",
      "Economics",
      "Government",
      "Literature in English",
      "Geography",
      "History",
      "Christian Religious Studies",
      "Business Management",
      "Financial Accounting",
      "Agricultural Science",
      "Physical Education",
    ];
    expect(new Set(names.map(subjectHue)).size).toBe(SUBJECT_HUES.length);
  });

  it("uses at least four of the six across a real JHS subject list", () => {
    const used = new Set(GHANAIAN_JHS.map(subjectHue));
    expect(used.size).toBeGreaterThanOrEqual(4);
  });

  it("falls back rather than throwing on an empty name", () => {
    expect(SUBJECT_HUES).toContain(subjectHue(""));
    expect(SUBJECT_HUES).toContain(subjectHue("   "));
  });

  /* Math.imul rather than plain multiplication: the FNV prime overflows into
     a float otherwise, and a long name would drift into NaN. */
  it("stays in range for a very long name", () => {
    expect(SUBJECT_HUES).toContain(subjectHue("Religious and Moral Education".repeat(40)));
  });
});
