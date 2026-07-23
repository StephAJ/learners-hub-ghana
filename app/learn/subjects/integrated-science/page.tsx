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
      id: "lesson-digestive-system",
      title: "The human digestive system",
      summary:
        "Follow food through the body and discover how nutrients reach your cells.",
      unitTitle: "Human body systems",
      version: 1,
      progressPercent: 25,
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
          <div><span>Subject progress</span><strong>82%</strong></div>
          <span><i style={{ width: "82%" }} /></span>
        </div>
        <div className="outline-lessons">
          <p className="outline-label">Current unit</p>
          <h2>{selectedLesson.unitTitle}</h2>
          {subject.lessons.map((lesson, index) => (
            <button
              className={lesson.id === selectedLesson.id ? "active" : ""}
              key={lesson.id}
              onClick={() => {
                setSelectedLessonId(lesson.id);
                setActiveBlockIndex(0);
                setProgress(lesson.progressPercent);
              }}
              type="button"
            >
              <span>{index + 1}</span>
              <p><strong>{lesson.title}</strong><small>{lesson.blocks.length} learning activities</small></p>
              <i aria-hidden="true">›</i>
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
  onAnswer,
  onCheck,
}: {
  answer: string;
  answerChecked: boolean;
  block: LessonBlock;
  onAnswer: (answer: string) => void;
  onCheck: () => void;
}) {
  if (block.type === "video") {
    return (
      <article className="lesson-block video-block">
        <div className="video-stage">
          <div className="body-map" aria-hidden="true"><span /><span /><span /><span /></div>
          <button type="button" aria-label="Play digestive system video">▶</button>
          <span>04:12</span>
        </div>
        <div className="block-copy"><p className="lesson-eyebrow">Guided video</p><h2>{block.title}</h2><p>{block.content}</p><small>Low-data transcript and captions available</small></div>
      </article>
    );
  }

  if (block.type === "interactive") {
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
    return (
      <article className="lesson-block resource-block">
        <span aria-hidden="true">↓</span>
        <div><p className="lesson-eyebrow">Study resource</p><h2>{block.title}</h2><p>{block.content}</p><small>PDF · 420 KB · Works offline after download</small></div>
        <button type="button">Download resource</button>
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
