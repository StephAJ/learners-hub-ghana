import type {
  LearnerAssessment,
  LearnerQuestion,
} from "../db/assessment-repository";
import type {
  LearnerLesson,
  LearnerSubject,
} from "../db/learning-repository";
import {
  DEMO_CLASS_NAME,
  demoAssessmentBySlug,
  demoAssessmentQuestions,
  demoMediaAssets,
  demoPersonName,
  demoSubjectByOffering,
  demoSubjectProgress,
  demoSubjects,
  demoYearGroup,
  type DemoAssessment,
  type DemoSubject,
} from "../domain/demo/greenfield";
import type { LessonBlock } from "../domain/learning/types";

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
  /** Cover photograph, when the subject has one. */
  coverUrl?: string;
  teacherName: string;
  /** The year the subject is pitched at, without the stream. */
  yearGroup: string;
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
      coverUrl: subject.coverUrl,
      lessonCount: published.length,
      nextLessonTitle: next?.title,
      offeringId: subject.offeringId,
      progressPercent: demoSubjectProgress(subject),
      slug: subject.slug,
      subjectName: subject.subjectName,
      teacherName: demoPersonName(subject.teacherPersonId),
      yearGroup: demoYearGroup(DEMO_CLASS_NAME),
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

/**
 * Resolves a demo block's asset id into the file metadata the player shows.
 *
 * The database does this with a join; without one the demo would render every
 * resource as "no longer available", which is exactly the dead end the
 * download used to be. The asset records already exist — they were only never
 * connected to the blocks that reference them.
 */
function withDemoAttachment(block: LessonBlock): LessonBlock {
  const assetId = block.config?.mediaAssetId;
  if (!assetId) return block;
  const asset = demoMediaAssets.find((item) => item.id === assetId);
  if (!asset || asset.status !== "ready") return block;
  return {
    ...block,
    attachment: {
      contentType: asset.contentType,
      filename: asset.originalFilename,
      kind: asset.kind,
      sizeBytes: asset.sizeBytes,
    },
  };
}

function toLearnerLesson(lesson: DemoSubject["lessons"][number]): LearnerLesson {
  return {
    availability: lesson.availability,
    blocks: lesson.blocks.map(withDemoAttachment),
    estimatedMinutes: lesson.estimatedMinutes,
    id: lesson.id,
    objectives: lesson.objectives,
    progressPercent: lesson.progressPercent,
    releaseHint: lesson.releaseHint,
    standardCodes: lesson.standardCodes,
    summary: lesson.summary,
    thumbnailUrl: lesson.thumbnailUrl,
    title: lesson.title,
    unitTitle: lesson.unitTitle,
    version: lesson.version,
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
    /* Answer keys never leave the server side of this projection: a learner
       is handed the paper, not the mark scheme. */
    questions: demoAssessmentQuestions(assessment).map(
      (question, index): LearnerQuestion => ({
        id: question.id,
        marks: question.marks,
        options: question.options,
        position: index + 1,
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

export { demoSubjectByOffering, demoSubjects };
