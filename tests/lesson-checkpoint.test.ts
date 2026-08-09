import { describe, expect, it } from "vitest";
import { checkpointQuestionIds } from "../db/lesson-checkpoint-repository";
import { evaluateQuestionResponse } from "../domain/assessment/assessment";
import type { AssessmentQuestionSnapshot } from "../domain/assessment/types";

/* ==========================================================================
   Lesson checkpoints

   The block these replace asked one hardcoded question about the small
   intestine in every subject, and compared the answer to a string literal in
   the player. What matters now is that a checkpoint is marked by the same
   code a paper is, and that the answer key never has a route to the client.
   ========================================================================== */

function question(
  overrides: Partial<AssessmentQuestionSnapshot> = {},
): AssessmentQuestionSnapshot {
  return {
    answerKey: { value: "option-b" },
    id: "question-1",
    marks: 2,
    options: [
      { id: "option-a", label: "Stomach" },
      { id: "option-b", label: "Small intestine" },
    ],
    position: 1,
    prompt: "Where are most nutrients absorbed?",
    questionVersion: 1,
    type: "single-choice",
    ...overrides,
  };
}

describe("checkpoint block configuration", () => {
  it("reads the question ids a teacher chose, in order", () => {
    expect(
      checkpointQuestionIds(
        JSON.stringify({ questionIds: ["q-3", "q-1", "q-2"] }),
      ),
    ).toEqual(["q-3", "q-1", "q-2"]);
  });

  it("treats a block with no questions as empty rather than failing", () => {
    expect(checkpointQuestionIds("{}")).toEqual([]);
    expect(checkpointQuestionIds("not json at all")).toEqual([]);
    expect(checkpointQuestionIds(JSON.stringify({ questionIds: {} }))).toEqual(
      [],
    );
  });

  it("drops anything in the list that is not a question id", () => {
    expect(
      checkpointQuestionIds(
        JSON.stringify({ questionIds: ["q-1", "", null, 7, "q-2"] }),
      ),
    ).toEqual(["q-1", "q-2"]);
  });

  it("ignores an H5P block's configuration", () => {
    expect(
      checkpointQuestionIds(
        JSON.stringify({ activityId: "activity-1", provider: "h5p" }),
      ),
    ).toEqual([]);
  });
});

describe("checkpoint marking", () => {
  it("awards the question's marks for a correct answer", () => {
    const result = evaluateQuestionResponse(question(), {
      value: "option-b",
    });
    expect(result.awardedMarks).toBe(2);
    expect(result.markingStatus).toBe("auto-marked");
  });

  it("awards nothing for a wrong answer", () => {
    const result = evaluateQuestionResponse(question(), {
      value: "option-a",
    });
    expect(result.awardedMarks).toBe(0);
    expect(result.markingStatus).toBe("auto-marked");
  });

  /* A learner who moves past a checkpoint without answering is marked, as a
     zero. Leaving the question out of the result would let the player report
     three of four correct and call the checkpoint passed. */
  it("marks a skipped question rather than omitting it", () => {
    const result = evaluateQuestionResponse(question(), { value: null });
    expect(result.awardedMarks).toBe(0);
    expect(result.questionId).toBe("question-1");
  });

  it("sends written answers to the teacher instead of guessing", () => {
    const result = evaluateQuestionResponse(
      question({ answerKey: { rubric: "Two marks per named organ." }, type: "essay" }),
      { value: "The small intestine has villi." },
    );
    expect(result.markingStatus).toBe("needs-marking");
    expect(result.awardedMarks).toBe(0);
  });

  /* The checkpoint and the paper share this: a matching answer is a set of
     pairs, so the order the learner worked the dropdowns cannot change the
     mark. */
  it("marks a matching answer independently of the order it was built", () => {
    const matching = question({
      answerKey: { value: { mouth: "chewing", stomach: "churning" } },
      type: "matching",
    });
    expect(
      evaluateQuestionResponse(matching, {
        value: { stomach: "churning", mouth: "chewing" },
      }).awardedMarks,
    ).toBe(2);
  });

  it("keeps ordering answers order-sensitive", () => {
    const ordering = question({
      answerKey: { value: ["mouth", "stomach", "intestine"] },
      type: "ordering",
    });
    expect(
      evaluateQuestionResponse(ordering, {
        value: ["stomach", "mouth", "intestine"],
      }).awardedMarks,
    ).toBe(0);
  });
});
