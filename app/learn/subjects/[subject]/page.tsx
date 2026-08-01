"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LearnerSubject } from "../../../../db/learning-repository";
import { demoLearnerSubject } from "../../../demo-data";
import { demoSubjectBySlug } from "../../../../domain/demo/greenfield";
import type { LessonBlock } from "../../../../domain/learning/types";
import { resolveLessonVideo } from "../../../../domain/learning/video";
import { previewLessonsFor, previewMediaUrl } from "../../../preview-workspace";
import "./lesson-player.css";

export default function SubjectLessonPlayerPage() {
  const params = useParams<{ subject: string }>();
  const slug = typeof params.subject === "string" ? params.subject : "";
  const demoSubject = demoSubjectBySlug(slug);
  if (!demoSubject) notFound();
  return <LessonPlayer key={slug} fallback={demoLearnerSubject(demoSubject)} />;
}

function LessonPlayer({ fallback }: { fallback: LearnerSubject }) {
  const [subject, setSubject] = useState(fallback);
  const [selectedLessonId, setSelectedLessonId] = useState(
    fallback.lessons[0]?.id ?? "",
  );
  const [activeBlockIndex, setActiveBlockIndex] = useState(0);
  const [progress, setProgress] = useState(
    fallback.lessons[0]?.progressPercent ?? 0,
  );
  const [answer, setAnswer] = useState("");
  const [answerChecked, setAnswerChecked] = useState(false);
  const [dataMode, setDataMode] = useState<"loading" | "protected" | "preview">(
    "loading",
  );
  const [notice, setNotice] = useState("");

  const offeringId = fallback.offeringId;

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
        if (active) setDataMode("preview");
      }
    }
    void loadSubject();
    return () => {
      active = false;
    };
  }, [offeringId]);

  /* Lessons a teacher published from the authoring screens while the school
     API was unreachable. Without them the preview path is a dead end: the
     teacher publishes, and the learner still sees only the sample lesson.
     Derived rather than merged into state, so the published lesson appears in
     the outline without seizing the learner's current place in the subject. */
  const lessons = useMemo(() => {
    if (dataMode !== "preview") return subject.lessons;
    const published = previewLessonsFor(subject.offeringId);
    if (published.length === 0) return subject.lessons;
    return [
      ...published,
      ...subject.lessons.filter(
        (lesson) => !published.some((item) => item.id === lesson.id),
      ),
    ];
  }, [dataMode, subject.lessons, subject.offeringId]);

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
    setAnswer("");
    setAnswerChecked(false);
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
    setNotice("Lesson complete. Your progress has been recorded.");
    if (dataMode === "protected") {
      const response = await fetch(
        `/api/learn/subjects?offeringId=${encodeURIComponent(offeringId)}`,
      );
      if (response.ok) {
        const payload = (await response.json()) as { subject: LearnerSubject };
        setSubject(payload.subject);
      }
    } else {
      setSubject((current) => ({
        ...current,
        lessons: current.lessons.map((lesson) =>
          lesson.availability === "locked"
            ? { ...lesson, availability: "available", releaseHint: undefined }
            : lesson,
        ),
      }));
    }
  }

  async function persistProgress(percent: number) {
    if (dataMode !== "protected") return;
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

  return (
    <div className="learning-shell">
      <header className="learning-topbar">
        <Link className="learning-brand" href="/student">
          <span aria-hidden="true">LH</span>
          <strong>Learners Hub</strong>
        </Link>
        <nav aria-label="Breadcrumb">
          <Link href="/learn/subjects">My subjects</Link><span aria-hidden="true">/</span>
          <strong>{subject.subjectName}</strong>
        </nav>
        <div>
          <span className={`learning-mode mode-${dataMode}`}>
            <i aria-hidden="true" />
            {dataMode === "protected" ? "Progress saved" : dataMode === "loading" ? "Connecting" : "Preview lesson"}
          </span>
          <button type="button" aria-label="Lesson options">•••</button>
          <span className="learner-avatar">KA</span>
        </div>
      </header>

      <aside className="lesson-outline" aria-label="Subject lesson outline">
        <div className="outline-subject">
          <span aria-hidden="true">{subject.code}</span>
          <div><small>{subject.className}</small><strong>{subject.subjectName}</strong><p>{subject.teacherName}</p></div>
        </div>
        <div className="outline-progress">
          <div><span>Subject progress</span><strong>{subjectProgress}%</strong></div>
          <span><i style={{ width: `${subjectProgress}%` }} /></span>
        </div>
        <div className="outline-lessons">
          <p className="outline-label">Current unit</p>
          <h2>{selectedLesson.unitTitle}</h2>
          {lessons.map((lesson, index) => (
            <button
              className={lesson.id === selectedLesson.id ? "active" : ""}
              disabled={lesson.availability !== "available"}
              key={lesson.id}
              onClick={() => {
                setSelectedLessonId(lesson.id);
                setActiveBlockIndex(0);
                setProgress(lesson.progressPercent);
              }}
              type="button"
            >
              <span>{lesson.availability === "locked" ? "⌁" : lesson.progressPercent === 100 ? "✓" : index + 1}</span>
              <p><strong>{lesson.title}</strong><small>{lesson.releaseHint ?? `${lesson.estimatedMinutes} min · ${lesson.standardCodes.length} standards`}</small></p>
              <i aria-hidden="true">{lesson.availability === "available" ? "›" : "🔒"}</i>
            </button>
          ))}
        </div>
        <div className="outline-help">
          <span aria-hidden="true">?</span>
          <p><strong>Need help?</strong><small>Ask {subject.teacherName.split(" ")[0]} about this lesson.</small></p>
        </div>
        <Link className="back-dashboard" href="/learn/subjects">← All subjects</Link>
      </aside>

      <main className="lesson-main">
        <section className="lesson-heading">
          <div className="lesson-heading-copy">
            <p className="lesson-eyebrow">{selectedLesson.unitTitle} · Lesson {lessonPosition}</p>
            <h1>{selectedLesson.title}</h1>
            <p>{selectedLesson.summary}</p>
            <div className="lesson-standard-chips">{selectedLesson.standardCodes.map((code) => <span key={code}>{code}</span>)}<span className="chip-quiet">{selectedLesson.estimatedMinutes} min</span></div>
          </div>
          <LessonProgressRing percent={progress} />
        </section>

        <section className="objective-card" aria-labelledby="objectives-title">
          <span aria-hidden="true">◎</span>
          <div><p className="lesson-eyebrow">Learning objectives</p><h2 id="objectives-title">By the end of this lesson, you can:</h2>
            <ul>{selectedLesson.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul>
          </div>
        </section>

        <nav className="block-steps" aria-label="Lesson activities">
          {selectedLesson.blocks.map((block, index) => (
            <button
              aria-current={index === activeBlockIndex ? "step" : undefined}
              className={index === activeBlockIndex ? "active" : index < completedBlocks ? "complete" : ""}
              key={block.id}
              onClick={() => void moveToBlock(index)}
              type="button"
            >
              <span>{index < completedBlocks ? "✓" : index + 1}</span>
              <small>{blockLabel(block)}</small>
            </button>
          ))}
        </nav>

        <LessonBlockView
          answer={answer}
          answerChecked={answerChecked}
          block={activeBlock}
          dataMode={dataMode}
          lessonId={selectedLesson.id}
          lessonVersion={selectedLesson.version}
          onAnswer={setAnswer}
          onCheck={() => setAnswerChecked(true)}
        />

        <footer className="lesson-controls">
          <button
            disabled={activeBlockIndex === 0}
            onClick={() => void moveToBlock(activeBlockIndex - 1)}
            type="button"
          >
            ← Previous
          </button>
          <span>Activity {activeBlockIndex + 1} of {selectedLesson.blocks.length}</span>
          {activeBlockIndex < selectedLesson.blocks.length - 1 ? (
            <button className="next-control" onClick={() => void moveToBlock(activeBlockIndex + 1)} type="button">Continue →</button>
          ) : (
            <button className="next-control" onClick={completeLesson} type="button">Complete lesson ✓</button>
          )}
        </footer>
        {notice && <p className="lesson-notice" role="status">{notice}</p>}
      </main>
    </div>
  );
}

/* A stroked SVG arc rather than a conic-gradient with a radial-gradient punched
   out of the middle. The gradient version had to fake its inner edge with a
   hard colour stop, which the compositor cannot antialias — that is what made
   the ring look jagged and cheap at 25%. A stroke is a real shape: crisp at any
   density, rounded at the ends, and it can animate as progress changes. */
function LessonProgressRing({ percent }: { percent: number }) {
  const radius = 33;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div
      aria-label={`${clamped}% of this lesson complete`}
      className="lesson-progress-ring"
      role="img"
    >
      <svg aria-hidden="true" viewBox="0 0 80 80">
        <circle className="ring-track" cx="40" cy="40" r={radius} />
        <circle
          className="ring-value"
          cx="40"
          cy="40"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
        />
      </svg>
      <span aria-hidden="true">
        <strong>{clamped}%</strong>
        <small>complete</small>
      </span>
    </div>
  );
}

function LessonBlockView({
  answer,
  answerChecked,
  block,
  dataMode,
  lessonId,
  lessonVersion,
  onAnswer,
  onCheck,
}: {
  answer: string;
  answerChecked: boolean;
  block: LessonBlock;
  dataMode: "loading" | "protected" | "preview";
  lessonId: string;
  lessonVersion: number;
  onAnswer: (answer: string) => void;
  onCheck: () => void;
}) {
  if (block.type === "video") {
    return <LessonVideoBlock block={block} />;
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
    const correct = answer === "Small intestine";
    return (
      <article className="lesson-block interactive-block">
        <div className="interactive-heading"><span aria-hidden="true">✦</span><div><p className="lesson-eyebrow">Interactive checkpoint</p><h2>{block.title}</h2></div><small>1 question</small></div>
        <p className="question">{block.content}</p>
        <div className="answer-grid">
          {["Stomach", "Small intestine", "Large intestine"].map((option) => (
            <button className={answer === option ? "selected" : ""} key={option} onClick={() => { onAnswer(option); }} type="button"><span>{String.fromCharCode(65 + ["Stomach", "Small intestine", "Large intestine"].indexOf(option))}</span>{option}</button>
          ))}
        </div>
        <button className="check-answer" disabled={!answer} onClick={onCheck} type="button">Check answer</button>
        {answerChecked && <p className={correct ? "answer-feedback correct" : "answer-feedback retry"} role="status">{correct ? "Correct — most nutrients pass into the blood through the small intestine." : "Not quite. Think about the organ with villi that increase absorption area."}</p>}
      </article>
    );
  }

  if (block.type === "resource") {
    const resourceAssetId = block.config?.mediaAssetId;
    const mediaUrl = resourceAssetId
      ? (previewMediaUrl(resourceAssetId) ??
        `/api/content/media?assetId=${encodeURIComponent(resourceAssetId)}`)
      : undefined;
    return (
      <article className="lesson-block resource-block">
        <span aria-hidden="true">↓</span>
        <div><p className="lesson-eyebrow">Study resource</p><h2>{block.title}</h2><p>{block.content}</p><small>PDF · 420 KB · Works offline after download</small></div>
        {mediaUrl ? <a href={mediaUrl}>Download resource</a> : <button type="button">Download resource</button>}
      </article>
    );
  }

  return (
    <article className="lesson-block reading-block">
      <p className="lesson-eyebrow">Read and explore</p>
      <h2>{block.title}</h2>
      <p>{block.content}</p>
      <div className="science-note"><span aria-hidden="true">★</span><p><strong>Science in daily life</strong>Chewing well increases the surface area of food, helping enzymes begin their work more effectively.</p></div>
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
function LessonVideoBlock({ block }: { block: LessonBlock }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [duration, setDuration] = useState<number>();

  /* A teacher working without a database uploads into the in-tab preview
     library, so that is tried before the authenticated media route. */
  const source = resolveLessonVideo(block.config, (assetId) =>
    previewMediaUrl(assetId) ??
    `/api/content/media?assetId=${encodeURIComponent(assetId)}`,
  );
  const mediaUrl = source?.kind === "youtube" ? undefined : source?.url;

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
        <div className="video-stage">
          <iframe
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            src={source.embedUrl}
            title={block.title}
          />
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
            <span aria-hidden="true">▶</span>
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

function formatDuration(seconds: number): string {
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
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
  dataMode: "loading" | "protected" | "preview";
  fallbackText: string;
  lessonId: string;
  lessonVersion: number;
  title: string;
}) {
  const [launch, setLaunch] = useState<{
    fallbackText: string;
    launchOrigin: string;
    launchUrl: string;
    title: string;
  }>();
  const [status, setStatus] = useState(
    dataMode === "protected"
      ? "Loading interactive activity…"
      : "Interactive preview unavailable outside a signed-in lesson.",
  );

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
          setLaunch(payload.activity);
          setStatus("Interactive activity ready.");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setStatus(
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
      void saveInteractiveResult(
        activityId,
        lessonId,
        lessonVersion,
        normalized,
      );
      if (normalized.completion) {
        setStatus("Interactive activity completion recorded.");
      }
    }
    window.addEventListener("message", receiveResult);
    return () => window.removeEventListener("message", receiveResult);
  }, [activityId, launch, lessonId, lessonVersion]);

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
            setStatus("Interactive activity loaded.");
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
