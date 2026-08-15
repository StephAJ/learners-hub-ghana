"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlignLeft,
  ArrowDownUp,
  ArrowLeftRight,
  CheckCheck,
  CircleDot,
  Hash,
  Layers,
  MousePointerClick,
  Paperclip,
  Plus,
  ToggleLeft,
  Trash2,
  Type,
  X,
} from "lucide-react";
import type { QuestionType } from "../../../domain/assessment/types";
import {
  QUESTION_TYPES,
  QUESTION_TYPE_ORDER,
  type AnswerShape,
} from "./question-types";
import "./question-composer.css";

/* ==========================================================================
   Question composer

   Replaces a single form that showed the same two fields — "Options, one per
   line" and "Correct answer or rubric" — whichever of the eleven item types
   was selected. Choosing "Multiple choice" changed nothing on screen; the
   teacher had to know that the correct answers went in one text box,
   comma-separated, spelled exactly as they had written the options, because
   the server slugified both before comparing them. Ordering and matching
   could not be authored at all.

   Here the type is picked from a grid that says what each one is, and the
   answer editor below is the editor for that type: options with the correct
   one marked, a sequence, a set of pairs, a number, a rubric. The composer
   emits the same flat CreateBankQuestionInput the API already takes, so all
   of this is presentation over an unchanged contract — see toQuestionOptions
   and buildAnswerKey in db/assessment-repository.ts for the encoding.
   ========================================================================== */

export type ComposedQuestion = {
  correctAnswer: string;
  /** Curriculum outcomes this question is evidence for. */
  standardIds?: string[];
  difficulty: "foundation" | "standard" | "challenge";
  formula?: string;
  marks: number;
  media?: { alt: string; url: string };
  options: string[];
  prompt: string;
  rationale: string;
  topic: string;
  type: QuestionType;
};

const TYPE_ICONS: Record<QuestionType, typeof CircleDot> = {
  "single-choice": CircleDot,
  "multiple-choice": CheckCheck,
  "true-false": ToggleLeft,
  "short-text": Type,
  numeric: Hash,
  matching: ArrowLeftRight,
  grouping: Layers,
  ordering: ArrowDownUp,
  essay: AlignLeft,
  "file-upload": Paperclip,
  hotspot: MousePointerClick,
  composite: Layers,
};

/** An option row while it is being edited. */
type OptionDraft = { correct: boolean; id: string; label: string };
type PairDraft = { id: string; left: string; right: string };

let sequence = 0;
function nextId() {
  sequence += 1;
  return `draft-${sequence}`;
}

function blankOptions(count: number): OptionDraft[] {
  return Array.from({ length: count }, () => ({
    correct: false,
    id: nextId(),
    label: "",
  }));
}

/* ==========================================================================
   Editing a question that is already in the bank

   The composer only ever wrote new ones, so a question with a typo, a wrong
   mark total or an option in the wrong order stayed that way — the remedy was
   writing a second question and leaving the first in the list.

   `existing` reopens one. What comes back is the current version's own fields,
   and saving writes a new version rather than rewriting that one, because a
   published paper stays bound to the version it was set with.
   ========================================================================== */
export type EditableQuestion = ComposedQuestion & { id: string };

export function QuestionComposer({
  existing,
  onCancel,
  onSubmit,
  standards = [],
  topicSuggestion,
}: {
  existing?: EditableQuestion;
  onCancel: () => void;
  onSubmit: (input: ComposedQuestion) => Promise<void>;
  /** The subject's curriculum outcomes, for the mapping below. */
  standards?: Array<{ code: string; description: string; id: string }>;
  topicSuggestion: string;
}) {
  const [type, setType] = useState<QuestionType>(
    existing?.type ?? "single-choice",
  );
  const [prompt, setPrompt] = useState(existing?.prompt ?? "");
  const [topic, setTopic] = useState(existing?.topic ?? topicSuggestion);
  const [difficulty, setDifficulty] = useState<ComposedQuestion["difficulty"]>(
    existing?.difficulty ?? "standard",
  );
  const [marks, setMarks] = useState(existing?.marks ?? 1);
  const [rationale, setRationale] = useState(existing?.rationale ?? "");
  const [formula, setFormula] = useState(existing?.formula ?? "");
  const [imageUrl, setImageUrl] = useState(existing?.media?.url ?? "");
  const [imageAlt, setImageAlt] = useState(existing?.media?.alt ?? "");

  const [options, setOptions] = useState<OptionDraft[]>(() =>
    existing && existing.options.length > 0
      ? existing.options.map((label) => ({
          correct: isNamedIn(existing.correctAnswer, label),
          id: nextId(),
          label,
        }))
      : blankOptions(4),
  );
  const [booleanAnswer, setBooleanAnswer] = useState(
    existing?.correctAnswer?.toLowerCase() === "false" ? "false" : "true",
  );
  const [exactAnswer, setExactAnswer] = useState(
    existing && existing.options.length === 0 ? existing.correctAnswer : "",
  );
  const [rubric, setRubric] = useState("");
  const [sequenceItems, setSequenceItems] = useState<OptionDraft[]>(() =>
    existing && existing.options.length > 0
      ? existing.options.map((label) => ({
          correct: false,
          id: nextId(),
          label,
        }))
      : blankOptions(4),
  );
  const [pairs, setPairs] = useState<PairDraft[]>(() => [
    { id: nextId(), left: "", right: "" },
    { id: nextId(), left: "", right: "" },
    { id: nextId(), left: "", right: "" },
  ]);

  const [standardIds, setStandardIds] = useState<string[]>(
    existing?.standardIds ?? [],
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const headingId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const shape = QUESTION_TYPES[type].answerShape;
  const unavailable = QUESTION_TYPES[type].unavailable;

  /* Escape closes, and focus is trapped, because this covers the whole
     workspace — a keyboard user who tabs out of it is lost behind a scrim. */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onCancel]);

  /* Switching between two single-answer types keeps the answer; switching to a
     different shape does not, because it would not mean the same thing. */
  function changeType(next: QuestionType) {
    const previousShape = QUESTION_TYPES[type].answerShape;
    const nextShape = QUESTION_TYPES[next].answerShape;
    setType(next);
    setError("");
    if (previousShape === nextShape) return;
    if (nextShape === "choice-one" || nextShape === "choice-many") {
      setOptions((current) =>
        /* Labels survive; which are correct does not, since "exactly one" and
           "any number" are different claims about the same list. */
        current.map((option) => ({ ...option, correct: false })),
      );
    }
  }

  const composed = useMemo(
    () => ({
      ...compose({
      booleanAnswer,
      difficulty,
      exactAnswer,
      formula,
      imageAlt,
      imageUrl,
      marks,
      options,
      pairs,
      prompt,
      rationale,
      rubric,
      sequenceItems,
      shape,
      topic,
      type,
      }),
      standardIds,
    }),
    [
      booleanAnswer,
      difficulty,
      exactAnswer,
      formula,
      imageAlt,
      imageUrl,
      marks,
      options,
      pairs,
      prompt,
      rationale,
      rubric,
      sequenceItems,
      shape,
      standardIds,
      topic,
      type,
    ],
  );

  /* An unavailable type is a refusal, not a warning. It printed a note saying
     the type could not work and then saved it anyway, so a teacher could
     write a hotspot question, publish it in a paper, and a learner would meet
     a question nothing can answer. Whatever a type cannot do, it cannot do
     after the note has been read. */
  const problem = unavailable ?? validate(composed, shape);

  async function submit() {
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSubmit(composed);
    } catch (thrown) {
      setError(
        thrown instanceof Error
          ? thrown.message
          : "The question could not be saved.",
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
        className="composer"
        ref={dialogRef}
        role="dialog"
      >
        <header className="composer-head">
          <div>
            <p className="composer-eyebrow">New question</p>
            <h2 id={headingId}>Write the question, then set its answer</h2>
          </div>
          <button
            aria-label="Close the composer"
            className="composer-close"
            onClick={onCancel}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="composer-body">
          <label className="composer-field composer-prompt">
            <span>Question</span>
            <textarea
              autoFocus
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="What do you want to ask?"
              rows={3}
              value={prompt}
            />
          </label>

          <fieldset className="composer-types">
            <legend>Question type</legend>
            <div className="composer-type-grid">
              {QUESTION_TYPE_ORDER.map((candidate) => {
                const definition = QUESTION_TYPES[candidate];
                const Icon = TYPE_ICONS[candidate];
                return (
                  <button
                    aria-pressed={candidate === type}
                    className={`composer-type${
                      candidate === type ? " is-selected" : ""
                    }${definition.unavailable ? " is-unavailable" : ""}`}
                    key={candidate}
                    onClick={() => changeType(candidate)}
                    type="button"
                  >
                    <span className="composer-type-icon" aria-hidden="true">
                      <Icon size={17} />
                    </span>
                    <span className="composer-type-copy">
                      <strong>{definition.label}</strong>
                      <small>{definition.blurb}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {unavailable ? (
            <p className="composer-warning" role="status">
              {unavailable}
            </p>
          ) : null}

          {/* Which outcomes this question is evidence for.

              Optional on purpose: a teacher writing a quick question at the
              end of a long day should not be stopped by a mapping screen, and
              an unmapped question still marks perfectly well. It just cannot
              contribute to what a learner is told they can do — which is why
              the note says so rather than leaving the omission silent. */}
          {standards.length > 0 ? (
            <fieldset className="composer-standards">
              <legend>What this question tests</legend>
              <p className="answer-help">
                Tick the outcomes a right answer here is evidence for. This is
                what fills in a learner&rsquo;s progress by outcome; leave it
                blank and the question still works, it just will not count
                towards one.
              </p>
              <div className="composer-standard-list">
                {standards.map((standard) => {
                  const on = standardIds.includes(standard.id);
                  return (
                    <label
                      className={`composer-standard${on ? " is-on" : ""}`}
                      key={standard.id}
                    >
                      <input
                        checked={on}
                        onChange={() =>
                          setStandardIds((current) =>
                            current.includes(standard.id)
                              ? current.filter((id) => id !== standard.id)
                              : [...current, standard.id],
                          )
                        }
                        type="checkbox"
                      />
                      <span>
                        <strong>{standard.code}</strong>
                        <small>{standard.description}</small>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          <details className="composer-extras">
            <summary>
              Add a diagram or formula
              {imageUrl.trim() || formula.trim() ? <em>added</em> : null}
            </summary>
            <div className="composer-extras-body">
              <label className="composer-field">
                <span>
                  Formula <em>1/3 + 1/4, or TeX such as rac{"{1}{3}"}</em>
                </span>
                <input
                  onChange={(event) => setFormula(event.target.value)}
                  placeholder="1/3 + 1/4 = ?"
                  value={formula}
                />
              </label>
              <label className="composer-field">
                <span>
                  Image <em>a path under public/, or an uploaded media URL</em>
                </span>
                <input
                  onChange={(event) => setImageUrl(event.target.value)}
                  placeholder="/lesson-images/digestive-system-parts.jpg"
                  value={imageUrl}
                />
              </label>
              <label className="composer-field">
                <span>
                  Describe the image <em>read aloud in place of it</em>
                </span>
                <input
                  onChange={(event) => setImageAlt(event.target.value)}
                  placeholder="A labelled diagram of the digestive system."
                  value={imageAlt}
                />
              </label>
              {imageUrl.trim() && !imageAlt.trim() ? (
                <p className="composer-warning">
                  This image will not be saved until it has a description. A
                  learner using a screen reader would otherwise meet a question
                  they cannot answer, with nothing on screen to say why.
                </p>
              ) : null}
            </div>
          </details>

          <section className="composer-answer">
            <h3>Answer</h3>
            <AnswerEditor
              booleanAnswer={booleanAnswer}
              exactAnswer={exactAnswer}
              options={options}
              pairs={pairs}
              rubric={rubric}
              sequenceItems={sequenceItems}
              setBooleanAnswer={setBooleanAnswer}
              setExactAnswer={setExactAnswer}
              setOptions={setOptions}
              setPairs={setPairs}
              setRubric={setRubric}
              setSequenceItems={setSequenceItems}
              shape={shape}
              type={type}
            />
          </section>

          <section className="composer-meta">
            <label className="composer-field">
              <span>Topic</span>
              <input
                onChange={(event) => setTopic(event.target.value)}
                placeholder="Human body systems"
                value={topic}
              />
            </label>
            <label className="composer-field">
              <span>Difficulty</span>
              <select
                onChange={(event) =>
                  setDifficulty(
                    event.target.value as ComposedQuestion["difficulty"],
                  )
                }
                value={difficulty}
              >
                <option value="foundation">Foundation</option>
                <option value="standard">Standard</option>
                <option value="challenge">Challenge</option>
              </select>
            </label>
            <label className="composer-field">
              <span>Marks</span>
              <input
                max={100}
                min={1}
                onChange={(event) =>
                  setMarks(Math.max(1, Number(event.target.value) || 1))
                }
                type="number"
                value={marks}
              />
            </label>
            <label className="composer-field composer-field-wide">
              <span>
                Explanation <em>shown to learners after release</em>
              </span>
              <input
                onChange={(event) => setRationale(event.target.value)}
                placeholder="Why the correct answer is correct."
                value={rationale}
              />
            </label>
          </section>
        </div>

        <footer className="composer-foot">
          {error ? (
            <p className="composer-error" role="alert">
              {error}
            </p>
          ) : (
            <p className="composer-hint">
              {problem ?? "Ready to save to the question bank."}
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
              {busy ? "Saving…" : "Save question"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   The answer editors
   ------------------------------------------------------------------------- */

function AnswerEditor({
  booleanAnswer,
  exactAnswer,
  options,
  pairs,
  rubric,
  sequenceItems,
  setBooleanAnswer,
  setExactAnswer,
  setOptions,
  setPairs,
  setRubric,
  setSequenceItems,
  shape,
  type,
}: {
  booleanAnswer: string;
  exactAnswer: string;
  options: OptionDraft[];
  pairs: PairDraft[];
  rubric: string;
  sequenceItems: OptionDraft[];
  setBooleanAnswer: (value: string) => void;
  setExactAnswer: (value: string) => void;
  setOptions: (update: (current: OptionDraft[]) => OptionDraft[]) => void;
  setPairs: (update: (current: PairDraft[]) => PairDraft[]) => void;
  setRubric: (value: string) => void;
  setSequenceItems: (update: (current: OptionDraft[]) => OptionDraft[]) => void;
  shape: AnswerShape;
  type: QuestionType;
}) {
  if (shape === "boolean") {
    return (
      <div className="answer-boolean">
        {[
          ["true", "True"],
          ["false", "False"],
        ].map(([value, label]) => (
          <label
            className={booleanAnswer === value ? "is-correct" : undefined}
            key={value}
          >
            <input
              checked={booleanAnswer === value}
              name="boolean-answer"
              onChange={() => setBooleanAnswer(value)}
              type="radio"
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    );
  }

  if (shape === "choice-one" || shape === "choice-many") {
    const many = shape === "choice-many";
    return (
      <div className="answer-options">
        <p className="answer-help">
          {many
            ? "Tick every option that is correct."
            : "Select the one correct option."}
        </p>
        {options.map((option, index) => (
          <div className="answer-option" key={option.id}>
            <label className="answer-option-mark">
              <input
                checked={option.correct}
                name={many ? `correct-${option.id}` : "correct-option"}
                onChange={() =>
                  setOptions((current) =>
                    current.map((item) =>
                      item.id === option.id
                        ? { ...item, correct: many ? !item.correct : true }
                        : /* Only one answer can be correct, so choosing one
                             clears the rest rather than silently allowing two. */
                          many
                          ? item
                          : { ...item, correct: false },
                    ),
                  )
                }
                type={many ? "checkbox" : "radio"}
              />
              <span className="answer-option-mark-label">
                {option.correct ? "Correct" : "Mark correct"}
              </span>
            </label>
            <input
              aria-label={`Option ${index + 1}`}
              className="answer-option-label"
              onChange={(event) =>
                setOptions((current) =>
                  current.map((item) =>
                    item.id === option.id
                      ? { ...item, label: event.target.value }
                      : item,
                  ),
                )
              }
              placeholder={`Option ${index + 1}`}
              value={option.label}
            />
            <button
              aria-label={`Remove option ${index + 1}`}
              className="answer-remove"
              disabled={options.length <= 2}
              onClick={() =>
                setOptions((current) =>
                  current.filter((item) => item.id !== option.id),
                )
              }
              type="button"
            >
              <Trash2 aria-hidden="true" size={15} />
            </button>
          </div>
        ))}
        <button
          className="answer-add"
          onClick={() =>
            setOptions((current) => [
              ...current,
              { correct: false, id: nextId(), label: "" },
            ])
          }
          type="button"
        >
          <Plus aria-hidden="true" size={15} /> Add option
        </button>
      </div>
    );
  }

  if (shape === "sequence") {
    return (
      <div className="answer-options">
        <p className="answer-help">
          Enter the items in their correct order. Learners are shown them
          shuffled.
        </p>
        {sequenceItems.map((item, index) => (
          <div className="answer-option answer-sequence" key={item.id}>
            <span className="answer-sequence-number" aria-hidden="true">
              {index + 1}
            </span>
            <input
              aria-label={`Item ${index + 1}`}
              className="answer-option-label"
              onChange={(event) =>
                setSequenceItems((current) =>
                  current.map((entry) =>
                    entry.id === item.id
                      ? { ...entry, label: event.target.value }
                      : entry,
                  ),
                )
              }
              placeholder={`Item ${index + 1}`}
              value={item.label}
            />
            <button
              aria-label={`Remove item ${index + 1}`}
              className="answer-remove"
              disabled={sequenceItems.length <= 2}
              onClick={() =>
                setSequenceItems((current) =>
                  current.filter((entry) => entry.id !== item.id),
                )
              }
              type="button"
            >
              <Trash2 aria-hidden="true" size={15} />
            </button>
          </div>
        ))}
        <button
          className="answer-add"
          onClick={() =>
            setSequenceItems((current) => [
              ...current,
              { correct: false, id: nextId(), label: "" },
            ])
          }
          type="button"
        >
          <Plus aria-hidden="true" size={15} /> Add item
        </button>
      </div>
    );
  }

  if (shape === "pairs" || shape === "groups") {
    const sorting = shape === "groups";
    return (
      <div className="answer-options">
        <p className="answer-help">
          {sorting
            ? "One row per item, with the group it belongs in. Repeat a group name on as many rows as you like — the learner sees each group once."
            : "Each row is one correct pair. Learners choose from all the right-hand answers, shuffled."}
        </p>
        {pairs.map((pair, index) => (
          <div className="answer-pair" key={pair.id}>
            <input
              aria-label={`Row ${index + 1}, item`}
              onChange={(event) =>
                setPairs((current) =>
                  current.map((entry) =>
                    entry.id === pair.id
                      ? { ...entry, left: event.target.value }
                      : entry,
                  ),
                )
              }
              placeholder="Item"
              value={pair.left}
            />
            <span className="answer-pair-link" aria-hidden="true">
              <ArrowLeftRight size={15} />
            </span>
            <input
              aria-label={
                sorting ? `Row ${index + 1}, group` : `Row ${index + 1}, match`
              }
              onChange={(event) =>
                setPairs((current) =>
                  current.map((entry) =>
                    entry.id === pair.id
                      ? { ...entry, right: event.target.value }
                      : entry,
                  ),
                )
              }
              placeholder={sorting ? "Belongs in" : "Matches with"}
              value={pair.right}
            />
            <button
              aria-label={`Remove row ${index + 1}`}
              className="answer-remove"
              disabled={pairs.length <= 2}
              onClick={() =>
                setPairs((current) =>
                  current.filter((entry) => entry.id !== pair.id),
                )
              }
              type="button"
            >
              <Trash2 aria-hidden="true" size={15} />
            </button>
          </div>
        ))}
        <button
          className="answer-add"
          onClick={() =>
            setPairs((current) => [
              ...current,
              { id: nextId(), left: "", right: "" },
            ])
          }
          type="button"
        >
          <Plus aria-hidden="true" size={15} />{" "}
          {sorting ? "Add item" : "Add pair"}
        </button>
      </div>
    );
  }

  if (shape === "rubric") {
    return (
      <label className="composer-field">
        <span>
          Marking rubric <em>what a full-mark answer contains</em>
        </span>
        <textarea
          onChange={(event) => setRubric(event.target.value)}
          placeholder="Describe what earns full marks, so this is marked the same way every time."
          rows={4}
          value={rubric}
        />
      </label>
    );
  }

  return (
    <label className="composer-field">
      <span>
        {type === "numeric" ? "Correct number" : "Correct answer"}
        <em>
          {type === "numeric"
            ? "matched exactly"
            : "matched ignoring case and surrounding spaces"}
        </em>
      </span>
      <input
        inputMode={type === "numeric" ? "decimal" : "text"}
        onChange={(event) => setExactAnswer(event.target.value)}
        placeholder={type === "numeric" ? "32" : "Amylase"}
        type={type === "numeric" ? "number" : "text"}
        value={exactAnswer}
      />
    </label>
  );
}

/* -------------------------------------------------------------------------
   Composing and validating

   Both are pure and live outside the component so the encoding can be read in
   one place, and tested without rendering anything.
   ------------------------------------------------------------------------- */

type ComposeInput = {
  booleanAnswer: string;
  difficulty: ComposedQuestion["difficulty"];
  exactAnswer: string;
  formula: string;
  imageAlt: string;
  imageUrl: string;
  marks: number;
  options: OptionDraft[];
  pairs: PairDraft[];
  prompt: string;
  rationale: string;
  rubric: string;
  sequenceItems: OptionDraft[];
  shape: AnswerShape;
  topic: string;
  type: QuestionType;
};

export function compose(input: ComposeInput): ComposedQuestion {
  const base = {
    difficulty: input.difficulty,
    formula: input.formula.trim() || undefined,
    marks: input.marks,
    /* Only a described image is an image. An undescribed one is dropped here
       rather than saved and hidden later, so the composer's warning is the
       whole story. */
    media:
      input.imageUrl.trim() && input.imageAlt.trim()
        ? { alt: input.imageAlt.trim(), url: input.imageUrl.trim() }
        : undefined,
    prompt: input.prompt.trim(),
    rationale: input.rationale.trim(),
    topic: input.topic.trim(),
    type: input.type,
  };

  if (input.shape === "boolean") {
    return {
      ...base,
      correctAnswer: input.booleanAnswer,
      options: ["True", "False"],
    };
  }

  if (input.shape === "choice-one" || input.shape === "choice-many") {
    const filled = input.options.filter((option) => option.label.trim());
    return {
      ...base,
      correctAnswer: filled
        .filter((option) => option.correct)
        .map((option) => option.label.trim())
        .join(", "),
      options: filled.map((option) => option.label.trim()),
    };
  }

  if (input.shape === "sequence") {
    const items = input.sequenceItems
      .map((item) => item.label.trim())
      .filter(Boolean);
    return {
      ...base,
      /* The sequence is the answer. The options are the same items in a
         different arrangement, so the question does not display its own
         answer — the runner renders options in stored order. */
      correctAnswer: items.join(", "),
      options: shuffleStably(items),
    };
  }

  if (input.shape === "pairs") {
    const filled = input.pairs.filter(
      (pair) => pair.left.trim() && pair.right.trim(),
    );
    return {
      ...base,
      correctAnswer: filled
        .map((pair) => `${pair.left.trim()}::${pair.right.trim()}`)
        .join(", "),
      /* `left::` and `right::` tell the repository which column an option
         belongs to; the runner splits on the resulting id prefix. */
      options: [
        ...filled.map((pair) => `left::${pair.left.trim()}`),
        ...shuffleStably(filled.map((pair) => `right::${pair.right.trim()}`)),
      ],
    };
  }

  /* Sorting is authored as pairs and stored as pairs — the one difference is
     the right-hand column. A group holds several items, so its name is
     written on several rows, and showing it once per row would give the
     learner four identical "Carbohydrate" buckets to choose between. Each
     distinct group appears once, in the order the author first wrote it. */
  if (input.shape === "groups") {
    const filled = input.pairs.filter(
      (pair) => pair.left.trim() && pair.right.trim(),
    );
    const groups: string[] = [];
    for (const pair of filled) {
      const name = pair.right.trim();
      if (!groups.some((entry) => entry.toLowerCase() === name.toLowerCase())) {
        groups.push(name);
      }
    }
    return {
      ...base,
      correctAnswer: filled
        .map((pair) => `${pair.left.trim()}::${pair.right.trim()}`)
        .join(", "),
      options: [
        ...shuffleStably(filled.map((pair) => `left::${pair.left.trim()}`)),
        ...groups.map((name) => `right::${name}`),
      ],
    };
  }

  if (input.shape === "rubric") {
    return { ...base, correctAnswer: input.rubric.trim(), options: [] };
  }

  return { ...base, correctAnswer: input.exactAnswer.trim(), options: [] };
}

export function validate(
  question: ComposedQuestion,
  shape: AnswerShape,
): string | undefined {
  if (!question.prompt) return "Write the question first.";
  if (!question.topic) return "Give the question a topic.";

  if (shape === "choice-one" || shape === "choice-many") {
    if (question.options.length < 2) return "Add at least two options.";
    if (!question.correctAnswer) {
      return shape === "choice-many"
        ? "Tick at least one correct option."
        : "Mark which option is correct.";
    }
  }
  if (shape === "sequence" && question.options.length < 2) {
    return "Add at least two items to put in order.";
  }
  if (shape === "pairs") {
    const complete = question.correctAnswer
      .split(",")
      .filter((pair) => pair.includes("::"));
    if (complete.length < 2) return "Complete at least two pairs.";
  }
  if (shape === "groups") {
    const rows = question.correctAnswer
      .split(",")
      .filter((row) => row.includes("::"));
    if (rows.length < 2) return "Give at least two items and their groups.";
    const groups = new Set(
      rows.map((row) => row.split("::")[1]?.trim().toLowerCase()),
    );
    /* One group is not a sorting question — every item goes in the only box,
       and the learner cannot get it wrong. */
    if (groups.size < 2) return "Sorting needs at least two different groups.";
  }
  if (shape === "rubric" && !question.correctAnswer) {
    return "Write the rubric this will be marked against.";
  }
  if (shape === "exact" && !question.correctAnswer) {
    return "Give the answer this will be marked against.";
  }
  if (question.type === "numeric" && !Number.isFinite(Number(question.correctAnswer))) {
    return "A numeric question needs a number as its answer.";
  }
  return undefined;
}

/**
 * A deterministic rearrangement.
 *
 * Only has to differ from the input, not be random: it exists so an ordering
 * question does not present its items already in the correct order. Being
 * deterministic keeps a saved question rendering the same way every time,
 * which a Math.random() shuffle at author time would also do — but this can
 * be reasoned about when a teacher asks why the options are in that order.
 */
function shuffleStably<T>(items: T[]): T[] {
  if (items.length < 2) return [...items];
  const middle = Math.ceil(items.length / 2);
  const front = items.slice(0, middle);
  const back = items.slice(middle);
  const interleaved: T[] = [];
  for (let index = 0; index < middle; index += 1) {
    if (back[index] !== undefined) interleaved.push(back[index]);
    if (front[index] !== undefined) interleaved.push(front[index]);
  }
  return interleaved;
}

/* Whether a stored answer names this option.

   The answer comes back from the repository as the words a learner sees —
   "The small intestine", or "A, C" for a multiple-response — so matching is on
   the label rather than on an id the composer never holds. */
function isNamedIn(answer: string | undefined, label: string): boolean {
  if (!answer || !label) return false;
  return answer
    .split(/[,;]/)
    .map((part) => part.trim().toLowerCase())
    .includes(label.trim().toLowerCase());
}
