"use client";

import type { LearnerLesson } from "../db/learning-repository";

/* ==========================================================================
   Preview workspace

   Every authoring screen falls back to a local "preview" mode when the school
   API is unreachable — no database configured, or a session that cannot reach
   the subject. Previously that fallback was decorative: a teacher could upload
   a video and it went nowhere, so the learner lesson still showed a play
   button that did nothing.

   This module is the missing middle. It holds, for the lifetime of one browser
   tab, the media a teacher uploaded and the lessons they published in preview
   mode, so the whole authoring path — upload a video, attach it to a lesson,
   publish, open the lesson as a learner — behaves the way it does against a
   real database.

   It is deliberately memory-only. Nothing here is persistence: a reload
   clears it, and object URLs are revoked when their entry is replaced. Real
   storage is the R2-backed media library behind /api/content/media.
   ========================================================================== */

type PreviewMedia = {
  contentType: string;
  filename: string;
  objectUrl: string;
};

const media = new Map<string, PreviewMedia>();
const drafts = new Map<string, { lesson: LearnerLesson; offeringId: string }>();
const lessonsByOffering = new Map<string, LearnerLesson[]>();

/**
 * Holds an uploaded file so it can be played or downloaded later in this tab,
 * and returns the object URL for immediate use.
 */
export function rememberPreviewMedia(assetId: string, file: File): string {
  forgetPreviewMedia(assetId);
  const objectUrl = URL.createObjectURL(file);
  media.set(assetId, {
    contentType: file.type,
    filename: file.name,
    objectUrl,
  });
  return objectUrl;
}

/** The playable URL for a preview-uploaded asset, if this tab still has it. */
export function previewMediaUrl(assetId: string): string | undefined {
  return media.get(assetId)?.objectUrl;
}

export function previewMediaContentType(assetId: string): string | undefined {
  return media.get(assetId)?.contentType;
}

function forgetPreviewMedia(assetId: string): void {
  const existing = media.get(assetId);
  if (!existing) return;
  URL.revokeObjectURL(existing.objectUrl);
  media.delete(assetId);
}

/**
 * Keeps a draft's full contents — its blocks, objectives and attachments —
 * next to the summary the lesson library shows. A draft is not visible to
 * learners; it is held so that publishing it can produce a real lesson rather
 * than a title with nothing behind it.
 */
export function rememberPreviewDraft(
  offeringId: string,
  lesson: LearnerLesson,
): void {
  drafts.set(lesson.id, { lesson, offeringId });
}

/**
 * Publishes a draft into the preview workspace so the learner player picks it
 * up. Re-publishing the same lesson replaces the earlier version, matching how
 * a real publish supersedes the previous one.
 *
 * Returns false when the lesson was authored in an earlier tab or before a
 * reload, so callers can say so instead of appearing to succeed.
 */
export function publishPreviewLesson(lessonId: string): boolean {
  const draft = drafts.get(lessonId);
  if (!draft) return false;

  const published: LearnerLesson = {
    ...draft.lesson,
    availability: "available",
    version: Math.max(1, draft.lesson.version),
  };
  const existing = lessonsByOffering.get(draft.offeringId) ?? [];
  lessonsByOffering.set(draft.offeringId, [
    published,
    ...existing.filter((item) => item.id !== published.id),
  ]);
  return true;
}

/** Lessons published in preview mode for a subject, newest first. */
export function previewLessonsFor(offeringId: string): LearnerLesson[] {
  return lessonsByOffering.get(offeringId) ?? [];
}
