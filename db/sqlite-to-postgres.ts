/* ==========================================================================
   SQLite statement translation

   The five learning repositories hold 202 prepared statements written for
   D1/SQLite. Rewriting them by hand to PostgreSQL would be several thousand
   lines of mechanical edits with no way to test most of them, so the
   statements stay as they are and are translated on the way to the driver.

   A survey of what those statements actually use found only two dialect
   differences: positional `?` placeholders, and `INSERT OR IGNORE`. There is
   no json_extract, strftime, group_concat, AUTOINCREMENT or last_insert_rowid
   anywhere in the repositories. The translation is therefore small and
   closed — and this module is where it stays closed, so a new statement that
   needs something else fails loudly here rather than silently at runtime.
   ========================================================================== */

/** Constructs that have no direct PostgreSQL equivalent and are not used. */
const UNSUPPORTED = [
  /\bjson_extract\s*\(/i,
  /\bjson_group_array\s*\(/i,
  /\bjson_each\s*\(/i,
  /\bgroup_concat\s*\(/i,
  /\bstrftime\s*\(/i,
  /\bjulianday\s*\(/i,
  /\blast_insert_rowid\s*\(/i,
  /\bAUTOINCREMENT\b/i,
  /\bINSERT\s+OR\s+(?!IGNORE)\w+/i,
] as const;

export type TranslatedStatement = {
  /** Number of placeholders, so a bind-count mismatch can be caught early. */
  parameterCount: number;
  text: string;
};

/**
 * Rewrites one SQLite statement for PostgreSQL.
 *
 * Throws on anything outside the small set the repositories actually use,
 * rather than passing it through and letting PostgreSQL fail with a message
 * that does not mention SQLite.
 */
export function translateStatement(sql: string): TranslatedStatement {
  for (const pattern of UNSUPPORTED) {
    if (pattern.test(stripLiterals(sql))) {
      throw new Error(
        `This statement uses a SQLite construct the PostgreSQL adapter does not translate: ${pattern}. Rewrite it in portable SQL.`,
      );
    }
  }

  const withConflictClause = translateInsertOrIgnore(sql);
  return numberPlaceholders(withConflictClause);
}

/**
 * `INSERT OR IGNORE INTO t ...` becomes `INSERT INTO t ... ON CONFLICT DO
 * NOTHING`.
 *
 * The clause has to go last, and `RETURNING` — if present — has to stay last
 * after it, so the insertion point is found rather than assumed.
 */
function translateInsertOrIgnore(sql: string): string {
  const match = /^(\s*)INSERT\s+OR\s+IGNORE\s+INTO\b/i.exec(sql);
  if (!match) return sql;

  const body = sql.replace(/^(\s*)INSERT\s+OR\s+IGNORE\s+INTO\b/i, "$1INSERT INTO");

  /* A statement that already names its own conflict target keeps it: the
     author was more specific than "any conflict", and overriding that would
     change which rows are ignored. */
  if (/\bON\s+CONFLICT\b/i.test(stripLiterals(body))) return body;

  const returning = /\bRETURNING\b/i.exec(stripLiterals(body));
  if (!returning) return `${body.replace(/;\s*$/, "")} ON CONFLICT DO NOTHING`;

  return `${body.slice(0, returning.index).replace(/\s+$/, "")} ON CONFLICT DO NOTHING ${body.slice(returning.index)}`;
}

/**
 * Turns SQLite's positional `?` into PostgreSQL's `$1`, `$2`, …
 *
 * Question marks inside string literals, quoted identifiers and comments are
 * left alone — `WHERE note = 'why?'` must not become `WHERE note = 'why$1'`.
 */
function numberPlaceholders(sql: string): TranslatedStatement {
  let text = "";
  let index = 0;
  let parameterCount = 0;

  while (index < sql.length) {
    const character = sql[index];

    if (character === "'" || character === '"') {
      const end = endOfQuoted(sql, index);
      text += sql.slice(index, end);
      index = end;
      continue;
    }

    if (character === "-" && sql[index + 1] === "-") {
      const newline = sql.indexOf("\n", index);
      const end = newline === -1 ? sql.length : newline;
      text += sql.slice(index, end);
      index = end;
      continue;
    }

    if (character === "/" && sql[index + 1] === "*") {
      const close = sql.indexOf("*/", index + 2);
      const end = close === -1 ? sql.length : close + 2;
      text += sql.slice(index, end);
      index = end;
      continue;
    }

    if (character === "?") {
      parameterCount += 1;
      text += `$${parameterCount}`;
      index += 1;
      continue;
    }

    text += character;
    index += 1;
  }

  return { parameterCount, text };
}

/** Index just past the closing quote, handling SQL's doubled-quote escape. */
function endOfQuoted(sql: string, start: number): number {
  const quote = sql[start];
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] === quote) {
      if (sql[index + 1] === quote) {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index += 1;
  }
  /* Unterminated literal. Returning the end lets PostgreSQL report the syntax
     error against the original text, which is more useful than a guess here. */
  return sql.length;
}

/**
 * The statement with the contents of literals, quoted identifiers and comments
 * blanked out, for keyword searches that must not match inside them.
 */
function stripLiterals(sql: string): string {
  let out = "";
  let index = 0;
  while (index < sql.length) {
    const character = sql[index];
    if (character === "'" || character === '"') {
      const end = endOfQuoted(sql, index);
      out += " ".repeat(end - index);
      index = end;
      continue;
    }
    if (character === "-" && sql[index + 1] === "-") {
      const newline = sql.indexOf("\n", index);
      const end = newline === -1 ? sql.length : newline;
      out += " ".repeat(end - index);
      index = end;
      continue;
    }
    if (character === "/" && sql[index + 1] === "*") {
      const close = sql.indexOf("*/", index + 2);
      const end = close === -1 ? sql.length : close + 2;
      out += " ".repeat(end - index);
      index = end;
      continue;
    }
    out += character;
    index += 1;
  }
  return out;
}
