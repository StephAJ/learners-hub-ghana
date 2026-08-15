import { describe, expect, it } from "vitest";
import {
  SECURE_MINIMUM_ATTEMPTS,
  SECURE_THRESHOLD,
  masteryState,
  masteryWording,
} from "../domain/learning/mastery";

/* ==========================================================================
   When a learner can be said to be able to do something

   The rule is a judgement about a child's report, so it is worth being
   explicit about what it will and will not claim.
   ========================================================================== */

const nothing = { attempted: 0, correct: 0, lessonsDone: 0 };

describe("masteryState", () => {
  it("says nothing has happened when nothing has", () => {
    expect(masteryState(nothing)).toBe("not-started");
  });

  /* The distinction the whole module exists for: having been taught something
     is not the same as being able to do it. */
  it("separates having met an outcome from being able to do it", () => {
    expect(masteryState({ ...nothing, lessonsDone: 3 })).toBe("taught");
    expect(masteryWording("taught")).toBe("Covered in class, not tested yet");
  });

  it("never calls an outcome secure on lessons alone", () => {
    expect(masteryState({ attempted: 0, correct: 0, lessonsDone: 40 })).not.toBe(
      "secure",
    );
  });

  /* One right answer on a four-option question is a one-in-four guess. */
  it("refuses to call one correct answer mastery", () => {
    expect(masteryState({ attempted: 1, correct: 1, lessonsDone: 2 })).toBe(
      "learning",
    );
  });

  it("calls it secure once enough whole questions have gone right", () => {
    expect(masteryState({ attempted: 2, correct: 2, lessonsDone: 1 })).toBe(
      "secure",
    );
    expect(masteryState({ attempted: 5, correct: 4, lessonsDone: 1 })).toBe(
      "secure",
    );
  });

  it("drops back to learning when the share falls below the threshold", () => {
    expect(masteryState({ attempted: 5, correct: 3, lessonsDone: 1 })).toBe(
      "learning",
    );
  });

  it("does not call a run of wrong answers anything but learning", () => {
    expect(masteryState({ attempted: 6, correct: 0, lessonsDone: 4 })).toBe(
      "learning",
    );
  });

  it("uses the thresholds it publishes", () => {
    const attempted = SECURE_MINIMUM_ATTEMPTS;
    const justEnough = Math.ceil(attempted * SECURE_THRESHOLD);
    expect(
      masteryState({ attempted, correct: justEnough, lessonsDone: 0 }),
    ).toBe("secure");
    expect(
      masteryState({ attempted, correct: justEnough - 1, lessonsDone: 0 }),
    ).toBe("learning");
  });

  it("has wording for every state", () => {
    for (const state of ["not-started", "taught", "learning", "secure"] as const) {
      expect(masteryWording(state).length).toBeGreaterThan(0);
    }
  });
});
