import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPostgresPool } from "../../db/postgres";
import { ensurePlatformReady } from "../../server/platform-ready";
import {
  createBankQuestion,
  getBankQuestion,
} from "../../db/assessment-repository";
import { buildPracticeSet, markPracticeAnswer } from "../../db/practice-repository";
import { AssessmentPolicyError } from "../../domain/assessment/assessment";
import { accessFor, makeSchool, resetTestDatabase } from "./harness";

/* ==========================================================================
   Gaps, a number line and a table

   Each goes the whole way: authored the way the composer emits it, stored,
   handed back to a learner without its answer key, and marked. The marking is
   what these are really about — three new answer shapes, each with a way to
   be wrong that the others do not have.
   ========================================================================== */

const OSU = "tenant-osu";
const CLASS_ID = "class-osu-jhs1";
const OFFERING_ID = "offering-osu-science";
const TEACHER = "person-osu-teacher";
const LEARNER = "person-osu-learner";

beforeAll(async () => {
  await ensurePlatformReady();
});

beforeEach(async () => {
  const database = getPostgresPool();
  await resetTestDatabase(database);

  const osu = await makeSchool(database, OSU, "Osu Community Basic School");
  await osu.addClass({ id: CLASS_ID, name: "JHS 1 Blue" });
  await osu.addStaff({ id: TEACHER, name: "Ama Darko", role: "teacher" });
  await osu.addOffering({
    classGroupId: CLASS_ID,
    className: "JHS 1 Blue",
    id: OFFERING_ID,
    subjectCode: "SCI",
    subjectName: "Integrated Science",
    teacherPersonId: TEACHER,
  });
  await osu.addLearner({ classGroupId: CLASS_ID, id: LEARNER, name: "Kofi" });
});

function teacher() {
  return accessFor(OSU, "teacher", TEACHER, {
    subjectOfferingIds: [OFFERING_ID],
  });
}

function learner() {
  return accessFor(OSU, "learner", LEARNER, { classGroupIds: [CLASS_ID] });
}

async function ask(
  input: Partial<Parameters<typeof createBankQuestion>[1]> & {
    correctAnswer: string;
    prompt: string;
    type: Parameters<typeof createBankQuestion>[1]["type"];
  },
) {
  return createBankQuestion(
    teacher(),
    {
      difficulty: "standard",
      marks: 2,
      options: [],
      rationale: "Because.",
      topic: "Digestion",
      ...input,
    },
    OFFERING_ID,
  );
}

async function mark(questionId: string, value: unknown) {
  return markPracticeAnswer(learner(), {
    offeringId: OFFERING_ID,
    questionId,
    value,
  });
}

describe("a passage with gaps", () => {
  const PROMPT =
    "Digestion begins in the [mouth] and most food is absorbed in the [small intestine].";

  async function askCloze() {
    return ask({
      correctAnswer: "mouth, small intestine",
      options: ["mouth", "small intestine", "liver"],
      prompt: PROMPT,
      type: "cloze",
    });
  }

  it("hands the learner a bank and no answer key", async () => {
    await askCloze();
    const set = await buildPracticeSet(learner(), { offeringId: OFFERING_ID });
    const question = set.questions[0];

    expect(question.type).toBe("cloze");
    /* The passage arrives with its brackets — the component splits it. */
    expect(question.prompt).toContain("[mouth]");
    expect(question.options.map((option) => option.label).sort()).toEqual([
      "liver",
      "mouth",
      "small intestine",
    ]);
    expect(JSON.stringify(question)).not.toContain("answerKey");
  });

  it("marks the words in the right gaps", async () => {
    const question = await askCloze();
    expect((await mark(question.id, ["mouth", "small-intestine"])).correct).toBe(
      true,
    );
  });

  /* Gap order is the answer: the same two words the other way round is a
     different claim about digestion. */
  it("marks the right words in the wrong gaps wrong", async () => {
    const question = await askCloze();
    expect((await mark(question.id, ["small-intestine", "mouth"])).correct).toBe(
      false,
    );
  });

  it("refuses a passage with no brackets in it", async () => {
    await expect(
      ask({
        correctAnswer: "",
        prompt: "Digestion begins in the mouth.",
        type: "cloze",
      }),
    ).rejects.toBeInstanceOf(AssessmentPolicyError);
  });
});

describe("a value on a number line", () => {
  async function askLine(answer = "7::0::10::0.5") {
    return ask({
      correctAnswer: answer,
      prompt: "Place 7 on the line.",
      type: "number-line",
    });
  }

  it("sends the learner the line but not the answer", async () => {
    await askLine();
    const set = await buildPracticeSet(learner(), { offeringId: OFFERING_ID });
    const question = set.questions[0];

    expect(question.line).toEqual({ max: 10, min: 0 });
    /* The axis is public, the value on it is not. */
    expect(JSON.stringify(question)).not.toContain("answerKey");
  });

  it("marks a value inside the tolerance right", async () => {
    const question = await askLine();
    expect((await mark(question.id, 7)).correct).toBe(true);
    expect((await mark(question.id, 7.4)).correct).toBe(true);
    expect((await mark(question.id, 6.6)).correct).toBe(true);
  });

  it("marks a value outside it wrong", async () => {
    const question = await askLine();
    expect((await mark(question.id, 8)).correct).toBe(false);
    expect((await mark(question.id, 0)).correct).toBe(false);
  });

  it("refuses an answer that is not on the line", async () => {
    await expect(askLine("42::0::10::0.5")).rejects.toBeInstanceOf(
      AssessmentPolicyError,
    );
  });

  it("refuses a line that ends before it starts", async () => {
    await expect(askLine("5::10::0::0.5")).rejects.toBeInstanceOf(
      AssessmentPolicyError,
    );
  });
});

describe("a table to complete", () => {
  const PROMPT = [
    "Country | Capital | Currency",
    "Ghana | [Accra] | Cedi",
    "Nigeria | [Abuja] | Naira",
  ].join("\n");

  async function askTable() {
    return ask({
      correctAnswer: "1:1::Accra, 2:1::Abuja",
      prompt: PROMPT,
      type: "table",
    });
  }

  it("sends the grid and keeps the answers back", async () => {
    await askTable();
    const set = await buildPracticeSet(learner(), { offeringId: OFFERING_ID });
    const question = set.questions[0];

    expect(question.prompt).toContain("[Accra]");
    expect(JSON.stringify(question)).not.toContain("answerKey");
  });

  it("marks the filled cells", async () => {
    const question = await askTable();
    expect(
      (await mark(question.id, { "1:1": "Accra", "2:1": "Abuja" })).correct,
    ).toBe(true);
  });

  /* A child should not lose a mark to a capital letter or a stray space. */
  it("forgives case and spacing", async () => {
    const question = await askTable();
    expect(
      (await mark(question.id, { "1:1": "accra ", "2:1": " ABUJA" })).correct,
    ).toBe(true);
  });

  it("marks a wrong cell wrong", async () => {
    const question = await askTable();
    expect(
      (await mark(question.id, { "1:1": "Kumasi", "2:1": "Abuja" })).correct,
    ).toBe(false);
  });

  it("refuses a table with nothing to fill in", async () => {
    await expect(
      ask({
        correctAnswer: "",
        prompt: "Country | Capital\nGhana | Accra",
        type: "table",
      }),
    ).rejects.toBeInstanceOf(AssessmentPolicyError);
  });
});

describe("reopening one in the composer", () => {
  it("gives the table back as the author wrote it", async () => {
    const question = await createBankQuestion(
      teacher(),
      {
        correctAnswer: "1:1::Accra",
        difficulty: "standard",
        marks: 1,
        options: [],
        prompt: "Country | Capital\nGhana | [Accra]",
        rationale: "Because.",
        topic: "West Africa",
        type: "table",
      },
      OFFERING_ID,
    );

    const reopened = await getBankQuestion(teacher(), question.id);
    expect(reopened.prompt).toContain("[Accra]");
    expect(reopened.type).toBe("table");
  });
});
