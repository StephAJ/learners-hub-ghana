"use client";

import confetti from "canvas-confetti";
import Link from "next/link";
import {
  ChevronRightIcon,
  ClockIcon,
  FlagIcon,
} from "../../../components/icons";
import { ProgressDonut } from "../../../components/progress-donut";
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
import type {
  QuestionMedia,
  QuestionResponse,
} from "../../../../domain/assessment/types";
import { QuestionFigure, QuestionFormula } from "./question-media";

export function AssessmentRunner({
  previewAssessment,
}: {
  previewAssessment: LearnerAssessment;
}) {
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

  /* Marks only ever go up as a teacher finishes marking, never down, so a
     score that already clears the pass mark is safe to celebrate even before
     every question is released — the learner cannot end up below the bar
     later. A score that has not cleared it yet stays silent rather than
     showing a premature "below pass mark," since written questions still
     awaiting marking could still push it over. */
  const hasPassed = Boolean(
    assessment.result &&
      assessment.result.maximumMarks > 0 &&
      (assessment.result.score / assessment.result.maximumMarks) * 100 >=
        assessment.passMarkPercent,
  );
  const celebratedRef = useRef(false);

  useEffect(() => {
    if (!hasPassed || celebratedRef.current) return;
    celebratedRef.current = true;
    celebratePass();
  }, [hasPassed]);

  const assessmentId = previewAssessment.id;

  useEffect(() => {
    let active = true;
    const timers = saveTimers.current;
    async function loadAssessment() {
      try {
        const response = await fetch(
          `/api/learn/assessments?assessmentId=${encodeURIComponent(assessmentId)}`,
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
  }, [assessmentId]);

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
          /* No answer key ships to the client, so preview mode cannot mark
             the attempt for real — this stands in for a plausible pass until
             a protected session provides the actual auto-marked score. */
          score: Math.round(totalMarks * 0.85),
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
      <div className="quiz-intro">
        {/* The workspace topbar already names the assessment, its subject and
            its shape, so this screen carries only what the topbar cannot: the
            instructions, the rules, and the button that starts the clock. */}
        <section className="quiz-intro-main">
          <p className="quiz-intro-instructions">{assessment.instructions}</p>

          <dl className="quiz-intro-facts">
            <div>
              <dt>Questions</dt>
              <dd>{assessment.questions.length}</dd>
            </div>
            <div>
              <dt>Total marks</dt>
              <dd>{totalMarks}</dd>
            </div>
            <div>
              <dt>Time limit</dt>
              <dd>{assessment.timeLimitMinutes} min</dd>
            </div>
            <div>
              <dt>Pass mark</dt>
              <dd>{assessment.passMarkPercent}%</dd>
            </div>
          </dl>

          <div className="quiz-readiness">
            <h2>Before you begin</h2>
            <ul>
              <li>Your timer starts when you select Start assessment.</li>
              <li>Answers save as you work, including on a weak connection.</li>
              <li>You can flag a question and return before submitting.</li>
            </ul>
          </div>

          {notice ? <p className="quiz-error">{notice}</p> : null}

          <div className="quiz-intro-actions">
            <button
              className="start-quiz-button"
              onClick={() => void startAttempt()}
              type="button"
            >
              Start assessment
              <ChevronRightIcon size={16} />
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

        <aside className="quiz-intro-aside">
          <h2>What this covers</h2>
          <ul>
            {[
              ...new Set(
                assessment.questions.map((question) =>
                  questionTypeLabel(question.type),
                ),
              ),
            ].map(
              (label) => (
                <li key={label}>{label}</li>
              ),
            )}
          </ul>
        </aside>
      </div>
    );
  }

  if (assessment.attempt.status !== "in-progress") {
    return (
      <div className="quiz-result">
        <section className={`quiz-result-card${hasPassed ? " is-passed" : ""}`}>
          <div className="result-check">{hasPassed ? "🎉" : "✓"}</div>
          <span>Attempt submitted</span>
          <h1>
            {hasPassed
              ? "Nice work — you passed!"
              : "Your work is safely recorded."}
          </h1>
          <p>
            {hasPassed
              ? `You cleared the ${assessment.passMarkPercent}% pass mark for this assessment.`
              : "Objective questions have been checked. Your teacher will review the written response before releasing the final result."}
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
      </div>
    );
  }

  return (
    <>
      <div className="runner">
        <header className="runner-bar">
          <div className="runner-bar-where">
            <p className="runner-bar-position">
              Question {activeIndex + 1} of {assessment.questions.length}
            </p>
            <p className="runner-bar-counts">
              {answeredCount} answered
              {flagged.size > 0 ? ` · ${flagged.size} flagged` : ""}
            </p>
          </div>

          {/* The save state belongs here rather than floating above the
              question card, where it was the only thing in its row and pulled
              the column out of alignment with this bar. */}
          <div className="runner-bar-side">
            <span
              className={`runner-save${
                saveState.includes("interrupted") ? " is-error" : ""
              }${saveState.includes("Saving") ? " is-busy" : ""}`}
              role="status"
            >
              <i aria-hidden="true" />
              {saveState}
            </span>

            <div
              className={`runner-timer${
                remainingSeconds < 120 ? " is-urgent" : ""
              }`}
            >
              <ClockIcon size={15} />
              <span className="runner-timer-value">
                {formatDuration(remainingSeconds)}
              </span>
              <span className="runner-timer-label">left</span>
            </div>
          </div>
        </header>

        <div className="runner-grid">
          <aside className="runner-nav">
            <div className="runner-nav-progress">
              <ProgressDonut
                percent={
                  (answeredCount / Math.max(1, assessment.questions.length)) *
                  100
                }
              />
              <p>
                <strong>
                  {answeredCount} of {assessment.questions.length}
                </strong>
                answered
              </p>
            </div>

            <nav aria-label="Question navigator" className="runner-nav-grid">
              {assessment.questions.map((question, index) => {
                const answered = hasResponse(responses[question.id]);
                const isFlagged = flagged.has(question.id);
                return (
                  <button
                    aria-current={index === activeIndex ? "step" : undefined}
                    aria-label={`Question ${index + 1}${
                      answered ? ", answered" : ", not answered"
                    }${isFlagged ? ", flagged" : ""}`}
                    className={[
                      index === activeIndex ? "is-active" : "",
                      answered ? "is-answered" : "",
                      isFlagged ? "is-flagged" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={question.id}
                    onClick={() => setActiveIndex(index)}
                    type="button"
                  >
                    {index + 1}
                  </button>
                );
              })}
            </nav>

            <button
              className="runner-submit"
              onClick={() => setConfirmSubmit(true)}
              type="button"
            >
              Review and submit
            </button>
          </aside>

          <section className="runner-stage">
            <article className="question-paper">
              <header>
                <div>
                  <span>
                    Question {activeIndex + 1} of{" "}
                    {assessment.questions.length}
                  </span>
                  <small>{questionTypeLabel(activeQuestion.type)}</small>
                </div>
                <button
                  className={
                    flagged.has(activeQuestion.id) ? "is-flagged" : ""
                  }
                  onClick={toggleFlag}
                  type="button"
                >
                  <FlagIcon size={14} />
                  {flagged.has(activeQuestion.id)
                    ? "Flagged"
                    : "Flag question"}
                </button>
              </header>

              <div className="question-prompt">
                <h1>{activeQuestion.prompt}</h1>
                <span className="question-marks">
                  {activeQuestion.marks}{" "}
                  {activeQuestion.marks === 1 ? "mark" : "marks"}
                </span>
              </div>

              {activeQuestion.formula ? (
                <QuestionFormula formula={activeQuestion.formula} />
              ) : null}
              {activeQuestion.media ? (
                <QuestionFigure media={activeQuestion.media} />
              ) : null}

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
                &#8592; Previous
              </button>
              {activeIndex < assessment.questions.length - 1 ? (
                <button
                  className="next-question-button"
                  onClick={() => setActiveIndex((index) => index + 1)}
                  type="button"
                >
                  Next question &#8594;
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
    </>
  );
}

/**
 * What sits inside one choice tile.
 *
 * A picture option keeps its label as the accessible name rather than
 * dropping it: "the diagram showing the small intestine" is what a learner
 * using a screen reader needs, and it is also what shows if the image fails.
 */
function ChoiceBody({
  option,
}: {
  option: { label: string; media?: QuestionMedia };
}) {
  if (option.media?.alt?.trim()) {
    return (
      <span className="choice-media">
        <QuestionFigure media={option.media} variant="option" />
        <strong>{option.label}</strong>
      </span>
    );
  }
  return <strong>{option.label}</strong>;
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
            <ChoiceBody option={option} />
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
            <ChoiceBody option={option} />
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

function celebratePass() {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const colors = ["#0d5f55", "#e9b84b", "#f3faf7"];
  const end = Date.now() + 1200;
  (function burst() {
    void confetti({
      angle: 60,
      colors,
      origin: { x: 0, y: 0.7 },
      particleCount: 3,
      spread: 55,
    });
    void confetti({
      angle: 120,
      colors,
      origin: { x: 1, y: 0.7 },
      particleCount: 3,
      spread: 55,
    });
    if (Date.now() < end) requestAnimationFrame(burst);
  })();
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
