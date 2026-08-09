import { describe, expect, it } from "vitest";
import type { AccessContext } from "../domain/identity/types";
import {
  addAssessmentQuestion,
  createAssessmentDraft,
  evaluateQuestionResponse,
  markConstructedResponse,
  publishAssessment,
  startAssessmentAttempt,
  submitAssessmentAttempt,
} from "../domain/assessment/assessment";
import type {
  AssessmentQuestionSnapshot,
} from "../domain/assessment/types";

const teacher: AccessContext = {
  actorPersonId: "teacher-1",
  classGroupIds: ["class-jhs2-gold"],
  classLearnerIds: [],
  linkedLearnerIds: [],
  membershipStatus: "active",
  role: "teacher",
  subjectOfferingIds: ["offering-science-jhs2"],
  tenantId: "tenant-greenfield",
};

describe("assessment lifecycle", () => {
  it("publishes an assigned quiz as an immutable version", () => {
    const published = publishAssessment(
      teacher,
      addAssessmentQuestion(createDraft(), singleChoiceQuestion()),
      "2026-07-23T10:00:00Z",
    );

    expect(published.status).toBe("published");
    expect(published.version).toBe(1);
    expect(published.questions[0].questionVersion).toBe(2);
  });

  it("rejects publication without questions", () => {
    expect(() =>
      publishAssessment(teacher, createDraft(), "2026-07-23T10:00:00Z"),
    ).toThrow("at least one question");
  });

  it("prevents publishing outside a teacher assignment", () => {
    const draft = {
      ...addAssessmentQuestion(createDraft(), singleChoiceQuestion()),
      offeringId: "offering-mathematics-jhs2",
    };

    expect(() =>
      publishAssessment(teacher, draft, "2026-07-23T10:00:00Z"),
    ).toThrow("not assigned");
  });

  it("auto-marks objective, matching, and ordering responses", () => {
    expect(
      evaluateQuestionResponse(singleChoiceQuestion(), {
        value: "small-intestine",
      }),
    ).toMatchObject({ awardedMarks: 1, markingStatus: "auto-marked" });

    expect(
      evaluateQuestionResponse(matchingQuestion(), {
        value: { mouth: "chewing", stomach: "churning" },
      }),
    ).toMatchObject({ awardedMarks: 2, markingStatus: "auto-marked" });

    expect(
      evaluateQuestionResponse(orderingQuestion(), {
        value: ["mouth", "oesophagus", "stomach"],
      }),
    ).toMatchObject({ awardedMarks: 2, markingStatus: "auto-marked" });
  });

  it("marks a matching answer on its pairs, not the order they were made", () => {
    /* The runner builds this object as the learner works the dropdowns, so its
       key order is whatever order they happened to answer in. Comparing the
       serialised object directly failed a fully correct answer whenever that
       differed from the author's — the common case with more than one pair. */
    expect(
      evaluateQuestionResponse(matchingQuestion(), {
        value: { stomach: "churning", mouth: "chewing" },
      }),
    ).toMatchObject({ awardedMarks: 2, markingStatus: "auto-marked" });

    /* Still wrong when a pair is actually wrong. */
    expect(
      evaluateQuestionResponse(matchingQuestion(), {
        value: { stomach: "chewing", mouth: "churning" },
      }),
    ).toMatchObject({ awardedMarks: 0 });

    /* An unanswered dropdown is not an answer of "". */
    expect(
      evaluateQuestionResponse(matchingQuestion(), {
        value: { mouth: "chewing", stomach: "" },
      }),
    ).toMatchObject({ awardedMarks: 0 });
  });

  it("keeps ordering answers order-sensitive", () => {
    expect(
      evaluateQuestionResponse(orderingQuestion(), {
        value: ["oesophagus", "mouth", "stomach"],
      }),
    ).toMatchObject({ awardedMarks: 0 });
  });

  it("queues constructed responses for manual marking", () => {
    const result = evaluateQuestionResponse(essayQuestion(), {
      value: "The small intestine has villi which increase surface area.",
    });

    expect(result.markingStatus).toBe("needs-marking");
    expect(result.awardedMarks).toBe(0);
  });

  it("uses a server-issued attempt deadline and blocks late submission", () => {
    const assessment = publishAssessment(
      teacher,
      addAssessmentQuestion(createDraft(), singleChoiceQuestion()),
      "2026-07-23T10:00:00Z",
    );
    const attempt = startAssessmentAttempt(
      assessment,
      "learner-1",
      "2026-07-23T10:05:00Z",
    );

    expect(attempt.deadlineAt).toBe("2026-07-23T10:20:00.000Z");
    expect(() =>
      submitAssessmentAttempt(
        attempt,
        [],
        "2026-07-23T10:20:01.000Z",
      ),
    ).toThrow("time limit");
  });

  it("keeps automatic and manual marks separate", () => {
    const marked = markConstructedResponse(
      {
        awardedMarks: 0,
        autoMarks: 0,
        flagged: false,
        markingStatus: "needs-marking",
        questionId: "question-essay",
        response: { value: "A detailed explanation." },
      },
      2,
      3,
      "Clear explanation.",
    );

    expect(marked.autoMarks).toBe(0);
    expect(marked.manualMarks).toBe(2);
    expect(marked.awardedMarks).toBe(2);
  });
});

function createDraft() {
  return createAssessmentDraft({
    authorPersonId: "teacher-1",
    id: "assessment-1",
    instructions: "Answer every question.",
    offeringId: "offering-science-jhs2",
    passMarkPercent: 50,
    purpose: "formative",
    tenantId: "tenant-greenfield",
    timeLimitMinutes: 15,
    title: "Digestive system check",
  });
}

function singleChoiceQuestion(): AssessmentQuestionSnapshot {
  return {
    answerKey: { value: "small-intestine" },
    id: "question-choice",
    marks: 1,
    options: [
      { id: "stomach", label: "Stomach" },
      { id: "small-intestine", label: "Small intestine" },
    ],
    position: 1,
    prompt: "Where does most nutrient absorption take place?",
    questionVersion: 2,
    type: "single-choice",
  };
}

function matchingQuestion(): AssessmentQuestionSnapshot {
  return {
    answerKey: {
      value: { mouth: "chewing", stomach: "churning" },
    },
    id: "question-matching",
    marks: 2,
    options: [],
    position: 2,
    prompt: "Match each organ to its action.",
    questionVersion: 1,
    type: "matching",
  };
}

function orderingQuestion(): AssessmentQuestionSnapshot {
  return {
    answerKey: { value: ["mouth", "oesophagus", "stomach"] },
    id: "question-order",
    marks: 2,
    options: [],
    position: 3,
    prompt: "Put these organs in the order food travels.",
    questionVersion: 1,
    type: "ordering",
  };
}

function essayQuestion(): AssessmentQuestionSnapshot {
  return {
    answerKey: { rubric: "Explains absorption and surface area." },
    id: "question-essay",
    marks: 3,
    options: [],
    position: 4,
    prompt: "Explain how the small intestine is adapted for absorption.",
    questionVersion: 1,
    type: "essay",
  };
}
