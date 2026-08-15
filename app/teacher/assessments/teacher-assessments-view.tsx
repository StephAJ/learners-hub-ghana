"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  QuestionBankSummary,
  ReviewAttempt,
  TeacherAssessmentWorkspace,
} from "../../../db/assessment-repository";
import type { QuestionType } from "../../../domain/assessment/types";
import {
  QuestionComposer,
  type ComposedQuestion,
  type EditableQuestion,
} from "./question-composer";
import { QuizBuilder, type QuizDraft } from "./quiz-builder";
import { QUESTION_TYPES } from "./question-types";
import { useOfferingParam } from "../../components/offering-param";
import "../../admin/academic/academic.css";
import "./teacher-assessments.css";

/* The one list of type names now lives with the composer, which also knows
   what each type means and how it is answered. */
const typeLabels = Object.fromEntries(
  Object.entries(QUESTION_TYPES).map(([type, definition]) => [
    type,
    definition.label,
  ]),
) as Record<QuestionType, string>;

/* ==========================================================================
   No preview bank

   This screen opened on a hardcoded Integrated Science question bank, three
   quizzes and a review queue, and kept them whenever /api/teacher/assessments
   failed. Writing a question in that state added it to local state and said
   "Question added to this preview"; publishing a quiz marked it published for
   nobody. A teacher could build an assessment against a bank that did not
   exist, and never be told.
   ========================================================================== */

async function fetchWorkspace(
  offeringId?: string,
): Promise<{ error: string } | { workspace: TeacherAssessmentWorkspace }> {
  try {
    const response = await fetch(
      offeringId
        ? `/api/teacher/assessments?offeringId=${encodeURIComponent(offeringId)}`
        : "/api/teacher/assessments",
    );
    const payload = (await response.json()) as {
      error?: string;
      workspace?: TeacherAssessmentWorkspace;
    };
    if (!response.ok || !payload.workspace) {
      return {
        error: payload.error ?? "Your assessments could not be loaded.",
      };
    }
    return { workspace: payload.workspace };
  } catch {
    return { error: "Your assessments could not be reached." };
  }
}

type WorkspaceTab = "bank" | "quizzes" | "review";

export function TeacherAssessmentsView() {
  const [workspace, setWorkspace] = useState<TeacherAssessmentWorkspace | null>(
    null,
  );
  const [state, setState] = useState<"error" | "loading" | "ready">("loading");
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");

  /* The subject comes from the address bar, so a teacher who chose one on
     their markbook opens their assessments already on it. */
  const { offeringId, setOfferingId } = useOfferingParam();
  /* Bumped by Try again, which needs to re-run a load the URL would not
     change on its own. */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadOnce() {
      const result = await fetchWorkspace(offeringId);
      if (!active) return;
      if ("error" in result) {
        setProblem(result.error);
        setState("error");
        return;
      }
      setWorkspace(result.workspace);
      setState("ready");
    }

    void loadOnce();
    return () => {
      active = false;
    };
  }, [offeringId, reloadKey]);

  /* Both put the screen into its loading state from an event handler, where
     the spinner should appear the moment the control is pressed. */
  function selectOffering(next: string) {
    /* Nothing to wait for if it is already the subject on screen — and
       setting the loading state without a URL change would leave the
       spinner up with no effect due to run. */
    if (next === offeringId) return;
    setState("loading");
    setOfferingId(next);
  }

  function retry() {
    setState("loading");
    setReloadKey((current) => current + 1);
  }

  if (state === "loading") {
    return <p className="workspace-loading">Loading your assessments…</p>;
  }

  if (state === "error" || !workspace) {
    return (
      <div className="workspace-failure">
        <h2>Your assessments could not be loaded.</h2>
        <p>{problem}</p>
        <button onClick={retry} type="button">
          Try again
        </button>
      </div>
    );
  }

  return (
    <LoadedAssessments
      notice={notice}
      selectOffering={selectOffering}
      setNotice={setNotice}
      setWorkspace={(update) =>
        setWorkspace((current) => (current ? update(current) : current))
      }
      workspace={workspace}
    />
  );
}

/* Split from the loader so the rest can take a workspace that is present. */
function LoadedAssessments({
  notice,
  selectOffering,
  setNotice,
  setWorkspace,
  workspace,
}: {
  notice: string;
  selectOffering: (offeringId: string) => void;
  setNotice: (value: string) => void;
  /* An updater over a workspace that is present, so nothing below has to
     spread a value that might be null. */
  setWorkspace: (
    update: (current: TeacherAssessmentWorkspace) => TeacherAssessmentWorkspace,
  ) => void;
  workspace: TeacherAssessmentWorkspace;
}) {
  const [tab, setTab] = useState<WorkspaceTab>("bank");
  /* The question open in the composer, loaded in full — the workspace list
     carries a summary, which is not enough to edit from. */
  const [editing, setEditing] = useState<EditableQuestion | undefined>();
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [typeFilter, setTypeFilter] = useState<QuestionType | "all">("all");

  const visibleQuestions = useMemo(
    () =>
      typeFilter === "all"
        ? workspace.bank
        : workspace.bank.filter((item) => item.type === typeFilter),
    [typeFilter, workspace.bank],
  );
  const needsMarking = workspace.reviewQueue.filter(
    (attempt) => attempt.status === "needs-marking",
  ).length;
  /* Most questions written in one sitting share a topic, so the composer
     opens on the one the bank used last rather than empty. */
  const topicSuggestion = workspace.bank[0]?.topic ?? "";

  async function createQuestion(input: ComposedQuestion) {
    const response = await fetch("/api/teacher/assessments", {
      body: JSON.stringify({
        action: "create-question",
        offeringId: workspace.offeringId,
        ...input,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as {
      error?: string;
      question?: QuestionBankSummary;
    };
    if (!response.ok || !payload.question) {
      setNotice(payload.error ?? "Question could not be created.");
      return;
    }
    setWorkspace((current) => ({
      ...current,
      bank: [payload.question as QuestionBankSummary, ...current.bank],
    }));
    setNotice("Question approved and added to the bank.");
    setShowQuestionForm(false);
  }

  async function publishQuiz(assessmentId: string) {
    const response = await fetch("/api/teacher/assessments", {
      body: JSON.stringify({ action: "publish", assessmentId }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as {
      assessment?: TeacherAssessmentWorkspace["assessments"][number];
      error?: string;
    };
    if (!response.ok || !payload.assessment) {
      setNotice(payload.error ?? "Quiz could not be published.");
      return;
    }
    setWorkspace((current) => ({
      ...current,
      assessments: current.assessments.map((assessment) =>
        assessment.id === assessmentId
          ? payload.assessment!
          : assessment,
      ),
    }));
    setNotice("Quiz published. Learners can now start it.");
  }

  async function openQuestion(questionId: string) {
    const response = await fetch(
      `/api/teacher/assessments?questionId=${encodeURIComponent(questionId)}`,
    );
    const payload = (await response.json()) as {
      error?: string;
      question?: EditableQuestion;
    };
    if (!response.ok || !payload.question) {
      setNotice(payload.error ?? "That question could not be opened.");
      return;
    }
    setEditing(payload.question);
    setShowQuestionForm(true);
  }

  async function saveQuestion(input: ComposedQuestion) {
    if (!editing) {
      await createQuestion(input);
      return;
    }
    const response = await fetch("/api/teacher/assessments", {
      body: JSON.stringify({
        action: "update-question",
        questionId: editing.id,
        ...input,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as {
      error?: string;
      question?: QuestionBankSummary;
    };
    if (!response.ok || !payload.question) {
      setNotice(payload.error ?? "That question could not be saved.");
      return;
    }
    const saved = payload.question;
    setWorkspace((current) => ({
      ...current,
      bank: current.bank.map((item) =>
        item.id === saved.id ? saved : item,
      ),
    }));
    setEditing(undefined);
    setShowQuestionForm(false);
    setNotice(
      `Saved as version ${saved.version}. Papers already published keep the version they were set with.`,
    );
  }

  async function createQuiz(input: QuizDraft) {
    const response = await fetch("/api/teacher/assessments", {
      body: JSON.stringify({
        action: "create-assessment",
        offeringId: workspace.offeringId,
        ...input,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as {
      assessment?: TeacherAssessmentWorkspace["assessments"][number];
      error?: string;
    };
    if (!response.ok || !payload.assessment) {
      setNotice(payload.error ?? "Quiz draft could not be assembled.");
      return;
    }
    setWorkspace((current) => ({
      ...current,
      assessments: [payload.assessment!, ...current.assessments],
    }));
    setNotice("Quiz draft assembled from pinned question versions.");
  }

  async function updateReviewQueue(
    action:
      | {
          action: "mark";
          attemptId: string;
          feedback: string;
          marks: number;
          questionVersionId: string;
        }
      | { action: "release"; attemptId: string },
  ) {
    const response = await fetch("/api/teacher/assessments", {
      body: JSON.stringify(action),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as {
      error?: string;
      reviewQueue?: ReviewAttempt[];
    };
    if (!response.ok || !payload.reviewQueue) {
      setNotice(payload.error ?? "Review action could not be completed.");
      return;
    }
    setWorkspace((current) => ({
      ...current,
      reviewQueue: payload.reviewQueue as ReviewAttempt[],
    }));
    setNotice(
      action.action === "mark"
        ? "Response marked and score recalculated."
        : "Result released to the learner.",
    );
  }

  return (
    <>

      <section className="assessment-main">

        <div className="assessment-content">
          {/* The banner this replaces was 205px of gradient carrying a subject
              code tile, "Build, deliver and review with confidence." and a
              paragraph explaining what an assessment workspace is for. A
              teacher who has navigated to their assessments does not need to be
              sold them. Which subject, and what is waiting, is the whole of
              what belongs above the work. */}
          <header className="screen-context">
            <div className="screen-identity">
              {/* This said "Integrated Science · JHS 2 Gold" to everyone,
                  because the workspace was gated on that one offering. A
                  teacher of several subjects chooses here. */}
              {workspace.offerings.length > 1 ? (
                <label className="screen-subject-switch">
                  <span className="sr-only">Subject</span>
                  <select
                    onChange={(event) => selectOffering(event.target.value)}
                    value={workspace.offeringId}
                  >
                    {workspace.offerings.map((offering) => (
                      <option key={offering.id} value={offering.id}>
                        {offering.subjectName} · {offering.className}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <h2>{workspace.subjectName}</h2>
              )}
              <p>
                {workspace.className} · {workspace.code}
              </p>
            </div>
            {/* A "Preview as learner" button stood here and set a notice
                saying the preview "will open in a clearly labelled preview
                session". There is no assessment preview screen — the lesson
                player has one now, an assessment paper does not — so the
                button was describing a feature rather than running one. It is
                gone until there is something behind it. */}
          </header>

          {notice ? (
            <button
              className="assessment-notice"
              onClick={() => setNotice("")}
              type="button"
            >
              {notice} <span>×</span>
            </button>
          ) : null}

          {/* Four cards, on the small card the content library already used.
              The label was the same size as the figure before, so neither read
              as the answer; the figure is the largest thing in the card now and
              the label the smallest. */}
          <section className="screen-stats" aria-label="Assessment summary">
            <article>
              <span aria-hidden="true">?</span>
              <div>
                <small>Question bank</small>
                <strong>{workspace.bank.length}</strong>
                <small>{workspace.typeCoverage} item types</small>
              </div>
            </article>
            <article>
              <span aria-hidden="true">▲</span>
              <div>
                <small>Published quizzes</small>
                <strong>
                  {
                    workspace.assessments.filter(
                      (assessment) => assessment.status === "published",
                    ).length
                  }
                </strong>
                <small>Ready for learners</small>
              </div>
            </article>
            <article>
              <span aria-hidden="true">✎</span>
              <div>
                <small>Awaiting marking</small>
                <strong>{needsMarking}</strong>
                <small>Constructed response</small>
              </div>
            </article>
            <article>
              <span aria-hidden="true">◷</span>
              <div>
                <small>Attempts</small>
                <strong>
                  {workspace.assessments.reduce(
                    (sum, assessment) => sum + assessment.attemptCount,
                    0,
                  )}
                </strong>
                <small>Current versions</small>
              </div>
            </article>
          </section>

          <div className="screen-tabs" role="tablist">
            {[
              ["bank", "Question bank"],
              ["quizzes", "Quizzes"],
              ["review", `Review queue · ${needsMarking}`],
            ].map(([id, label]) => (
              <button
                aria-selected={tab === id}
                className={tab === id ? "is-active" : ""}
                key={id}
                onClick={() => setTab(id as WorkspaceTab)}
                role="tab"
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "bank" ? (
            <QuestionBankPanel
              createQuestion={saveQuestion}
              editing={editing}
              onOpenQuestion={openQuestion}
              questions={visibleQuestions}
              setShowForm={(value) => {
                if (!value) setEditing(undefined);
                setShowQuestionForm(value);
              }}
              setTypeFilter={setTypeFilter}
              showForm={showQuestionForm}
              topicSuggestion={topicSuggestion}
              typeFilter={typeFilter}
            />
          ) : null}
          {tab === "quizzes" ? (
            <QuizPanel
              assessments={workspace.assessments}
              bank={workspace.bank}
              createQuiz={createQuiz}
              publishQuiz={publishQuiz}
            />
          ) : null}
          {tab === "review" ? (
            <ReviewPanel
              attempts={workspace.reviewQueue}
              updateQueue={updateReviewQueue}
            />
          ) : null}
        </div>
      </section>
    </>
  );
}

function QuestionBankPanel({
  createQuestion,
  editing,
  onOpenQuestion,
  questions,
  setShowForm,
  setTypeFilter,
  showForm,
  topicSuggestion,
  typeFilter,
}: {
  createQuestion: (input: ComposedQuestion) => Promise<void>;
  editing?: EditableQuestion;
  onOpenQuestion: (questionId: string) => Promise<void>;
  questions: QuestionBankSummary[];
  setShowForm: (value: boolean) => void;
  setTypeFilter: (value: QuestionType | "all") => void;
  showForm: boolean;
  topicSuggestion: string;
  typeFilter: QuestionType | "all";
}) {
  return (
    <section className="assessment-panel">
      <div className="panel-heading">
        <div>
          <p>Reusable content</p>
          <h2>Question bank</h2>
        </div>
        <button
          className="primary-assessment-button"
          onClick={() => setShowForm(!showForm)}
          type="button"
        >
          {showForm ? "Close form" : "+ New question"}
        </button>
      </div>

      {showForm ? (
        <QuestionComposer
          /* Keyed on the question so reopening a different one remounts the
             composer rather than leaving the previous one's answers in it. */
          key={editing?.id ?? "new"}
          existing={editing}
          onCancel={() => setShowForm(false)}
          onSubmit={createQuestion}
          topicSuggestion={topicSuggestion}
        />
      ) : null}

      <div className="question-filter-row">
        <label htmlFor="question-type-filter">Filter by item type</label>
        <select
          id="question-type-filter"
          onChange={(event) =>
            setTypeFilter(event.target.value as QuestionType | "all")
          }
          value={typeFilter}
        >
          <option value="all">All question types</option>
          {Object.entries(typeLabels).map(([type, label]) => (
            <option key={type} value={type}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {questions.length === 0 ? (
        <div className="workspace-empty">
          <strong>No questions yet</strong>
          <p>
            Questions you write for this subject collect here, ready to be
            pulled into a quiz. Write the first one above.
          </p>
        </div>
      ) : null}
      <div className="question-bank-list">
        {questions.map((item) => (
          /* A question was a card that did nothing. Editing one is the most
             ordinary thing a teacher wants from a bank, so the card is the
             control — a button rather than a row with an edit link tucked in
             the corner. */
          <button
            className="question-bank-card"
            key={item.id}
            onClick={() => void onOpenQuestion(item.id)}
            type="button"
          >
            <span className={`question-type-icon ${item.type}`}>
              {questionSymbol(item.type)}
            </span>
            <div className="question-card-copy">
              <div>
                <span className="question-type-label">
                  {typeLabels[item.type]}
                </span>
                <span className={`difficulty-tag ${item.difficulty}`}>
                  {item.difficulty}
                </span>
              </div>
              <h3>{item.prompt}</h3>
              <p>
                {item.topic} · Version {item.version} · Used in{" "}
                {item.usageCount}{" "}
                {item.usageCount === 1 ? "quiz" : "quizzes"}
              </p>
            </div>
            <div className="question-marks">
              <strong>{item.marks}</strong>
              <span>{item.marks === 1 ? "mark" : "marks"}</span>
              <small>{item.status}</small>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function QuizPanel({
  assessments,
  bank,
  createQuiz,
  publishQuiz,
}: {
  assessments: TeacherAssessmentWorkspace["assessments"];
  bank: QuestionBankSummary[];
  createQuiz: (input: QuizDraft) => Promise<void>;
  publishQuiz: (assessmentId: string) => Promise<void>;
}) {
  const [showBuilder, setShowBuilder] = useState(false);

  return (
    <section className="assessment-panel">
      <div className="panel-heading">
        <div>
          <p>Delivery</p>
          <h2>Quizzes and checks</h2>
        </div>
        <button
          className="secondary-assessment-button"
          onClick={() => setShowBuilder(true)}
          type="button"
        >
          + Assemble quiz
        </button>
      </div>

      {showBuilder ? (
        <QuizBuilder
          bank={bank}
          onCancel={() => setShowBuilder(false)}
          onSubmit={async (draft) => {
            await createQuiz(draft);
            setShowBuilder(false);
          }}
        />
      ) : null}

      {assessments.length === 0 ? (
        <div className="workspace-empty">
          <strong>No quizzes yet</strong>
          <p>Assemble one from the question bank to publish it to learners.</p>
        </div>
      ) : null}
      <div className="quiz-grid">
        {assessments.map((assessment) => (
          <article className="quiz-card" key={assessment.id}>
            <div className="quiz-card-top">
              <span className={`quiz-state ${assessment.status}`}>
                {assessment.status}
              </span>
            </div>
            <div className="quiz-icon">✓</div>
            <p>{assessment.purpose.replace("-", " ")}</p>
            <h3>{assessment.title}</h3>
            <div className="quiz-facts">
              <span>{assessment.questionCount} questions</span>
              <span>{assessment.totalMarks} marks</span>
              <span>{assessment.timeLimitMinutes} min</span>
            </div>
            <div className="quiz-card-footer">
              <span>
                <strong>{assessment.attemptCount}</strong> attempts
              </span>
              {assessment.status === "draft" ? (
                <button
                  onClick={() => void publishQuiz(assessment.id)}
                  type="button"
                >
                  Publish quiz
                </button>
              ) : (
                <span>Published</span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}


function ReviewPanel({
  attempts,
  updateQueue,
}: {
  attempts: ReviewAttempt[];
  updateQueue: (
    action:
      | {
          action: "mark";
          attemptId: string;
          feedback: string;
          marks: number;
          questionVersionId: string;
        }
      | { action: "release"; attemptId: string },
  ) => Promise<void>;
}) {
  const [marks, setMarks] = useState("2");
  const [feedback, setFeedback] = useState(
    "Good explanation of surface area. Add the rich blood supply for full marks.",
  );

  return (
    <section className="assessment-panel">
      <div className="panel-heading">
        <div>
          <p>Teacher judgement</p>
          <h2>Attempt review</h2>
        </div>
        <span className="review-policy">Results release after marking</span>
      </div>
      {attempts.length === 0 ? (
        <div className="workspace-empty">
          <strong>Nothing to review</strong>
          <p>
            Attempts appear here once learners have sat a published quiz.
          </p>
        </div>
      ) : null}
      <div className="review-list">
        {attempts.map((attempt) => (
          <article className="review-card" key={attempt.attemptId}>
            <header>
              <span className="review-avatar">
                {initials(attempt.learnerName)}
              </span>
              <div>
                <h3>{attempt.learnerName}</h3>
                <p>
                  {attempt.title} · Submitted{" "}
                  {formatTime(attempt.submittedAt)}
                </p>
              </div>
              <span className={`review-status ${attempt.status}`}>
                {attempt.status.replace("-", " ")}
              </span>
            </header>
            {attempt.response ? (
              <div className="marking-workbench">
                <div className="learner-response">
                  <span>Constructed response</span>
                  <h4>{attempt.response.prompt}</h4>
                  {attempt.response.responseText.trim() ? (
                    <blockquote>{attempt.response.responseText}</blockquote>
                  ) : null}

                  {/* Handed-in files open in a new tab so the marker keeps
                      this form and the marks already typed into it. */}
                  {attempt.response.attachments.length > 0 ? (
                    <ul className="response-files">
                      {attempt.response.attachments.map((file) => (
                        <li key={file.id}>
                          <a
                            href={`/api/learn/assessments/attachment?attachmentId=${encodeURIComponent(file.id)}`}
                            rel="noreferrer noopener"
                            target="_blank"
                          >
                            {file.filename}
                          </a>
                          <span>{formatFileSize(file.sizeBytes)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {!attempt.response.responseText.trim() &&
                  attempt.response.attachments.length === 0 ? (
                    <blockquote>
                      Handed in with no written answer and no attached file.
                    </blockquote>
                  ) : null}
                </div>
                <div className="marking-controls">
                  <label>
                    Awarded marks
                    <span>
                      <input
                        max={attempt.response.maximumMarks}
                        min="0"
                        onChange={(event) => setMarks(event.target.value)}
                        type="number"
                        value={marks}
                      />
                      / {attempt.response.maximumMarks}
                    </span>
                  </label>
                  <label>
                    Feedback to learner
                    <textarea
                      onChange={(event) => setFeedback(event.target.value)}
                      rows={3}
                      value={feedback}
                    />
                  </label>
                  <button
                    className="primary-assessment-button"
                    onClick={() =>
                      void updateQueue({
                        action: "mark",
                        attemptId: attempt.attemptId,
                        feedback,
                        marks: Number(marks),
                        questionVersionId:
                          attempt.response!.questionVersionId,
                      })
                    }
                    type="button"
                  >
                    Save mark
                  </button>
                </div>
              </div>
            ) : (
              <div className="release-result-row">
                <div>
                  <span>Final score</span>
                  <strong>
                    {attempt.score} / {attempt.maximumMarks}
                  </strong>
                </div>
                {attempt.status === "marked" ? (
                  <button
                    className="primary-assessment-button"
                    onClick={() =>
                      void updateQueue({
                        action: "release",
                        attemptId: attempt.attemptId,
                      })
                    }
                    type="button"
                  >
                    Release result
                  </button>
                ) : (
                  <span className="released-note">Visible to learner</span>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function questionSymbol(type: QuestionType) {
  if (type === "single-choice" || type === "multiple-choice") return "●";
  if (type === "true-false") return "T";
  if (type === "matching") return "↔";
  if (type === "grouping") return "⊞";
  if (type === "ordering") return "≡";
  if (type === "essay") return "¶";
  if (type === "numeric") return "#";
  return "?";
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-GH", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/** Kilobytes up to a megabyte, then megabytes — what a phone would say. */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
