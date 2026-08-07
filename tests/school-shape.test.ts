import { describe, expect, it } from "vitest";
import {
  MAX_STREAMS_PER_YEAR_GROUP,
  SCHOOL_STAGES,
  allYearGroups,
  planClasses,
  reconcilePlan,
} from "../domain/academic/school-shape";
import { SchoolStructureError } from "../domain/academic/structure";

const YEAR = "year-2026-27";

describe("planning a school's classes", () => {
  it("names a year group's only class after the year group itself", () => {
    const planned = planClasses({
      academicYearId: YEAR,
      streamCounts: { "JHS 1": 1 },
      streamNaming: "letters",
    });

    expect(planned).toEqual([
      { level: "Junior High", name: "JHS 1", yearGroup: "JHS 1" },
    ]);
  });

  it("splits a year group only when it runs more than one class", () => {
    const planned = planClasses({
      academicYearId: YEAR,
      streamCounts: { "JHS 1": 1, "JHS 2": 3, "JHS 3": 2 },
      streamNaming: "colours",
    });

    expect(planned.map((item) => item.name)).toEqual([
      "JHS 1",
      "JHS 2 Blue",
      "JHS 2 Gold",
      "JHS 2 Green",
      "JHS 3 Blue",
      "JHS 3 Gold",
    ]);
  });

  it("keeps every class of a split year group in the same year group", () => {
    const planned = planClasses({
      academicYearId: YEAR,
      streamCounts: { "JHS 2": 3 },
      streamNaming: "letters",
    });

    expect(planned.map((item) => item.yearGroup)).toEqual([
      "JHS 2",
      "JHS 2",
      "JHS 2",
    ]);
    expect(new Set(planned.map((item) => item.level))).toEqual(
      new Set(["Junior High"]),
    );
  });

  it("offers letters, colours and numbers as the split", () => {
    const counts = { "KG 1": 3 };
    const names = (streamNaming: "letters" | "colours" | "numbers") =>
      planClasses({ academicYearId: YEAR, streamCounts: counts, streamNaming }).map(
        (item) => item.name,
      );

    expect(names("letters")).toEqual(["KG 1 A", "KG 1 B", "KG 1 C"]);
    expect(names("colours")).toEqual(["KG 1 Blue", "KG 1 Gold", "KG 1 Green"]);
    expect(names("numbers")).toEqual(["KG 1 1", "KG 1 2", "KG 1 3"]);
  });

  it("skips a year group the school does not run", () => {
    const planned = planClasses({
      academicYearId: YEAR,
      streamCounts: { "Basic 5": 0, "Basic 6": 0, "KG 1": 1, "KG 2": 1 },
      streamNaming: "letters",
    });

    expect(planned.map((item) => item.name)).toEqual(["KG 1", "KG 2"]);
  });

  it("returns the classes in teaching order whatever order they were given in", () => {
    const planned = planClasses({
      academicYearId: YEAR,
      streamCounts: { "JHS 1": 1, "KG 1": 1, "Basic 1": 1, Creche: 1 },
      streamNaming: "letters",
    });

    expect(planned.map((item) => item.name)).toEqual([
      "Creche",
      "KG 1",
      "Basic 1",
      "JHS 1",
    ]);
  });

  it("refuses a plan with nothing in it", () => {
    expect(() =>
      planClasses({
        academicYearId: YEAR,
        streamCounts: { "JHS 1": 0 },
        streamNaming: "letters",
      }),
    ).toThrow(SchoolStructureError);
  });

  it("refuses a year group the ladder does not have", () => {
    expect(() =>
      planClasses({
        academicYearId: YEAR,
        streamCounts: { "Year 9": 2 },
        streamNaming: "letters",
      }),
    ).toThrow(/not a year group/i);
  });

  it("refuses a split larger than a school could plausibly run", () => {
    expect(() =>
      planClasses({
        academicYearId: YEAR,
        streamCounts: { "JHS 1": MAX_STREAMS_PER_YEAR_GROUP + 1 },
        streamNaming: "letters",
      }),
    ).toThrow(/at most/i);
  });

  it("has a stream label for every split it allows", () => {
    const planned = planClasses({
      academicYearId: YEAR,
      streamCounts: { "JHS 1": MAX_STREAMS_PER_YEAR_GROUP },
      streamNaming: "colours",
    });

    expect(planned).toHaveLength(MAX_STREAMS_PER_YEAR_GROUP);
    expect(planned.every((item) => item.name.split(" ")[2]?.length)).toBe(true);
  });

  it("refuses a plan with no academic year to create into", () => {
    expect(() =>
      planClasses({
        academicYearId: "  ",
        streamCounts: { "JHS 1": 1 },
        streamNaming: "letters",
      }),
    ).toThrow(SchoolStructureError);
  });
});

describe("the year group ladder", () => {
  it("gives every year group exactly one stage", () => {
    const seen = new Set<string>();
    for (const entry of allYearGroups()) {
      expect(seen.has(entry.yearGroup)).toBe(false);
      seen.add(entry.yearGroup);
    }
    expect(seen.size).toBe(
      SCHOOL_STAGES.reduce((total, stage) => total + stage.yearGroups.length, 0),
    );
  });

  /* The whole naming scheme rests on this: a class is "<year group>" or
     "<year group> <stream>", and demoYearGroup() reads the year back off the
     front of the name. A year group whose own label had a space-separated
     third word would make that ambiguous. */
  it("names year groups so a stream suffix stays unambiguous", () => {
    for (const entry of allYearGroups()) {
      expect(entry.yearGroup.split(" ").length).toBeLessThanOrEqual(2);
    }
  });
});

describe("running the plan against classes that already exist", () => {
  it("creates only what is missing", () => {
    const planned = planClasses({
      academicYearId: YEAR,
      streamCounts: { "JHS 2": 3 },
      streamNaming: "colours",
    });

    const { create, skip } = reconcilePlan(planned, ["JHS 2 Blue", "JHS 2 Gold"]);

    expect(create.map((item) => item.name)).toEqual(["JHS 2 Green"]);
    expect(skip.map((item) => item.name)).toEqual(["JHS 2 Blue", "JHS 2 Gold"]);
  });

  it("matches an existing class whatever case it was typed in", () => {
    const planned = planClasses({
      academicYearId: YEAR,
      streamCounts: { "JHS 1": 1 },
      streamNaming: "letters",
    });

    expect(reconcilePlan(planned, ["  jhs 1  "]).create).toEqual([]);
  });
});
