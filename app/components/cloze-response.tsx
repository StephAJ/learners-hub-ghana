"use client";

import { useState } from "react";
import { parseBracketed } from "../../domain/assessment/bracketed";
import type { QuestionOption } from "../../domain/assessment/types";

/* ==========================================================================
   Filling the gaps in a passage

   Tap a word, tap a gap. The fourth question type built on that one gesture,
   and by now the argument is simply consistency: a learner who can answer a
   matching question can answer this one without being taught anything new.

   The passage arrives as the author wrote it, brackets and all, and is split
   here — see domain/assessment/bracketed.ts. Keeping one source for the text
   and its answers is what stops the two drifting apart, which a separate
   "answers" field would have allowed on every edit.

   A word taken from the bank stays out of it, so a learner cannot use the
   same word twice and then find the last gap unfillable. Tapping a filled gap
   puts its word back.
   ========================================================================== */

export function ClozeResponse({
  disabled,
  onChange,
  options,
  passage,
  value,
}: {
  disabled?: boolean;
  onChange: (value: string[]) => void;
  /** The word bank: the real answers plus the author's wrong ones, shuffled. */
  options: QuestionOption[];
  /** The prompt, with answers still in square brackets. */
  passage: string;
  value: unknown;
}) {
  const segments = parseBracketed(passage);
  const gapCount = segments.filter((segment) => segment.kind === "gap").length;
  const filled = normaliseFilled(value, gapCount, options);
  const [held, setHeld] = useState<string | null>(null);

  const used = new Set(filled.filter(Boolean));
  const bank = options.filter((option) => !used.has(option.id));

  function tapWord(id: string) {
    if (disabled) return;
    setHeld((current) => (current === id ? null : id));
  }

  function tapGap(index: number) {
    if (disabled) return;
    const next = [...filled];
    if (next[index]) {
      next[index] = "";
      onChange(next);
      setHeld(null);
      return;
    }
    if (!held) return;
    next[index] = held;
    onChange(next);
    setHeld(null);
  }

  const labelOf = (id: string) =>
    options.find((option) => option.id === id)?.label ?? "";

  return (
    <div className="cloze-response">
      <p className="cloze-hint">
        {held
          ? "Now tap the gap it belongs in."
          : "Tap a word, then tap the gap it belongs in."}
      </p>

      <div className="cloze-bank">
        {bank.length === 0 ? (
          <p className="cloze-bank-empty">
            Every word is placed. Tap a gap to take one back.
          </p>
        ) : (
          bank.map((option) => (
            <button
              aria-pressed={held === option.id}
              className={`cloze-word${held === option.id ? " is-held" : ""}`}
              disabled={disabled}
              key={option.id}
              onClick={() => tapWord(option.id)}
              type="button"
            >
              {option.label}
            </button>
          ))
        )}
      </div>

      <p className="cloze-passage">
        {segments.map((segment, position) =>
          segment.kind === "text" ? (
            <span key={`text-${position}`}>{segment.text}</span>
          ) : (
            <button
              aria-label={
                filled[segment.index]
                  ? `Gap ${segment.index + 1}, ${labelOf(filled[segment.index])}. Tap to clear.`
                  : `Gap ${segment.index + 1}, empty`
              }
              className={`cloze-gap${filled[segment.index] ? " is-filled" : ""}${
                held && !filled[segment.index] ? " is-ready" : ""
              }`}
              disabled={disabled}
              key={`gap-${segment.index}`}
              onClick={() => tapGap(segment.index)}
              type="button"
            >
              {filled[segment.index] ? labelOf(filled[segment.index]) : " "}
            </button>
          ),
        )}
      </p>

      <p aria-live="polite" className="cloze-status">
        {used.size === gapCount
          ? "Every gap is filled."
          : `${gapCount - used.size} of ${gapCount} still to fill.`}
      </p>
    </div>
  );
}

/**
 * The learner's answer as one slot per gap.
 *
 * A stored answer can be the wrong length — an author can add or remove a gap
 * between a learner starting and resuming — and can name a word the bank no
 * longer holds. Both are dropped rather than rendered, so the passage and the
 * answer always agree.
 */
function normaliseFilled(
  value: unknown,
  gapCount: number,
  options: QuestionOption[],
): string[] {
  const known = new Set(options.map((option) => option.id));
  const seen = new Set<string>();
  const filled = Array.from({ length: gapCount }, () => "");

  if (Array.isArray(value)) {
    value.slice(0, gapCount).forEach((entry, index) => {
      const id = String(entry ?? "");
      if (!known.has(id) || seen.has(id)) return;
      seen.add(id);
      filled[index] = id;
    });
  }
  return filled;
}
