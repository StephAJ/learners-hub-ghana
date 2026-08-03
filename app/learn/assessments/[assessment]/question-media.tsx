import Image from "next/image";
import type { QuestionMedia } from "../../../../domain/assessment/types";

/* ==========================================================================
   Pictures and formulas in a question

   A quiz that can only ask about words can only test what a learner can put
   into words. Half of what a basic school actually examines is a diagram to
   label, a graph to read, a shape to name, or an equation to solve — so a
   question carries an optional image and an optional formula, and a
   multiple-choice option can be a picture rather than a phrase.

   Both are rendered here so the runner, the review screen and the teacher's
   preview show them identically.
   ========================================================================== */

export function QuestionFigure({
  media,
  variant = "prompt",
}: {
  media: QuestionMedia;
  /** Option images sit inside a choice tile and are smaller. */
  variant?: "prompt" | "option";
}) {
  /* An image with no description is not renderable: a learner using a screen
     reader would meet a question they cannot answer, with nothing to say so.
     The authoring side refuses to save one, and this is the second gate. */
  if (!media.alt?.trim()) return null;

  return (
    <figure className={`question-figure question-figure-${variant}`}>
      <Image
        alt={media.alt}
        height={variant === "option" ? 240 : 640}
        sizes={variant === "option" ? "220px" : "(max-width: 820px) 100vw, 620px"}
        src={media.url}
        width={variant === "option" ? 320 : 960}
      />
    </figure>
  );
}

/**
 * A formula, set as mathematics.
 *
 * Deliberately not a TeX engine. Bundling one costs every learner on a
 * metered connection several hundred kilobytes to render the handful of
 * expressions a basic-school paper actually contains, and those expressions
 * are fractions, powers, roots and the four operators. This renders that
 * subset and shows anything else as the author typed it, which is legible
 * even when it is not typeset.
 *
 * The accessible name is always the source text, so a screen reader reads
 * "1/3 + 1/4" rather than trying to narrate the layout.
 */
export function QuestionFormula({ formula }: { formula: string }) {
  const source = formula.trim();
  if (!source) return null;

  return (
    <p className="question-formula" role="math" aria-label={source}>
      {renderFormula(source)}
    </p>
  );
}

/** Splits on the pieces we can typeset, leaving everything else as text. */
function renderFormula(source: string) {
  const pattern = /(\\frac\{[^{}]*\}\{[^{}]*\}|\d+\/\d+|\^\{[^{}]*\}|\^\d+|\\sqrt\{[^{}]*\}|\\times|\\div|\\pm|\\leq|\\geq|\\neq)/g;
  const pieces = source.split(pattern).filter((piece) => piece !== "");

  return pieces.map((piece, index) => {
    const fraction =
      /^\\frac\{([^{}]*)\}\{([^{}]*)\}$/.exec(piece) ??
      /^(\d+)\/(\d+)$/.exec(piece);
    if (fraction) {
      return (
        <span className="formula-fraction" key={index}>
          <span className="formula-numerator">{fraction[1]}</span>
          <span className="formula-denominator">{fraction[2]}</span>
        </span>
      );
    }

    const power = /^\^\{?([^{}]*)\}?$/.exec(piece);
    if (power) return <sup key={index}>{power[1]}</sup>;

    const root = /^\\sqrt\{([^{}]*)\}$/.exec(piece);
    if (root) {
      return (
        <span className="formula-root" key={index}>
          <span aria-hidden="true">&radic;</span>
          <span className="formula-radicand">{root[1]}</span>
        </span>
      );
    }

    const symbols: Record<string, string> = {
      "\\div": "÷",
      "\\geq": "≥",
      "\\leq": "≤",
      "\\neq": "≠",
      "\\pm": "±",
      "\\times": "×",
    };
    if (symbols[piece]) return <span key={index}>{symbols[piece]}</span>;

    return <span key={index}>{piece}</span>;
  });
}
