import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPostgresPool } from "../../db/postgres";
import { ensurePlatformReady } from "../../server/platform-ready";
import {
  createBankQuestion,
  createPersistentAssessmentDraft,
  publishPersistentAssessment,
  releasePersistentResult,
  savePersistentResponse,
  startPersistentAttempt,
  submitPersistentAttempt,
} from "../../db/assessment-repository";
import { createStandard } from "../../db/curriculum-repository";
import {
  learnerMastery,
  setQuestionStandards,
} from "../../db/mastery-repository";
import { AuthorizationError } from "../../domain/identity/authorization";
import { accessFor, makeSchool, resetTestDatabase } from "./harness";

/* ==========================================================================
   Mastery by outcome

   The claim this screen makes about a child — "you can do this" — is the one
   worth being careful about, so these tests are mostly about what it refuses
   to claim: not on lessons alone, not on one lucky answer, and not on a mark
   the teacher has not given back yet.
   ========================================================================== */

const OSU = "tenant-osu";
const CLASS_ID = "class-osu-jhs1";
const OFFERING_ID = "offering-osu-science";
const TEACHER = "person-osu-teacher";
const HEAD = "person-osu-head";
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
  /* Standards are curriculum, which only an academic administrator writes —
     a teacher maps questions to them but does not author them. */
  await osu.addStaff({ id: HEAD, name: "Yaw Mensah", role: "academic-admin" });
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

function head() {
  return accessFor(OSU, "academic-admin", HEAD);
}

/** createStandard returns the offering's whole list; this picks out the new one. */
async function addStandard(code: string, offeringId = OFFERING_ID) {
  const all = await createStandard(head(), offeringId, {
    code,
    description: `Explain ${code}`,
    strand: "Living things",
    subStrand: "Digestion",
  });
  const made = all.find((standard) => standard.code === code);
  if (!made) throw new Error(`standard ${code} was not created`);
  return made;
}

async function addQuestion(standardIds: string[], prompt: string) {
  const question = await createBankQuestion(
    teacher(),
    {
      correctAnswer: "The small intestine",
      difficulty: "standard",
      marks: 1,
      options: ["The stomach", "The small intestine"],
      prompt,
      rationale: "Absorption happens along the small intestine.",
      topic: "Digestion",
      type: "single-choice",
    },
    OFFERING_ID,
  );
  await setQuestionStandards(teacher(), {
    offeringId: OFFERING_ID,
    questionId: question.id,
    standardIds,
  });
  return question.id;
}

/** Sits a one-question paper and takes it all the way to released. */
async function sitPaper(questionIds: string[], answers: string[]) {
  const draft = await createPersistentAssessmentDraft(teacher(), {
    feedbackPolicy: "after-release",
    instructions: "Answer every question.",
    passMarkPercent: 50,
    purpose: "formative",
    questionIds,
    timeLimitMinutes: 30,
    title: "Digestion check",
  });
  await publishPersistentAssessment(teacher(), draft.id);

  const attempt = await startPersistentAttempt(learner(), draft.id);
  for (const [index, questionId] of questionIds.entries()) {
    await savePersistentResponse(
      learner(),
      attempt.attempt!.id,
      questionId,
      { value: answers[index] },
      false,
    );
  }
  await submitPersistentAttempt(learner(), attempt.attempt!.id);
  return attempt.attempt!.id;
}

describe("what mastery will not claim", () => {
  it("reports an untouched outcome as not started", async () => {
    await addStandard("B1.1.1");
    const mastery = await learnerMastery(learner(), {
      offeringId: OFFERING_ID,
    });

    expect(mastery.standards).toHaveLength(1);
    expect(mastery.standards[0].state).toBe("not-started");
    expect(mastery.secureCount).toBe(0);
  });

  /* One correct answer on a two-option question is a coin toss. */
  it("does not call a single right answer mastery", async () => {
    const standard = await addStandard("B1.1.1");
    const questionId = await addQuestion([standard.id], "Where is food absorbed?");
    const attemptId = await sitPaper([questionId], ["the-small-intestine"]);
    await releasePersistentResult(teacher(), attemptId);

    const mastery = await learnerMastery(learner(), {
      offeringId: OFFERING_ID,
    });
    expect(mastery.standards[0].attempted).toBe(1);
    expect(mastery.standards[0].correct).toBe(1);
    expect(mastery.standards[0].state).toBe("learning");
  });

  it("counts nothing from a paper the teacher has not given back", async () => {
    const standard = await addStandard("B1.1.1");
    const q1 = await addQuestion([standard.id], "One?");
    const q2 = await addQuestion([standard.id], "Two?");
    await sitPaper([q1, q2], ["the-small-intestine", "the-small-intestine"]);
    /* Deliberately not released. */

    const mastery = await learnerMastery(learner(), {
      offeringId: OFFERING_ID,
    });
    expect(mastery.standards[0].attempted).toBe(0);
    expect(mastery.standards[0].state).toBe("not-started");
  });
});

describe("what mastery does claim", () => {
  it("calls an outcome secure once two whole questions go right", async () => {
    const standard = await addStandard("B1.1.1");
    const q1 = await addQuestion([standard.id], "One?");
    const q2 = await addQuestion([standard.id], "Two?");
    const attemptId = await sitPaper(
      [q1, q2],
      ["the-small-intestine", "the-small-intestine"],
    );
    await releasePersistentResult(teacher(), attemptId);

    const mastery = await learnerMastery(learner(), {
      offeringId: OFFERING_ID,
    });
    expect(mastery.standards[0].state).toBe("secure");
    expect(mastery.secureCount).toBe(1);
  });

  it("keeps one outcome's evidence out of another's", async () => {
    const digestion = await addStandard("B1.1.1");
    const circulation = await addStandard("B1.2.1");
    const q1 = await addQuestion([digestion.id], "One?");
    const q2 = await addQuestion([digestion.id], "Two?");
    const attemptId = await sitPaper(
      [q1, q2],
      ["the-small-intestine", "the-small-intestine"],
    );
    await releasePersistentResult(teacher(), attemptId);

    const mastery = await learnerMastery(learner(), {
      offeringId: OFFERING_ID,
    });
    const byCode = new Map(mastery.standards.map((s) => [s.code, s]));
    expect(byCode.get("B1.1.1")!.state).toBe("secure");
    expect(byCode.get("B1.2.1")!.state).toBe("not-started");
    expect(circulation.id).toBeTruthy();
  });

  it("drops back to learning when later answers are wrong", async () => {
    const standard = await addStandard("B1.1.1");
    const ids = [
      await addQuestion([standard.id], "One?"),
      await addQuestion([standard.id], "Two?"),
      await addQuestion([standard.id], "Three?"),
      await addQuestion([standard.id], "Four?"),
      await addQuestion([standard.id], "Five?"),
    ];
    const attemptId = await sitPaper(ids, [
      "the-small-intestine",
      "the-small-intestine",
      "the-stomach",
      "the-stomach",
      "the-stomach",
    ]);
    await releasePersistentResult(teacher(), attemptId);

    const mastery = await learnerMastery(learner(), {
      offeringId: OFFERING_ID,
    });
    expect(mastery.standards[0].correct).toBe(2);
    expect(mastery.standards[0].attempted).toBe(5);
    expect(mastery.standards[0].state).toBe("learning");
  });
});

describe("mapping a question to outcomes", () => {
  it("replaces the set rather than adding to it", async () => {
    const first = await addStandard("B1.1.1");
    const second = await addStandard("B1.2.1");
    const questionId = await addQuestion([first.id], "One?");

    await setQuestionStandards(teacher(), {
      offeringId: OFFERING_ID,
      questionId,
      standardIds: [second.id],
    });

    const attemptId = await sitPaper([questionId], ["the-small-intestine"]);
    await releasePersistentResult(teacher(), attemptId);
    const mastery = await learnerMastery(learner(), {
      offeringId: OFFERING_ID,
    });
    const byCode = new Map(mastery.standards.map((s) => [s.code, s]));
    expect(byCode.get("B1.1.1")!.attempted).toBe(0);
    expect(byCode.get("B1.2.1")!.attempted).toBe(1);
  });

  /* A science question mapped to a mathematics outcome would quietly corrupt
     another subject's picture, so the link is filtered to this offering. */
  it("ignores a standard from another subject", async () => {
    const database = getPostgresPool();
    const osu = await makeSchool(database, OSU, "Osu Community Basic School");
    await osu.addOffering({
      classGroupId: CLASS_ID,
      className: "JHS 1 Blue",
      id: "offering-osu-maths",
      subjectCode: "MTH",
      subjectName: "Mathematics",
      teacherPersonId: TEACHER,
    });
    const maths = await addStandard("M1.1.1", "offering-osu-maths");

    const science = await addStandard("B1.1.1");
    const questionId = await addQuestion([science.id], "One?");
    await setQuestionStandards(teacher(), {
      offeringId: OFFERING_ID,
      questionId,
      standardIds: [maths.id],
    });

    const attemptId = await sitPaper([questionId], ["the-small-intestine"]);
    await releasePersistentResult(teacher(), attemptId);
    const mastery = await learnerMastery(learner(), {
      offeringId: OFFERING_ID,
    });
    /* The science standard was unmapped by the replace, and the maths one was
       refused — so nothing is credited anywhere. */
    expect(mastery.standards[0].attempted).toBe(0);
  });
});

describe("who may read it", () => {
  it("refuses a learner asking about somebody else", async () => {
    await addStandard("B1.1.1");
    await expect(
      learnerMastery(learner(), {
        learnerPersonId: "person-somebody-else",
        offeringId: OFFERING_ID,
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("lets the subject's teacher read a learner they teach", async () => {
    await addStandard("B1.1.1");
    const mastery = await learnerMastery(teacher(), {
      learnerPersonId: LEARNER,
      offeringId: OFFERING_ID,
    });
    expect(mastery.standards).toHaveLength(1);
  });
});
