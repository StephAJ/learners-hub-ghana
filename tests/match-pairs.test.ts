import { describe, expect, it } from "vitest";
import {
  leftOptions,
  linkPair,
  normaliseMatches,
  ownerOf,
  pairNumber,
  rightOptions,
  stripSide,
  unlink,
} from "../app/components/match-pairs";

/* ==========================================================================
   Joining two columns

   The stored shape is the same object the dropdowns wrote, so these tests are
   as much about not breaking marking as about the new interaction.
   ========================================================================== */

const OPTIONS = [
  { id: "left:stomach", label: "Stomach" },
  { id: "left:liver", label: "Liver" },
  { id: "left:small", label: "Small intestine" },
  { id: "right:acid", label: "Churns food with acid" },
  { id: "right:bile", label: "Makes bile" },
  { id: "right:absorb", label: "Absorbs nutrients" },
];

describe("splitting the two columns", () => {
  it("keeps the author's order within each side", () => {
    expect(leftOptions(OPTIONS).map((o) => o.label)).toEqual([
      "Stomach",
      "Liver",
      "Small intestine",
    ]);
    expect(rightOptions(OPTIONS)).toHaveLength(3);
  });

  it("strips the side prefix, which is not part of the stored answer", () => {
    expect(stripSide("left:stomach")).toBe("stomach");
    expect(stripSide("right:bile")).toBe("bile");
    /* Only the leading prefix: a key that happens to contain the word must
       survive intact, or the answer stops matching the key. */
    expect(stripSide("left:left-ventricle")).toBe("left-ventricle");
  });
});

describe("linkPair", () => {
  it("joins a left item to a right one", () => {
    expect(linkPair({}, "stomach", "acid")).toEqual({ stomach: "acid" });
  });

  it("replaces what a left item was joined to", () => {
    expect(linkPair({ stomach: "bile" }, "stomach", "acid")).toEqual({
      stomach: "acid",
    });
  });

  /* The dropdowns let two rows choose the same match, which no matching
     question ever means — the second claim moves it rather than duplicating. */
  it("takes a right item away from whoever held it", () => {
    const before = { liver: "bile", stomach: "acid" };
    expect(linkPair(before, "small", "bile")).toEqual({
      small: "bile",
      stomach: "acid",
    });
  });

  it("never leaves one right item claimed twice", () => {
    let matches: Record<string, string> = {};
    for (const left of ["stomach", "liver", "small"]) {
      matches = linkPair(matches, left, "bile");
    }
    expect(Object.values(matches)).toEqual(["bile"]);
  });
});

describe("unlink and ownerOf", () => {
  it("breaks one pair and leaves the rest", () => {
    expect(unlink({ liver: "bile", stomach: "acid" }, "stomach")).toEqual({
      liver: "bile",
    });
  });

  it("finds which left item holds a right one", () => {
    expect(ownerOf({ liver: "bile" }, "bile")).toBe("liver");
    expect(ownerOf({ liver: "bile" }, "acid")).toBeUndefined();
  });
});

describe("pairNumber", () => {
  /* Numbered by the author's left-hand order, so a badge does not move as the
     learner works. */
  it("numbers by the question's order, not the order joined", () => {
    expect(pairNumber("stomach", OPTIONS)).toBe(1);
    expect(pairNumber("liver", OPTIONS)).toBe(2);
    expect(pairNumber("small", OPTIONS)).toBe(3);
  });
});

describe("normaliseMatches", () => {
  it("keeps a complete answer", () => {
    const answer = { liver: "bile", stomach: "acid" };
    expect(normaliseMatches(answer, OPTIONS)).toEqual(answer);
  });

  it("drops a left item the author has removed", () => {
    expect(normaliseMatches({ gallbladder: "bile" }, OPTIONS)).toEqual({});
  });

  it("drops a match the author has removed", () => {
    expect(normaliseMatches({ stomach: "enzymes" }, OPTIONS)).toEqual({});
  });

  /* The dropdowns wrote "" for a row nobody had answered. */
  it("drops the blanks the old dropdowns stored", () => {
    expect(normaliseMatches({ liver: "bile", stomach: "" }, OPTIONS)).toEqual({
      liver: "bile",
    });
  });

  it("keeps a duplicated match once", () => {
    const repaired = normaliseMatches(
      { liver: "bile", small: "bile" },
      OPTIONS,
    );
    expect(Object.values(repaired)).toEqual(["bile"]);
  });

  it("survives an answer that is not an object", () => {
    for (const value of [null, undefined, "stomach", 7, ["a"]]) {
      expect(normaliseMatches(value, OPTIONS)).toEqual({});
    }
  });
});
