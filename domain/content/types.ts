export type MediaKind =
  | "image"
  | "audio"
  | "video"
  | "document"
  | "h5p-package";

export type MediaAssetStatus =
  | "ready"
  | "awaiting-runtime"
  | "quarantined"
  | "deleted";

export type MediaAsset = {
  contentType: string;
  createdAt: string;
  id: string;
  kind: MediaKind;
  originalFilename: string;
  offeringId: string;
  sizeBytes: number;
  status: MediaAssetStatus;
};

export type InteractiveActivityStatus =
  | "draft"
  | "launchable"
  | "awaiting-runtime"
  | "archived";

export type InteractiveActivity = {
  contentType: string;
  fallbackText: string;
  id: string;
  launchOrigin?: string;
  launchUrl?: string;
  offeringId: string;
  packageAssetId?: string;
  provider: "h5p";
  status: InteractiveActivityStatus;
  title: string;
};

export type InteractiveResultVerb =
  | "experienced"
  | "answered"
  | "completed";

export type InteractiveResultInput = {
  activityId: string;
  completion: boolean;
  lessonId: string;
  lessonVersion: number;
  scorePercent?: number;
  statement: Record<string, unknown>;
  success?: boolean;
  verb: InteractiveResultVerb;
};

