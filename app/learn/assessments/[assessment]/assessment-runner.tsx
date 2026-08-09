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
import type { QuestionResponse } from "../../../../domain/assessment/types";
import {
  QuestionFigure,
  QuestionFormula,
} from "../../../components/question-media";
import { QuestionInput } from "../../../components/question-input";

/* ==========================================================================
   No preview attempt

   This runner had a "preview" mode it fell into whenever the assessment could
   not be re-fetched. In it, pressing Start built an attempt with the id
   "preview-attempt"; typing an answer reported "Saved in preview" and saved
   nothing; and submitting invented a result — Math.round(totalMarks * 0.85) —
   and showed it to the learner as their score.

   A learner cannot tell that screen from the working one. They sit the paper,
   answer it, hand it in, and are told they scored 85%. Nothing was recorded,
   and no teacher ever sees it.

   The paper is loaded on the server now and every write goes to the API. A
   failure says so.
   ========================================================================== */

export function AssessmentRunner({
  assessment: initialAssessment,
}: {
  assessment: LearnerAssessment;
}) {
  const [assessment, setAssessment] = useState(initialAssessment);
  const [activeIndex, setActiveIndex] = useState(0);
  const [responses, setResponses] = useState<
    Record<string, QuestionResponse>
  >({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState("All changes saved");
  const [notice, setNotice] = useState("");
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(
    initialAssessment.timeLimitMinutes * 60,
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

  const assessmentId = initialAssessment.id;

  useEffect(() => {
    let active = true;
    const timers = saveTimers.current;
    /* A refresh, not a fallback: the server already rendered this paper, so
       a failure here leaves what is on screen and says nothing. Picking up an
       attempt in progress is the reason it runs at all. */
    async function loadAssessment() {
      try {
        const response = await fetch(
          `/api/learn/assessments?assessmentId=${encodeURIComponent(assessmentId)}`,
        );
        if (!response.ok) return;
        const payload = (await response.json()) as {
          assessment?: LearnerAssessment;
        };
        if (!active || !payload.assessment) return;
        setAssessment(payload.assessment);
        setResponses(payload.assessment.attempt?.responses ?? {});
      } catch {
        /* Left as the server rendered it. */
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
  }

  function updateResponse(questionId: string, value: unknown) {
    const response = { value };
    setResponses((current) => ({ ...current, [questionId]: response }));
    if (!assessment.attempt) return;
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
    if (!assessment.attempt) return;
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
            <small>Your attempt will be recorded.</small>
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
          <Link href={`/learn/subjects/${assessment.offeringId}`}>
            Back to the subject
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
