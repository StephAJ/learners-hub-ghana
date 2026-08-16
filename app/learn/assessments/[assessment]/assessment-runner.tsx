"use client";

import confetti from "canvas-confetti";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  FlagIcon,
} from "../../../components/icons";
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
import {
  OutlineScrim,
  OutlineToggle,
  useOutlineDrawer,
} from "../../../components/outline-drawer";
import { beginFocusMode, endFocusMode } from "../../../components/sidebar-state";

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
  /* Empty when saving is working, which is almost always. A permanent "All
     changes saved" chip is a reassurance nobody asked for that costs a corner
     of the rail on every screen; what a learner actually needs to know is the
     one case where it stops working, and that is worth a sentence rather than
     a pill. */
  const [saveProblem, setSaveProblem] = useState("");
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
  /* So the tick that reaches zero hands in once, not once a second. */
  const timeUpRef = useRef(false);

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

  /* The clock ran, reached zero, and then nothing happened — which is what
     "the timer isn't working" looks like from the learner's chair. It showed
     00:00 over a paper that still accepted typing, while every save was
     refused by the repository ("The assessment time limit has expired") and
     the attempt sat at in-progress indefinitely. An attempt found already
     past its deadline on open behaved the same way: a live paper with a dead
     clock.

     Reaching zero hands the paper in now, once, and says so. */
  useEffect(() => {
    const deadline = assessment.attempt?.deadlineAt;
    if (!deadline || assessment.attempt?.status !== "in-progress") return;

    const expiresAt = new Date(deadline).getTime();
    /* An unparseable deadline must not read as "no time left" — that would
       hand in a paper the learner has only just started. Leave the clock at
       the paper's own limit and let them work. */
    if (Number.isNaN(expiresAt)) return;

    const updateClock = () => {
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setRemainingSeconds(left);
      if (left === 0 && !timeUpRef.current) {
        timeUpRef.current = true;
        setNotice(
          "Time is up. Your paper has been handed in with the answers saved so far.",
        );
        void handIn();
      }
    };

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
    /* handIn is re-created each render and is only ever called from the tick;
       including it would restart the interval every second. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /* Before any of the early returns below — the paper has several states and
     a hook cannot be called from only some of them. */
  const drawer = useOutlineDrawer();

  /* The same fold the lesson player does, and for the same reason: this shell
     lays itself out across the whole window, so leaving the workspace sidebar
     open put a 15.5rem column beside a full-width page and pushed the paper
     off the right-hand edge — the outline's text clipped on the left and the
     back link scrolled out of reach. Sitting a paper wants the room at least
     as much as reading a lesson does. */
  useEffect(() => {
    beginFocusMode();
    return () => endFocusMode();
  }, []);

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
    setSaveProblem(
      result.ok
        ? ""
        : "Your last answer could not be saved. Check your connection — the answers already saved are safe.",
    );
    return result.ok;
  }

  /* Both hand back the paper the server now holds rather than patching the
     copy on screen: the attachment list, and whether the attempt is still
     open, are the server's answer to give. The string they return is the
     message the control shows; null means it worked. */
  async function attachFile(
    questionId: string,
    file: File,
  ): Promise<string | null> {
    if (!assessment.attempt) return "Start the paper before adding a file.";
    const body = new FormData();
    body.append("attemptId", assessment.attempt.id);
    body.append("file", file);
    body.append("questionId", questionId);
    const result = await fetch("/api/learn/assessments", { body, method: "POST" });
    const payload = (await result.json()) as {
      assessment?: LearnerAssessment;
      error?: string;
    };
    if (!result.ok || !payload.assessment) {
      return payload.error ?? "That file could not be added.";
    }
    setAssessment(payload.assessment);
    return null;
  }

  async function removeFile(attachmentId: string): Promise<string | null> {
    if (!assessment.attempt) return null;
    const result = await fetch("/api/learn/assessments", {
      body: JSON.stringify({
        action: "remove-attachment",
        attachmentId,
        attemptId: assessment.attempt.id,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await result.json()) as {
      assessment?: LearnerAssessment;
      error?: string;
    };
    if (!result.ok || !payload.assessment) {
      return payload.error ?? "That file could not be removed.";
    }
    setAssessment(payload.assessment);
    return null;
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
    await handIn();
  }

  /* The submit itself, without the save pass in front of it.

     Time-up cannot re-save: the repository refuses any write once the
     deadline is behind us ("The assessment time limit has expired"), so
     running submitAttempt() when the clock hits zero would fail on its own
     first step and abort. What the server already holds is what gets marked,
     which is exactly what an expired attempt should hand in. */
  async function handIn() {
    if (!assessment.attempt) return;
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

  /* Before the intro, because a paper with no questions is not one a learner
     should be invited to start — the runner would offer the rules and the
     clock, then read questions[0] off an empty list and take the page down.
     The same fault the lesson player had for a subject with no lessons. */
  if (assessment.questions.length === 0) {
    return (
      <div className="quiz-intro">
        <section className="quiz-intro-main">
          <p className="quiz-intro-instructions">
            This paper has no questions in it yet, so there is nothing to
            answer. Your teacher adds them before releasing it &mdash; nothing
            has gone wrong with your account, and you have not missed anything.
          </p>
          <Link className="course-primary" href="/learn/assessments">
            Back to my assessments
          </Link>
        </section>
      </div>
    );
  }

  if (!assessment.attempt) {
    return (
      <div className="lesson-shell">
        {/* The same rail the paper and the lesson player use, so starting an
            assessment does not look like a different product from sitting
            one. It was a two-column card whose stylesheet had been written
            for markup that no longer existed — the facts row styled an
            <article> the component emitted as a <div>, so none of it
            applied. */}
        <header className="lesson-toprail">
          <div className="lesson-toprail-heading">
            <Link className="course-back" href="/learn/assessments">
              <ArrowLeftIcon size={14} />
              All assessments
            </Link>
            <span className="lesson-toprail-divider" aria-hidden="true" />
            <div className="lesson-toprail-title">
              <p className="lesson-eyebrow">Assessment</p>
              <h2>{assessment.title}</h2>
            </div>
          </div>
        </header>

        <div className="quiz-brief">
          <p className="quiz-brief-instructions">{assessment.instructions}</p>

          <dl className="quiz-brief-facts">
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
              <dd>
                {assessment.timeLimitMinutes}
                <small>min</small>
              </dd>
            </div>
            <div>
              <dt>Pass mark</dt>
              <dd>
                {assessment.passMarkPercent}
                <small>%</small>
              </dd>
            </div>
          </dl>

          <section className="quiz-brief-panel">
            <h3>Before you begin</h3>
            <ul>
              <li>The clock starts when you select Start, not before.</li>
              <li>Your answers save as you go, even on a weak connection.</li>
              <li>You can flag a question and come back to it.</li>
              <li>
                When the time runs out the paper is handed in with whatever you
                have answered.
              </li>
            </ul>
          </section>

          <section className="quiz-brief-panel quiz-brief-covers">
            <h3>What this covers</h3>
            <ul>
              {[
                ...new Set(
                  assessment.questions.map((question) =>
                    questionTypeLabel(question.type),
                  ),
                ),
              ].map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </section>

          {notice ? (
            <p className="quiz-brief-error" role="alert">
              {notice}
            </p>
          ) : null}

          <div className="quiz-brief-start">
            <button
              className="course-primary"
              onClick={() => void startAttempt()}
              type="button"
            >
              Start assessment
              <ChevronRightIcon size={16} />
            </button>
            <small>This attempt is recorded and your teacher marks it.</small>
          </div>
        </div>
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

        {/* ==================================================================
            The review

            This screen ended at the card above: a number, the word
            "Released", and a link away. The teacher's marking — a mark per
            question and the words they wrote against the written answers —
            was stored on assessment_responses and shown to nobody. A learner
            was told what they scored and never what they got wrong.

            Shown only when the paper's feedback policy allows it, which is
            what that column has been for since the schema was written.
            ================================================================== */}
        {assessment.review.length > 0 ? (
          <section className="quiz-review">
            <h2>Your answers</h2>
            <ol>
              {assessment.questions.map((question, index) => {
                const marked = assessment.review.find(
                  (item) => item.questionId === question.id,
                );
                if (!marked) return null;
                const full = marked.awardedMarks >= marked.maximumMarks;
                const none = marked.awardedMarks === 0;
                return (
                  <li
                    className={
                      full
                        ? "is-correct"
                        : none
                          ? "is-incorrect"
                          : "is-partial"
                    }
                    key={question.id}
                  >
                    <div className="review-head">
                      <span className="review-number">{index + 1}</span>
                      <p className="review-prompt">{question.prompt}</p>
                      <span className="review-marks">
                        {marked.markingStatus === "needs-marking"
                          ? "Not yet marked"
                          : `${marked.awardedMarks} / ${marked.maximumMarks}`}
                      </span>
                    </div>
                    {marked.correctAnswer ? (
                      <p className="review-answer">
                        <span>Correct answer</span>
                        {marked.correctAnswer}
                      </p>
                    ) : null}
                    {marked.feedback ? (
                      <p className="review-feedback">
                        <span>Your teacher wrote</span>
                        {marked.feedback}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <>
      {/* ====================================================================
          The paper, on the lesson player's shell

          This was a boxed "runner" inside the workspace chrome: a bar, a
          panel of numbered squares, and a question card in a column beside
          them. Sitting a paper is the most focused thing a learner does in
          the product and it had the least room of any screen.

          It now uses the same shell the lesson player does — literally the
          same classes, so the two cannot drift apart — with the questions
          listed down the side rather than reduced to a grid of numbers. A
          learner scanning for "the one about the small intestine" can read it
          rather than remember which number it was.
          ==================================================================== */}
      <div className="lesson-shell" {...drawer.shellProps}>
        <header className="lesson-toprail">
          <div className="lesson-toprail-heading">
            <OutlineToggle drawer={drawer} label="Questions" />
            <Link className="course-back" href="/learn/assessments">
              <ArrowLeftIcon size={14} />
              All assessments
            </Link>
            <span className="lesson-toprail-divider" aria-hidden="true" />
            {/* The paper's name, not the question's text. The paper below
                leads with the prompt as its own heading, so carrying it here
                too printed the same sentence twice on one screen. */}
            <div className="lesson-toprail-title">
              <p className="lesson-eyebrow">
                Question {activeIndex + 1} of {assessment.questions.length}
              </p>
              <h2>{assessment.title}</h2>
            </div>
          </div>

          <div className="course-stage-nav">
            <div
              className={`runner-timer${
                remainingSeconds < 120 ? " is-urgent" : ""
              }`}
            >
              <ClockIcon size={13} />
              <span className="runner-timer-value">
                {formatDuration(remainingSeconds)}
              </span>
              <span className="runner-timer-label">left</span>
            </div>

            <button
              aria-label="Previous question"
              disabled={activeIndex === 0}
              onClick={() => setActiveIndex((index) => index - 1)}
              type="button"
            >
              <ChevronLeftIcon size={18} />
            </button>
            <button
              aria-label="Next question"
              disabled={activeIndex >= assessment.questions.length - 1}
              onClick={() => setActiveIndex((index) => index + 1)}
              type="button"
            >
              <ChevronRightIcon size={18} />
            </button>
          </div>
        </header>

        <div className="course-player">
          <OutlineScrim drawer={drawer} />
          <aside className="course-outline" aria-label="Questions">
            <header className="course-outline-head">
              <p>This paper</p>
              <div className="course-outline-progress">
                <span>
                  {answeredCount} of {assessment.questions.length} answered
                  {flagged.size > 0 ? ` · ${flagged.size} flagged` : ""}
                </span>
                <span className="course-outline-track" aria-hidden="true">
                  <i
                    style={{
                      width: `${
                        (answeredCount /
                          Math.max(1, assessment.questions.length)) *
                        100
                      }%`,
                    }}
                  />
                </span>
              </div>
            </header>

            <ol className="course-outline-list">
              {assessment.questions.map((question, index) => {
                const answered = hasResponse(responses[question.id]);
                const isFlagged = flagged.has(question.id);
                const isOpen = index === activeIndex;
                return (
                  <li className={isOpen ? "is-open" : undefined} key={question.id}>
                    <button
                      aria-current={isOpen ? "step" : undefined}
                      className="course-outline-lesson quiz-outline-question"
                      onClick={() => {
                        setActiveIndex(index);
                        /* Choosing one is the whole reason it was open. */
                        drawer.close();
                      }}
                      type="button"
                    >
                      {/* The same disc the lesson outline uses, so a learner
                          reads one shape across both screens: the number until
                          it is done, a tick after. */}
                      <span
                        className={`course-outline-status${
                          answered ? " is-done" : ""
                        }`}
                      >
                        {answered ? "✓" : index + 1}
                      </span>
                      <span className="course-outline-lesson-copy">
                        <strong>{question.prompt}</strong>
                        <small>
                          {questionTypeLabel(question.type)} · {question.marks}{" "}
                          {question.marks === 1 ? "mark" : "marks"}
                        </small>
                      </span>
                      {isFlagged ? (
                        <FlagIcon aria-label="Flagged" size={13} />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ol>

            <div className="quiz-outline-foot">
              <button
                className="course-primary"
                onClick={() => setConfirmSubmit(true)}
                type="button"
              >
                Review and submit
              </button>
            </div>
          </aside>

          <section className="course-stage quiz-stage">
            {/* Only when something is wrong. A learner sitting a paper does
                not need telling every few seconds that it is going fine; they
                do need telling the one time it is not. */}
            {saveProblem ? (
              <p className="quiz-save-problem" role="alert">
                {saveProblem}
              </p>
            ) : null}

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
                  <FlagIcon size={14} />
                  {flagged.has(activeQuestion.id) ? "Flagged" : "Flag question"}
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
                attachments={assessment.responseAttachments.filter(
                  (attachment) => attachment.questionId === activeQuestion.id,
                )}
                onAttach={(file) => attachFile(activeQuestion.id, file)}
                onChange={(value) => updateResponse(activeQuestion.id, value)}
                onRemoveAttachment={removeFile}
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
