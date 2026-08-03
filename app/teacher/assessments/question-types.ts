import type { QuestionType } from "../../../domain/assessment/types";

/* ==========================================================================
   The question type catalogue

   One place that knows what each item type is called, what it is for, and —
   crucially — what kind of answer editor it needs. The builder previously
   offered all eleven types in a dropdown and then showed the same two fields
   for every one of them: "Options, one per line" and "Correct answer or
   rubric". A teacher authoring a multiple-choice question had to know to type
   the correct answers comma-separated, spelled exactly as the options, which
   were then slugified before comparison. Nothing on screen said so.

   `answerShape` is what the composer switches on. Grouping the eleven types
   into six shapes keeps the editor honest: two types that are answered the
   same way are edited the same way.
   ========================================================================== */

export type AnswerShape =
  /** A list of options, exactly one of them correct. */
  | "choice-one"
  /** A list of options, any number correct. */
  | "choice-many"
  /** True and False, fixed. */
  | "boolean"
  /** A single expected value, compared on submission. */
  | "exact"
  /** Left-hand prompts paired to right-hand answers. */
  | "pairs"
  /** Items whose sequence is the answer. */
  | "sequence"
  /** No machine-markable answer: a teacher reads it against a rubric. */
  | "rubric";

export type QuestionTypeDefinition = {
  answerShape: AnswerShape;
  /** Shown under the name in the type picker. */
  blurb: string;
  label: string;
  /**
   * Set when the type cannot yet be delivered end to end.
   *
   * Shown in the picker rather than hidden, because "this exists but is not
   * finished" is more useful to a teacher planning a paper than a type that
   * silently is not there — and hiding it would not stop the eleven types the
   * bank already contains from appearing in the list.
   */
  unavailable?: string;
};

export const QUESTION_TYPES: Record<QuestionType, QuestionTypeDefinition> = {
  "single-choice": {
    answerShape: "choice-one",
    blurb: "One right answer from a list.",
    label: "Single choice",
  },
  "multiple-choice": {
    answerShape: "choice-many",
    blurb: "Several right answers from a list.",
    label: "Multiple choice",
  },
  "true-false": {
    answerShape: "boolean",
    blurb: "A statement to accept or reject.",
    label: "True or false",
  },
  "short-text": {
    answerShape: "exact",
    blurb: "A word or phrase, marked automatically.",
    label: "Short answer",
  },
  numeric: {
    answerShape: "exact",
    blurb: "A number, marked automatically.",
    label: "Numeric",
  },
  matching: {
    answerShape: "pairs",
    blurb: "Pair each item with its partner.",
    label: "Matching",
  },
  ordering: {
    answerShape: "sequence",
    blurb: "Put the items in the right order.",
    label: "Ordering",
  },
  essay: {
    answerShape: "rubric",
    blurb: "Extended writing you mark yourself.",
    label: "Essay",
  },
  "file-upload": {
    answerShape: "rubric",
    blurb: "Work handed in as a file.",
    label: "File upload",
  },
  hotspot: {
    answerShape: "exact",
    blurb: "Point at a place on an image.",
    label: "Hotspot",
    unavailable:
      "Hotspot questions need an image with marked regions, which the media library cannot store yet.",
  },
  composite: {
    answerShape: "rubric",
    blurb: "A scenario with several linked parts.",
    label: "Composite",
  },
};

export const QUESTION_TYPE_ORDER: QuestionType[] = [
  "single-choice",
  "multiple-choice",
  "true-false",
  "short-text",
  "numeric",
  "ordering",
  "matching",
  "essay",
  "composite",
  "file-upload",
  "hotspot",
];

/** Types a teacher never marks by hand. */
export function isAutoMarked(type: QuestionType): boolean {
  return QUESTION_TYPES[type].answerShape !== "rubric";
}
