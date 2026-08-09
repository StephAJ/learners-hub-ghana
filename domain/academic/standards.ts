/* ==========================================================================
   Curriculum standards

   A standard is the school's reference to a line in its national curriculum:
   a code, the strand it belongs to, and what a learner should be able to do.
   Lessons are mapped to them, and the coverage figure a teacher sees is how
   many of their subject's standards have a lesson against them.

   Until now they existed only in the demo seed, so a school's own subjects
   had none and could never have any. What follows is the authoring rules;
   db/curriculum-repository.ts stores them.

   Two things shape the design:

   1. The code is the standard's identity. It is what the curriculum document
      calls it, what an inspector asks about, and what the unique index on
      (tenant, offering, code) enforces. Wording can be corrected — the
      description describes the code, it is not the thing itself — but a code
      that lessons already point at cannot be reassigned to a different
      statement without silently changing what those lessons claim to cover.

   2. A real curriculum is dozens of lines per subject. Entering them one form
      at a time is the difference between a school adopting this and giving
      up, so a paste from a spreadsheet is a first-class way in rather than an
      import feature bolted on later.
   ========================================================================== */

export class CurriculumStandardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CurriculumStandardError";
  }
}

export type CurriculumStandardInput = {
  code: string;
  description: string;
  strand: string;
  subStrand: string;
};

export type CurriculumStandardStatus = "active" | "retired";

const MAX_CODE = 40;
const MAX_TEXT = 400;

export function normaliseStandard(
  input: Partial<CurriculumStandardInput>,
): CurriculumStandardInput {
  const code = collapse(input.code ?? "");
  const description = collapse(input.description ?? "");
  const strand = collapse(input.strand ?? "");
  const subStrand = collapse(input.subStrand ?? "");

  if (!code) {
    throw new CurriculumStandardError(
      "A standard needs the code its curriculum gives it.",
    );
  }
  if (code.length > MAX_CODE) {
    throw new CurriculumStandardError(
      `A standard code cannot be longer than ${MAX_CODE} characters.`,
    );
  }
  if (!description) {
    throw new CurriculumStandardError(
      "A standard needs a description of what a learner should be able to do.",
    );
  }
  for (const [label, value] of [
    ["description", description],
    ["strand", strand],
    ["sub-strand", subStrand],
  ] as const) {
    if (value.length > MAX_TEXT) {
      throw new CurriculumStandardError(
        `A standard's ${label} cannot be longer than ${MAX_TEXT} characters.`,
      );
    }
  }

  return { code, description, strand, subStrand };
}

/**
 * Rows pasted out of a spreadsheet.
 *
 * Tab-separated first, because that is what copying cells out of Excel or
 * Google Sheets actually puts on the clipboard, and a curriculum arrives as a
 * spreadsheet far more often than it arrives typed.
 *
 * Commas are accepted when a line has no tabs, for someone typing rather than
 * pasting — and the description is always taken as everything after the last
 * structural separator, because descriptions contain commas and codes do not.
 *
 * Two shapes, distinguished by how many columns a row has:
 *   code <TAB> description
 *   code <TAB> strand <TAB> sub-strand <TAB> description
 */
export function parseStandardsPaste(
  text: string,
): CurriculumStandardInput[] {
  /* Trimmed for the emptiness test only. Trimming the line itself would strip
     a leading tab, and a leading tab is an empty first cell — a row whose
     code was left blank. Losing it turns "this row has no code" into "this
     row has one column", which is true and useless. */
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    throw new CurriculumStandardError("Paste at least one standard.");
  }

  const rows = lines.map((line, index) => {
    const cells = splitRow(line);
    if (cells.length === 2) {
      return normaliseStandardOnLine(
        { code: cells[0], description: cells[1], strand: "", subStrand: "" },
        index,
        line,
      );
    }
    if (cells.length >= 4) {
      return normaliseStandardOnLine(
        {
          code: cells[0],
          /* Anything past the fourth column is part of the description: a
             pasted row whose description held a tab should not become a
             silently truncated standard. */
          description: cells.slice(3).join(" ").trim(),
          strand: cells[1],
          subStrand: cells[2],
        },
        index,
        line,
      );
    }
    throw new CurriculumStandardError(
      `Line ${index + 1} has ${cells.length} ${
        cells.length === 1 ? "column" : "columns"
      }. Use code and description, or code, strand, sub-strand and description.`,
    );
  });

  /* A paste that repeats a code would insert the first and fail on the
     second, leaving the import half done. Caught before anything is written
     so the whole paste is refused with the line to fix. */
  const seen = new Map<string, number>();
  rows.forEach((row, index) => {
    const key = row.code.toLowerCase();
    const first = seen.get(key);
    if (first !== undefined) {
      throw new CurriculumStandardError(
        `Line ${index + 1} repeats the code ${row.code}, already on line ${first + 1}.`,
      );
    }
    seen.set(key, index);
  });

  return rows;
}

function normaliseStandardOnLine(
  input: CurriculumStandardInput,
  index: number,
  line: string,
): CurriculumStandardInput {
  try {
    return normaliseStandard(input);
  } catch (error) {
    /* The line number is the whole value of a bulk error message: "a standard
       needs a code" is unhelpful against sixty pasted rows. */
    throw new CurriculumStandardError(
      `Line ${index + 1} (${truncate(line.trim())}): ${
        error instanceof Error ? error.message : "could not be read."
      }`,
    );
  }
}

function splitRow(row: string): string[] {
  if (row.includes("\t")) {
    return row.split("\t").map((cell) => cell.trim());
  }
  const line = row.trim();
  const parts = line.split(",");
  if (parts.length < 2) return [line];
  if (parts.length === 2) {
    return [parts[0].trim(), parts[1].trim()];
  }
  /* Three commas mark the four columns; the rest belong to the description. */
  return [
    parts[0].trim(),
    parts[1].trim(),
    parts[2].trim(),
    parts.slice(3).join(",").trim(),
  ];
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string): string {
  return value.length > 40 ? `${value.slice(0, 39)}…` : value;
}
