import { describe, expect, it } from "vitest";
import { compose, validate } from "../app/teacher/assessments/question-composer";
import { QUESTION_TYPES } from "../app/teacher/assessments/question-types";
import { evaluateQuestionResponse } from "../domain/assessment/assessment";
import type { AssessmentQuestionSnapshot } from "../domain/assessment/types";

/* ==========================================================================
   The composer's encoding

   The composer produces the flat { options, correctAnswer } shape the API has
   always taken, and db/assessment-repository.ts turns that back into options
   and an answer key. These tests walk the whole round trip — compose, encode
   the way the repository does, then mark a learner response against it — so
   an authored question is proven markable rather than merely well-formed.
   ========================================================================== */

const base = {
  booleanAnswer: "true",
  difficulty: "standard" as const,
  exactAnswer: "",
  formula: "",
  imageAlt: "",
  imageUrl: "",
  marks: 2,
  options: [],
  pairs: [],
  prompt: "Which organ absorbs most nutrients?",
  rationale: "",
  rubric: "",
  sequenceItems: [],
  topic: "Human body systems",
};

function option(label: string, correct = false) {
  return { correct, id: label, label };
}

/* Mirrors toQuestionOptions() and buildAnswerKey() in the repository. Kept
   here rather than imported because the repository module pulls in the
   database client, which these tests deliberately do not touch. */
function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function encodeOptions(options: string[]) {
  return options.map((entry) => {
    const separator = entry.indexOf("::");
    const side = separator === -1 ? "" : entry.slice(0, separator);
    if (side !== "left" && side !== "right") {
      return { id: slugify(entry), label: entry };
    }
    const label = entry.slice(separator + 2).trim();
    return { id: `${side}:${slugify(label)}`, label };
  });
}

function splitList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function encodeAnswerKey(
  type: AssessmentQuestionSnapshot["type"],
  correctAnswer: string,
  options: ReturnType<typeof encodeOptions>,
) {
  if (type === "essay" || type === "file-upload" || type === "composite") {
    return { rubric: correctAnswer.trim() };
  }
  if (type === "true-false") {
    return { value: correctAnswer.trim().toLowerCase() === "true" };
  }
  if (type === "multiple-choice") {
    return {
      value: correctAnswer
        .split(",")
        .map((answer) => slugify(answer))
        .filter((answer) => options.some((item) => item.id === answer)),
    };
  }
  if (type === "numeric") return { value: Number(correctAnswer) };
  if (type === "single-choice") return { value: slugify(correctAnswer) };
  if (type === "ordering") {
    return { value: splitList(correctAnswer).map((label) => slugify(label)) };
  }
  if (type === "matching") {
    return {
      value: Object.fromEntries(
        splitList(correctAnswer)
          .map((pair) => pair.split("::"))
          .filter((parts) => parts.length === 2)
          .map(([left, right]) => [slugify(left), slugify(right)]),
      ),
    };
  }
  return { value: correctAnswer.trim() };
}

/** compose -> repository encoding -> a snapshot the marker can evaluate. */
function authored(input: Parameters<typeof compose>[0]) {
  const question = compose(input);
  const options = encodeOptions(question.options);
  return {
    marked: (value: unknown) =>
      evaluateQuestionResponse(
        {
          answerKey: encodeAnswerKey(question.type, question.correctAnswer, options),
          id: "question-1",
          marks: question.marks,
          options,
          position: 1,
          prompt: question.prompt,
          questionVersion: 1,
          type: question.type,
        },
        { value },
      ),
    options,
    question,
  };
}

describe("authoring a question", () => {
  it("marks the option a single-choice question was authored against", () => {
    const { marked } = authored({
      ...base,
      options: [
        option("Mouth"),
        option("Stomach"),
        option("Small intestine", true),
      ],
      shape: "choice-one",
      type: "single-choice",
    });

    expect(marked("small-intestine").awardedMarks).toBe(2);
    expect(marked("stomach").awardedMarks).toBe(0);
  });

  it("accepts a multiple-choice answer in any order", () => {
    const { marked } = authored({
      ...base,
      options: [
        option("Protein", true),
        option("Vitamins", true),
        option("Water"),
      ],
      shape: "choice-many",
      type: "multiple-choice",
    });

    expect(marked(["vitamins", "protein"]).awardedMarks).toBe(2);
    expect(marked(["protein"]).awardedMarks).toBe(0);
  });

  it("does not present an ordering question already in its answer order", () => {
    const { options, question, marked } = authored({
      ...base,
      sequenceItems: [
        option("Mouth"),
        option("Oesophagus"),
        option("Stomach"),
        option("Small intestine"),
      ],
      shape: "sequence",
      type: "ordering",
    });

    const correct = ["mouth", "oesophagus", "stomach", "small-intestine"];
    expect(marked(correct).awardedMarks).toBe(2);
    /* The stored options are the same items, rearranged. */
    expect(options.map((item) => item.id).sort()).toEqual([...correct].sort());
    expect(options.map((item) => item.id)).not.toEqual(correct);
    expect(question.correctAnswer).toBe(
      "Mouth, Oesophagus, Stomach, Small intestine",
    );
  });

  it("splits a matching question into the two columns the runner expects", () => {
    const { options, marked } = authored({
      ...base,
      pairs: [
        { id: "1", left: "Mouth", right: "Chewing" },
        { id: "2", left: "Stomach", right: "Churning" },
        { id: "3", left: "Small intestine", right: "Absorbing" },
      ],
      shape: "pairs",
      type: "matching",
    });

    expect(options.filter((item) => item.id.startsWith("left:"))).toHaveLength(3);
    expect(options.filter((item) => item.id.startsWith("right:"))).toHaveLength(3);

    /* Answered in a different order from the one it was authored in. */
    expect(
      marked({
        stomach: "churning",
        "small-intestine": "absorbing",
        mouth: "chewing",
      }).awardedMarks,
    ).toBe(2);
    expect(
      marked({ mouth: "churning", stomach: "chewing" }).awardedMarks,
    ).toBe(0);
  });

  it("marks true/false and numeric answers", () => {
    const trueFalse = authored({
      ...base,
      booleanAnswer: "false",
      shape: "boolean",
      type: "true-false",
    });
    expect(trueFalse.marked(false).awardedMarks).toBe(2);
    expect(trueFalse.marked(true).awardedMarks).toBe(0);

    const numeric = authored({
      ...base,
      exactAnswer: "32",
      shape: "exact",
      type: "numeric",
    });
    expect(numeric.marked(32).awardedMarks).toBe(2);
    expect(numeric.marked(30).awardedMarks).toBe(0);
  });

  it("sends an essay to the teacher rather than marking it", () => {
    const { marked, question } = authored({
      ...base,
      rubric: "Names villi and a rich blood supply.",
      shape: "rubric",
      type: "essay",
    });

    expect(question.correctAnswer).toBe("Names villi and a rich blood supply.");
    expect(marked("Villi increase surface area.").markingStatus).toBe(
      "needs-marking",
    );
  });
});

describe("refusing to save an unmarkable question", () => {
  it("requires a prompt, a topic, and a marked answer", () => {
    expect(
      validate(compose({ ...base, prompt: "", shape: "rubric", type: "essay" }), "rubric"),
    ).toMatch(/write the question/i);

    expect(
      validate(
        compose({ ...base, shape: "rubric", topic: "", type: "essay" }),
        "rubric",
      ),
    ).toMatch(/topic/i);

    /* Options written, but none of them marked correct — the case that
       previously saved and then scored every attempt zero. */
    expect(
      validate(
        compose({
          ...base,
          options: [option("Mouth"), option("Stomach")],
          shape: "choice-one",
          type: "single-choice",
        }),
        "choice-one",
      ),
    ).toMatch(/mark which option/i);
  });

  it("requires enough items for ordering and matching", () => {
    expect(
      validate(
        compose({
          ...base,
          sequenceItems: [option("Mouth")],
          shape: "sequence",
          type: "ordering",
        }),
        "sequence",
      ),
    ).toMatch(/at least two items/i);

    expect(
      validate(
        compose({
          ...base,
          pairs: [{ id: "1", left: "Mouth", right: "" }],
          shape: "pairs",
          type: "matching",
        }),
        "pairs",
      ),
    ).toMatch(/at least two pairs/i);
  });

  it("requires a number from a numeric question", () => {
    expect(
      validate(
        compose({ ...base, exactAnswer: "about ten", shape: "exact", type: "numeric" }),
        "exact",
      ),
    ).toMatch(/number/i);
  });

  it("passes a fully authored question", () => {
    expect(
      validate(
        compose({
          ...base,
          options: [option("Mouth"), option("Small intestine", true)],
          shape: "choice-one",
          type: "single-choice",
        }),
        "choice-one",
      ),
    ).toBeUndefined();
  });
});

describe("the type catalogue", () => {
  it("gives every question type an answer shape", () => {
    /* A type missing from here would render the composer's default editor and
       silently author the wrong answer key. */
    const types: AssessmentQuestionSnapshot["type"][] = [
      "single-choice",
      "multiple-choice",
      "true-false",
      "short-text",
      "numeric",
      "matching",
      "ordering",
      "essay",
      "file-upload",
      "hotspot",
      "composite",
    ];
    for (const type of types) {
      expect(QUESTION_TYPES[type]?.answerShape).toBeTruthy();
    }
  });
});
