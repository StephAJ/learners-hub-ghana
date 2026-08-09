"use client";

import Image from "next/image";
import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { LearnerSubject } from "../../../../db/learning-repository";
import type {
  CheckpointMarkResult,
  CheckpointQuestion,
} from "../../../../db/lesson-checkpoint-repository";
import type {
  LessonAttachment,
  LessonBlock,
} from "../../../../domain/learning/types";
import { resolveLessonVideo } from "../../../../domain/learning/video";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  ClockIcon,
  DownloadIcon,
  FileTextIcon,
  ImageIcon,
  LayersIcon,
  LockIcon,
  PencilIcon,
  PlayCircleIcon,
  PlayIcon,
  ReadIcon,
  SparkIcon,
  UsersIcon,
} from "../../../components/icons";
import { LessonPoster } from "../../../components/lesson-poster";
import {
  QuestionInput,
  hasAnswer,
} from "../../../components/question-input";
import {
  QuestionFigure,
  QuestionFormula,
} from "../../../components/question-media";
import { beginFocusMode, endFocusMode } from "../../../components/sidebar-state";

/* The three panels under the stage, in one place: a tab's label, its glyph
   and its hue are the same fact, and keeping them together stops a fourth
   panel being added as a label with no icon. */
const LESSON_PANELS = [
  { hue: "teal", Icon: ReadIcon, id: "overview", label: "Overview" },
  { hue: "lime", Icon: SparkIcon, id: "objectives", label: "What you'll learn" },
  {
    hue: "violet",
    Icon: ClipboardCheckIcon,
    id: "standards",
    label: "Curriculum",
  },
] as const;

/**
 * True when a teacher is looking at their own lesson rather than a learner
 * working through it.
 *
 * The player is the same component either way — the whole point of a preview
 * is that it is not a mock-up — so what changes is only what gets written. A
 * teacher clicking through their lesson must not leave progress rows or xAPI
 * statements behind under their own name; a markbook that counts the teacher
 * as having completed the lesson is worse than no preview at all.
 *
 * Context rather than a prop because the interactive block is three components
 * down and takes nothing else from up here.
 */
const LessonPreviewContext = createContext(false);

export function LessonPlayer({
  fallback,
  preview = false,
}: {
  fallback: LearnerSubject;
  preview?: boolean;
}) {
  const [subject, setSubject] = useState(fallback);
  const [selectedLessonId, setSelectedLessonId] = useState(
    fallback.lessons[0]?.id ?? "",
  );
  const [activeBlockIndex, setActiveBlockIndex] = useState(0);
  const [progress, setProgress] = useState(
    fallback.lessons[0]?.progressPercent ?? 0,
  );
  /* "preview" used to be the third state here: on a failed fetch the player
     kept the server's subject, merged in lessons from an in-memory Map, and
     served H5P activities from the demo dataset — with progress and xAPI
     silently not recorded. The Map has had no writers since the teacher
     screens stopped writing to it, so it only ever contributed nothing.

     The subject is rendered on the server from the learner's own data, so a
     failed refresh leaves what is on screen rather than substituting
     somebody else's. */
  const [dataMode, setDataMode] = useState<"loading" | "protected">("loading");
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState<
    "overview" | "objectives" | "standards"
  >("overview");

  const offeringId = fallback.offeringId;

  /* A lesson is the one screen that wants the whole window, so the sidebar
     folds to its rail on the way in and unfolds on the way out — unless the
     learner had already collapsed it, in which case it is left alone. */
  useEffect(() => {
    beginFocusMode();
    return () => endFocusMode();
  }, []);

  useEffect(() => {
    let active = true;
    async function loadSubject() {
      try {
        const response = await fetch(
          `/api/learn/subjects?offeringId=${encodeURIComponent(offeringId)}`,
        );
        if (!response.ok) throw new Error("Subject data unavailable.");
        const payload = (await response.json()) as { subject: LearnerSubject };
        if (!active || payload.subject.lessons.length === 0) return;
        setSubject(payload.subject);
        setSelectedLessonId(payload.subject.lessons[0].id);
        setProgress(payload.subject.lessons[0].progressPercent);
        setDataMode("protected");
      } catch {
        /* Left as the server rendered it. Writes below still go to the API
           and report their own failures. */
        if (active) setNotice("Your progress may not be saved just now.");
      }
    }
    void loadSubject();
    return () => {
      active = false;
    };
  }, [offeringId]);

  const lessons = subject.lessons;

  const selectedLesson =
    lessons.find((lesson) => lesson.id === selectedLessonId) ?? lessons[0];
  const activeBlock =
    selectedLesson.blocks[activeBlockIndex] ?? selectedLesson.blocks[0];
  const subjectProgress = Math.round(
    lessons.reduce((total, lesson) => total + lesson.progressPercent, 0) /
      Math.max(1, lessons.length),
  );
  const completedBlocks = Math.max(
    1,
    Math.round((progress / 100) * selectedLesson.blocks.length),
  );
  const lessonPosition = useMemo(
    () =>
      Math.max(
        1,
        lessons.findIndex((lesson) => lesson.id === selectedLesson.id) + 1,
      ),
    [lessons, selectedLesson.id],
  );

  async function moveToBlock(index: number) {
    setActiveBlockIndex(index);
    const nextProgress = Math.max(
      progress,
      Math.round(((index + 1) / selectedLesson.blocks.length) * 100),
    );
    setProgress(nextProgress);
    await persistProgress(nextProgress);
  }

  async function completeLesson() {
    setProgress(100);
    await persistProgress(100);
    setNotice(
      preview
        ? "End of the lesson. Nothing was recorded — this is a preview."
        : "Lesson complete. Your progress has been recorded.",
    );
    /* Re-read rather than unlocking the next lesson locally: which lesson
       opens next is a release rule the server owns, and guessing at it was
       how a locked lesson could appear to unlock without having done so. */
    const response = await fetch(
      `/api/learn/subjects?offeringId=${encodeURIComponent(offeringId)}`,
    );
    if (response.ok) {
      const payload = (await response.json()) as { subject: LearnerSubject };
      setSubject(payload.subject);
    }
  }

  async function persistProgress(percent: number) {
    /* A preview reads the lesson; it does not record having read it. */
    if (preview) return;
    const response = await fetch("/api/learn/subjects", {
      body: JSON.stringify({
        lessonId: selectedLesson.id,
        lessonVersion: selectedLesson.version,
        percent,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setNotice(payload.error ?? "Progress could not be saved.");
    }
  }

  const completedLessons = lessons.filter(
    (lesson) => lesson.progressPercent === 100,
  ).length;

  return (
    <LessonPreviewContext.Provider value={preview}>
    <div className="lesson-shell">
      {preview ? (
        <p className="lesson-preview-ribbon">
          Preview — this is the lesson exactly as a learner sees it. Nothing you
          do here is recorded.
        </p>
      ) : null}
      <header className="lesson-toprail">
        <div className="lesson-toprail-heading">
          <Link className="course-back" href="/learn/subjects">
            <ArrowLeftIcon size={14} />
            All subjects
          </Link>
          <span className="lesson-toprail-divider" aria-hidden="true" />
          <div className="lesson-toprail-title">
            <p className="lesson-eyebrow">
              {selectedLesson.unitTitle} · Lesson {lessonPosition} of{" "}
              {lessons.length}
            </p>
            <h2>{selectedLesson.title}</h2>
          </div>
        </div>
        <div className="course-stage-nav">
          <span className={`learning-mode mode-${dataMode}`}>
            <i aria-hidden="true" />
            {dataMode === "protected" ? "Progress saved" : "Connecting"}
          </span>
          <button
            aria-label="Previous activity"
            disabled={activeBlockIndex === 0}
            onClick={() => void moveToBlock(activeBlockIndex - 1)}
            type="button"
          >
            <ChevronLeftIcon size={18} />
          </button>
          <button
            aria-label="Next activity"
            disabled={activeBlockIndex >= selectedLesson.blocks.length - 1}
            onClick={() => void moveToBlock(activeBlockIndex + 1)}
            type="button"
          >
            <ChevronRightIcon size={18} />
          </button>
        </div>
      </header>

    <div className="course-player">
      <aside className="course-outline" aria-label="Course content">
        <header className="course-outline-head">
          <p>Course content</p>
          <div className="course-outline-progress">
            <span>
              {completedLessons} of {lessons.length} lessons complete
            </span>
            <span className="course-outline-track" aria-hidden="true">
              <i style={{ width: `${subjectProgress}%` }} />
            </span>
          </div>
        </header>

        <ol className="course-outline-list">
          {lessons.map((lesson, index) => {
            const isOpen = lesson.id === selectedLesson.id;
            const isLocked = lesson.availability !== "available";
            const isDone = lesson.progressPercent === 100;
            return (
              <li
                className={isOpen ? "is-open" : undefined}
                key={lesson.id}
              >
                <button
                  aria-expanded={isOpen}
                  className="course-outline-lesson"
                  disabled={isLocked}
                  onClick={() => {
                    setSelectedLessonId(lesson.id);
                    setActiveBlockIndex(0);
                    setProgress(lesson.progressPercent);
                  }}
                  type="button"
                >
                  <span
                    className={`course-outline-status${isDone ? " is-done" : ""}`}
                    aria-hidden="true"
                  >
                    {isLocked ? (
                      <LockIcon size={13} />
                    ) : isDone ? (
                      <CheckIcon size={13} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="course-outline-lesson-copy">
                    <strong>{lesson.title}</strong>
                    <small>
                      {lesson.releaseHint ??
                        `${lesson.blocks.length} activities · ${lesson.estimatedMinutes} min`}
                    </small>
                  </span>
                </button>

                {/* Only the open lesson lists its activities. Showing every
                    lesson's contents at once turned a four-lesson subject into
                    a twenty-row wall. */}
                {isOpen ? (
                  <ol className="course-outline-activities">
                    {lesson.blocks.map((block, blockIndex) => {
                      const isCurrent = blockIndex === activeBlockIndex;
                      const isPassed = blockIndex < completedBlocks;
                      return (
                        <li key={block.id}>
                          <button
                            aria-current={isCurrent ? "step" : undefined}
                            className={isCurrent ? "is-current" : undefined}
                            onClick={() => void moveToBlock(blockIndex)}
                            type="button"
                          >
                            <span className="course-activity-tick" aria-hidden="true">
                              {isPassed ? (
                                <CheckIcon size={12} />
                              ) : (
                                <BlockGlyph type={block.type} />
                              )}
                            </span>
                            <span className="course-activity-label">
                              {block.title}
                            </span>
                            <span className="course-activity-kind">
                              {blockLabel(block)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                ) : null}
              </li>
            );
          })}
        </ol>
      </aside>

      <div className="course-stage">
        <LessonBlockView
          block={activeBlock}
          dataMode={dataMode}
          lessonId={selectedLesson.id}
          lessonThumbnailUrl={selectedLesson.thumbnailUrl}
          lessonVersion={selectedLesson.version}
        />

        <div className="course-tabs">
          {/* A segmented control rather than the underlined strip this used
              to be. Three panels of very different shapes hung off it, and an
              underline gave no hint that switching changed the kind of thing
              below, not just the words. */}
          <div className="course-tablist" role="tablist" aria-label="Lesson detail">
            {LESSON_PANELS.map((panel) => (
              <button
                aria-controls={`panel-${panel.id}`}
                aria-selected={activeTab === panel.id}
                className={activeTab === panel.id ? "is-active" : undefined}
                data-hue={panel.hue}
                id={`tab-${panel.id}`}
                key={panel.id}
                onClick={() => setActiveTab(panel.id)}
                role="tab"
                type="button"
              >
                <panel.Icon size={16} />
                {panel.label}
              </button>
            ))}
          </div>

          <div
            aria-labelledby={`tab-${activeTab}`}
            className="course-tabpanel"
            id={`panel-${activeTab}`}
            role="tabpanel"
            tabIndex={0}
          >
            {activeTab === "overview" ? (
              <>
                <p className="course-summary">{selectedLesson.summary}</p>
                {/* Three facts as tiles rather than a bare definition list.
                    They are the answers to "who, how long, how much" a
                    learner scans for before starting, and as unlabelled rows
                    of text they read as small print. */}
                <dl className="course-facts">
                  <div data-hue="blue">
                    <span className="course-fact-glyph" aria-hidden="true">
                      <UsersIcon size={18} />
                    </span>
                    <div>
                      <dt>Taught by</dt>
                      <dd>{subject.teacherName}</dd>
                    </div>
                  </div>
                  <div data-hue="amber">
                    <span className="course-fact-glyph" aria-hidden="true">
                      <ClockIcon size={18} />
                    </span>
                    <div>
                      <dt>Estimated time</dt>
                      <dd>{selectedLesson.estimatedMinutes} minutes</dd>
                    </div>
                  </div>
                  <div data-hue="violet">
                    <span className="course-fact-glyph" aria-hidden="true">
                      <LayersIcon size={18} />
                    </span>
                    <div>
                      <dt>Activities</dt>
                      <dd>{selectedLesson.blocks.length}</dd>
                    </div>
                  </div>
                </dl>
              </>
            ) : activeTab === "objectives" ? (
              <>
                <p className="course-panel-lede">
                  By the end of this lesson you should be able to:
                </p>
                <ul className="course-objectives">
                  {selectedLesson.objectives.map((objective, index) => (
                    <li key={objective}>
                      {/* Numbered rather than ticked. A row of check marks
                          beside things the learner has not done yet read as
                          a progress list that was already complete. */}
                      <span aria-hidden="true">{index + 1}</span>
                      <span>{objective}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p className="course-panel-lede">
                  What this lesson covers in the national curriculum.
                </p>
                <ul className="course-standards">
                  {selectedLesson.standardCodes.map((code) => (
                    <li key={code}>
                      <ClipboardCheckIcon size={14} />
                      {code}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        <footer className="course-stage-foot">
          <span>
            Activity {activeBlockIndex + 1} of {selectedLesson.blocks.length}
          </span>
          {activeBlockIndex < selectedLesson.blocks.length - 1 ? (
            <button
              className="course-primary"
              onClick={() => void moveToBlock(activeBlockIndex + 1)}
              type="button"
            >
              Continue
              <ChevronRightIcon size={16} />
            </button>
          ) : (
            <button
              className="course-primary"
              onClick={completeLesson}
              type="button"
            >
              <CheckIcon size={16} />
              Complete lesson
            </button>
          )}
        </footer>

        {notice && (
          <p className="lesson-notice" role="status">
            {notice}
          </p>
        )}
      </div>
      </div>
    </div>
    </LessonPreviewContext.Provider>
  );
}

/** The small mark an activity shows in the outline before it is completed. */
function BlockGlyph({ type }: { type: LessonBlock["type"] }) {
  if (type === "video") return <PlayCircleIcon size={12} />;
  if (type === "interactive") return <SparkIcon size={12} />;
  if (type === "practice") return <PencilIcon size={12} />;
  if (type === "resource") return <DownloadIcon size={12} />;
  return <ReadIcon size={12} />;
}

function LessonBlockView({
  block,
  dataMode,
  lessonId,
  lessonThumbnailUrl,
  lessonVersion,
}: {
  block: LessonBlock;
  dataMode: "loading" | "protected";
  lessonId: string;
  lessonThumbnailUrl?: string;
  lessonVersion: number;
}) {
  if (block.type === "video") {
    return (
      <LessonVideoBlock block={block} lessonThumbnailUrl={lessonThumbnailUrl} />
    );
  }

  if (block.type === "interactive") {
    if (block.config?.activityId && block.config.provider === "h5p") {
      return (
        <H5pActivityFrame
          activityId={block.config.activityId}
          dataMode={dataMode}
          fallbackText={block.content}
          lessonId={lessonId}
          lessonVersion={lessonVersion}
          title={block.title}
        />
      );
    }
    return (
      <LessonCheckpointBlock
        block={block}
        dataMode={dataMode}
        lessonId={lessonId}
        lessonVersion={lessonVersion}
      />
    );
  }

  if (block.type === "resource") {
    const resourceAssetId = block.config?.mediaAssetId;
    const mediaUrl = resourceAssetId ? mediaUrlFor(resourceAssetId) : undefined;
    const attachment = block.attachment;
    return (
      <article className="lesson-block resource-block">
        <span aria-hidden="true">
          <FileGlyph kind={attachment?.kind} />
        </span>
        <div>
          <p className="lesson-eyebrow">Study resource</p>
          <h2>{block.title}</h2>
          <p>{block.content}</p>
          {/* What the file is, before the learner spends the data on it. A
              download offering no name, format or size is a guess on a metered
              connection. */}
          {attachment ? (
            <ul className="resource-facts">
              <li title={attachment.filename}>{attachment.filename}</li>
              <li>{describeFileKind(attachment)}</li>
              <li>{formatFileSize(attachment.sizeBytes)}</li>
            </ul>
          ) : null}
          <small>
            {!mediaUrl
              ? "Your teacher has not attached the file yet."
              : attachment
                ? "Downloads once, then works offline."
                : "This file is no longer available. Ask your teacher to attach it again."}
          </small>
        </div>
        {/* A download control with nothing to download used to render as an
            ordinary button that did nothing when pressed. */}
        {mediaUrl && attachment ? (
          <a download={attachment.filename} href={mediaUrl}>
            <DownloadIcon size={16} />
            Download
          </a>
        ) : null}
      </article>
    );
  }

  return (
    <article className="lesson-block reading-block">
      <p className="lesson-eyebrow">Read and explore</p>
      <h2>{block.title}</h2>
      <p>{block.content}</p>
      {/* A diagram the learner reads in place, as opposed to the resource
          block's attachment, which they download. Rendered only when the
          author supplied alt text: an unlabelled cross-section is worse than
          no diagram for anyone using a screen reader. */}
      {block.config?.imageUrl && block.config.imageAlt ? (
        <figure className="lesson-figure">
          <Image
            alt={block.config.imageAlt}
            height={720}
            sizes="(max-width: 900px) 100vw, 720px"
            src={block.config.imageUrl}
            width={1280}
          />
          {block.config.imageCaption ? (
            <figcaption>{block.config.imageCaption}</figcaption>
          ) : null}
        </figure>
      ) : null}
      {/* Previously a hardcoded note about chewing food, which rendered on
          every reading block in every subject — including a Social Studies
          lesson about the arms of government. */}
      {block.config?.noteBody ? (
        <div className="science-note">
          <span aria-hidden="true">
            <SparkIcon size={16} />
          </span>
          <p>
            {block.config.noteTitle ? (
              <strong>{block.config.noteTitle}</strong>
            ) : null}
            {block.config.noteBody}
          </p>
        </div>
      ) : null}
    </article>
  );
}

/**
 * The lesson video.
 *
 * The previous version drew a play triangle with no click handler over a
 * decorative gradient, so pressing it did nothing — the reported "the video
 * does not play at all". A video block now has exactly three honest states:
 * a real player when the lesson has a video attached, a clear explanation when
 * it does not, and a recoverable error when the stream fails.
 */
function LessonVideoBlock({
  block,
  lessonThumbnailUrl,
}: {
  block: LessonBlock;
  lessonThumbnailUrl?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [duration, setDuration] = useState<number>();

  /* A teacher working without a database uploads into the in-tab preview
     library, so that is tried before the authenticated media route. */
  const source = resolveLessonVideo(block.config, mediaUrlFor);
  const mediaUrl = source?.kind === "youtube" ? undefined : source?.url;

  /* The teacher's own still, if they attached one. Everything below falls back
     to generated artwork rather than to nothing. */
  const posterAssetId = block.config?.posterAssetId;
  const posterUrl = posterAssetId ? mediaUrlFor(posterAssetId) : undefined;
  /* Order of preference: the still this teacher chose for this block, then
     the lesson's own cover, then generated artwork. The lesson cover is a
     plain file under public/, so unlike posterUrl it is not access-checked
     and the image optimizer can do its job. */
  const stillUrl = posterUrl ?? lessonThumbnailUrl;

  async function play() {
    const video = videoRef.current;
    if (!video) return;
    try {
      await video.play();
      setStarted(true);
    } catch {
      /* Autoplay policies and codec failures both surface here. Falling back
         to the native controls leaves the learner a way through. */
      setStarted(true);
    }
  }

  const copy = (
    <div className="block-copy">
      <p className="lesson-eyebrow">Guided video</p>
      <h2>{block.title}</h2>
      <p>{block.content}</p>
      {mediaUrl && !failed ? (
        <small>
          {duration ? `${formatDuration(duration)} · ` : ""}
          Captions and a low-data transcript are available in the player.
        </small>
      ) : null}
    </div>
  );

  /* A hosted video is framed rather than played through <video>. The frame is
     sandboxed and the source comes from the allowlist in domain/learning/video,
     so a lesson can never point the iframe at an arbitrary host. */
  if (source?.kind === "youtube") {
    return (
      <article className="lesson-block video-block">
        <div className={`video-stage${started ? " is-playing" : ""}`}>
          {started ? (
            <iframe
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              src={withAutoplay(source.embedUrl)}
              title={block.title}
            />
          ) : (
            <>
              {/* The teacher's still wins over YouTube's own: they chose a
                  frame that suits the lesson, and it is served from the
                  school's origin rather than pinging Google before play. */}
              <Image
                alt=""
                aria-hidden="true"
                className="video-poster"
                fill
                sizes="(max-width: 680px) 100vw, 55vw"
                src={
                  stillUrl ??
                  `https://i.ytimg.com/vi/${source.videoId}/hqdefault.jpg`
                }
                unoptimized={!stillUrl || Boolean(posterUrl)}
              />
              {/* Deferring the iframe until this is pressed is what actually
                  holds off YouTube's cookies until playback — embedding it
                  up front, as before, undercut that. */}
              <button
                aria-label={`Play: ${block.title}`}
                className="video-play"
                onClick={() => setStarted(true)}
                type="button"
              >
                <PlayIcon size={26} />
              </button>
            </>
          )}
        </div>
        <div className="block-copy">
          <p className="lesson-eyebrow">Guided video</p>
          <h2>{block.title}</h2>
          <p>{block.content}</p>
          <small>
            <a href={source.watchUrl} rel="noreferrer noopener" target="_blank">
              Open on YouTube
            </a>{" "}
            if the video will not load on your connection.
          </small>
        </div>
      </article>
    );
  }

  if (!mediaUrl) {
    return (
      <article className="lesson-block video-block">
        <div className="video-stage video-stage-empty">
          <span aria-hidden="true">▶</span>
          <strong>No video attached yet</strong>
          <p>
            Your teacher has written this activity but has not uploaded the
            video for it. The rest of the lesson still works.
          </p>
        </div>
        {copy}
      </article>
    );
  }

  return (
    <article className="lesson-block video-block">
      <div className={`video-stage${started ? " is-playing" : ""}`}>
        <video
          controls
          controlsList="nodownload"
          onError={() => setFailed(true)}
          onLoadedMetadata={(event) => {
            const value = event.currentTarget.duration;
            if (Number.isFinite(value)) setDuration(value);
          }}
          onPause={() => setStarted(true)}
          onPlay={() => setStarted(true)}
          playsInline
          preload="metadata"
          ref={videoRef}
          src={mediaUrl}
        >
          Your browser cannot play this lesson video.
        </video>

        {/* Covers the video element until playback starts. `preload="metadata"`
            gives us a duration but not a frame, so without this the stage is a
            black rectangle — indistinguishable from a video that failed. */}
        {!started && !failed ? (
          stillUrl ? (
            /* The access-checked media route is unoptimized: the image
               optimizer would fetch it server-side with no learner session and
               get a 401 back. A lesson cover under public/ has no such
               problem, so it is left optimizable. */
            <Image
              alt=""
              aria-hidden="true"
              className="video-poster video-poster-overlay"
              fill
              sizes="(max-width: 680px) 100vw, 55vw"
              src={stillUrl}
              unoptimized={Boolean(posterUrl)}
            />
          ) : (
            <LessonPoster
              className="video-poster video-poster-overlay"
              seed={block.id}
            />
          )
        ) : null}

        {failed ? (
          <div className="video-stage-message">
            <strong>This video could not be loaded</strong>
            <p>Check your connection, then try again.</p>
            <button
              onClick={() => {
                setFailed(false);
                videoRef.current?.load();
              }}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : null}

        {/* A large target over the poster frame, because the native control
            strip is a hard tap on a phone. It hands straight over to the
            native controls once playback starts. */}
        {!started && !failed ? (
          <button
            aria-label={`Play: ${block.title}`}
            className="video-play"
            onClick={() => void play()}
            type="button"
          >
            <PlayIcon size={26} />
          </button>
        ) : null}

        {duration && !started && !failed ? (
          <span className="video-duration">{formatDuration(duration)}</span>
        ) : null}
      </div>
      {copy}
    </article>
  );
}

/** A glyph that tells a document apart from a picture at a glance. */
function FileGlyph({ kind }: { kind?: LessonAttachment["kind"] }) {
  if (kind === "image") return <ImageIcon size={18} />;
  if (kind === "audio" || kind === "video") return <PlayCircleIcon size={18} />;
  return <FileTextIcon size={18} />;
}

/** "PDF · 2 pages" is the teacher's job; this is only the format. */
function describeFileKind(attachment: LessonAttachment): string {
  const extension = attachment.filename.split(".").at(-1);
  if (extension && extension !== attachment.filename) {
    return extension.toUpperCase();
  }
  return attachment.kind === "document" ? "Document" : attachment.kind;
}

/**
 * Bytes as a learner would say them.
 *
 * Decimal units, because a phone reporting a 4.2 MB download and a page
 * claiming 4.0 MiB for the same file reads as one of them being wrong.
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ["kB", "MB", "GB"];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/* The one route to a school's media. An in-memory Map used to be consulted
   first, holding uploads the content studio made while the API was
   unreachable; nothing has written to it since that path was removed. */
function mediaUrlFor(assetId: string): string {
  return `/api/content/media?assetId=${encodeURIComponent(assetId)}`;
}

/** Only added once the facade is pressed, so the poster click is what starts playback. */
function withAutoplay(embedUrl: string): string {
  const url = new URL(embedUrl);
  url.searchParams.set("autoplay", "1");
  return url.toString();
}

function formatDuration(seconds: number): string {
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * An interactive checkpoint: the subject's own questions, marked on the server.
 *
 * This block used to render one hardcoded question about the small intestine,
 * with three hardcoded options, in every subject — a Social Studies lesson
 * asked where nutrients are absorbed. The questions now come from the same
 * bank the teacher writes papers from, and are marked by the same code, so a
 * checkpoint agrees with the examination it is preparing the learner for.
 *
 * Answers are posted rather than compared here: the answer key is the one part
 * of a question a learner must never be sent.
 */
function LessonCheckpointBlock({
  block,
  dataMode,
  lessonId,
  lessonVersion,
}: {
  block: LessonBlock;
  dataMode: "loading" | "protected";
  lessonId: string;
  lessonVersion: number;
}) {
  const [questions, setQuestions] = useState<CheckpointQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<CheckpointMarkResult>();
  const [status, setStatus] = useState("");
  const [marking, setMarking] = useState(false);
  const isPreview = useContext(LessonPreviewContext);
  const configuredCount = block.config?.questionIds?.length ?? 0;

  /* Reset when the learner moves to another checkpoint: the component is
     reused across blocks, and leaving the previous block's marks on screen
     would credit them for questions they have not seen.

     Adjusted during render rather than in an effect — React's documented way
     to reset state when a prop changes, and the same shape the lesson draft
     form uses when the draft being edited changes. An effect would paint the
     previous block's answers once first. */
  const [loadedBlockId, setLoadedBlockId] = useState(block.id);
  if (loadedBlockId !== block.id) {
    setLoadedBlockId(block.id);
    setAnswers({});
    setResult(undefined);
    setStatus("");
  }

  useEffect(() => {
    if (dataMode !== "protected" || configuredCount === 0) return;
    let active = true;
    async function loadCheckpoint() {
      try {
        const response = await fetch(
          `/api/learn/lesson-checkpoint?blockId=${encodeURIComponent(block.id)}&lessonId=${encodeURIComponent(lessonId)}&lessonVersion=${lessonVersion}`,
        );
        const payload = (await response.json()) as {
          checkpoint?: { questions: CheckpointQuestion[] };
          error?: string;
        };
        if (!active) return;
        if (!response.ok || !payload.checkpoint) {
          setStatus(payload.error ?? "This checkpoint is unavailable.");
          return;
        }
        setQuestions(payload.checkpoint.questions);
      } catch {
        if (active) setStatus("This checkpoint could not be loaded.");
      }
    }
    void loadCheckpoint();
    return () => {
      active = false;
    };
  }, [block.id, configuredCount, dataMode, lessonId, lessonVersion]);

  async function checkAnswers() {
    setMarking(true);
    try {
      const response = await fetch("/api/learn/lesson-checkpoint", {
        body: JSON.stringify({
          blockId: block.id,
          lessonId,
          lessonVersion,
          responses: questions.map((question) => ({
            questionId: question.id,
            value: answers[question.id] ?? null,
          })),
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        result?: CheckpointMarkResult;
      };
      if (!response.ok || !payload.result) {
        setStatus(payload.error ?? "Your answers could not be checked.");
        return;
      }
      setResult(payload.result);
      setStatus("");
    } catch {
      setStatus("Your answers could not be checked.");
    } finally {
      setMarking(false);
    }
  }

  /* A block whose teacher has not chosen questions yet. Said plainly rather
     than rendered as an empty card with a dead button. */
  if (configuredCount === 0) {
    return (
      <article className="lesson-block interactive-block">
        <div className="interactive-heading">
          <span aria-hidden="true">
            <SparkIcon size={16} />
          </span>
          <div>
            <p className="lesson-eyebrow">Interactive checkpoint</p>
            <h2>{block.title}</h2>
          </div>
        </div>
        <p className="question">{block.content}</p>
        <p className="checkpoint-empty">
          Your teacher has not added questions to this checkpoint yet.
        </p>
      </article>
    );
  }

  const resultsById = new Map(
    result?.questions.map((entry) => [entry.questionId, entry]),
  );
  const answeredCount = questions.filter((question) =>
    hasAnswer(answers[question.id]),
  ).length;

  return (
    <article className="lesson-block interactive-block">
      <div className="interactive-heading">
        <span aria-hidden="true">
          <SparkIcon size={16} />
        </span>
        <div>
          <p className="lesson-eyebrow">Interactive checkpoint</p>
          <h2>{block.title}</h2>
        </div>
        <small>
          {questions.length || configuredCount}{" "}
          {(questions.length || configuredCount) === 1
            ? "question"
            : "questions"}
        </small>
      </div>
      <p className="question">{block.content}</p>

      {dataMode !== "protected" ? (
        <p className="checkpoint-empty">
          {isPreview
            ? "Checkpoint questions load once the lesson is published."
            : "Sign in to answer this checkpoint."}
        </p>
      ) : null}

      <ol className="checkpoint-questions">
        {questions.map((question, index) => {
          const marked = resultsById.get(question.id);
          return (
            <li key={question.id}>
              <div className="checkpoint-question-head">
                <span className="checkpoint-number">{index + 1}</span>
                <p>{question.prompt}</p>
                <small>
                  {question.marks} {question.marks === 1 ? "mark" : "marks"}
                </small>
              </div>
              {question.media ? (
                <QuestionFigure media={question.media} />
              ) : null}
              {question.formula ? (
                <QuestionFormula formula={question.formula} />
              ) : null}
              <QuestionInput
                disabled={Boolean(result)}
                onChange={(value) =>
                  setAnswers((current) => ({
                    ...current,
                    [question.id]: value,
                  }))
                }
                question={question}
                value={answers[question.id]}
              />
              {marked ? (
                <p
                  className={`answer-feedback ${
                    marked.needsTeacher
                      ? "pending"
                      : marked.correct
                        ? "correct"
                        : "retry"
                  }`}
                  role="status"
                >
                  {marked.needsTeacher
                    ? "Saved. Your teacher marks written answers."
                    : marked.correct
                      ? "Correct."
                      : "Not quite."}
                  {marked.rationale ? ` ${marked.rationale}` : ""}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      {result ? (
        <div className="checkpoint-score" role="status">
          <strong>
            {result.awardedMarks} / {result.totalMarks}
          </strong>
          <span>
            {/* Formative on purpose: a checkpoint is practice inside a
                lesson, so it is marked and explained but not written to the
                gradebook. */}
            Practice only — this score is not recorded in your gradebook.
          </span>
          <button
            className="check-answer"
            onClick={() => {
              setResult(undefined);
              setAnswers({});
            }}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : (
        <button
          className="check-answer"
          disabled={marking || answeredCount === 0 || questions.length === 0}
          onClick={checkAnswers}
          type="button"
        >
          {marking ? "Checking…" : "Check answers"}
        </button>
      )}

      {status ? (
        <p className="answer-feedback retry" role="status">
          {status}
        </p>
      ) : null}
    </article>
  );
}

function H5pActivityFrame({
  activityId,
  dataMode,
  fallbackText,
  lessonId,
  lessonVersion,
  title,
}: {
  activityId: string;
  dataMode: "loading" | "protected";
  fallbackText: string;
  lessonId: string;
  lessonVersion: number;
  title: string;
}) {
  const [signedLaunch, setSignedLaunch] = useState<{
    fallbackText: string;
    launchOrigin: string;
    launchUrl: string;
    title: string;
  }>();
  const [signedStatus, setSignedStatus] = useState<string>();
  /* A teacher previewing must not post xAPI statements under their own name;
     the activity still plays. */
  const isPreview = useContext(LessonPreviewContext);

  /* Only a launch the school's runtime signed. The fallback here used to
     serve the activity from the demo dataset when no signed launch could be
     minted, so a learner played somebody else's activity and was told their
     score was not recorded — for an activity that was never theirs. */
  const launch = signedLaunch;
  const status = signedStatus ?? "Loading interactive activity…";

  useEffect(() => {
    if (dataMode !== "protected") return;
    let active = true;
    const params = new URLSearchParams({
      activityId,
      lessonId,
      lessonVersion: String(lessonVersion),
    });
    void fetch(`/api/learn/interactions?${params}`)
      .then(async (response) => {
        const payload = (await response.json()) as {
          activity?: {
            fallbackText: string;
            launchOrigin: string;
            launchUrl: string;
            title: string;
          };
          error?: string;
        };
        if (!response.ok || !payload.activity) {
          throw new Error(
            payload.error ?? "Interactive activity unavailable.",
          );
        }
        if (active) {
          setSignedLaunch(payload.activity);
          setSignedStatus("Interactive activity ready.");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setSignedStatus(
            error instanceof Error
              ? error.message
              : "Interactive activity unavailable.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [activityId, dataMode, lessonId, lessonVersion]);

  useEffect(() => {
    if (!launch) return;
    function receiveResult(event: MessageEvent) {
      if (
        event.origin !== launch?.launchOrigin ||
        !isH5pResultMessage(event.data)
      ) {
        return;
      }
      const normalized = normalizeH5pStatement(event.data.statement);
      if (!isPreview) {
        void saveInteractiveResult(
          activityId,
          lessonId,
          lessonVersion,
          normalized,
        );
      }
      if (normalized.completion) {
        setSignedStatus("Interactive activity completion recorded.");
      }
    }
    window.addEventListener("message", receiveResult);
    return () => window.removeEventListener("message", receiveResult);
  }, [activityId, isPreview, launch, lessonId, lessonVersion]);

  return (
    <article className="lesson-block h5p-block">
      <div className="h5p-heading">
        <span>Play</span>
        <div><p className="lesson-eyebrow">Interactive activity</p><h2>{launch?.title ?? title}</h2></div>
        <em>Measured</em>
      </div>
      {launch ? (
        <iframe
          allow="autoplay; fullscreen"
          onLoad={() => {
            setSignedStatus("Interactive activity loaded.");
            if (!isPreview) {
              void saveInteractiveResult(
                activityId,
                lessonId,
                lessonVersion,
                {
                  completion: false,
                  statement: { source: "h5p-iframe", verb: "experienced" },
                  verb: "experienced",
                },
              );
            }
          }}
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-forms allow-scripts allow-same-origin allow-presentation"
          src={launch.launchUrl}
          title={launch.title}
        />
      ) : (
        <div className="h5p-fallback"><span>✦</span><p><strong>Accessible lesson alternative</strong>{fallbackText}</p></div>
      )}
      <p className="h5p-status" role="status">{status}</p>
      <details>
        <summary>Text alternative</summary>
        <p>{launch?.fallbackText ?? fallbackText}</p>
      </details>
    </article>
  );
}

function isH5pResultMessage(
  value: unknown,
): value is { statement: Record<string, unknown>; type: "h5p-xapi" } {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    message.type === "h5p-xapi" &&
    Boolean(message.statement) &&
    typeof message.statement === "object"
  );
}

function normalizeH5pStatement(statement: Record<string, unknown>) {
  const result =
    statement.result && typeof statement.result === "object"
      ? (statement.result as Record<string, unknown>)
      : {};
  const score =
    result.score && typeof result.score === "object"
      ? (result.score as Record<string, unknown>)
      : {};
  const scaled =
    typeof score.scaled === "number" ? score.scaled * 100 : undefined;
  const verbRecord =
    statement.verb && typeof statement.verb === "object"
      ? (statement.verb as Record<string, unknown>)
      : {};
  const verbId = typeof verbRecord.id === "string" ? verbRecord.id : "";
  const verb = verbId.endsWith("completed")
    ? ("completed" as const)
    : verbId.endsWith("answered")
      ? ("answered" as const)
      : ("experienced" as const);
  return {
    completion: result.completion === true || verb === "completed",
    scorePercent: scaled,
    statement,
    success:
      typeof result.success === "boolean" ? result.success : undefined,
    verb,
  };
}

async function saveInteractiveResult(
  activityId: string,
  lessonId: string,
  lessonVersion: number,
  result: {
    completion: boolean;
    scorePercent?: number;
    statement: Record<string, unknown>;
    success?: boolean;
    verb: "experienced" | "answered" | "completed";
  },
) {
  await fetch("/api/learn/interactions", {
    body: JSON.stringify({
      activityId,
      lessonId,
      lessonVersion,
      ...result,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function blockLabel(block: LessonBlock) {
  const labels: Record<LessonBlock["type"], string> = {
    text: "Explore",
    video: "Watch",
    interactive: "Check",
    practice: "Practise",
    resource: "Review",
  };
  return labels[block.type];
}
