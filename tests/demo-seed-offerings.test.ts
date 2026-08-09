import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoSubjects } from "../domain/demo/greenfield";
import { createSchoolDatabase } from "../db/school-database";

/* ==========================================================================
   What the demo seed may hang off an offering

   `subject_offerings` is unique on (tenant, subject, class group, year), and
   `setClassOffering()` — the admin screen that puts a subject on a class's
   timetable — mints its own UUID for the row. So a school that staffed JHS 2
   Gold with Integrated Science before anyone opened a lesson holds that slot
   under an id of its own, and the demo seed's `INSERT OR IGNORE` for
   `offering-science-jhs2` quietly does nothing.

   The seed then pointed a teacher assignment, a term of units, eight lessons,
   a question bank, a markbook and a timetable at that id anyway. The first of
   them violated teacher_assignments_offering_id_fkey; because the seed is one
   transaction and every learning screen awaits it, the teacher's classes,
   their markbook and their messages all returned the same PostgreSQL error.

   The four foundations chain — operations to reporting to assessment to
   learning — so driving the outermost one exercises all of them. A stub pool
   rather than a server, matching tests/postgres-port.test.ts: what has to be
   right is which statements get built, and that is visible without one.
   ========================================================================== */

const SCIENCE = "offering-science-jhs2";

/** Every offering the demo dataset would seed, minus the ones named. */
function offeringsExcept(...missing: string[]) {
  return demoSubjects
    .map((subject) => subject.offeringId)
    .filter((id) => !missing.includes(id));
}

/**
 * A pool that answers the seed's "which of these offerings exist?" query with
 * `present`, records every statement it is asked to run, and returns nothing
 * for anything else — which is what an INSERT returns.
 */
function stubPool(present: string[]) {
  const statements: Array<{ text: string; values: unknown[] }> = [];

  async function query(config: unknown) {
    if (typeof config === "string") return { rowCount: 0, rows: [] };
    const typed = config as { text: string; values: unknown[] };
    statements.push(typed);
    if (/FROM subject_offerings/.test(typed.text)) {
      const asked = typed.values.filter((value) => present.includes(String(value)));
      return { rowCount: asked.length, rows: asked.map((id) => ({ id })) };
    }
    return { rowCount: 0, rows: [] };
  }

  const pool = {
    connect: async () => ({ query, release: () => undefined }),
    query,
  };
  return { pool: pool as never, statements };
}

/** The ids a statement binds, ignoring the ones it only reads by. */
function boundValues(statements: Array<{ text: string; values: unknown[] }>) {
  return statements
    .filter((statement) => /INSERT|UPDATE/i.test(statement.text))
    .flatMap((statement) => statement.values.map((value) => String(value)));
}

let current = stubPool([]);

vi.mock("../db/index", () => ({
  getSchoolDatabase: async () => createSchoolDatabase(currentPool()),
}));

/* The people seed is a startup concern and reaches its own pool. */
vi.mock("../db/people-repository", () => ({
  ensurePeopleSeed: async () => undefined,
}));

function currentPool() {
  return current.pool;
}

async function runEverySeed() {
  const { ensureOperationsFoundation } = await import(
    "../db/operations-repository"
  );
  await ensureOperationsFoundation();
}

describe("seeding the demo school over a school's own timetable", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("writes nothing against an offering the school owns under its own id", async () => {
    current = stubPool(offeringsExcept(SCIENCE));

    await expect(runEverySeed()).resolves.not.toThrow();

    const offenders = current.statements.filter(
      (statement) =>
        /INSERT|UPDATE/i.test(statement.text) &&
        /* The attempt to create the offering names it, and is allowed to: it
           is the statement whose success everything else is conditional on. */
        !/INTO subject_offerings/i.test(statement.text) &&
        statement.values.map(String).includes(SCIENCE),
    );
    expect(
      offenders.map((statement) => statement.text.trim().split("\n")[0]),
      "an id the offering insert did not create is an id nothing may reference",
    ).toEqual([]);
  });

  it("still seeds the subjects whose offerings it did create", async () => {
    current = stubPool(offeringsExcept(SCIENCE));
    await runEverySeed();

    /* Skipping one subject must not collapse the other three, or the fix is
       just a quieter version of the same outage. */
    const written = boundValues(current.statements);
    for (const offeringId of offeringsExcept(SCIENCE)) {
      expect(written, offeringId).toContain(offeringId);
    }
    expect(
      current.statements.some((statement) =>
        /INSERT INTO teacher_assignments/i.test(statement.text),
      ),
    ).toBe(true);
  });

  it("seeds the whole demo school when every offering is its own", async () => {
    current = stubPool(offeringsExcept());
    await runEverySeed();

    const written = boundValues(current.statements);
    for (const subject of demoSubjects) {
      expect(written, subject.offeringId).toContain(subject.offeringId);
    }
    expect(written).toContain(SCIENCE);
  });

  it("asks the table rather than assuming, before it writes anything", async () => {
    current = stubPool(offeringsExcept(SCIENCE));
    await runEverySeed();

    const asked = current.statements.findIndex((statement) =>
      /SELECT id FROM subject_offerings/i.test(statement.text),
    );
    const firstAssignment = current.statements.findIndex((statement) =>
      /INSERT INTO teacher_assignments/i.test(statement.text),
    );
    expect(asked).toBeGreaterThanOrEqual(0);
    expect(
      firstAssignment,
      "the offerings have to be resolved before anything is keyed to them",
    ).toBeGreaterThan(asked);
  });
});
