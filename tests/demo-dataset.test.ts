import { describe, expect, it } from "vitest";
import {
  demoActivities,
  demoAssessments,
  demoMediaAssets,
  demoPeople,
  demoSubjectBySlug,
  demoSubjectProgress,
  demoSubjects,
} from "../domain/demo/greenfield";
import { resolveLessonVideo, resolveVideoUrl } from "../domain/learning/video";

/* The demo dataset is the only thing standing behind every screen until the
   learning repositories move off D1, and it is hand-written. These tests hold
   it to the same referential integrity a database would have enforced. */

describe("demo dataset integrity", () => {
  const personIds = new Set(demoPeople.map((person) => person.id));
  const assetIds = new Set(demoMediaAssets.map((asset) => asset.id));
  const activityIds = new Set(demoActivities.map((activity) => activity.id));

  it("gives every subject a distinct slug and offering", () => {
    const slugs = demoSubjects.map((subject) => subject.slug);
    const offerings = demoSubjects.map((subject) => subject.offeringId);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(offerings).size).toBe(offerings.length);
  });

  it("assigns every subject to a person who exists and can teach", () => {
    for (const subject of demoSubjects) {
      expect(personIds).toContain(subject.teacherPersonId);
      const teacher = demoPeople.find(
        (person) => person.id === subject.teacherPersonId,
      );
      expect(["teacher", "class-teacher"]).toContain(teacher?.role);
    }
  });

  it("only cites curriculum standards the subject declares", () => {
    for (const subject of demoSubjects) {
      const codes = new Set(
        subject.standards.map((standard) => standard.code),
      );
      for (const lesson of subject.lessons) {
        for (const code of lesson.standardCodes) {
          expect(codes, `${subject.slug} / ${lesson.id}`).toContain(code);
        }
      }
    }
  });

  it("numbers lesson blocks from one with no gaps", () => {
    for (const subject of demoSubjects) {
      for (const lesson of subject.lessons) {
        const positions = lesson.blocks.map((block) => block.position);
        expect(positions, `${lesson.id}`).toEqual(
          positions.map((_, index) => index + 1),
        );
      }
    }
  });

  it("gives every block a globally unique id", () => {
    const ids = demoSubjects.flatMap((subject) =>
      subject.lessons.flatMap((lesson) =>
        lesson.blocks.map((block) => block.id),
      ),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("attaches only media and activities that exist in the same subject", () => {
    for (const subject of demoSubjects) {
      for (const lesson of subject.lessons) {
        for (const block of lesson.blocks) {
          const { activityId, mediaAssetId } = block.config ?? {};
          if (mediaAssetId) {
            expect(assetIds, block.id).toContain(mediaAssetId);
            const asset = demoMediaAssets.find(
              (item) => item.id === mediaAssetId,
            );
            expect(asset?.offeringId, block.id).toBe(subject.offeringId);
          }
          if (activityId) {
            expect(activityIds, block.id).toContain(activityId);
            const activity = demoActivities.find(
              (item) => item.id === activityId,
            );
            expect(activity?.offeringId, block.id).toBe(subject.offeringId);
          }
        }
      }
    }
  });

  it("points every activity package at an uploaded asset", () => {
    for (const activity of demoActivities) {
      if (!activity.packageAssetId) continue;
      expect(assetIds, activity.id).toContain(activity.packageAssetId);
    }
  });

  it("gives every uploader and asset a real owner and subject", () => {
    const offerings = new Set(
      demoSubjects.map((subject) => subject.offeringId),
    );
    for (const asset of demoMediaAssets) {
      expect(personIds, asset.id).toContain(asset.uploadedByPersonId);
      expect(offerings, asset.id).toContain(asset.offeringId);
    }
  });

  it("keeps a locked lesson's release hint pointing at a real lesson", () => {
    for (const subject of demoSubjects) {
      for (const lesson of subject.lessons) {
        if (lesson.availability !== "locked" || lesson.status !== "published") {
          continue;
        }
        expect(lesson.releaseHint, lesson.id).toBeTruthy();
        const named = subject.lessons.some(
          (candidate) =>
            candidate.id !== lesson.id &&
            lesson.releaseHint?.includes(candidate.title),
        );
        expect(named, `${lesson.id} names its prerequisite`).toBe(true);
      }
    }
  });

  it("never leaves a locked lesson with progress recorded against it", () => {
    for (const subject of demoSubjects) {
      for (const lesson of subject.lessons) {
        if (lesson.availability === "locked") {
          expect(lesson.progressPercent, lesson.id).toBe(0);
        }
        expect(lesson.progressPercent).toBeGreaterThanOrEqual(0);
        expect(lesson.progressPercent).toBeLessThanOrEqual(100);
      }
    }
  });

  /* The dataset is now the seed for the PostgreSQL learning tables as well as
     the preview fallback. PostgreSQL enforces these relationships where D1 was
     never asked to, and a violation fails the whole seed transaction on a
     fresh database — the deployment nobody gets to test twice. */
  it("places every lesson in a unit its subject declares", () => {
    for (const subject of demoSubjects) {
      const unitIds = new Set(subject.units.map((unit) => unit.id));
      for (const lesson of subject.lessons) {
        expect(unitIds, `${lesson.id} -> ${lesson.unitId}`).toContain(
          lesson.unitId,
        );
      }
    }
  });

  it("keeps unit, standard and lesson ids unique across all subjects", () => {
    /* Each is a primary key in one shared table, not scoped per subject. */
    const unitIds = demoSubjects.flatMap((subject) =>
      subject.units.map((unit) => unit.id),
    );
    const standardIds = demoSubjects.flatMap((subject) =>
      subject.standards.map((standard) => standard.id),
    );
    const lessonIds = demoSubjects.flatMap((subject) =>
      subject.lessons.map((lesson) => lesson.id),
    );
    for (const [label, ids] of [
      ["unit", unitIds],
      ["standard", standardIds],
      ["lesson", lessonIds],
    ] as const) {
      const duplicates = ids.filter(
        (id, index) => ids.indexOf(id) !== index,
      );
      expect(duplicates, `duplicate ${label} ids`).toEqual([]);
    }
  });

  it("keeps standard codes unique too, since lessons cite them by code", () => {
    const codes = demoSubjects.flatMap((subject) =>
      subject.standards.map((standard) => standard.code),
    );
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("plays every video a lesson references", () => {
    const videoBlocks = demoSubjects.flatMap((subject) =>
      subject.lessons.flatMap((lesson) =>
        lesson.blocks.filter((block) => block.type === "video"),
      ),
    );
    expect(videoBlocks.length).toBeGreaterThan(0);
    for (const block of videoBlocks) {
      const source = resolveLessonVideo(block.config, () => undefined);
      expect(source, `${block.id} resolves to something playable`).toBeDefined();
    }
  });

  it("covers every question type across the demo assessments", () => {
    const used = new Set(
      demoAssessments.flatMap((assessment) =>
        assessment.questions.map((question) => question.type),
      ),
    );
    for (const type of [
      "single-choice",
      "multiple-choice",
      "true-false",
      "short-text",
      "numeric",
      "matching",
      "ordering",
      "essay",
    ]) {
      expect(used, `${type} is demonstrated`).toContain(type);
    }
  });

  it("numbers assessment questions from one and marks them all", () => {
    for (const assessment of demoAssessments) {
      const positions = assessment.questions.map(
        (question) => question.position,
      );
      expect(positions).toEqual(positions.map((_, index) => index + 1));
      for (const question of assessment.questions) {
        expect(question.marks, question.id).toBeGreaterThan(0);
        expect(question.answerNote.length, question.id).toBeGreaterThan(0);
      }
    }
  });

  it("averages subject progress over published lessons only", () => {
    const science = demoSubjectBySlug("integrated-science");
    expect(science).toBeDefined();
    /* 100, 40 and 0 across three published lessons. */
    expect(demoSubjectProgress(science!)).toBe(47);
  });
});

describe("lesson video sources", () => {
  it("frames YouTube watch, short and embed links alike", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=1UvuBYUbFk0",
      "https://youtu.be/1UvuBYUbFk0",
      "https://www.youtube.com/embed/1UvuBYUbFk0",
      "https://m.youtube.com/watch?v=1UvuBYUbFk0",
    ]) {
      const source = resolveVideoUrl(url);
      expect(source?.kind, url).toBe("youtube");
      if (source?.kind !== "youtube") continue;
      expect(source.embedUrl).toContain(
        "https://www.youtube-nocookie.com/embed/1UvuBYUbFk0",
      );
      expect(source.watchUrl).toBe(
        "https://www.youtube.com/watch?v=1UvuBYUbFk0",
      );
    }
  });

  it("carries a start time through to the embed", () => {
    const source = resolveVideoUrl(
      "https://www.youtube.com/watch?v=1UvuBYUbFk0&t=90s",
    );
    expect(source?.kind).toBe("youtube");
    if (source?.kind !== "youtube") return;
    expect(source.embedUrl).toContain("start=90");
  });

  it("accepts a direct media file over https", () => {
    const source = resolveVideoUrl("https://cdn.example.org/lesson.mp4");
    expect(source).toEqual({
      kind: "file",
      url: "https://cdn.example.org/lesson.mp4",
    });
  });

  it("refuses anything it cannot vouch for", () => {
    for (const url of [
      "http://www.youtube.com/watch?v=1UvuBYUbFk0",
      "https://evil.example.com/embed/whatever",
      "https://www.youtube.com/watch?v=short",
      "javascript:alert(1)",
      "not a url",
      "",
    ]) {
      expect(resolveVideoUrl(url), url).toBeUndefined();
    }
  });

  it("prefers the school's own upload over a third-party link", () => {
    const source = resolveLessonVideo(
      {
        mediaAssetId: "asset-1",
        videoUrl: "https://www.youtube.com/watch?v=1UvuBYUbFk0",
      },
      () => "/api/content/media?assetId=asset-1",
    );
    expect(source).toEqual({
      kind: "asset",
      url: "/api/content/media?assetId=asset-1",
    });
  });

  it("falls back to the link when the upload cannot be resolved", () => {
    const source = resolveLessonVideo(
      {
        mediaAssetId: "asset-missing",
        videoUrl: "https://www.youtube.com/watch?v=1UvuBYUbFk0",
      },
      () => undefined,
    );
    expect(source?.kind).toBe("youtube");
  });
});
