import { describe, expect, it } from "vitest";
import {
  groupOptions,
  itemOptions,
  itemsIn,
  normalisePlacements,
  placeItem,
  removeItem,
  unplaced,
} from "../app/components/group-sort";

/* ==========================================================================
   Sorting into groups

   The shape is the same map matching stores, which is why marking needed no
   new comparator. The constraint is not the same, and that difference is what
   most of this pins down: a group holds many items, so placing one thing must
   never displace another.
   ========================================================================== */

const OPTIONS = [
  { id: "left:kenkey", label: "Kenkey" },
  { id: "left:tilapia", label: "Grilled tilapia" },
  { id: "left:groundnuts", label: "Groundnuts" },
  { id: "left:yam", label: "Yam" },
  { id: "right:carbohydrate", label: "Carbohydrate" },
  { id: "right:protein", label: "Protein" },
  { id: "right:fat", label: "Fat" },
];

describe("splitting items from groups", () => {
  it("reads four items and three groups", () => {
    expect(itemOptions(OPTIONS)).toHaveLength(4);
    expect(groupOptions(OPTIONS).map((g) => g.label)).toEqual([
      "Carbohydrate",
      "Protein",
      "Fat",
    ]);
  });
});

describe("placeItem", () => {
  it("puts an item in a group", () => {
    expect(placeItem({}, "kenkey", "carbohydrate")).toEqual({
      kenkey: "carbohydrate",
    });
  });

  it("moves an item that was already somewhere else", () => {
    expect(placeItem({ kenkey: "protein" }, "kenkey", "carbohydrate")).toEqual({
      kenkey: "carbohydrate",
    });
  });

  /* The difference from matching, and the reason this has its own module: a
     group is not claimed by one item, so nothing is ever evicted. A learner
     cannot lose work by placing things in an unlucky order. */
  it("never displaces another item already in that group", () => {
    const before = { kenkey: "carbohydrate", tilapia: "protein" };
    expect(placeItem(before, "yam", "carbohydrate")).toEqual({
      kenkey: "carbohydrate",
      tilapia: "protein",
      yam: "carbohydrate",
    });
  });

  it("lets every item share one group", () => {
    let placed: Record<string, string> = {};
    for (const item of ["kenkey", "tilapia", "groundnuts", "yam"]) {
      placed = placeItem(placed, item, "carbohydrate");
    }
    expect(Object.keys(placed)).toHaveLength(4);
  });
});

describe("removeItem", () => {
  it("takes one item back and leaves the rest", () => {
    expect(
      removeItem({ kenkey: "carbohydrate", tilapia: "protein" }, "kenkey"),
    ).toEqual({ tilapia: "protein" });
  });
});

describe("itemsIn and unplaced", () => {
  const placed = { kenkey: "carbohydrate", yam: "carbohydrate" };

  it("lists a group's items in the question's own order", () => {
    expect(itemsIn(placed, "carbohydrate", OPTIONS).map((o) => o.label)).toEqual(
      ["Kenkey", "Yam"],
    );
  });

  it("returns nothing for an empty group", () => {
    expect(itemsIn(placed, "fat", OPTIONS)).toEqual([]);
  });

  it("leaves the rest in the tray", () => {
    expect(unplaced(placed, OPTIONS).map((o) => o.label)).toEqual([
      "Grilled tilapia",
      "Groundnuts",
    ]);
  });

  it("empties the tray once everything is placed", () => {
    const all = {
      groundnuts: "fat",
      kenkey: "carbohydrate",
      tilapia: "protein",
      yam: "carbohydrate",
    };
    expect(unplaced(all, OPTIONS)).toEqual([]);
  });
});

describe("normalisePlacements", () => {
  it("keeps a valid answer", () => {
    const answer = { kenkey: "carbohydrate", tilapia: "protein" };
    expect(normalisePlacements(answer, OPTIONS)).toEqual(answer);
  });

  it("drops an item the author has removed", () => {
    expect(normalisePlacements({ waakye: "carbohydrate" }, OPTIONS)).toEqual({});
  });

  /* An author renaming a group between a learner starting and resuming. */
  it("drops a group the author has renamed away", () => {
    expect(normalisePlacements({ kenkey: "starch" }, OPTIONS)).toEqual({});
  });

  it("drops a blank placement rather than storing it as an answer", () => {
    expect(
      normalisePlacements({ kenkey: "carbohydrate", yam: "" }, OPTIONS),
    ).toEqual({ kenkey: "carbohydrate" });
  });

  it("survives an answer that is not an object", () => {
    for (const value of [null, undefined, "kenkey", 7, ["a"]]) {
      expect(normalisePlacements(value, OPTIONS)).toEqual({});
    }
  });
});
