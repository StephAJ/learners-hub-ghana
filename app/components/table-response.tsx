"use client";

import {
  parseTableRows,
  tableBlanks,
  withoutBrackets,
} from "../../domain/assessment/bracketed";

/* ==========================================================================
   Completing a table

   Common in Ghanaian past papers and, until now, impossible to author: the
   only way to ask it was to split one table into six separate questions and
   lose the thing that made it a table.

   The grid arrives as the author wrote it — rows on lines, cells split on a
   vertical bar, blanks in square brackets — and is parsed here, so the
   authored text is the single source for both the layout and the answers.

   Typed rather than tapped, which breaks the pattern the other types share.
   That is deliberate: a table cell usually wants a word the learner recalls
   rather than one they choose, and offering a bank of every answer in the
   grid would turn recall into elimination.
   ========================================================================== */

export function TableResponse({
  disabled,
  onChange,
  source,
  value,
}: {
  disabled?: boolean;
  onChange: (value: Record<string, string>) => void;
  /** The prompt, with blanks still in square brackets. */
  source: string;
  value: unknown;
}) {
  const rows = parseTableRows(source);
  const blanks = new Map(
    tableBlanks(rows).map((blank) => [blank.key, blank]),
  );
  const filled = normaliseCells(value, blanks);

  const [header, ...body] = rows;
  const done = Object.values(filled).filter((entry) => entry.trim()).length;

  function setCell(key: string, entry: string) {
    onChange({ ...filled, [key]: entry });
  }

  if (!header || body.length === 0) {
    return (
      <p className="answer-unavailable" role="status">
        This table has not been finished yet. Leave it and tell your teacher
        &mdash; it will not count against you.
      </p>
    );
  }

  return (
    <div className="table-response">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {header.map((cell, column) => (
                <th key={column} scope="col">
                  {withoutBrackets(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((cells, index) => {
              const row = index + 1;
              return (
                <tr key={row}>
                  {cells.map((cell, column) => {
                    const key = `${row}:${column}`;
                    const blank = blanks.get(key);
                    if (!blank) {
                      /* The first column is what the row is about, so it is
                         marked up as a heading for the row rather than a
                         plain cell — which is what lets a screen reader say
                         "Ghana, capital" when the learner reaches the gap. */
                      return column === 0 ? (
                        <th key={column} scope="row">
                          {withoutBrackets(cell)}
                        </th>
                      ) : (
                        <td key={column}>{withoutBrackets(cell)}</td>
                      );
                    }
                    return (
                      <td className="table-blank" key={column}>
                        <input
                          aria-label={`${cells[0] || `Row ${row}`}, ${
                            header[column] ?? `column ${column + 1}`
                          }`}
                          disabled={disabled}
                          onChange={(event) => setCell(key, event.target.value)}
                          value={filled[key] ?? ""}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p aria-live="polite" className="table-status">
        {done === blanks.size
          ? "Every cell is filled."
          : `${blanks.size - done} of ${blanks.size} still to fill.`}
      </p>
    </div>
  );
}

/** Drops anything for a cell the table no longer has a blank at. */
function normaliseCells(
  value: unknown,
  blanks: Map<string, unknown>,
): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const cells: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!blanks.has(key)) continue;
    cells[key] = String(entry ?? "");
  }
  return cells;
}
