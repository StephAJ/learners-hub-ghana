import type {
  QuestionMedia,
  QuestionOption,
  QuestionType,
} from "../../domain/assessment/types";
import { QuestionFigure } from "./question-media";
import "./question-input.css";

/* ==========================================================================
   Answering a question

   Extracted from the assessment runner so a lesson checkpoint asks a question
   exactly the way a paper does. A learner who has learned that a matching
   question uses a "Choose a match" select in an examination should not meet a
   different control for the same question type inside a lesson — and an
   accessibility fix made here reaches both.

   This renders the controls only. Marking lives in domain/assessment.
   ========================================================================== */

/** The shape both callers share: a question with no answer key attached. */
export type AnswerableQuestion = {
  id: string;
  options: QuestionOption[];
  type: QuestionType;
};

/**
 * A choice tile's body: a picture option, or a plain label.
 *
 * A picture option keeps its label as the accessible name rather than
 * dropping it: "the diagram showing the small intestine" is what a learner
 * using a screen reader needs, and it is also what shows if the image fails.
 */
export function ChoiceBody({
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

export function QuestionInput({
  disabled = false,
  onChange,
  question,
  value,
}: {
  /** Set once an answer has been marked, so feedback cannot be edited away. */
  disabled?: boolean;
  onChange: (value: unknown) => void;
  question: AnswerableQuestion;
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
              disabled={disabled}
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
              disabled={disabled}
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
                aria-label={`What ${item.label} matches with`}
                disabled={disabled}
                onChange={(event) =>
                  onChange({ ...matches, [key]: event.target.value })
                }
                value={matches[key] ?? ""}
              >
                {/* Not "Choose an action". These placeholders were written
                    against the one demo question in front of the developer at
                    the time — a matching question about digestive organs and
                    their actions — so every matching question in every subject
                    asked the learner to choose an action, and every ordering
                    question asked them to select an organ. The select cannot
                    know what its options are, so it says what it is for. */}
                <option value="">Choose a match</option>
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
              aria-label={`Position ${index + 1}`}
              disabled={disabled}
              onChange={(event) => {
                const next = [...order];
                next[index] = event.target.value;
                onChange(next);
              }}
              value={order[index] ?? ""}
            >
              <option value="">Choose an item</option>
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
          disabled={disabled}
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
            disabled={disabled}
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
        disabled={disabled}
        inputMode={question.type === "numeric" ? "decimal" : "text"}
        onChange={(event) => onChange(event.target.value)}
        type={question.type === "numeric" ? "number" : "text"}
        value={String(value ?? "")}
      />
    </label>
  );
}

/** True when a learner has actually put something in the control. */
export function hasAnswer(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(Boolean);
  if (typeof value === "object" && value) {
    return Object.values(value).some(Boolean);
  }
  return value !== undefined && value !== null && String(value).trim() !== "";
}
