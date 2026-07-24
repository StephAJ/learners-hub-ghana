import { describe, expect, it } from "vitest";
import {
  addLessonBlock,
  createLessonDraft,
  evaluateLessonAvailability,
  publishLesson,
  recordLessonProgress,
  reorderLessonBlocks,
} from "../domain/learning/lessons";
import type { AccessContext } from "../domain/identity/types";

const teacher: AccessContext = {
  actorPersonId: "teacher-1",
  membershipStatus: "active",
  role: "teacher",
  subjectOfferingIds: ["offering-science-jhs2"],
  tenantId: "tenant-greenfield",
};

describe("lesson lifecycle", () => {
  it("creates a version-zero draft", () => {
    const draft = createLessonDraft({
      authorPersonId: "teacher-1",
      id: "lesson-1",
      offeringId: "offering-science-jhs2",
      objectives: ["Explain the role of the digestive system."],
      summary: "Follow food through the human digestive system.",
      tenantId: "tenant-greenfield",
      title: "The human digestive system",
      unitId: "unit-human-systems",
    });

    expect(draft.status).toBe("draft");
    expect(draft.version).toBe(0);
  });

  it("adds ordered structured blocks without mutating the draft", () => {
    const draft = completeDraft();
    const updated = addLessonBlock(draft, {
      content: "A short knowledge check",
      id: "block-check",
      ready: true,
      title: "Check your understanding",
      type: "interactive",
    });

    expect(draft.blocks).toHaveLength(1);
    expect(updated.blocks).toHaveLength(2);
    expect(updated.blocks[1].position).toBe(2);
  });

  it("prevents publishing incomplete lesson content", () => {
    const draft = createLessonDraft({
      authorPersonId: "teacher-1",
      id: "lesson-empty",
      offeringId: "offering-science-jhs2",
      objectives: [],
      summary: "",
      tenantId: "tenant-greenfield",
      title: "Digestive system",
      unitId: "unit-human-systems",
    });

    expect(() => publishLesson(teacher, draft, "2026-07-23")).toThrow(
      "A lesson needs at least one learning objective.",
    );
  });

  it("prevents a teacher publishing outside their assigned subject", () => {
    const unrelatedLesson = {
      ...completeDraft(),
      offeringId: "offering-mathematics-jhs2",
    };

    expect(() =>
      publishLesson(teacher, unrelatedLesson, "2026-07-23"),
    ).toThrow("You are not assigned to this subject offering.");
  });

  it("publishes a complete assigned lesson as version one", () => {
    const published = publishLesson(teacher, completeDraft(), "2026-07-23");

    expect(published.status).toBe("published");
    expect(published.version).toBe(1);
    expect(published.publishedAt).toBe("2026-07-23");
  });

  it("records monotonic learner progress and completion", () => {
    const started = recordLessonProgress(undefined, {
      lessonId: "lesson-1",
      lessonVersion: 1,
      learnerId: "learner-1",
      percent: 45,
      tenantId: "tenant-greenfield",
      updatedAt: "2026-07-23T10:00:00Z",
    });
    const completed = recordLessonProgress(started, {
      ...started,
      percent: 100,
      updatedAt: "2026-07-23T10:30:00Z",
    });

    expect(completed.status).toBe("completed");
    expect(() =>
      recordLessonProgress(completed, {
        ...completed,
        percent: 80,
        updatedAt: "2026-07-23T10:45:00Z",
      }),
    ).toThrow("Lesson progress cannot move backwards.");
  });

  it("reorders every draft activity without mutating content", () => {
    const draft = addLessonBlock(completeDraft(), {
      content: "Trace oxygen into the blood.",
      id: "block-video",
      ready: true,
      title: "Watch gas exchange",
      type: "video",
    });
    const reordered = reorderLessonBlocks(draft, [
      "block-video",
      "block-introduction",
    ]);

    expect(reordered.blocks.map((block) => block.id)).toEqual([
      "block-video",
      "block-introduction",
    ]);
    expect(reordered.blocks.map((block) => block.position)).toEqual([1, 2]);
  });

  it("evaluates scheduled and prerequisite lesson release rules", () => {
    const now = new Date("2026-07-24T10:00:00Z");
    expect(
      evaluateLessonAvailability(
        {
          availableFrom: "2026-07-25T08:00:00Z",
          lessonId: "lesson-2",
        },
        new Set(),
        now,
      ),
    ).toBe("scheduled");
    expect(
      evaluateLessonAvailability(
        {
          lessonId: "lesson-2",
          prerequisiteLessonId: "lesson-1",
        },
        new Set(),
        now,
      ),
    ).toBe("locked");
    expect(
      evaluateLessonAvailability(
        {
          lessonId: "lesson-2",
          prerequisiteLessonId: "lesson-1",
        },
        new Set(["lesson-1"]),
        now,
      ),
    ).toBe("available");
  });
});

function completeDraft() {
  const draft = createLessonDraft({
    authorPersonId: "teacher-1",
    id: "lesson-1",
    offeringId: "offering-science-jhs2",
    objectives: ["Explain the role of the digestive system."],
    summary: "Follow food through the human digestive system.",
    tenantId: "tenant-greenfield",
    title: "The human digestive system",
    unitId: "unit-human-systems",
  });

  return addLessonBlock(draft, {
    content: "Digestion breaks food into nutrients the body can absorb.",
    id: "block-introduction",
    ready: true,
    title: "What is digestion?",
    type: "text",
  });
}
