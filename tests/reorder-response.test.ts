import { describe, expect, it } from "vitest";
import { normaliseOrder, reorder } from "../app/components/reorder-order";

/* ==========================================================================
   The two pure parts of an ordering answer

   The drag itself needs a browser, but what it computes does not: moving an
   item, and repairing a stored answer against the options the paper holds.
   Both are where an ordering question can quietly mark wrong, so both are
   worth pinning down.
   ========================================================================== */

const OPTIONS = [
  { id: "mouth", label: "Mouth" },
  { id: "stomach", label: "Stomach" },
  { id: "small", label: "Small intestine" },
  { id: "large", label: "Large intestine" },
];

describe("reorder", () => {
  it("moves an item later and closes the gap behind it", () => {
    expect(reorder(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item earlier", () => {
    expect(reorder(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("leaves the list alone when an item is moved onto itself", () => {
    expect(reorder(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });

  it("keeps every item, so a drag can never lose one", () => {
    const before = ["a", "b", "c", "d", "e"];
    for (let from = 0; from < before.length; from += 1) {
      for (let to = 0; to < before.length; to += 1) {
        expect([...reorder(before, from, to)].sort()).toEqual([...before].sort());
      }
    }
  });
});

describe("normaliseOrder", () => {
  it("starts in the paper's own order when nothing is answered yet", () => {
    expect(normaliseOrder(undefined, OPTIONS)).toEqual([
      "mouth",
      "stomach",
      "small",
      "large",
    ]);
  });

  it("keeps the learner's order when it is complete", () => {
    const answer = ["large", "small", "stomach", "mouth"];
    expect(normaliseOrder(answer, OPTIONS)).toEqual(answer);
  });

  it("appends anything the stored answer is missing", () => {
    expect(normaliseOrder(["small"], OPTIONS)).toEqual([
      "small",
      "mouth",
      "stomach",
      "large",
    ]);
  });

  /* The old dropdowns wrote "" for a position nobody had chosen, so a resumed
     attempt from before this change arrives full of them. */
  it("drops the blanks the old select-per-position answer stored", () => {
    expect(normaliseOrder(["", "stomach", "", ""], OPTIONS)).toEqual([
      "stomach",
      "mouth",
      "small",
      "large",
    ]);
  });

  it("drops an option the author has since removed from the question", () => {
    expect(normaliseOrder(["gallbladder", "mouth"], OPTIONS)).toEqual([
      "mouth",
      "stomach",
      "small",
      "large",
    ]);
  });

  /* The dropdowns allowed the same item in two positions. An answer like that
     can still be sitting in an attempt, and it must not produce a list with
     one item twice and another missing. */
  it("keeps a duplicated item once and still shows every option", () => {
    expect(normaliseOrder(["mouth", "mouth", "large"], OPTIONS)).toEqual([
      "mouth",
      "large",
      "stomach",
      "small",
    ]);
  });

  it("survives an answer that is not a list at all", () => {
    for (const value of [null, "mouth", 7, {}]) {
      expect(normaliseOrder(value, OPTIONS)).toHaveLength(OPTIONS.length);
    }
  });
});
