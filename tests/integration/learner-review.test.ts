import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPostgresPool } from "../../db/postgres";
import { ensurePlatformReady } from "../../server/platform-ready";
import {
  createBankQuestion,
  createPersistentAssessmentDraft,
  getLearnerAssessment,
  markPersistentResponse,
  publishPersistentAssessment,
  releasePersistentResult,
  savePersistentResponse,
  startPersistentAttempt,
  submitPersistentAttempt,
} from "../../db/assessment-repository";
import type { FeedbackPolicy } from "../../domain/assessment/types";
import { accessFor, makeSchool, resetTestDatabase } from "./harness";

/* ==========================================================================
   What a learner is told about their own paper

   Two things were wrong, and one of them was a security question.

   The learner's payload carried `{ score, maximumMarks, released }`. The mark
   a teacher gave each answer, and the feedback they wrote against it, were
   stored on assessment_responses and shown to nobody — so the most useful
   thing in the whole subsystem was written to the database and thrown away.

   And `feedback_policy` was inserted as the literal 'after-release' every
   time and never read, so the column that decides *when* a learner may see
   the answer key was decorative. These tests are mostly about that: an answer
   key shown early is the one mistake that cannot be taken back.
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

/** A one-question paper, published under the policy named. */
async function publishPaper(feedbackPolicy: FeedbackPolicy) {
  const question = await createBankQuestion(
    teacher(),
    {
      correctAnswer: "The small intestine",
      difficulty: "standard",
      marks: 4,
      options: ["The stomach", "The small intestine", "The liver"],
      prompt: "Where is most food absorbed?",
      rationale: "Most absorption happens along the small intestine.",
      topic: "Digestion",
      type: "single-choice",
    },
    OFFERING_ID,
  );
  const questionId = question.id;

  const draft = await createPersistentAssessmentDraft(teacher(), {
    feedbackPolicy,
    instructions: "Answer every question.",
    passMarkPercent: 50,
    purpose: "formative",
    questionIds: [questionId],
    timeLimitMinutes: 15,
    title: "Digestion check",
  });
  await publishPersistentAssessment(teacher(), draft.id);
  return draft.id;
}

describe("a paper whose result has not been released", () => {
  it("tells the learner nothing about the answers", async () => {
    const assessmentId = await publishPaper("after-release");
    const started = await startPersistentAttempt(learner(), assessmentId);
    await submitPersistentAttempt(learner(), started.attempt!.id);

    const seen = await getLearnerAssessment(learner(), assessmentId);

    expect(
      seen.review,
      "an answer key shown early is the one mistake that cannot be undone",
    ).toEqual([]);
  });

  it("tells them once the teacher releases it", async () => {
    const assessmentId = await publishPaper("after-release");
    const started = await startPersistentAttempt(learner(), assessmentId);
    const attemptId = started.attempt!.id;
    await submitPersistentAttempt(learner(), attemptId);
    await releasePersistentResult(teacher(), attemptId);

    const seen = await getLearnerAssessment(learner(), assessmentId);

    expect(seen.review).toHaveLength(1);
    expect(seen.review[0].maximumMarks).toBe(4);
  });
});

describe("a practice paper", () => {
  it("shows its marking as soon as it is handed in", async () => {
    const assessmentId = await publishPaper("after-attempt");
    const started = await startPersistentAttempt(learner(), assessmentId);
    await submitPersistentAttempt(learner(), started.attempt!.id);

    const seen = await getLearnerAssessment(learner(), assessmentId);

    expect(seen.review).toHaveLength(1);
    expect(seen.review[0].correctAnswer).toBe("The small intestine");
  });

  it("shows nothing while the attempt is still open", async () => {
    const assessmentId = await publishPaper("immediate");
    await startPersistentAttempt(learner(), assessmentId);

    const seen = await getLearnerAssessment(learner(), assessmentId);

    expect(
      seen.review,
      "a paper that answers question three while four is open is not an assessment",
    ).toEqual([]);
  });
});

describe("the teacher's feedback", () => {
  it("reaches the learner it was written for", async () => {
    const assessmentId = await publishPaper("after-release");
    const started = await startPersistentAttempt(learner(), assessmentId);
    const attemptId = started.attempt!.id;
    const paper = await getLearnerAssessment(learner(), assessmentId);
    await savePersistentResponse(
      learner(),
      attemptId,
      paper.questions[0].id,
      { value: "The liver" },
      false,
    );
    await submitPersistentAttempt(learner(), attemptId);

    /* Read after the answer is saved: the response row is what carries the
       question version, and marking is keyed to it. */
    const questionVersionId = await getPostgresPool()
      .query<{ question_version_id: string }>(
        `SELECT question_version_id FROM assessment_responses
         WHERE attempt_id = $1 LIMIT 1`,
        [attemptId],
      )
      .then((result) => result.rows[0]?.question_version_id);

    await markPersistentResponse(
      teacher(),
      attemptId,
      questionVersionId!,
      2,
      "Close — absorption happens further along than the stomach.",
    );
    await releasePersistentResult(teacher(), attemptId);

    const seen = await getLearnerAssessment(learner(), assessmentId);

    expect(seen.review[0].feedback).toContain("further along");
    expect(seen.review[0].awardedMarks).toBe(2);
  });
});
