"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  LearnerAssessment,
  LearnerQuestion,
} from "../../../../db/assessment-repository";
import type { QuestionResponse } from "../../../../domain/assessment/types";
import "./quiz-runner.css";

const previewAssessment: LearnerAssessment = {
  attempt: null,
  id: "assessment-digestion-check",
  instructions:
    "Answer every question. You can flag an item and return to it before submitting.",
  passMarkPercent: 60,
  purpose: "formative",
  questions: [
    {
      id: "question-absorption-site",
      marks: 1,
      options: [
        { id: "mouth", label: "Mouth" },
        { id: "stomach", label: "Stomach" },
        { id: "small-intestine", label: "Small intestine" },
        { id: "large-intestine", label: "Large intestine" },
      ],
      position: 1,
      prompt: "Where does most nutrient absorption take place?",
      questionVersion: 1,
      type: "single-choice",
    },
    {
      id: "question-bile-true-false",
      marks: 1,
      options: [],
      position: 2,
      prompt: "Bile helps the body digest fats.",
      questionVersion: 1,
      type: "true-false",
    },
    {
      id: "question-organ-action-match",
      marks: 2,
      options: [
        { id: "left:mouth", label: "Mouth" },
        { id: "left:stomach", label: "Stomach" },
        { id: "right:chewing", label: "Chewing" },
        { id: "right:churning", label: "Churning" },
      ],
      position: 3,
      prompt: "Match each digestive organ to its main action.",
      questionVersion: 1,
      type: "matching",
    },
    {
      id: "question-digestion-order",
      marks: 2,
      options: [
        { id: "stomach", label: "Stomach" },
        { id: "mouth", label: "Mouth" },
        { id: "oesophagus", label: "Oesophagus" },
      ],
      position: 4,
      prompt: "Arrange the organs in the order food travels through them.",
      questionVersion: 1,
      type: "ordering",
    },
    {
      id: "question-villi-explanation",
      marks: 3,
      options: [],
      position: 5,
      prompt:
        "Explain two ways the small intestine is adapted for nutrient absorption.",
      questionVersion: 1,
      type: "essay",
    },
  ],
  result: null,
  timeLimitMinutes: 12,
  title: "Digestive system knowledge check",
  version: 1,
};

export default function DigestiveSystemCheckPage() {
  const [assessment, setAssessment] = useState(previewAssessment);
  const [activeIndex, setActiveIndex] = useState(0);
  const [responses, setResponses] = useState<
    Record<string, QuestionResponse>
  >({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [dataMode, setDataMode] = useState<"loading" | "protected" | "preview">(
    "loading",
  );
  const [saveState, setSaveState] = useState("All changes saved");
  const [notice, setNotice] = useState("");
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(
    previewAssessment.timeLimitMinutes * 60,
  );
  const saveTimers = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});

  useEffect(() => {
    let active = true;
    const timers = saveTimers.current;
    async function loadAssessment() {
      try {
        const response = await fetch(
          "/api/learn/assessments?assessmentId=assessment-digestion-check",
        );
        if (!response.ok) throw new Error("Assessment unavailable.");
        const payload = (await response.json()) as {
          assessment: LearnerAssessment;
        };
        if (!active) return;
        setAssessment(payload.assessment);
        setResponses(payload.assessment.attempt?.responses ?? {});
        setDataMode("protected");
      } catch {
        if (active) setDataMode("preview");
      }
    }
    void loadAssessment();
    return () => {
      active = false;
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    const deadline = assessment.attempt?.deadlineAt;
    if (!deadline || assessment.attempt?.status !== "in-progress") return;
    const updateClock = () => {
      setRemainingSeconds(
        Math.max(
          0,
          Math.floor((new Date(deadline).getTime() - Date.now()) / 1000),
        ),
      );
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, [assessment.attempt?.deadlineAt, assessment.attempt?.status]);

  const activeQuestion = assessment.questions[activeIndex];
  const answeredCount = useMemo(
    () =>
      assessment.questions.filter((question) =>
        hasResponse(responses[question.id]),
      ).length,
    [assessment.questions, responses],
  );
  const totalMarks = assessment.questions.reduce(
    (sum, question) => sum + question.marks,
    0,
  );

  async function startAttempt() {
    if (dataMode === "protected") {
      const response = await fetch("/api/learn/assessments", {
        body: JSON.stringify({
          action: "start",
          assessmentId: assessment.id,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        assessment?: LearnerAssessment;
        error?: string;
      };
      if (!response.ok || !payload.assessment) {
        setNotice(payload.error ?? "Attempt could not be started.");
        return;
      }
      setAssessment(payload.assessment);
      setResponses(payload.assessment.attempt?.responses ?? {});
      return;
    }
    const startedAt = new Date();
    setAssessment((current) => ({
      ...current,
      attempt: {
        deadlineAt: new Date(
          startedAt.getTime() + current.timeLimitMinutes * 60_000,
        ).toISOString(),
        id: "preview-attempt",
        responses: {},
        startedAt: startedAt.toISOString(),
        status: "in-progress",
      },
    }));
  }

  function updateResponse(questionId: string, value: unknown) {
    const response = { value };
    setResponses((current) => ({ ...current, [questionId]: response }));
    if (!assessment.attempt || dataMode !== "protected") {
      setSaveState("Saved in preview");
      return;
    }
    setSaveState("Saving…");
    clearTimeout(saveTimers.current[questionId]);
    saveTimers.current[questionId] = setTimeout(() => {
      void saveResponse(questionId, response, flagged.has(questionId));
    }, 450);
  }

  async function saveResponse(
    questionId: string,
    response: QuestionResponse,
    isFlagged: boolean,
  ) {
    if (!assessment.attempt || dataMode !== "protected") return;
    const result = await fetch("/api/learn/assessments", {
      body: JSON.stringify({
        action: "save",
        attemptId: assessment.attempt.id,
        flagged: isFlagged,
        questionId,
        response,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    setSaveState(result.ok ? "All changes saved" : "Save interrupted");
    return result.ok;
  }

  function toggleFlag() {
    if (!activeQuestion) return;
    const next = new Set(flagged);
    const willFlag = !next.has(activeQuestion.id);
    if (willFlag) next.add(activeQuestion.id);
    else next.delete(activeQuestion.id);
    setFlagged(next);
    const response = responses[activeQuestion.id] ?? { value: null };
    void saveResponse(activeQuestion.id, response, willFlag);
  }

  async function submitAttempt() {
    if (!assessment.attempt) return;
    setConfirmSubmit(false);
    if (dataMode !== "protected") {
      setAssessment((current) => ({
        ...current,
        attempt: current.attempt
          ? { ...current.attempt, status: "needs-marking" }
          : null,
        result: {
          maximumMarks: totalMarks,
          released: false,
          score: 4,
        },
      }));
      return;
    }
    Object.values(saveTimers.current).forEach(clearTimeout);
    setSaveState("Saving final responses…");
    const savedResponses = await Promise.all(
      Object.entries(responses).map(([questionId, response]) =>
        saveResponse(
          questionId,
          response,
          flagged.has(questionId),
        ),
      ),
    );
    if (savedResponses.some((saved) => saved === false)) {
      setNotice(
        "One or more responses could not be saved. Check your connection and try again.",
      );
      return;
    }
    const response = await fetch("/api/learn/assessments", {
      body: JSON.stringify({
        action: "submit",
        attemptId: assessment.attempt.id,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as {
      assessment?: LearnerAssessment;
      error?: string;
    };
    if (!response.ok || !payload.assessment) {
      setNotice(payload.error ?? "Attempt could not be submitted.");
      return;
    }
    setAssessment(payload.assessment);
  }

  if (!assessment.attempt) {
    return (
      <main className="quiz-intro-shell">
        <header className="quiz-student-header">
          <Link href="/student">Learners Hub</Link>
          <span>Integrated Science · JHS 2 Gold</span>
          <span className="quiz-student-avatar">KA</span>
        </header>
        <section className="quiz-intro-card">
          <div className="quiz-intro-visual">
            <span>IS</span>
            <div>
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className="quiz-intro-copy">
            <span className="formative-label">Formative knowledge check</span>
            <h1>{assessment.title}</h1>
            <p>{assessment.instructions}</p>
            <div className="quiz-intro-facts">
              <article>
                <strong>{assessment.questions.length}</strong>
                <span>questions</span>
              </article>
              <article>
                <strong>{totalMarks}</strong>
                <span>total marks</span>
              </article>
              <article>
                <strong>{assessment.timeLimitMinutes}</strong>
                <span>minutes</span>
              </article>
              <article>
                <strong>{assessment.passMarkPercent}%</strong>
                <span>pass mark</span>
              </article>
            </div>
            <div className="quiz-readiness">
              <span>Before you begin</span>
              <ul>
                <li>Your timer starts when you select Start assessment.</li>
                <li>Answers save as you work, including on a weak connection.</li>
                <li>You can flag a question and return before submitting.</li>
              </ul>
            </div>
            {notice ? <p className="quiz-error">{notice}</p> : null}
            <button
              className="start-quiz-button"
              onClick={() => void startAttempt()}
              type="button"
            >
              Start assessment <span>→</span>
            </button>
            <small>
              {dataMode === "protected"
                ? "Your attempt will be recorded."
                : dataMode === "loading"
                  ? "Connecting to your school record…"
                  : "Preview mode — no school record will change."}
            </small>
          </div>
        </section>
      </main>
    );
  }

  if (assessment.attempt.status !== "in-progress") {
    return (
      <main className="quiz-result-shell">
        <section className="quiz-result-card">
          <div className="result-check">✓</div>
          <span>Attempt submitted</span>
          <h1>Your work is safely recorded.</h1>
          <p>
            Objective questions have been checked. Your teacher will review the
            written response before releasing the final result.
          </p>
          <div className="result-summary">
            <article>
              <span>Auto-marked score</span>
              <strong>
                {assessment.result?.score ?? 0} /{" "}
                {assessment.result?.maximumMarks ?? totalMarks}
              </strong>
            </article>
            <article>
              <span>Result status</span>
              <strong>
                {assessment.result?.released
                  ? "Released"
                  : "Awaiting teacher"}
              </strong>
            </article>
          </div>
          <Link href="/learn/subjects/integrated-science">
            Return to Integrated Science
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="quiz-runner-shell">
      <header className="quiz-runner-header">
        <Link href="/student">LH</Link>
        <div>
          <span>Integrated Science</span>
          <strong>{assessment.title}</strong>
        </div>
        <div className={`quiz-timer ${remainingSeconds < 120 ? "urgent" : ""}`}>
          <small>Time remaining</small>
          <strong>{formatDuration(remainingSeconds)}</strong>
        </div>
      </header>

      <div className="quiz-runner-layout">
        <aside className="question-navigator">
          <div>
            <span>Progress</span>
            <strong>
              {answeredCount} of {assessment.questions.length} answered
            </strong>
            <div className="quiz-progress-track">
              <span
                style={{
                  width: `${(answeredCount / assessment.questions.length) * 100}%`,
                }}
              />
            </div>
          </div>
          <nav aria-label="Question navigator">
            {assessment.questions.map((question, index) => (
              <button
                aria-label={`Question ${index + 1}`}
                className={[
                  index === activeIndex ? "is-active" : "",
                  hasResponse(responses[question.id]) ? "is-answered" : "",
                  flagged.has(question.id) ? "is-flagged" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={question.id}
                onClick={() => setActiveIndex(index)}
                type="button"
              >
                {index + 1}
              </button>
            ))}
          </nav>
          <div className="navigator-key">
            <span><i className="answered-dot" /> Answered</span>
            <span><i className="flagged-dot" /> Flagged</span>
          </div>
          <button
            className="submit-assessment-button"
            onClick={() => setConfirmSubmit(true)}
            type="button"
          >
            Review and submit
          </button>
        </aside>

        <section className="question-stage">
          <div className="save-indicator">
            <span className={saveState.includes("interrupted") ? "error" : ""}>
              {saveState.includes("Saving") ? "◌" : "✓"}
            </span>
            {saveState}
          </div>
          <article className="question-paper">
            <header>
              <div>
                <span>
                  Question {activeIndex + 1} of {assessment.questions.length}
                </span>
                <small>{questionTypeLabel(activeQuestion.type)}</small>
              </div>
              <button
                className={flagged.has(activeQuestion.id) ? "is-flagged" : ""}
                onClick={toggleFlag}
                type="button"
              >
                ⚑{" "}
                {flagged.has(activeQuestion.id)
                  ? "Flagged for review"
                  : "Flag question"}
              </button>
            </header>
            <div className="question-prompt">
              <h1>{activeQuestion.prompt}</h1>
              <span>
                {activeQuestion.marks}{" "}
                {activeQuestion.marks === 1 ? "mark" : "marks"}
              </span>
            </div>
            <QuestionInput
              onChange={(value) => updateResponse(activeQuestion.id, value)}
              question={activeQuestion}
              value={responses[activeQuestion.id]?.value}
            />
          </article>
          <footer className="question-actions">
            <button
              disabled={activeIndex === 0}
              onClick={() => setActiveIndex((index) => index - 1)}
              type="button"
            >
              ← Previous
            </button>
            {activeIndex < assessment.questions.length - 1 ? (
              <button
                className="next-question-button"
                onClick={() => setActiveIndex((index) => index + 1)}
                type="button"
              >
                Next question →
              </button>
            ) : (
              <button
                className="next-question-button"
                onClick={() => setConfirmSubmit(true)}
                type="button"
              >
                Review attempt
              </button>
            )}
          </footer>
        </section>
      </div>

      {confirmSubmit ? (
        <div className="submit-dialog-backdrop" role="presentation">
          <section
            aria-labelledby="submit-title"
            aria-modal="true"
            className="submit-dialog"
            role="dialog"
          >
            <span className="submit-dialog-icon">✓</span>
            <h2 id="submit-title">Ready to submit?</h2>
            <p>
              You answered {answeredCount} of {assessment.questions.length}{" "}
              questions and flagged {flagged.size} for review.
            </p>
            {answeredCount < assessment.questions.length ? (
              <div className="unanswered-warning">
                {assessment.questions.length - answeredCount} unanswered{" "}
                question
                {assessment.questions.length - answeredCount === 1 ? "" : "s"}
              </div>
            ) : null}
            <div>
              <button onClick={() => setConfirmSubmit(false)} type="button">
                Keep working
              </button>
              <button
                className="confirm-submit-button"
                onClick={() => void submitAttempt()}
                type="button"
              >
                Submit attempt
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function QuestionInput({
  onChange,
  question,
  value,
}: {
  onChange: (value: unknown) => void;
  question: LearnerQuestion;
  value: unknown;
}) {
  if (question.type === "single-choice" || question.type === "true-false") {
    const options =
      question.type === "true-false"
        ? [
            { id: "true", label: "True", value: true },
            { id: "false", label: "False", value: false },
          ]
        : question.options.map((option) => ({ ...option, value: option.id }));
    return (
      <div className="choice-list">
        {options.map((option, index) => (
          <label
            className={
              value === option.value ? "choice-option is-selected" : "choice-option"
            }
            key={option.id}
          >
            <input
              checked={value === option.value}
              name={question.id}
              onChange={() => onChange(option.value)}
              type="radio"
            />
            <span>{String.fromCharCode(65 + index)}</span>
            <strong>{option.label}</strong>
          </label>
        ))}
      </div>
    );
  }

  if (question.type === "multiple-choice") {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <div className="choice-list">
        {question.options.map((option, index) => (
          <label
            className={
              selected.includes(option.id)
                ? "choice-option is-selected"
                : "choice-option"
            }
            key={option.id}
          >
            <input
              checked={selected.includes(option.id)}
              onChange={() =>
                onChange(
                  selected.includes(option.id)
                    ? selected.filter((id) => id !== option.id)
                    : [...selected, option.id],
                )
              }
              type="checkbox"
            />
            <span>{String.fromCharCode(65 + index)}</span>
            <strong>{option.label}</strong>
          </label>
        ))}
      </div>
    );
  }

  if (question.type === "matching") {
    const matches =
      typeof value === "object" && value
        ? (value as Record<string, string>)
        : {};
    const left = question.options.filter((option) =>
      option.id.startsWith("left:"),
    );
    const right = question.options.filter((option) =>
      option.id.startsWith("right:"),
    );
    return (
      <div className="matching-list">
        {left.map((item) => {
          const key = item.id.replace("left:", "");
          return (
            <label key={item.id}>
              <strong>{item.label}</strong>
              <span>matches with</span>
              <select
                onChange={(event) =>
                  onChange({ ...matches, [key]: event.target.value })
                }
                value={matches[key] ?? ""}
              >
                <option value="">Choose an action</option>
                {right.map((option) => (
                  <option
                    key={option.id}
                    value={option.id.replace("right:", "")}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    );
  }

  if (question.type === "ordering") {
    const order = Array.isArray(value)
      ? value.map(String)
      : question.options.map(() => "");
    return (
      <div className="ordering-list">
        {question.options.map((_, index) => (
          <label key={index}>
            <span>{index + 1}</span>
            <select
              onChange={(event) => {
                const next = [...order];
                next[index] = event.target.value;
                onChange(next);
              }}
              value={order[index] ?? ""}
            >
              <option value="">Select organ</option>
              {question.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    );
  }

  if (question.type === "essay" || question.type === "composite") {
    return (
      <div className="written-response">
        <textarea
          aria-label="Written response"
          onChange={(event) => onChange(event.target.value)}
          placeholder="Write your explanation here…"
          rows={8}
          value={String(value ?? "")}
        />
        <small>{String(value ?? "").trim().split(/\s+/).filter(Boolean).length} words</small>
      </div>
    );
  }

  if (question.type === "file-upload") {
    return (
      <div className="upload-response">
        <span>↑</span>
        <strong>Secure file response</strong>
        <p>Uploads will be enabled when your school activates file storage.</p>
      </div>
    );
  }

  if (question.type === "hotspot") {
    return (
      <div className="hotspot-response">
        {[1, 2, 3, 4, 5, 6].map((zone) => (
          <button
            className={value === `zone-${zone}` ? "is-selected" : ""}
            key={zone}
            onClick={() => onChange(`zone-${zone}`)}
            type="button"
          >
            {zone}
          </button>
        ))}
      </div>
    );
  }

  return (
    <label className="short-response">
      Your answer
      <input
        inputMode={question.type === "numeric" ? "decimal" : "text"}
        onChange={(event) => onChange(event.target.value)}
        type={question.type === "numeric" ? "number" : "text"}
        value={String(value ?? "")}
      />
    </label>
  );
}

function hasResponse(response?: QuestionResponse) {
  const value = response?.value;
  if (Array.isArray(value)) return value.some(Boolean);
  if (typeof value === "object" && value) {
    return Object.values(value).some(Boolean);
  }
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function questionTypeLabel(type: LearnerQuestion["type"]) {
  return type
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
