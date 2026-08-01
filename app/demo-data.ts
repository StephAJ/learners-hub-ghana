import type {
  LearnerAssessment,
  LearnerQuestion,
} from "../db/assessment-repository";
import type { TeacherContentWorkspace } from "../db/content-repository";
import type {
  LearnerLesson,
  LearnerSubject,
  LessonSummary,
  TeacherLessonWorkspace,
} from "../db/learning-repository";
import {
  DEMO_CLASS_NAME,
  demoAssessmentBySlug,
  demoActivities,
  demoMediaAssets,
  demoPersonName,
  demoSubjectByOffering,
  demoSubjectProgress,
  demoSubjects,
  type DemoAssessment,
  type DemoSubject,
} from "../domain/demo/greenfield";

/* ==========================================================================
   Demo projections

   The Greenfield dataset in domain/demo is written once, in the shape the
   school actually has. Each screen needs it in the shape its repository would
   have returned, and these functions do that conversion.

   Keeping the projections here rather than in the dataset means domain/demo
   stays free of database types, so the same dataset can be handed to the
   Postgres seed when the learning repositories move off D1.
   ========================================================================== */

/** Everything the learner subject index needs, per subject. */
export type DemoSubjectCard = {
  className: string;
  code: string;
  lessonCount: number;
  nextLessonTitle?: string;
  offeringId: string;
  progressPercent: number;
  slug: string;
  subjectName: string;
  teacherName: string;
};

export function demoSubjectCards(): DemoSubjectCard[] {
  return demoSubjects.map((subject) => {
    const published = subject.lessons.filter(
      (lesson) => lesson.status === "published",
    );
    /* "Next" is the first lesson that is open and unfinished — what a learner
       returning to the subject should be pointed at. */
    const next = published.find(
      (lesson) =>
        lesson.availability === "available" && lesson.progressPercent < 100,
    );
    return {
      className: DEMO_CLASS_NAME,
      code: subject.code,
      lessonCount: published.length,
      nextLessonTitle: next?.title,
      offeringId: subject.offeringId,
      progressPercent: demoSubjectProgress(subject),
      slug: subject.slug,
      subjectName: subject.subjectName,
      teacherName: demoPersonName(subject.teacherPersonId),
    };
  });
}

/** A subject as the learner lesson player expects it. Drafts are withheld. */
export function demoLearnerSubject(subject: DemoSubject): LearnerSubject {
  return {
    className: DEMO_CLASS_NAME,
    code: subject.code,
    lessons: subject.lessons
      .filter((lesson) => lesson.status === "published")
      .map(toLearnerLesson),
    offeringId: subject.offeringId,
    subjectName: subject.subjectName,
    teacherName: demoPersonName(subject.teacherPersonId),
  };
}

function toLearnerLesson(lesson: DemoSubject["lessons"][number]): LearnerLesson {
  return {
    availability: lesson.availability,
    blocks: lesson.blocks,
    estimatedMinutes: lesson.estimatedMinutes,
    id: lesson.id,
    objectives: lesson.objectives,
    progressPercent: lesson.progressPercent,
    releaseHint: lesson.releaseHint,
    standardCodes: lesson.standardCodes,
    summary: lesson.summary,
    title: lesson.title,
    unitTitle: lesson.unitTitle,
    version: lesson.version,
  };
}

/** A subject as the teacher lesson library expects it. Drafts are included. */
export function demoTeacherLessonWorkspace(
  subject: DemoSubject,
): TeacherLessonWorkspace {
  const mappedStandards = new Set(
    subject.lessons.flatMap((lesson) => lesson.standardCodes),
  );
  return {
    className: DEMO_CLASS_NAME,
    code: subject.code,
    /* Coverage is the share of the subject's standards that at least one
       lesson claims — the same figure the repository computes. */
    coveragePercent: Math.round(
      (mappedStandards.size / Math.max(1, subject.standards.length)) * 100,
    ),
    lessons: subject.lessons.map((lesson) => toLessonSummary(subject, lesson)),
    offeringId: subject.offeringId,
    standards: subject.standards,
    subjectName: subject.subjectName,
    units: subject.units,
  };
}

function toLessonSummary(
  subject: DemoSubject,
  lesson: DemoSubject["lessons"][number],
): LessonSummary {
  const prerequisite = lesson.releaseHint
    ? subject.lessons.find(
        (candidate) =>
          candidate.id !== lesson.id &&
          lesson.releaseHint?.includes(candidate.title),
      )
    : undefined;
  return {
    blockCount: lesson.blocks.length,
    id: lesson.id,
    objectiveCount: lesson.objectives.length,
    prerequisiteTitle: prerequisite?.title,
    releaseMode: prerequisite ? "prerequisite" : "immediate",
    standardCodes: lesson.standardCodes,
    status: lesson.status,
    title: lesson.title,
    unitId: lesson.unitId,
    unitTitle: lesson.unitTitle,
    updatedAt: lesson.publishedAt ?? "2026-07-28T09:00:00Z",
    version: lesson.version,
  };
}

/** The media library and activity list for one subject. */
export function demoContentWorkspace(
  subject: DemoSubject,
): TeacherContentWorkspace {
  const mediaAssets = demoMediaAssets
    .filter((asset) => asset.offeringId === subject.offeringId)
    .map((asset) => ({
      contentType: asset.contentType,
      createdAt: asset.createdAt,
      id: asset.id,
      kind: asset.kind,
      offeringId: asset.offeringId,
      originalFilename: asset.originalFilename,
      sizeBytes: asset.sizeBytes,
      status: asset.status,
    }));
  return {
    activities: demoActivities
      .filter((activity) => activity.offeringId === subject.offeringId)
      .map((activity) => ({
        contentType: activity.contentType,
        fallbackText: activity.fallbackText,
        id: activity.id,
        offeringId: activity.offeringId,
        packageAssetId: activity.packageAssetId,
        provider: "h5p" as const,
        status: activity.status,
        title: activity.title,
      })),
    className: DEMO_CLASS_NAME,
    mediaAssets,
    offeringId: subject.offeringId,
    subjectName: subject.subjectName,
    totalBytes: mediaAssets.reduce((total, asset) => total + asset.sizeBytes, 0),
  };
}

/** An assessment as the learner quiz runner expects it, answer keys removed. */
export function demoLearnerAssessment(
  assessment: DemoAssessment,
): LearnerAssessment {
  return {
    attempt: null,
    id: assessment.id,
    instructions: assessment.instructions,
    passMarkPercent: assessment.passMarkPercent,
    purpose: assessment.purpose,
    questions: assessment.questions.map(
      (question): LearnerQuestion => ({
        id: question.id,
        marks: question.marks,
        options: question.options,
        position: question.position,
        prompt: question.prompt,
        questionVersion: 1,
        type: question.type,
      }),
    ),
    result: null,
    timeLimitMinutes: assessment.timeLimitMinutes,
    title: assessment.title,
    version: 1,
  };
}

export function demoLearnerAssessmentBySlug(
  slug: string,
): LearnerAssessment | undefined {
  const assessment = demoAssessmentBySlug(slug);
  return assessment ? demoLearnerAssessment(assessment) : undefined;
}

/** The subject a teacher owns, used to pick their workspace's default. */
export function demoSubjectForTeacher(
  teacherPersonId: string,
): DemoSubject | undefined {
  return demoSubjects.find(
    (subject) => subject.teacherPersonId === teacherPersonId,
  );
}

export { demoSubjectByOffering, demoSubjects };
