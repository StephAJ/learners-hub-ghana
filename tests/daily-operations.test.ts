import { describe, expect, it } from "vitest";
import {
  assertSubmittableWork,
  changeTimetableEntry,
  correctAttendance,
  findTimetableClashes,
  preparePublishedAssignment,
  releaseRubricMark,
  scoreRubric,
  shouldCreateGuardianAlert,
  submitAttendanceRegister,
  summarizeAttendance,
} from "../domain/operations/daily-operations";
import type {
  AttendanceRecord,
  RubricCriterion,
  RubricScore,
  TimetableEntry,
} from "../domain/operations/types";

const criteria: RubricCriterion[] = [
  { id: "accuracy", maximumPoints: 12, name: "Scientific accuracy" },
  { id: "communication", maximumPoints: 8, name: "Communication" },
];

describe("daily school operations", () => {
  it("calculates an explainable rubric total", () => {
    const result = scoreRubric(criteria, scores(11, 7));

    expect(result).toEqual({
      earnedPoints: 18,
      maximumPoints: 20,
      percentage: 90,
    });
  });

  it("publishes only coherent assignment and rubric snapshots", () => {
    expect(() =>
      preparePublishedAssignment(
        {
          brief: "Build and label a model.",
          dueAt: "2026-07-28T16:00:00Z",
          maximumPoints: 25,
          opensAt: "2026-07-24T08:00:00Z",
          title: "Body systems model",
        },
        criteria,
      ),
    ).toThrow("maximum");

    expect(
      preparePublishedAssignment(
        {
          brief: "Build and label a model.",
          dueAt: "2026-07-28T16:00:00Z",
          maximumPoints: 20,
          opensAt: "2026-07-24T08:00:00Z",
          title: "Body systems model",
        },
        criteria,
      ).status,
    ).toBe("published");
  });

  it("requires every rubric criterion before releasing marks", () => {
    expect(() =>
      releaseRubricMark(criteria, [scores(11, 7)[0]], "2026-07-24"),
    ).toThrow("criterion");

    expect(
      releaseRubricMark(criteria, scores(11, 7), "2026-07-24").status,
    ).toBe("released");
    expect(() =>
      releaseRubricMark(
        criteria,
        [
          ...scores(11, 7),
          { criterionId: "unknown", points: 1 },
        ],
        "2026-07-24",
      ),
    ).toThrow("criterion");
  });

  it("summarizes attendance using explicit present and excused rules", () => {
    const summary = summarizeAttendance([
      attendance("learner-1", "present"),
      attendance("learner-2", "late"),
      attendance("learner-3", "absent"),
      attendance("learner-4", "excused"),
      attendance("learner-5", "school-activity"),
    ]);

    expect(summary).toEqual({
      absent: 1,
      excused: 1,
      late: 1,
      percentage: 75,
      presentEquivalent: 3,
      totalCounted: 4,
    });
  });

  it("requires a reason and preserves attendance correction evidence", () => {
    const original = attendance("learner-1", "absent");
    expect(() => correctAttendance(original, "sick", " ")).toThrow("reason");

    const correction = correctAttendance(
      original,
      "sick",
      "Guardian supplied clinic note",
    );
    expect(correction.previousCode).toBe("absent");
    expect(correction.record.code).toBe("sick");
  });

  it("blocks register submission until every rostered learner is recorded", () => {
    expect(() =>
      submitAttendanceRegister(
        ["learner-1", "learner-2"],
        [attendance("learner-1", "present")],
        "2026-07-24T08:20:00Z",
      ),
    ).toThrow("learner");
  });

  it("creates alerts only for submitted unexcused absences", () => {
    const absent = attendance("learner-1", "absent");
    expect(shouldCreateGuardianAlert("draft", absent)).toBe(false);
    expect(shouldCreateGuardianAlert("submitted", absent)).toBe(true);
    expect(
      shouldCreateGuardianAlert(
        "submitted",
        attendance("learner-1", "excused"),
      ),
    ).toBe(false);
  });

  it("detects active class, teacher, and room timetable clashes", () => {
    const existing = timetable("science", "class-a", "teacher-a", "Lab 1");
    const proposed = {
      ...timetable("maths", "class-b", "teacher-a", "Room 4"),
      startMinute: 500,
      endMinute: 560,
    };

    expect(findTimetableClashes(proposed, [existing])).toEqual([
      { entryId: "science", resource: "teacher" },
    ]);
    expect(
      findTimetableClashes(
        { ...proposed, status: "cancelled" },
        [existing],
      ),
    ).toEqual([]);
  });

  it("requires evidence for timetable cancellation and substitution", () => {
    const entry = timetable(
      "science",
      "class-a",
      "teacher-a",
      "Lab 1",
    );
    expect(() =>
      changeTimetableEntry(entry, "cancelled", "", undefined),
    ).toThrow("reason");
    expect(() =>
      changeTimetableEntry(entry, "substituted", "Teacher away", undefined),
    ).toThrow("substitute");
    expect(
      changeTimetableEntry(
        entry,
        "substituted",
        "Teacher attending training",
        "teacher-b",
      ).status,
    ).toBe("substituted");
  });
});

function scores(accuracy: number, communication: number): RubricScore[] {
  return [
    { criterionId: "accuracy", points: accuracy },
    { criterionId: "communication", points: communication },
  ];
}

function attendance(
  learnerPersonId: string,
  code: AttendanceRecord["code"],
): AttendanceRecord {
  return { code, learnerPersonId };
}

function timetable(
  id: string,
  classGroupId: string,
  teacherPersonId: string,
  room: string,
): TimetableEntry {
  return {
    classGroupId,
    endMinute: 540,
    id,
    room,
    startMinute: 480,
    status: "scheduled",
    teacherPersonId,
    weekday: 4,
  };
}

describe("assertSubmittableWork", () => {
  it("accepts an attached file", () => {
    expect(() =>
      assertSubmittableWork({ attachmentCount: 1, responseText: "" }),
    ).not.toThrow();
  });

  /* The rule used to accept either a file or a written answer, and the text
     box was what a learner met first — so an assignment that asked for a
     labelled model could be handed in as one typed sentence. The work is the
     submission; a note beside it is still stored but is no longer a
     substitute for it. */
  it("refuses a written answer standing in for the work", () => {
    expect(() =>
      assertSubmittableWork({
        attachmentCount: 0,
        responseText: "The small intestine absorbs most nutrients.",
      }),
    ).toThrow(/attach your work/i);
  });

  it("rejects an empty submission", () => {
    expect(() =>
      assertSubmittableWork({ attachmentCount: 0, responseText: "" }),
    ).toThrow(/attach your work/i);
  });

  it("still accepts a note alongside the file", () => {
    expect(() =>
      assertSubmittableWork({
        attachmentCount: 2,
        responseText: "Page 2 is the diagram.",
      }),
    ).not.toThrow();
  });
});
