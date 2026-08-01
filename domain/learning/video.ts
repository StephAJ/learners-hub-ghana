import type { LessonBlock, LessonVideoSource } from "./types";

/* ==========================================================================
   Lesson video sources

   A lesson video is either a file the school uploaded, or something already
   published elsewhere that a teacher wants to teach around. Both reach the
   learner through this resolver, so the player never has to guess what it has
   been handed.

   The allowlist is the point. A lesson block's config is authored data, and
   authored data ends up in an iframe src — so a host is either recognised and
   framed, or it is a plain media file, or it is refused. There is no
   "embed whatever the URL says" path.
   ========================================================================== */

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const FILE_EXTENSIONS = [".mp4", ".webm", ".ogg", ".ogv", ".m4v", ".mov"];

/**
 * Works out what, if anything, a video block can play.
 *
 * `mediaUrlFor` turns an uploaded asset id into a URL — it is passed in rather
 * than imported so this stays pure and the caller keeps control of whether the
 * asset resolves to the authenticated media route or an in-tab preview URL.
 */
export function resolveLessonVideo(
  config: LessonBlock["config"],
  mediaUrlFor: (assetId: string) => string | undefined,
): LessonVideoSource | undefined {
  /* The school's own copy wins over a third-party link: it is the one they
     control, it needs no external request, and it is already access-checked. */
  if (config?.mediaAssetId) {
    const url = mediaUrlFor(config.mediaAssetId);
    if (url) return { kind: "asset", url };
  }
  if (config?.videoUrl) return resolveVideoUrl(config.videoUrl);
  return undefined;
}

/** Classifies a single URL, or returns undefined if it may not be played. */
export function resolveVideoUrl(
  rawUrl: string,
): LessonVideoSource | undefined {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return undefined;
  }

  /* http:// would downgrade the page and get blocked as mixed content anyway,
     so it is refused here where the reason can be explained. */
  if (url.protocol !== "https:") return undefined;

  const host = url.hostname.toLowerCase();

  if (YOUTUBE_HOSTS.has(host)) {
    const videoId = youtubeVideoId(url);
    if (!videoId) return undefined;
    /* nocookie defers YouTube's tracking cookies until the learner actually
       presses play. These are children's sessions. */
    const embed = new URL(
      `https://www.youtube-nocookie.com/embed/${videoId}`,
    );
    embed.searchParams.set("rel", "0");
    embed.searchParams.set("modestbranding", "1");
    const start = startSeconds(url);
    if (start) embed.searchParams.set("start", String(start));
    return {
      kind: "youtube",
      embedUrl: embed.toString(),
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  const path = url.pathname.toLowerCase();
  if (FILE_EXTENSIONS.some((extension) => path.endsWith(extension))) {
    return { kind: "file", url: url.toString() };
  }

  return undefined;
}

/** The eleven-character id, from any of the shapes YouTube hands out. */
function youtubeVideoId(url: URL): string | undefined {
  const candidate =
    url.hostname.toLowerCase().endsWith("youtu.be")
      ? url.pathname.slice(1)
      : url.pathname.startsWith("/embed/")
        ? url.pathname.slice("/embed/".length)
        : (url.searchParams.get("v") ?? "");
  const id = candidate.split("/")[0];
  return /^[\w-]{11}$/.test(id) ? id : undefined;
}

/** Honours ?t=90 or ?start=90 so a teacher can point at one part of a video. */
function startSeconds(url: URL): number | undefined {
  const raw = url.searchParams.get("start") ?? url.searchParams.get("t");
  if (!raw) return undefined;
  const seconds = Number.parseInt(raw.replace(/s$/, ""), 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}
