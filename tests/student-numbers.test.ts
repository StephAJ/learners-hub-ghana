import { describe, expect, it } from "vitest";
import { allocateStudentNumber } from "../db/people-repository";

/* ==========================================================================
   Student numbers

   There was no column for these. Both the register and the report card
   computed one from a three-way map of demo person ids and returned
   "LH-260145" for everybody else, so in a real school every learner but two
   carried the same number on the document the school issues to a family.

   The generator is what stands between that and a number per learner, so
   what is covered here is the sequence: that it continues rather than
   restarts, and that a school's own numbering cannot derail it.
   ========================================================================== */

/** Stands in for the transaction client, returning one MAX row. */
function clientReturning(highest: number | string | null) {
  return {
    query: async () => ({ rows: [{ highest: highest as number }] }),
  };
}

const year = String(new Date().getFullYear()).slice(-2);

describe("allocating a student number", () => {
  it("starts at one for a school with no learners", async () => {
    expect(await allocateStudentNumber(clientReturning(0), "t")).toBe(
      `LH-${year}0001`,
    );
  });

  it("continues the sequence rather than restarting it", async () => {
    expect(await allocateStudentNumber(clientReturning(41), "t")).toBe(
      `LH-${year}0042`,
    );
  });

  /* A school of more than 9999 learners is not the target, but the number
     must stay unique rather than wrap or truncate. */
  it("keeps going past the padded width", async () => {
    expect(await allocateStudentNumber(clientReturning(9999), "t")).toBe(
      `LH-${year}10000`,
    );
  });

  /* COALESCE returns 0 for an empty table; the driver hands numerics back as
     strings, which would otherwise concatenate instead of add. */
  it("treats a numeric string from the driver as a number", async () => {
    expect(await allocateStudentNumber(clientReturning("7"), "t")).toBe(
      `LH-${year}0008`,
    );
  });

  it("survives a school whose table has no generated numbers at all", async () => {
    expect(await allocateStudentNumber(clientReturning(null), "t")).toBe(
      `LH-${year}0001`,
    );
  });
});
