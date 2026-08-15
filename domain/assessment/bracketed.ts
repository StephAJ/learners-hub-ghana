import type {
  QuestionAnswerKey,
  QuestionType,
} from "./types";

/* ==========================================================================
   Answers written in brackets

   Two question types need an author to say "this bit is the answer" inside a
   larger piece of text: a passage with words taken out of it, and a table with
   cells to complete. Both use the same convention, so a teacher learns it once:

     Digestion begins in the [mouth] and finishes in the [large intestine].

     Country | Capital  | Currency
     Ghana   | [Accra]  | Cedi
     Nigeria | [Abuja]  | Naira

   Square brackets rather than underscores or a separate "answers" field. An
   underscore row cannot say which answer belongs to which gap once there are
   more than two, and a separate field means writing the passage twice and
   keeping them in step by hand — which is the mistake this exists to prevent.
   ========================================================================== */

export type BracketedSegment =
  | { kind: "text"; text: string }
  | { answer: string; index: number; kind: "gap" };

const BRACKETED = /\[([^\]]*)\]/g;

/**
 * Splits authored text into the plain parts and the bracketed answers.
 *
 * Gaps are numbered in reading order, which is what the learner's answer is
 * keyed on — so moving a gap in the passage moves its answer with it.
 */
export function parseBracketed(source: string): BracketedSegment[] {
  const segments: BracketedSegment[] = [];
  let cursor = 0;
  let index = 0;

  for (const match of source.matchAll(BRACKETED)) {
    const at = match.index ?? 0;
    if (at > cursor) {
      segments.push({ kind: "text", text: source.slice(cursor, at) });
    }
    segments.push({ answer: match[1].trim(), index, kind: "gap" });
    index += 1;
    cursor = at + match[0].length;
  }

  if (cursor < source.length) {
    segments.push({ kind: "text", text: source.slice(cursor) });
  }
  return segments;
}

/** Just the answers, in reading order. */
export function bracketedAnswers(source: string): string[] {
  return parseBracketed(source)
    .filter((segment): segment is Extract<BracketedSegment, { kind: "gap" }> =>
      segment.kind === "gap",
    )
    .map((segment) => segment.answer)
    .filter(Boolean);
}

/**
 * The passage with the brackets removed, for anything that needs to read it
 * as prose — a question bank listing, or a screen reader announcing the
 * question before the gaps are filled.
 */
export function withoutBrackets(source: string): string {
  return source.replace(BRACKETED, (_, answer: string) => answer);
}

/** A table's rows, split on the pipe, with empty trailing cells dropped. */
export function parseTableRows(source: string): string[][] {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("|").map((cell) => cell.trim()));
}

/**
 * Every blank cell in a table, keyed "row:column".
 *
 * Row 0 is the header, so blanks there are ignored — a header is the question,
 * not part of the answer, and an author bracketing one has made a mistake this
 * quietly refuses rather than turning into an unanswerable cell.
 */
export function tableBlanks(
  rows: string[][],
): Array<{ answer: string; column: number; key: string; row: number }> {
  const blanks: Array<{
    answer: string;
    column: number;
    key: string;
    row: number;
  }> = [];

  rows.forEach((cells, row) => {
    if (row === 0) return;
    cells.forEach((cell, column) => {
      const answers = bracketedAnswers(cell);
      if (answers.length === 0) return;
      blanks.push({
        answer: answers[0],
        column,
        key: `${row}:${column}`,
        row,
      });
    });
  });

  return blanks;
}

/**
 * The axis of a number-line question, read out of its answer key.
 *
 * The key holds the line and the answer together because the line is part of
 * the question; this lifts the public half onto the snapshot so it survives
 * the key being stripped.
 */
export function lineFromAnswerKey(
  type: QuestionType,
  answerKey: QuestionAnswerKey,
): { max: number; min: number } | undefined {
  if (type !== "number-line") return undefined;
  const value = answerKey.value;
  if (!value || typeof value !== "object") return undefined;
  const { max, min } = value as { max?: unknown; min?: unknown };
  if (!Number.isFinite(Number(max)) || !Number.isFinite(Number(min))) {
    return undefined;
  }
  return { max: Number(max), min: Number(min) };
}
