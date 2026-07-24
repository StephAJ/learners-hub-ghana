import { canTeachOffering } from "../identity/authorization";
import type { AccessContext } from "../identity/types";
import type {
  CreateLessonDraftCommand,
  Lesson,
  LessonAvailability,
  LessonBlockInput,
  LessonProgress,
  LessonReleaseRule,
  RecordLessonProgressCommand,
} from "./types";

export class LessonPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LessonPolicyError";
  }
}

export function createLessonDraft(
  command: CreateLessonDraftCommand,
): Lesson {
  requireValue(command.tenantId, "School is required.");
  requireValue(command.authorPersonId, "Lesson author is required.");
  requireValue(command.offeringId, "Subject offering is required.");
  requireValue(command.unitId, "Curriculum unit is required.");

  return {
    ...command,
    blocks: [],
    status: "draft",
    version: 0,
  };
}

export function addLessonBlock(
  lesson: Lesson,
  block: LessonBlockInput,
): Lesson {
  requireDraft(lesson);
  requireValue(block.title, "Block title is required.");

  return {
    ...lesson,
    blocks: [
      ...lesson.blocks,
      {
        ...block,
        position: lesson.blocks.length + 1,
      },
    ],
  };
}

export function reorderLessonBlocks(
  lesson: Lesson,
  orderedBlockIds: string[],
): Lesson {
  requireDraft(lesson);
  if (
    orderedBlockIds.length !== lesson.blocks.length ||
    new Set(orderedBlockIds).size !== lesson.blocks.length ||
    lesson.blocks.some((block) => !orderedBlockIds.includes(block.id))
  ) {
    throw new LessonPolicyError(
      "The block order must include every lesson block exactly once.",
    );
  }

  const blocksById = new Map(
    lesson.blocks.map((block) => [block.id, block]),
  );
  return {
    ...lesson,
    blocks: orderedBlockIds.map((id, index) => ({
      ...blocksById.get(id)!,
      position: index + 1,
    })),
  };
}

export function evaluateLessonAvailability(
  rule: LessonReleaseRule | undefined,
  completedLessonIds: ReadonlySet<string>,
  now: Date,
): LessonAvailability {
  if (!rule) return "available";

  if (rule.availableUntil && now >= new Date(rule.availableUntil)) {
    return "closed";
  }
  if (rule.availableFrom && now < new Date(rule.availableFrom)) {
    return "scheduled";
  }
  if (
    rule.prerequisiteLessonId &&
    !completedLessonIds.has(rule.prerequisiteLessonId)
  ) {
    return "locked";
  }
  return "available";
}

export function publishLesson(
  access: AccessContext,
  lesson: Lesson,
  publishedAt: string,
): Lesson {
  requireDraft(lesson);
  requireTenant(access, lesson);
  requirePublicationContent(lesson);

  if (!canTeachOffering(access, lesson.offeringId)) {
    throw new LessonPolicyError(
      "You are not assigned to this subject offering.",
    );
  }

  return {
    ...lesson,
    publishedAt,
    status: "published",
    version: lesson.version + 1,
  };
}

export function recordLessonProgress(
  current: LessonProgress | undefined,
  command: RecordLessonProgressCommand,
): LessonProgress {
  requirePercentage(command.percent);
  if (current) {
    requireSameProgressRecord(current, command);
    if (command.percent < current.percent) {
      throw new LessonPolicyError("Lesson progress cannot move backwards.");
    }
  }

  const completed = command.percent === 100;
  return {
    ...command,
    completedAt: completed ? command.updatedAt : undefined,
    status: completed ? "completed" : "in-progress",
  };
}

function requirePublicationContent(lesson: Lesson) {
  if (lesson.title.trim().length < 5) {
    throw new LessonPolicyError("A lesson needs a meaningful title.");
  }
  if (lesson.objectives.length === 0) {
    throw new LessonPolicyError(
      "A lesson needs at least one learning objective.",
    );
  }
  if (lesson.blocks.length === 0) {
    throw new LessonPolicyError("A lesson needs at least one content block.");
  }
  if (lesson.blocks.some((block) => !block.ready)) {
    throw new LessonPolicyError(
      "Every lesson block must be ready before publication.",
    );
  }
}

function requireDraft(lesson: Lesson) {
  if (lesson.status !== "draft") {
    throw new LessonPolicyError("Only a draft lesson can be changed.");
  }
}

function requireTenant(access: AccessContext, lesson: Lesson) {
  if (access.tenantId !== lesson.tenantId) {
    throw new LessonPolicyError("Lesson belongs to another school.");
  }
}

function requirePercentage(percent: number) {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new LessonPolicyError(
      "Lesson progress must be between 0 and 100.",
    );
  }
}

function requireSameProgressRecord(
  current: LessonProgress,
  command: RecordLessonProgressCommand,
) {
  if (
    current.tenantId !== command.tenantId ||
    current.learnerId !== command.learnerId ||
    current.lessonId !== command.lessonId ||
    current.lessonVersion !== command.lessonVersion
  ) {
    throw new LessonPolicyError(
      "Lesson progress update does not match the current record.",
    );
  }
}

function requireValue(value: string, message: string) {
  if (!value.trim()) {
    throw new LessonPolicyError(message);
  }
}
