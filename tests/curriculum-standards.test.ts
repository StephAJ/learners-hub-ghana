import { describe, expect, it } from "vitest";
import {
  normaliseStandard,
  parseStandardsPaste,
} from "../domain/academic/standards";

/* ==========================================================================
   Curriculum standards

   A real curriculum arrives as a spreadsheet of dozens of lines per subject,
   so the paste is the way most standards will ever enter the product. What is
   covered here is what a school actually pastes: tabs from Excel, commas from
   someone typing, descriptions containing commas, and the two mistakes that
   would otherwise leave an import half done.
   ========================================================================== */

describe("reading one standard", () => {
  it("keeps the code, strand and description it was given", () => {
    expect(
      normaliseStandard({
        code: "B7.1.1.1",
        description: "Describe the structure of the digestive system.",
        strand: "Systems",
        subStrand: "Human body systems",
      }),
    ).toEqual({
      code: "B7.1.1.1",
      description: "Describe the structure of the digestive system.",
      strand: "Systems",
      subStrand: "Human body systems",
    });
  });

  /* Pasted cells arrive with stray spacing and line breaks inside them. */
  it("collapses the whitespace a paste brings with it", () => {
    expect(
      normaliseStandard({
        code: "  B7.1.1.1 ",
        description: "Describe   the\tstructure  of the system.",
        strand: "",
        subStrand: "",
      }),
    ).toEqual({
      code: "B7.1.1.1",
      description: "Describe the structure of the system.",
      strand: "",
      subStrand: "",
    });
  });

  it("refuses a standard with no code or no description", () => {
    expect(() =>
      normaliseStandard({ code: "", description: "Something." }),
    ).toThrow("needs the code");
    expect(() =>
      normaliseStandard({ code: "B7.1", description: "  " }),
    ).toThrow("needs a description");
  });
});

describe("pasting a curriculum", () => {
  it("reads tab-separated cells copied from a spreadsheet", () => {
    const rows = parseStandardsPaste(
      [
        "B7.1.1.1\tSystems\tHuman body systems\tDescribe the digestive system.",
        "B7.1.1.2\tSystems\tHuman body systems\tExplain how nutrients are absorbed.",
      ].join("\n"),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].code).toBe("B7.1.1.1");
    expect(rows[0].strand).toBe("Systems");
    expect(rows[1].description).toBe("Explain how nutrients are absorbed.");
  });

  it("accepts a code and a description on their own", () => {
    const rows = parseStandardsPaste("B7.1.1.1\tDescribe the system.");
    expect(rows).toEqual([
      {
        code: "B7.1.1.1",
        description: "Describe the system.",
        strand: "",
        subStrand: "",
      },
    ]);
  });

  /* Typed by hand rather than pasted. The description is last precisely so
     the commas inside it survive. */
  it("reads commas, and keeps the ones inside a description", () => {
    const rows = parseStandardsPaste(
      "B7.1.1.1, Systems, Human body systems, Describe the mouth, the stomach, and the intestines.",
    );
    expect(rows[0].subStrand).toBe("Human body systems");
    expect(rows[0].description).toBe(
      "Describe the mouth, the stomach, and the intestines.",
    );
  });

  it("ignores blank lines between pasted blocks", () => {
    expect(
      parseStandardsPaste("B7.1\tOne.\n\n  \nB7.2\tTwo.\n"),
    ).toHaveLength(2);
  });

  /* Both of these would otherwise insert the good rows and fail part-way,
     leaving the school to work out what did and did not land. */
  it("refuses the whole paste when a code repeats", () => {
    expect(() =>
      parseStandardsPaste("B7.1\tOne.\nB7.2\tTwo.\nb7.1\tAgain."),
    ).toThrow(/Line 3 repeats the code b7.1, already on line 1/);
  });

  it("names the line it could not read", () => {
    expect(() => parseStandardsPaste("B7.1\tOne.\nB7.2")).toThrow(/Line 2/);
    expect(() => parseStandardsPaste("B7.1\tOne.\n\tMissing code.")).toThrow(
      /Line 2.*needs the code/,
    );
  });

  it("refuses an empty paste", () => {
    expect(() => parseStandardsPaste("   \n\n")).toThrow("at least one");
  });

  /* A tab inside the description would otherwise truncate it silently. */
  it("keeps a description that itself contains a tab", () => {
    const rows = parseStandardsPaste(
      "B7.1\tSystems\tDigestion\tDescribe the system\tand its organs.",
    );
    expect(rows[0].description).toBe("Describe the system and its organs.");
  });
});
