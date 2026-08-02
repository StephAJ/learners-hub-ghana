export type LessonStatus = "draft" | "published" | "archived";

export type LessonBlockType =
  | "text"
  | "video"
  | "interactive"
  | "practice"
  | "resource";

export type LessonBlock = {
  config?: {
    activityId?: string;
    mediaAssetId?: string;
    provider?: "h5p";
    /* An optional aside a teacher can attach to a reading block — the
       "did you know" panel. Both fields are the author's; the player renders
       nothing when they are absent, rather than inventing a fact. */
    noteTitle?: string;
    noteBody?: string;
    /* A video block sources its footage one of two ways: mediaAssetId streams a
       file the school uploaded, and videoUrl points at something already
       published elsewhere. Schools without the bandwidth or rights to host
       their own footage still need to set a lesson around a good video, so both
       are first-class. When both are set the uploaded asset wins, because it is
       the copy the school controls. */
    videoUrl?: string;
    /* The still a learner sees before pressing play. Optional on purpose: a
       teacher who has not chosen one gets generated artwork rather than a
       black rectangle, so the block never looks broken for want of a
       thumbnail nobody had time to make. */
    posterAssetId?: string;
  };
  content: string;
  id: string;
  position: number;
  ready: boolean;
  title: string;
  type: LessonBlockType;
};

/* Where a lesson video comes from. Only providers listed here are ever framed;
   anything else is treated as a direct media file, and an unrecognised host is
   refused rather than embedded. */
export type LessonVideoSource =
  | { kind: "asset"; url: string }
  | { kind: "file"; url: string }
  | { kind: "youtube"; embedUrl: string; videoId: string; watchUrl: string };

export type LessonBlockInput = Omit<LessonBlock, "position">;

export type CurriculumStandard = {
  code: string;
  description: string;
  id: string;
  position: number;
  strand: string;
  subStrand: string;
};

export type LessonReleaseRule = {
  availableFrom?: string;
  availableUntil?: string;
  lessonId: string;
  prerequisiteLessonId?: string;
};

export type LessonAvailability =
  | "available"
  | "scheduled"
  | "locked"
  | "closed";

export type Lesson = {
  authorPersonId: string;
  blocks: LessonBlock[];
  id: string;
  objectives: string[];
  offeringId: string;
  publishedAt?: string;
  status: LessonStatus;
  summary: string;
  tenantId: string;
  title: string;
  unitId: string;
  version: number;
};

export type CreateLessonDraftCommand = Omit<
  Lesson,
  "blocks" | "publishedAt" | "status" | "version"
>;

export type LessonProgressStatus = "in-progress" | "completed";

export type LessonProgress = {
  completedAt?: string;
  learnerId: string;
  lessonId: string;
  lessonVersion: number;
  percent: number;
  status: LessonProgressStatus;
  tenantId: string;
  updatedAt: string;
};

export type RecordLessonProgressCommand = Omit<
  LessonProgress,
  "completedAt" | "status"
>;
