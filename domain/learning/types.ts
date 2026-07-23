export type LessonStatus = "draft" | "published" | "archived";

export type LessonBlockType =
  | "text"
  | "video"
  | "interactive"
  | "practice"
  | "resource";

export type LessonBlock = {
  content: string;
  id: string;
  position: number;
  ready: boolean;
  title: string;
  type: LessonBlockType;
};

export type LessonBlockInput = Omit<LessonBlock, "position">;

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

