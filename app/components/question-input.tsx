"use client";

import { useRef, useState } from "react";

import type {
  QuestionMedia,
  QuestionOption,
  QuestionType,
} from "../../domain/assessment/types";
import { QuestionFigure } from "./question-media";
import { ReorderResponse } from "./reorder-response";
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

/**
 * A file already handed in against this question.
 *
 * Structurally the learner's half of ResponseAttachment in
 * db/assessment-repository. Declared here rather than imported so a lesson
 * checkpoint, which has no attempt behind it, can render this component
 * without pulling in the repository's types.
 */
export type AnswerAttachment = {
  contentType: string;
  filename: string;
  id: string;
  sizeBytes: number;
};

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
  attachments = [],
  disabled = false,
  onAttach,
  onChange,
  onRemoveAttachment,
  question,
  value,
}: {
  /** Files already handed in against this question. */
  attachments?: AnswerAttachment[];
  /** Set once an answer has been marked, so feedback cannot be edited away. */
  disabled?: boolean;
  /* Both return the message to show, or null when it worked. A caller with no
     attempt behind it — a lesson checkpoint — passes neither, and the control
     says so rather than offering a button that cannot store anything. */
  onAttach?: (file: File) => Promise<string | null>;
  onChange: (value: unknown) => void;
  onRemoveAttachment?: (attachmentId: string) => Promise<string | null>;
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
    return (
      <ReorderResponse
        disabled={disabled}
        onChange={onChange}
        options={question.options}
        value={value}
      />
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
      <FileUploadResponse
        attachments={attachments}
        disabled={disabled}
        onAttach={onAttach}
        onRemove={onRemoveAttachment}
      />
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

/**
 * Handing in a file as the answer.
 *
 * This block used to read "Uploads will be enabled when your school activates
 * file storage" — but the storage it was waiting for is the same one lesson
 * media and handed-in assignment work already use. What was missing was the
 * row joining an answer to an asset, not the bucket.
 *
 * Each file goes up on its own as it is chosen, rather than being held until
 * the paper is handed in: a learner photographing working on a phone should
 * not lose four pages because the fifth failed.
 */
function FileUploadResponse({
  attachments,
  disabled,
  onAttach,
  onRemove,
}: {
  attachments: AnswerAttachment[];
  disabled: boolean;
  onAttach?: (file: File) => Promise<string | null>;
  onRemove?: (attachmentId: string) => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  if (!onAttach) {
    return (
      <div className="upload-response">
        <span>&#8593;</span>
        <strong>File response</strong>
        <p>
          This question is answered by handing in a file, which happens on the
          full paper rather than here.
        </p>
      </div>
    );
  }

  async function choose(file: File) {
    setBusy(true);
    setNotice(await onAttach!(file));
    setBusy(false);
    /* Cleared so choosing the same file again still fires a change event —
       a learner who retook a photograph under the same name would otherwise
       press the button and watch nothing happen. */
    if (picker.current) picker.current.value = "";
  }

  async function drop(attachmentId: string) {
    if (!onRemove) return;
    setBusy(true);
    setNotice(await onRemove(attachmentId));
    setBusy(false);
  }

  return (
    <div className="upload-response is-live">
      {attachments.length > 0 ? (
        <ul className="upload-list">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <a
                href={`/api/learn/assessments/attachment?attachmentId=${encodeURIComponent(
                  attachment.id,
                )}`}
              >
                {attachment.filename}
              </a>
              <small>{formatFileSize(attachment.sizeBytes)}</small>
              {disabled || !onRemove ? null : (
                <button
                  disabled={busy}
                  onClick={() => void drop(attachment.id)}
                  type="button"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {disabled ? (
        attachments.length === 0 ? (
          <p>No file was handed in for this question.</p>
        ) : null
      ) : (
        <>
          <label className="upload-picker">
            <span>{busy ? "Sending\u2026" : "Choose a file"}</span>
            <input
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void choose(file);
              }}
              ref={picker}
              type="file"
            />
          </label>
          <p>
            A photograph of your working or a document. It is saved as soon as
            you choose it, so you can add the next page straight away.
          </p>
        </>
      )}

      {notice ? <p className="upload-notice">{notice}</p> : null}
    </div>
  );
}

/** Kilobytes up to a megabyte, then megabytes — what a phone would say. */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
