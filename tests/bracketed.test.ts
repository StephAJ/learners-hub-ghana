import { describe, expect, it } from "vitest";
import {
  bracketedAnswers,
  parseBracketed,
  parseTableRows,
  tableBlanks,
  withoutBrackets,
} from "../domain/assessment/bracketed";

/* ==========================================================================
   Answers written in brackets

   One authoring convention behind two question types, so it is worth being
   sure it survives what a teacher will actually type — punctuation against a
   bracket, an empty pair, a stray one.
   ========================================================================== */

describe("parseBracketed", () => {
  it("splits a passage into its text and its gaps", () => {
    expect(
      parseBracketed("Digestion begins in the [mouth] and ends there."),
    ).toEqual([
      { kind: "text", text: "Digestion begins in the " },
      { answer: "mouth", index: 0, kind: "gap" },
      { kind: "text", text: " and ends there." },
    ]);
  });

  it("numbers gaps in reading order", () => {
    const gaps = parseBracketed("[a] then [b] then [c]").filter(
      (segment) => segment.kind === "gap",
    );
    expect(gaps.map((gap) => "index" in gap && gap.index)).toEqual([0, 1, 2]);
  });

  it("keeps punctuation sitting against a gap", () => {
    expect(
      parseBracketed("It ends in the [large intestine]."),
    ).toContainEqual({ kind: "text", text: "." });
  });

  it("returns the whole thing as text when there are no gaps", () => {
    expect(parseBracketed("Nothing here.")).toEqual([
      { kind: "text", text: "Nothing here." },
    ]);
  });

  it("handles a passage that is nothing but a gap", () => {
    expect(parseBracketed("[mouth]")).toEqual([
      { answer: "mouth", index: 0, kind: "gap" },
    ]);
  });
});

describe("bracketedAnswers", () => {
  it("reads the answers in order", () => {
    expect(bracketedAnswers("[mouth] then the [stomach]")).toEqual([
      "mouth",
      "stomach",
    ]);
  });

  it("trims what the author typed", () => {
    expect(bracketedAnswers("the [ small intestine ]")).toEqual([
      "small intestine",
    ]);
  });

  /* An empty pair is a typo, not a gap with a blank answer — treating it as
     the latter would create a gap nothing can fill. */
  it("drops an empty bracket pair", () => {
    expect(bracketedAnswers("a [] b [mouth]")).toEqual(["mouth"]);
  });

  it("ignores an unclosed bracket rather than swallowing the rest", () => {
    expect(bracketedAnswers("a [mouth] b [stomach")).toEqual(["mouth"]);
  });
});

describe("withoutBrackets", () => {
  it("reads as prose with the answers in place", () => {
    expect(withoutBrackets("Begins in the [mouth].")).toBe(
      "Begins in the mouth.",
    );
  });
});

describe("parseTableRows", () => {
  it("splits rows and cells", () => {
    expect(
      parseTableRows("Country | Capital\nGhana | [Accra]\n"),
    ).toEqual([
      ["Country", "Capital"],
      ["Ghana", "[Accra]"],
    ]);
  });

  it("ignores blank lines between rows", () => {
    expect(parseTableRows("a | b\n\n\nc | d")).toHaveLength(2);
  });
});

describe("tableBlanks", () => {
  const rows = parseTableRows(
    [
      "Country | Capital | Currency",
      "Ghana | [Accra] | Cedi",
      "Nigeria | [Abuja] | [Naira]",
    ].join("\n"),
  );

  it("finds every blank cell, keyed by row and column", () => {
    expect(tableBlanks(rows)).toEqual([
      { answer: "Accra", column: 1, key: "1:1", row: 1 },
      { answer: "Abuja", column: 1, key: "2:1", row: 2 },
      { answer: "Naira", column: 2, key: "2:2", row: 2 },
    ]);
  });

  /* A header is the question, not part of the answer. */
  it("refuses a blank in the header row", () => {
    const headed = parseTableRows("Country | [Capital]\nGhana | Accra");
    expect(tableBlanks(headed)).toEqual([]);
  });

  it("finds nothing in a table with no brackets", () => {
    expect(tableBlanks(parseTableRows("a | b\nc | d"))).toEqual([]);
  });
});
