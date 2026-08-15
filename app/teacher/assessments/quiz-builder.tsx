"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Search, Trash2, X } from "lucide-react";
import type { QuestionBankSummary } from "../../../db/assessment-repository";
import type {
  AssessmentPurpose,
  FeedbackPolicy,
  QuestionType,
} from "../../../domain/assessment/types";
import { QUESTION_TYPES, isAutoMarked } from "./question-types";
import "./composer-shell.css";
import "./quiz-builder.css";

/* ==========================================================================
   Quiz builder

   The previous version rendered `bank.slice(0, 8)` as a checkbox list. A
   subject with more than eight approved questions could not put its ninth
   into a quiz at all, and nothing on screen said so — the list simply stopped.
   There was no search, no ordering, and no running total, so assembling a
   twenty-mark paper meant counting marks by hand off a truncated list.

   This is the whole bank, searchable and filterable, with the selection kept
   as an ordered list beside it. Order matters: the repository writes question
   positions from the order of `questionIds`, so what is arranged here is the
   order a learner sits the paper in.

   The totals in the footer are the point of the redesign. A teacher building
   a quiz is working towards a mark total and a time, and both were invisible
   until after the draft was created.
   ========================================================================== */

export type QuizDraft = {
  feedbackPolicy: FeedbackPolicy;
  instructions: string;
  passMarkPercent: number;
  purpose: AssessmentPurpose;
  questionIds: string[];
  timeLimitMinutes: number;
  title: string;
};

/* ==========================================================================
   When the learner sees their marks

   The column has existed since the schema was written and was inserted as
   'after-release' every time, from code, with no control anywhere — so
   "practice with immediate feedback versus an exam with delayed feedback"
   was a field in the database and nothing a teacher could choose.

   The order matters: the safe option is first and is the default. A paper
   that shows its answers the moment it is submitted is a paper the next
   learner to sit it already has.
   ========================================================================== */
const FEEDBACK_POLICIES: Array<[FeedbackPolicy, string, string]> = [
  [
    "after-release",
    "When I release the result",
    "Nothing until you have marked and released. Right for anything that counts.",
  ],
  [
    "after-attempt",
    "As soon as it is handed in",
    "Marks and correct answers on submission, before you have read the written answers.",
  ],
  [
    "immediate",
    "Straight away, question by question",
    "Practice only — the paper gives its answers away as it is worked through.",
  ],
];

const PURPOSES: Array<[AssessmentPurpose, string]> = [
  ["diagnostic", "Diagnostic"],
  ["formative", "Formative"],
  ["homework", "Homework"],
  ["summative", "Summative"],
  ["mock-examination", "Mock examination"],
  ["timed-examination", "Timed examination"],
  ["survey", "Survey"],
];

export function QuizBuilder({
  bank,
  onCancel,
  onSubmit,
}: {
  bank: QuestionBankSummary[];
  onCancel: () => void;
  onSubmit: (draft: QuizDraft) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState<AssessmentPurpose>("formative");
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(15);
  const [passMarkPercent, setPassMarkPercent] = useState(60);
  const [feedbackPolicy, setFeedbackPolicy] =
    useState<FeedbackPolicy>("after-release");
  const [instructions, setInstructions] = useState(
    "Answer every question, and review anything you flagged before submitting.",
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<QuestionType | "all">("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const headingId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onCancel]);

  const byId = useMemo(
    () => new Map(bank.map((question) => [question.id, question])),
    [bank],
  );

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => byId.get(id))
        .filter((question): question is QuestionBankSummary =>
          Boolean(question),
        ),
    [byId, selectedIds],
  );

  const available = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return bank.filter((question) => {
      if (selectedIds.includes(question.id)) return false;
      if (typeFilter !== "all" && question.type !== typeFilter) return false;
      if (!needle) return true;
      return (
        question.prompt.toLowerCase().includes(needle) ||
        question.topic.toLowerCase().includes(needle)
      );
    });
  }, [bank, query, selectedIds, typeFilter]);

  const totalMarks = selected.reduce((sum, item) => sum + item.marks, 0);
  /* Constructed responses are the ones a teacher has to sit down and read, so
     the count is worth showing while the paper is still being assembled
     rather than discovered later in the marking queue. */
  const manualCount = selected.filter(
    (question) => !isAutoMarked(question.type),
  ).length;

  const problem = !title.trim()
    ? "Give the quiz a title."
    : selected.length === 0
      ? "Add at least one question."
      : !instructions.trim()
        ? "Write the instructions learners will see."
        : undefined;

  function move(id: string, direction: -1 | 1) {
    setSelectedIds((current) => {
      const index = current.indexOf(id);
      const next = index + direction;
      if (index === -1 || next < 0 || next >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
      return reordered;
    });
  }

  async function submit() {
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSubmit({
        feedbackPolicy,
        instructions: instructions.trim(),
        passMarkPercent,
        purpose,
        questionIds: selectedIds,
        timeLimitMinutes,
        title: title.trim(),
      });
    } catch (thrown) {
      setError(
        thrown instanceof Error
          ? thrown.message
          : "The quiz draft could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="composer-scrim" role="presentation">
      <div
        aria-labelledby={headingId}
        aria-modal="true"
        className="composer composer-wide"
        ref={dialogRef}
        role="dialog"
      >
        <header className="composer-head">
          <div>
            <p className="composer-eyebrow">New quiz</p>
            <h2 id={headingId}>Assemble a paper from the question bank</h2>
          </div>
          <button
            aria-label="Close the quiz builder"
            className="composer-close"
            onClick={onCancel}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="composer-body">
          <section className="composer-meta">
            <label className="composer-field composer-field-wide">
              <span>Quiz title</span>
              <input
                autoFocus
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Digestive system knowledge check"
                value={title}
              />
            </label>
            <label className="composer-field">
              <span>Purpose</span>
              <select
                onChange={(event) =>
                  setPurpose(event.target.value as AssessmentPurpose)
                }
                value={purpose}
              >
                {PURPOSES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="composer-field">
              <span>
                Time limit <em>minutes</em>
              </span>
              <input
                max={600}
                min={1}
                onChange={(event) =>
                  setTimeLimitMinutes(Math.max(1, Number(event.target.value) || 1))
                }
                type="number"
                value={timeLimitMinutes}
              />
            </label>
            <label className="composer-field">
              <span>
                Pass mark <em>percent</em>
              </span>
              <input
                max={100}
                min={0}
                onChange={(event) =>
                  setPassMarkPercent(
                    Math.min(100, Math.max(0, Number(event.target.value) || 0)),
                  )
                }
                type="number"
                value={passMarkPercent}
              />
            </label>
            <label className="composer-field composer-field-wide">
              <span>
                Feedback <em>when the learner sees their marks</em>
              </span>
              <select
                onChange={(event) =>
                  setFeedbackPolicy(event.target.value as FeedbackPolicy)
                }
                value={feedbackPolicy}
              >
                {FEEDBACK_POLICIES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <small>
                {
                  FEEDBACK_POLICIES.find(
                    ([value]) => value === feedbackPolicy,
                  )?.[2]
                }
              </small>
            </label>
            <label className="composer-field composer-field-wide">
              <span>
                Instructions <em>shown before the first question</em>
              </span>
              <input
                onChange={(event) => setInstructions(event.target.value)}
                value={instructions}
              />
            </label>
          </section>

          <div className="quiz-picker">
            <section className="quiz-picker-side">
              <div className="quiz-picker-head">
                <h3>Question bank</h3>
                <span>{available.length} available</span>
              </div>

              <div className="quiz-picker-filters">
                <label className="quiz-search">
                  <Search aria-hidden="true" size={15} />
                  <input
                    aria-label="Search the question bank"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search prompt or topic"
                    value={query}
                  />
                </label>
                <select
                  aria-label="Filter by question type"
                  onChange={(event) =>
                    setTypeFilter(event.target.value as QuestionType | "all")
                  }
                  value={typeFilter}
                >
                  <option value="all">All types</option>
                  {Object.entries(QUESTION_TYPES).map(([type, definition]) => (
                    <option key={type} value={type}>
                      {definition.label}
                    </option>
                  ))}
                </select>
              </div>

              <ul className="quiz-picker-list">
                {available.map((question) => (
                  <li key={question.id}>
                    <button
                      className="quiz-picker-item"
                      onClick={() =>
                        setSelectedIds((current) => [...current, question.id])
                      }
                      type="button"
                    >
                      <span className="quiz-picker-copy">
                        <strong>{question.prompt}</strong>
                        <small>
                          {QUESTION_TYPES[question.type].label} ·{" "}
                          {question.marks}{" "}
                          {question.marks === 1 ? "mark" : "marks"} ·{" "}
                          {question.topic}
                        </small>
                      </span>
                      <span className="quiz-picker-add" aria-hidden="true">
                        <Plus size={15} />
                      </span>
                    </button>
                  </li>
                ))}
                {available.length === 0 ? (
                  <li className="quiz-picker-empty">
                    {bank.length === selected.length
                      ? "Every question in the bank is in this quiz."
                      : "No questions match this search."}
                  </li>
                ) : null}
              </ul>
            </section>

            <section className="quiz-picker-side">
              <div className="quiz-picker-head">
                <h3>In this quiz</h3>
                <span>
                  {selected.length}{" "}
                  {selected.length === 1 ? "question" : "questions"}
                </span>
              </div>

              <ol className="quiz-picker-list quiz-selected-list">
                {selected.map((question, index) => (
                  <li key={question.id}>
                    <span className="quiz-selected-position" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span className="quiz-picker-copy">
                      <strong>{question.prompt}</strong>
                      <small>
                        {QUESTION_TYPES[question.type].label} ·{" "}
                        {question.marks}{" "}
                        {question.marks === 1 ? "mark" : "marks"}
                        {isAutoMarked(question.type) ? "" : " · you mark this"}
                      </small>
                    </span>
                    <span className="quiz-selected-controls">
                      <button
                        aria-label={`Move "${question.prompt}" earlier`}
                        disabled={index === 0}
                        onClick={() => move(question.id, -1)}
                        type="button"
                      >
                        <ArrowUp aria-hidden="true" size={14} />
                      </button>
                      <button
                        aria-label={`Move "${question.prompt}" later`}
                        disabled={index === selected.length - 1}
                        onClick={() => move(question.id, 1)}
                        type="button"
                      >
                        <ArrowDown aria-hidden="true" size={14} />
                      </button>
                      <button
                        aria-label={`Remove "${question.prompt}"`}
                        onClick={() =>
                          setSelectedIds((current) =>
                            current.filter((id) => id !== question.id),
                          )
                        }
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={14} />
                      </button>
                    </span>
                  </li>
                ))}
                {selected.length === 0 ? (
                  <li className="quiz-picker-empty">
                    Choose questions from the bank. They are asked in the order
                    you add them.
                  </li>
                ) : null}
              </ol>
            </section>
          </div>
        </div>

        <footer className="composer-foot">
          {error ? (
            <p className="composer-error" role="alert">
              {error}
            </p>
          ) : (
            <p className="quiz-totals">
              <span>
                <strong>{totalMarks}</strong>{" "}
                {totalMarks === 1 ? "mark" : "marks"}
              </span>
              <span>
                <strong>{timeLimitMinutes}</strong> min
              </span>
              <span>
                Pass at <strong>{Math.ceil((passMarkPercent / 100) * totalMarks)}</strong>
              </span>
              {manualCount > 0 ? (
                <span className="quiz-totals-manual">
                  {manualCount} to mark by hand
                </span>
              ) : null}
            </p>
          )}
          <div className="composer-actions">
            <button className="composer-quiet" onClick={onCancel} type="button">
              Cancel
            </button>
            <button
              className="composer-primary"
              disabled={busy || Boolean(problem)}
              onClick={() => void submit()}
              type="button"
            >
              {busy ? "Creating…" : "Create quiz draft"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
