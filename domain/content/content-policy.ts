import type {
  InteractiveResultInput,
  MediaKind,
} from "./types";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_STATEMENT_BYTES = 8 * 1024;

const uploadRules: Record<
  MediaKind,
  { extensions: ReadonlySet<string>; contentTypes: ReadonlySet<string> }
> = {
  image: {
    extensions: new Set(["jpg", "jpeg", "png", "webp", "gif"]),
    contentTypes: new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ]),
  },
  audio: {
    extensions: new Set(["mp3", "m4a", "ogg", "wav"]),
    contentTypes: new Set([
      "audio/mpeg",
      "audio/mp4",
      "audio/ogg",
      "audio/wav",
      "audio/x-wav",
    ]),
  },
  video: {
    extensions: new Set(["mp4", "webm", "mov"]),
    contentTypes: new Set([
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ]),
  },
  document: {
    extensions: new Set(["pdf", "docx", "pptx", "xlsx", "txt"]),
    contentTypes: new Set([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
    ]),
  },
  "h5p-package": {
    extensions: new Set(["h5p"]),
    contentTypes: new Set([
      "application/zip",
      "application/x-h5p",
      "application/octet-stream",
    ]),
  },
};

export class ContentPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentPolicyError";
  }
}

export function validateUpload(input: {
  contentType: string;
  filename: string;
  kind: MediaKind;
  sizeBytes: number;
}) {
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new ContentPolicyError("Choose a non-empty file to upload.");
  }
  if (input.sizeBytes > MAX_UPLOAD_BYTES) {
    throw new ContentPolicyError("Uploads cannot exceed 25 MB.");
  }

  const filename = safeDisplayFilename(input.filename);
  const extension = fileExtension(filename);
  const rule = uploadRules[input.kind];
  if (!rule.extensions.has(extension)) {
    throw new ContentPolicyError(
      `The selected file extension is not valid for ${input.kind}.`,
    );
  }
  if (!rule.contentTypes.has(input.contentType.toLowerCase())) {
    throw new ContentPolicyError(
      `The selected file type is not valid for ${input.kind}.`,
    );
  }

  return { extension, filename };
}

export function safeDisplayFilename(value: string) {
  const filename = value
    .replaceAll("\\", "/")
    .split("/")
    .at(-1)
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  if (!filename) {
    throw new ContentPolicyError("The uploaded file needs a valid name.");
  }
  return filename.slice(0, 160);
}

export function validateH5pEmbedUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ContentPolicyError("Enter a valid H5P embed URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !url.hostname.includes(".") ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".local") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) ||
    url.hostname.startsWith("[")
  ) {
    throw new ContentPolicyError(
      "H5P activities require a public HTTPS embed URL.",
    );
  }
  return {
    launchOrigin: url.origin,
    launchUrl: url.toString(),
  };
}

export function validateInteractiveResult(input: InteractiveResultInput) {
  if (
    !input.activityId.trim() ||
    !input.lessonId.trim() ||
    !Number.isInteger(input.lessonVersion) ||
    input.lessonVersion < 1
  ) {
    throw new ContentPolicyError(
      "Activity, lesson, and published lesson version are required.",
    );
  }
  if (!["experienced", "answered", "completed"].includes(input.verb)) {
    throw new ContentPolicyError("Unsupported interactive result verb.");
  }
  if (
    input.scorePercent !== undefined &&
    (!Number.isFinite(input.scorePercent) ||
      input.scorePercent < 0 ||
      input.scorePercent > 100)
  ) {
    throw new ContentPolicyError(
      "Interactive scores must be between 0 and 100.",
    );
  }
  const statementJson = JSON.stringify(input.statement);
  if (new TextEncoder().encode(statementJson).byteLength > MAX_STATEMENT_BYTES) {
    throw new ContentPolicyError(
      "The interactive result statement is too large.",
    );
  }
  return {
    ...input,
    scorePercent:
      input.scorePercent === undefined
        ? undefined
        : Math.round(input.scorePercent),
    statementJson,
  };
}

function fileExtension(filename: string) {
  return filename.split(".").at(-1)?.toLowerCase() ?? "";
}
