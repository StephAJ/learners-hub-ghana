"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { LearnerSubject } from "../../../../db/learning-repository";
import type { LessonBlock } from "../../../../domain/learning/types";
import "./lesson-player.css";

const fallbackSubject: LearnerSubject = {
  className: "JHS 2 Gold",
  code: "IS",
  offeringId: "offering-science-jhs2",
  subjectName: "Integrated Science",
  teacherName: "Grace Mensah",
  lessons: [
    {
      availability: "available",
      id: "lesson-digestive-system",
      estimatedMinutes: 20,
      title: "The human digestive system",
      summary:
        "Follow food through the body and discover how nutrients reach your cells.",
      unitTitle: "Human body systems",
      version: 1,
      progressPercent: 25,
      standardCodes: ["JHS2.IS.HBS.1", "JHS2.IS.HBS.2"],
      objectives: [
        "Identify the main organs of the digestive system.",
        "Explain how food is broken down and absorbed.",
      ],
      blocks: [
        {
          id: "block-digestion-intro",
          type: "text",
          position: 1,
          title: "Your body’s food-processing journey",
          content:
            "Digestion turns the food you eat into small nutrients that can pass into the blood and support growth, repair, and energy.",
          ready: true,
        },
        {
          id: "block-digestion-video",
          type: "video",
          position: 2,
          title: "Watch: from mouth to small intestine",
          content:
            "A four-minute guided animation tracing swallowing, stomach churning, and nutrient absorption.",
          ready: true,
        },
        {
          id: "block-digestion-check",
          type: "interactive",
          position: 3,
          title: "Check your understanding",
          content: "Where does most nutrient absorption take place?",
          ready: true,
        },
        {
          id: "block-digestion-resource",
          type: "resource",
          position: 4,
          title: "Digestive system study sheet",
          content:
            "Download the low-data revision sheet and labelled-organ guide.",
          ready: true,
        },
      ],
    },
    {
      availability: "locked",
      blocks: [
        {
          id: "block-respiration-intro",
          type: "text",
          position: 1,
          title: "The journey of a breath",
          content:
            "Air travels through the nose and windpipe into branching tubes that end in tiny air sacs called alveoli.",
          ready: true,
        },
        {
          id: "block-respiration-video",
          type: "video",
          position: 2,
          title: "Watch gas exchange",
          content:
            "A short low-data animation shows oxygen entering the blood and carbon dioxide leaving it.",
          ready: true,
        },
        {
          id: "block-respiration-practice",
          type: "practice",
          position: 3,
          title: "Label the breathing pathway",
          content:
            "Arrange the nose, windpipe, bronchi, lungs, and alveoli in the order air reaches them.",
          ready: true,
        },
      ],
      estimatedMinutes: 15,
      id: "lesson-respiratory-system",
      objectives: [
        "Identify the main structures of the respiratory system.",
        "Explain how oxygen reaches body cells.",
      ],
      progressPercent: 0,
      releaseHint: "Complete “The human digestive system” first",
      standardCodes: ["JHS2.IS.HBS.2"],
      summary:
        "Trace oxygen from the air into the blood and connect breathing to energy.",
      title: "How breathing powers the body",
      unitTitle: "Human body systems",
      version: 1,
    },
  ],
};

export default function IntegratedSciencePage() {
  const [subject, setSubject] = useState(fallbackSubject);
  const [selectedLessonId, setSelectedLessonId] = useState(
    fallbackSubject.lessons[0].id,
  );
  const [activeBlockIndex, setActiveBlockIndex] = useState(0);
  const [progress, setProgress] = useState(
    fallbackSubject.lessons[0].progressPercent,
  );
  const [answer, setAnswer] = useState("");
  const [answerChecked, setAnswerChecked] = useState(false);
  const [dataMode, setDataMode] = useState<"loading" | "protected" | "preview">(
    "loading",
  );
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function loadSubject() {
      try {
        const response = await fetch(
          "/api/learn/subjects?offeringId=offering-science-jhs2",
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
  }, []);

  const selectedLesson =
    subject.lessons.find((lesson) => lesson.id === selectedLessonId) ??
    subject.lessons[0];
  const activeBlock =
    selectedLesson.blocks[activeBlockIndex] ?? selectedLesson.blocks[0];
  const subjectProgress = Math.round(
    subject.lessons.reduce(
      (total, lesson) => total + lesson.progressPercent,
      0,
    ) / Math.max(1, subject.lessons.length),
  );
  const completedBlocks = Math.max(
    1,
    Math.round((progress / 100) * selectedLesson.blocks.length),
  );
  const lessonPosition = useMemo(
    () =>
      Math.max(
        1,
        subject.lessons.findIndex((lesson) => lesson.id === selectedLesson.id) +
          1,
      ),
    [selectedLesson.id, subject.lessons],
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
        "/api/learn/subjects?offeringId=offering-science-jhs2",
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
        <Link className="learning-brand" href="/">
          <span aria-hidden="true">LH</span>
          <strong>Learners Hub</strong>
        </Link>
        <nav aria-label="Breadcrumb">
          <Link href="/">My subjects</Link><span aria-hidden="true">/</span>
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
          {subject.lessons.map((lesson, index) => (
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
        <Link className="back-dashboard" href="/">← Back to dashboard</Link>
      </aside>

      <main className="lesson-main">
        <section className="lesson-heading">
          <div>
            <p className="lesson-eyebrow">{selectedLesson.unitTitle} · Lesson {lessonPosition}</p>
            <h1>{selectedLesson.title}</h1>
            <p>{selectedLesson.summary}</p>
            <div className="lesson-standard-chips">{selectedLesson.standardCodes.map((code) => <span key={code}>{code}</span>)}<span>{selectedLesson.estimatedMinutes} min</span></div>
          </div>
          <div className="lesson-progress-ring" style={{ "--lesson-progress": `${progress * 3.6}deg` } as React.CSSProperties}>
            <span><strong>{progress}%</strong><small>complete</small></span>
          </div>
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
    const mediaUrl = block.config?.mediaAssetId
      ? `/api/content/media?assetId=${encodeURIComponent(block.config.mediaAssetId)}`
      : undefined;
    return (
      <article className="lesson-block video-block">
        <div className="video-stage">
          {mediaUrl ? (
            <video controls playsInline preload="metadata" src={mediaUrl}>
              Your browser does not support embedded lesson video.
            </video>
          ) : (
            <>
              <div className="body-map" aria-hidden="true"><span /><span /><span /><span /></div>
              <button type="button" aria-label="Play digestive system video">▶</button>
              <span>04:12</span>
            </>
          )}
        </div>
        <div className="block-copy"><p className="lesson-eyebrow">Guided video</p><h2>{block.title}</h2><p>{block.content}</p><small>Low-data transcript and captions available</small></div>
      </article>
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
    const mediaUrl = block.config?.mediaAssetId
      ? `/api/content/media?assetId=${encodeURIComponent(block.config.mediaAssetId)}`
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
        <span>H5P</span>
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
