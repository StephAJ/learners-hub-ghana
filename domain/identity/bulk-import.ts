import type { DirectoryPerson, SchoolRole } from "./types";

/* ==========================================================================
   Bringing a school's people in at once

   Setting a school up meant inviting learners one form at a time, and getting
   every one of them right first time, because there was no way to correct a
   row afterwards either. A Ghanaian JHS with three streams is a hundred and
   twenty forms.

   The rule the product scope is firmest about is this one: "bulk import never
   silently skips invalid rows". So parsing is separated from importing. This
   module turns a pasted spreadsheet into a verdict on every row — accepted,
   or rejected with the reason and the line number — and the screen shows that
   verdict before anything is written. Nothing is guessed: a row missing a
   surname is rejected rather than given a blank one.

   Deliberately not a CSV library. The input is a paste from a spreadsheet,
   which is tab-separated, and comma-separated is accepted as a fallback. A
   dependency that handles quoted embedded newlines would buy correctness for
   an input shape this form does not have.
   ========================================================================== */

export type ImportRowInput = {
  className: string;
  email: string;
  firstName: string;
  kind: DirectoryPerson["kind"];
  lastName: string;
  phone: string;
  role: SchoolRole;
};

export type ImportRow =
  | { input: ImportRowInput; line: number; ok: true }
  | { line: number; ok: false; problem: string; raw: string };

export type ImportPreview = {
  accepted: ImportRowInput[];
  rejected: Array<{ line: number; problem: string; raw: string }>;
  rows: ImportRow[];
};

const HEADINGS = [
  "first name",
  "last name",
  "email",
  "role",
  "class",
  "phone",
] as const;

const ROLES: Record<string, SchoolRole> = {
  "academic admin": "academic-admin",
  "academic-admin": "academic-admin",
  "admissions officer": "admissions-officer",
  "admissions-officer": "admissions-officer",
  "class teacher": "class-teacher",
  "class-teacher": "class-teacher",
  guardian: "guardian",
  learner: "learner",
  parent: "guardian",
  pupil: "learner",
  "school admin": "school-admin",
  "school-admin": "school-admin",
  student: "learner",
  teacher: "teacher",
};

const KIND_FOR_ROLE: Record<SchoolRole, DirectoryPerson["kind"]> = {
  "academic-admin": "staff",
  "admissions-officer": "staff",
  "class-teacher": "staff",
  guardian: "guardian",
  learner: "learner",
  "school-admin": "staff",
  teacher: "staff",
};

/** The header line a school pastes above their rows. */
export const IMPORT_TEMPLATE = HEADINGS.join("\t");

/**
 * Reads a pasted table into a verdict per row.
 *
 * Line numbers count from 1 including the header, so they match what the
 * person is looking at in their spreadsheet.
 */
export function parsePeopleImport(text: string): ImportPreview {
  const lines = text.split(/\r?\n/);
  const rows: ImportRow[] = [];
  let started = false;

  lines.forEach((raw, index) => {
    const line = index + 1;
    if (!raw.trim()) return;

    const cells = splitCells(raw);
    /* A header is optional — somebody pasting only their rows should not have
       to know about it — but if one is there it is skipped rather than
       imported as a person called "First name". */
    if (!started && looksLikeHeader(cells)) {
      started = true;
      return;
    }
    started = true;

    const [firstName, lastName, email, role, className, phone] = cells;
    const problem = firstProblem({ email, firstName, lastName, role });
    if (problem) {
      rows.push({ line, ok: false, problem, raw });
      return;
    }

    const resolved = ROLES[role.trim().toLowerCase()];
    rows.push({
      input: {
        className: (className ?? "").trim(),
        email: email.trim().toLowerCase(),
        firstName: firstName.trim(),
        kind: KIND_FOR_ROLE[resolved],
        lastName: lastName.trim(),
        phone: (phone ?? "").trim(),
        role: resolved,
      },
      line,
      ok: true,
    });
  });

  const duplicates = findDuplicateEmails(rows);
  const checked = rows.map((row) =>
    row.ok && row.input.email && duplicates.has(row.input.email)
      ? {
          line: row.line,
          ok: false as const,
          problem: `${row.input.email} appears more than once in this paste.`,
          raw: lines[row.line - 1] ?? "",
        }
      : row,
  );

  return {
    accepted: checked.filter((row) => row.ok).map((row) => row.input),
    rejected: checked
      .filter((row) => !row.ok)
      .map((row) => ({ line: row.line, problem: row.problem, raw: row.raw })),
    rows: checked,
  };
}

/* ==========================================================================
   Who needs an email address

   Every row used to. That is wrong for the schools this is built for: a
   Ghanaian basic school importing a class of JHS 1 learners has names, a
   class and often no addresses at all — children of that age frequently do
   not have one, and the school issues them later or never.

   The effect was that a realistic paste had every single row rejected, and
   the Add button stayed dead. So an address is required only of the people
   who actually sign in — staff and guardians — and a learner may have one or
   not. `people.email` is nullable and its unique index tolerates repeated
   NULLs, so nothing downstream had to change.
   ========================================================================== */
const NEEDS_EMAIL: ReadonlySet<SchoolRole> = new Set<SchoolRole>([
  "academic-admin",
  "admissions-officer",
  "class-teacher",
  "guardian",
  "school-admin",
  "teacher",
]);

function firstProblem(cells: {
  email: string | undefined;
  firstName: string | undefined;
  lastName: string | undefined;
  role: string | undefined;
}): string {
  if (!cells.firstName?.trim()) return "No first name in this row.";
  if (!cells.lastName?.trim()) return "No last name in this row.";
  if (!cells.role?.trim()) return "No role in this row.";
  const resolved = ROLES[cells.role.trim().toLowerCase()];
  if (!resolved) {
    return `"${cells.role.trim()}" is not a role. Use learner, guardian, teacher, class teacher, academic admin, admissions officer or school admin.`;
  }
  const email = cells.email?.trim() ?? "";
  if (!email && NEEDS_EMAIL.has(resolved)) {
    return "This role signs in, so it needs an email address.";
  }
  if (email && !email.includes("@")) {
    return `${email} does not look like an email address.`;
  }
  return "";
}

/** Tabs first, because that is what a spreadsheet paste gives you. */
function splitCells(line: string): string[] {
  return (line.includes("\t") ? line.split("\t") : line.split(",")).map(
    (cell) => cell.trim(),
  );
}

function looksLikeHeader(cells: string[]): boolean {
  const first = cells[0]?.toLowerCase().replace(/[^a-z ]/g, "").trim();
  return first === "first name" || first === "firstname" || first === "first";
}

/**
 * Emails repeated within the paste itself.
 *
 * The database's unique index catches a clash with somebody already on the
 * roll. It cannot catch two rows in the same paste, because the first would
 * succeed — and a school would be told the import worked while one of two
 * children with the same address silently became the other.
 */
function findDuplicateEmails(rows: ImportRow[]): Set<string> {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const row of rows) {
    /* A learner with no address is not a duplicate of the next learner with
       no address. Only real addresses are compared. */
    if (!row.ok || !row.input.email) continue;
    if (seen.has(row.input.email)) twice.add(row.input.email);
    seen.add(row.input.email);
  }
  return twice;
}
