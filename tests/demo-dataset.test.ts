import { describe, expect, it } from "vitest";
import {
  demoActivities,
  demoAssessmentQuestions,
  demoAssessments,
  demoLibrary,
  demoQuestionBank,
  demoLearners,
  demoMediaAssets,
  demoPeople,
  demoPeriods,
  demoReportAverageTenths,
  demoReports,
  demoTimetable,
  demoSubjectBySlug,
  demoSubjectProgress,
  demoSubjects,
} from "../domain/demo/greenfield";
import { resolveLessonVideo, resolveVideoUrl } from "../domain/learning/video";
import { SEED_SUBJECTS } from "../db/academic-seed";

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
        demoAssessmentQuestions(assessment).map((question) => question.type),
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

  it("resolves every question an assessment lists", () => {
    for (const assessment of demoAssessments) {
      /* A missing id would silently shorten the paper rather than fail. */
      expect(
        demoAssessmentQuestions(assessment).map((question) => question.id),
        assessment.slug,
      ).toEqual(assessment.questionIds);
    }
  });

  it("marks every bank question and gives it an answer key", () => {
    for (const question of demoQuestionBank) {
      expect(question.marks, question.id).toBeGreaterThan(0);
      const { rubric, value } = question.answerKey;
      /* Auto-marked types need a value; the ones a teacher reads need a
         rubric. A question with neither cannot be marked at all. */
      expect(
        rubric !== undefined || value !== undefined,
        `${question.id} has no answer key`,
      ).toBe(true);
      expect(question.rationale.length, question.id).toBeGreaterThan(0);
    }
  });

  it("keeps bank question ids unique", () => {
    const ids = demoQuestionBank.map((question) => question.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only puts a question on a paper from the same subject", () => {
    for (const assessment of demoAssessments) {
      for (const question of demoAssessmentQuestions(assessment)) {
        expect(question.offeringId, `${assessment.slug}/${question.id}`).toBe(
          assessment.offeringId,
        );
      }
    }
  });

  it("offers choices for the types that need them, and none for the rest", () => {
    const needsOptions = new Set([
      "single-choice",
      "multiple-choice",
      "matching",
      "grouping",
      "ordering",
      /* A gap-fill offers the word bank a learner picks from. A table and a
         number line offer nothing — their layout is the prompt and their
         axis is the answer key. */
      "cloze",
    ]);
    for (const question of demoQuestionBank) {
      if (needsOptions.has(question.type)) {
        expect(question.options.length, question.id).toBeGreaterThan(1);
      } else {
        expect(question.options, question.id).toEqual([]);
      }
    }
  });

  /* A sorting question that offers one group cannot be got wrong, and one
     that offers a group nothing belongs in is a trick rather than a question.
     Both are easy to write by accident, so the demo set is held to neither. */
  it("gives every sorting question at least two groups, each of them used", () => {
    for (const question of demoQuestionBank) {
      if (question.type !== "grouping") continue;
      const groups = question.options
        .filter((option) => option.id.startsWith("right:"))
        .map((option) => option.id.replace("right:", ""));
      expect(groups.length, question.id).toBeGreaterThan(1);

      const used = new Set(Object.values(question.answerKey.value ?? {}));
      expect(new Set(groups), question.id).toEqual(used);

      /* And every item the learner is given has somewhere to go. */
      const items = question.options
        .filter((option) => option.id.startsWith("left:"))
        .map((option) => option.id.replace("left:", ""));
      expect(
        Object.keys(question.answerKey.value ?? {}).sort(),
        question.id,
      ).toEqual([...items].sort());
    }
  });

  /* A question mapped to another subject's outcome would quietly corrupt that
     subject's mastery picture, and the seed drops such a row silently — so
     the dataset is held to it here, where the mistake is visible. */
  it("only maps a question to an outcome its own subject declares", () => {
    for (const question of demoQuestionBank) {
      const subject = demoSubjects.find(
        (candidate) => candidate.offeringId === question.offeringId,
      );
      const codes = new Set(
        (subject?.standards ?? []).map((standard) => standard.code),
      );
      for (const code of question.standardCodes) {
        expect(codes, `${question.id} -> ${code}`).toContain(code);
      }
    }
  });

  /* An outcome nothing tests can only ever read "covered in class, not tested
     yet" — fine for a real school mid-term, but a demo that shipped like that
     would look broken rather than honest. Every outcome with lessons behind
     it has at least one question too. */
  it("gives every taught outcome something that tests it", () => {
    const tested = new Set(
      demoQuestionBank.flatMap((question) => question.standardCodes),
    );
    for (const subject of demoSubjects) {
      for (const standard of subject.standards) {
        const taught = subject.lessons.some((lesson) =>
          lesson.standardCodes.includes(standard.code),
        );
        if (!taught) continue;
        expect(tested, `${standard.code} is taught but never tested`).toContain(
          standard.code,
        );
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

/* The timetable and the register feed the operations and reporting seeds. Both
   used to be written out separately inside those seeds, and both had drifted:
   English was credited to an administrator, and two learners existed in the
   markbook but in no directory. These hold them to the subjects. */

describe("class roster and timetable", () => {
  it("puts every learner in the class", () => {
    expect(demoLearners.length).toBeGreaterThanOrEqual(3);
    for (const learner of demoLearners) {
      expect(learner.kind).toBe("learner");
      expect(learner.scopeType).toBe("class");
    }
  });

  it("gives every learner a distinct id and email", () => {
    const ids = demoLearners.map((learner) => learner.id);
    const emails = demoLearners.map((learner) => learner.email);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it("only ever schedules a subject with the teacher who owns it", () => {
    for (const entry of demoTimetable) {
      const subject = demoSubjects.find(
        (candidate) => candidate.offeringId === entry.offeringId,
      );
      expect(subject, entry.id).toBeDefined();
      expect(entry.teacherPersonId, entry.id).toBe(subject!.teacherPersonId);
      expect(entry.subjectName, entry.id).toBe(subject!.subjectName);
    }
  });

  it("never schedules anyone who cannot teach", () => {
    for (const entry of demoTimetable) {
      const teacher = demoPeople.find(
        (person) => person.id === entry.teacherPersonId,
      );
      expect(["teacher", "class-teacher"], entry.id).toContain(teacher?.role);
    }
  });

  it("schedules into real teaching periods, never the break", () => {
    const teaching = new Set(
      demoPeriods.filter((p) => p.kind === "lesson").map((p) => p.id),
    );
    for (const entry of demoTimetable) {
      expect(teaching, entry.id).toContain(entry.periodId);
    }
  });

  it("puts one lesson in each period of each weekday", () => {
    const seen = new Set<string>();
    for (const entry of demoTimetable) {
      const slot = `${entry.weekday}:${entry.periodId}`;
      expect(seen.has(slot), `two lessons in ${slot}`).toBe(false);
      seen.add(slot);
    }
    const teachingPeriods = demoPeriods.filter((p) => p.kind === "lesson");
    expect(demoTimetable).toHaveLength(5 * teachingPeriods.length);
  });

  it("gives every timetable entry a distinct id", () => {
    const ids = demoTimetable.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("orders periods without overlapping them", () => {
    const sorted = [...demoPeriods].sort((a, b) => a.position - b.position);
    expect(sorted.map((p) => p.id)).toEqual(demoPeriods.map((p) => p.id));
    for (let i = 1; i < sorted.length; i += 1) {
      expect(
        sorted[i].startsAt >= sorted[i - 1].endsAt,
        `${sorted[i].id} starts before ${sorted[i - 1].id} ends`,
      ).toBe(true);
    }
  });
});

/* The gradebook and report seeds project from these. A report card is what a
   guardian reads most carefully, so it has to describe the school the learner
   is actually in — the previous seed listed six subjects, two of which existed
   nowhere else, against offering ids that were never created. */

describe("reports", () => {
  it("writes a report for every learner on the register", () => {
    const reported = new Set(demoReports.map((r) => r.learnerPersonId));
    for (const learner of demoLearners) {
      expect(reported, `no report for ${learner.id}`).toContain(learner.id);
    }
    expect(demoReports).toHaveLength(demoLearners.length);
  });

  it("reports on exactly the subjects the learner takes", () => {
    const slugs = demoSubjects.map((subject) => subject.slug).sort();
    for (const report of demoReports) {
      expect(Object.keys(report.results).sort(), report.learnerPersonId).toEqual(
        slugs,
      );
    }
  });

  it("keeps every score and attendance figure in range", () => {
    for (const report of demoReports) {
      expect(report.attendancePresent).toBeLessThanOrEqual(
        report.attendanceTotal,
      );
      expect(report.attendancePresent).toBeGreaterThanOrEqual(0);
      for (const [slug, result] of Object.entries(report.results)) {
        expect(result.scoreTenths, `${report.learnerPersonId}/${slug}`)
          .toBeGreaterThanOrEqual(0);
        expect(result.scoreTenths, `${report.learnerPersonId}/${slug}`)
          .toBeLessThanOrEqual(1000);
        expect(result.comment.length).toBeGreaterThan(0);
      }
    }
  });

  it("averages across the subjects it reports on", () => {
    for (const report of demoReports) {
      const scores = Object.values(report.results).map((r) => r.scoreTenths);
      const expected = Math.round(
        scores.reduce((total, score) => total + score, 0) / scores.length,
      );
      expect(demoReportAverageTenths(report)).toBe(expected);
    }
  });
});

/* ==========================================================================
   The library

   A resource filed under a code the school does not teach joins to nothing,
   so the listing shows no subject and the subject filter never offers it. It
   is silent — which is exactly how five of the seven shipped with codes
   invented rather than looked up.
   ========================================================================== */
describe("the demo library", () => {
  const codes = new Set(SEED_SUBJECTS.map((subject) => subject.code));

  it("files every resource under a subject this school teaches", () => {
    for (const resource of demoLibrary) {
      if (!resource.subjectCode) continue;
      expect(codes, `${resource.id} -> ${resource.subjectCode}`).toContain(
        resource.subjectCode,
      );
    }
  });

  it("gives every resource a title, a description and a filename", () => {
    for (const resource of demoLibrary) {
      expect(resource.title.trim(), resource.id).toBeTruthy();
      expect(resource.description.trim(), resource.id).toBeTruthy();
      expect(resource.filename, resource.id).toMatch(/\.pdf$/);
    }
  });

  it("keeps ids and filenames unique, since both are keys", () => {
    const ids = demoLibrary.map((resource) => resource.id);
    const files = demoLibrary.map((resource) => resource.filename);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(files).size).toBe(files.length);
  });

  /* Both filters are optional, and a demo where every listing is filed
     identically would not show that. */
  it("leaves some resources belonging to no subject and no year", () => {
    expect(
      demoLibrary.some(
        (resource) => !resource.subjectCode && !resource.yearGroup,
      ),
    ).toBe(true);
  });

  it("puts something on more than one shelf", () => {
    const shelves = new Set(demoLibrary.map((resource) => resource.category));
    expect(shelves.size).toBeGreaterThan(2);
  });
});
