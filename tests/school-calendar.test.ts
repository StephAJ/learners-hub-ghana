import { describe, expect, it } from "vitest";
import {
  isSchoolDay,
  recentSchoolDays,
  schoolDate,
  schoolWeekday,
} from "../domain/operations/school-calendar";

/* ==========================================================================
   The school's own day

   db/operations-repository.ts pinned this to "2026-07-24" and weekday 5, so
   every register, timetable and school day in the product was Friday 24 July
   2026 forever. What is covered here is the part that has to be right on a
   day nobody is testing on: the rollover, the weekend, and the run of school
   days the register seeds against.
   ========================================================================== */

const at = (iso: string) => new Date(iso);

describe("today at the school", () => {
  it("answers in the school's own zone", () => {
    expect(schoolDate(at("2026-07-24T09:00:00Z"))).toBe("2026-07-24");
  });

  /* Accra is GMT+0, so a server in UTC agrees — but the date must come from
     the zone rather than from toISOString(), or a school behind GMT would
     read tomorrow's register through its own evening. */
  it("does not roll over before the school's midnight", () => {
    expect(schoolDate(at("2026-07-24T23:59:00Z"))).toBe("2026-07-24");
    expect(schoolDate(at("2026-07-25T00:01:00Z"))).toBe("2026-07-25");
  });

  it("numbers weekdays the way the timetable does", () => {
    /* The seeded timetable holds weekdays 1 to 5, and the frozen constant it
       replaces was 5 for this Friday. */
    expect(schoolWeekday(at("2026-07-24T09:00:00Z"))).toBe(5);
    expect(schoolWeekday(at("2026-07-20T09:00:00Z"))).toBe(1);
    expect(schoolWeekday(at("2026-07-26T09:00:00Z"))).toBe(0);
  });

  it("knows when the school is shut", () => {
    expect(isSchoolDay(at("2026-07-24T09:00:00Z"))).toBe(true);
    expect(isSchoolDay(at("2026-07-25T09:00:00Z"))).toBe(false);
    expect(isSchoolDay(at("2026-07-26T09:00:00Z"))).toBe(false);
  });
});

describe("the recent run of school days", () => {
  it("ends with today and reaches back over the weekend", () => {
    /* Monday 20 July: the three days before it are the previous week's
       Wednesday, Thursday and Friday, not Saturday and Sunday. */
    expect(recentSchoolDays(4, at("2026-07-20T09:00:00Z"))).toEqual([
      "2026-07-15",
      "2026-07-16",
      "2026-07-17",
      "2026-07-20",
    ]);
  });

  it("reproduces the run the seed used to hardcode", () => {
    expect(recentSchoolDays(4, at("2026-07-24T09:00:00Z"))).toEqual([
      "2026-07-21",
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
    ]);
  });

  /* There is no register for a day the school was shut, so a weekend ends on
     the Friday just gone rather than inventing a Saturday session. */
  it("ends on the last school day when the school is shut", () => {
    expect(recentSchoolDays(2, at("2026-07-26T09:00:00Z"))).toEqual([
      "2026-07-23",
      "2026-07-24",
    ]);
  });

  it("returns them oldest first", () => {
    const days = recentSchoolDays(5, at("2026-07-24T09:00:00Z"));
    expect(days).toEqual([...days].sort());
  });
});
