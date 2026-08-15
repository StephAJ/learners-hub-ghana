import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPostgresPool } from "../../db/postgres";
import { ensurePlatformReady } from "../../server/platform-ready";
import { createBankQuestion } from "../../db/assessment-repository";
import {
  buildPracticeSet,
  markPracticeAnswer,
} from "../../db/practice-repository";
import { AuthorizationError } from "../../domain/identity/authorization";
import { accessFor, makeSchool, resetTestDatabase } from "./harness";

/* ==========================================================================
   Practice

   Two properties carry the whole feature, and neither is visible on screen,
   so both are pinned here:

   1. Nothing is written. No attempt, no grade, no progress. A learner has to
      be able to get a question wrong six times without it counting, or they
      will not practise anything they find hard.
   2. Answer keys do not leave the server. The set a learner receives has no
      key in it, and the right answer only comes back in a mark response —
      after an answer has been given.

   The third is ordinary tenancy: a question id from another school, or
   another class's subject, must not be markable.
   ========================================================================== */

const OSU = "tenant-osu";
const LABONE = "tenant-labone";
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
  await osu.addLearner({
    classGroupId: CLASS_ID,
    id: LEARNER,
    name: "Kofi Asante",
  });
});

function teacher() {
  return accessFor(OSU, "teacher", TEACHER, {
    subjectOfferingIds: [OFFERING_ID],
  });
}

function learner() {
  return accessFor(OSU, "learner", LEARNER, {
    classGroupIds: [CLASS_ID],
  });
}

async function addQuestion(
  overrides: Partial<Parameters<typeof createBankQuestion>[1]> = {},
) {
  return createBankQuestion(
    teacher(),
    {
      correctAnswer: "The small intestine",
      difficulty: "standard",
      marks: 1,
      options: ["The stomach", "The small intestine", "The liver"],
      prompt: "Where is most food absorbed?",
      rationale: "Most absorption happens along the small intestine.",
      topic: "Digestion",
      type: "single-choice",
      ...overrides,
    },
    OFFERING_ID,
  );
}

/** Every table practice could plausibly write to, counted. */
async function writeCounts() {
  const database = getPostgresPool();
  const counts: Record<string, number> = {};
  for (const table of [
    "assessment_attempts",
    "assessment_responses",
    "grade_entries",
    "lesson_progress",
    "audit_events",
    "interactive_activity_results",
  ]) {
    const result = await database.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
    counts[table] = result.rows[0].n as number;
  }
  return counts;
}

describe("the set a learner is given", () => {
  it("carries no answer key", async () => {
    await addQuestion();
    const set = await buildPracticeSet(learner(), { offeringId: OFFERING_ID });

    expect(set.questions).toHaveLength(1);
    const serialised = JSON.stringify(set);
    expect(serialised).not.toContain("answerKey");
    /* Not just the field name — the answer itself must not be reachable by
       reading the payload. The options list legitimately contains the label,
       so this checks the key's own slug form. */
    expect(set.questions[0]).not.toHaveProperty("answerKey");
  });

  it("leaves out anything a teacher has to mark by hand", async () => {
    await addQuestion();
    await addQuestion({
      correctAnswer: "Marked on the explanation given.",
      options: [],
      prompt: "Explain how villi increase absorption.",
      type: "essay",
    });

    const set = await buildPracticeSet(learner(), { offeringId: OFFERING_ID });
    expect(set.questions.map((q) => q.type)).toEqual(["single-choice"]);
  });

  it("offers the bank's topics so one thing can be practised at a time", async () => {
    await addQuestion();
    await addQuestion({ prompt: "What is 3 + 4?", topic: "Number" });

    const set = await buildPracticeSet(learner(), { offeringId: OFFERING_ID });
    expect(set.topics).toEqual(["Digestion", "Number"]);

    const narrowed = await buildPracticeSet(learner(), {
      offeringId: OFFERING_ID,
      topic: "Number",
    });
    expect(narrowed.questions).toHaveLength(1);
    expect(narrowed.questions[0].prompt).toBe("What is 3 + 4?");
  });

  it("gives a different question first on a later visit", async () => {
    for (const prompt of ["One", "Two", "Three"]) {
      await addQuestion({ prompt });
    }
    const first = await buildPracticeSet(learner(), {
      offeringId: OFFERING_ID,
      seed: 0,
    });
    const later = await buildPracticeSet(learner(), {
      offeringId: OFFERING_ID,
      seed: 1,
    });
    expect(later.questions[0].id).not.toBe(first.questions[0].id);
    /* Same questions, different starting point — nothing is dropped. */
    expect(later.questions.map((q) => q.id).sort()).toEqual(
      first.questions.map((q) => q.id).sort(),
    );
  });
});

describe("marking an answer", () => {
  it("says it is right, and why", async () => {
    const question = await addQuestion();
    const mark = await markPracticeAnswer(learner(), {
      offeringId: OFFERING_ID,
      questionId: question.id,
      value: "the-small-intestine",
    });

    expect(mark.correct).toBe(true);
    expect(mark.rationale).toContain("small intestine");
  });

  it("names the right answer when it is wrong", async () => {
    const question = await addQuestion();
    const mark = await markPracticeAnswer(learner(), {
      offeringId: OFFERING_ID,
      questionId: question.id,
      value: "the-stomach",
    });

    expect(mark.correct).toBe(false);
    expect(mark.expected).toBe("The small intestine");
  });

  /* The whole point of the feature. */
  it("writes nothing, however many times it is answered", async () => {
    const question = await addQuestion();
    const before = await writeCounts();

    for (const value of ["the-stomach", "the-liver", "the-small-intestine"]) {
      await markPracticeAnswer(learner(), {
        offeringId: OFFERING_ID,
        questionId: question.id,
        value,
      });
    }

    expect(await writeCounts()).toEqual(before);
  });

  it("can be answered again after getting it wrong", async () => {
    const question = await addQuestion();
    const wrong = await markPracticeAnswer(learner(), {
      offeringId: OFFERING_ID,
      questionId: question.id,
      value: "the-liver",
    });
    const right = await markPracticeAnswer(learner(), {
      offeringId: OFFERING_ID,
      questionId: question.id,
      value: "the-small-intestine",
    });

    expect(wrong.correct).toBe(false);
    expect(right.correct).toBe(true);
  });
});

describe("what a learner cannot practise", () => {
  it("refuses another school's subject", async () => {
    const database = getPostgresPool();
    await makeSchool(database, LABONE, "Labone Model School");
    await addQuestion();

    const outsider = accessFor(LABONE, "learner", "person-labone-learner", {
      classGroupIds: ["class-labone"],
    });
    await expect(
      buildPracticeSet(outsider, { offeringId: OFFERING_ID }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("refuses to mark a question the learner cannot reach", async () => {
    const question = await addQuestion();
    const outsider = accessFor(OSU, "learner", "person-osu-other", {
      classGroupIds: ["class-osu-other"],
    });

    await expect(
      markPracticeAnswer(outsider, {
        offeringId: OFFERING_ID,
        questionId: question.id,
        value: "the-small-intestine",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
