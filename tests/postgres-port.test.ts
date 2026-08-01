import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSchoolDatabase } from "../db/school-database";
import { learningSchema } from "../db/learning-schema";
import { translateStatement } from "../db/sqlite-to-postgres";

/* The five learning repositories run unchanged against PostgreSQL through the
   adapter, so the adapter is the thing that has to be right. There is no
   PostgreSQL in the development environment, so these tests pin the two places
   a mistake would be invisible until deployment: the SQL translation, and the
   shape of the generated schema. */

describe("SQLite to PostgreSQL translation", () => {
  it("numbers placeholders in order", () => {
    const { parameterCount, text } = translateStatement(
      "SELECT * FROM lessons WHERE tenant_id = ? AND offering_id = ? LIMIT ?",
    );
    expect(text).toBe(
      "SELECT * FROM lessons WHERE tenant_id = $1 AND offering_id = $2 LIMIT $3",
    );
    expect(parameterCount).toBe(3);
  });

  it("leaves question marks inside string literals alone", () => {
    const { parameterCount, text } = translateStatement(
      "SELECT * FROM blocks WHERE content = 'why?' AND id = ?",
    );
    expect(text).toBe(
      "SELECT * FROM blocks WHERE content = 'why?' AND id = $1",
    );
    expect(parameterCount).toBe(1);
  });

  it("handles doubled quotes inside a literal", () => {
    const { parameterCount, text } = translateStatement(
      "SELECT * FROM t WHERE a = 'it''s a ? really' AND b = ?",
    );
    expect(text).toBe(
      "SELECT * FROM t WHERE a = 'it''s a ? really' AND b = $1",
    );
    expect(parameterCount).toBe(1);
  });

  it("leaves question marks in quoted identifiers and comments alone", () => {
    const { parameterCount, text } = translateStatement(
      `SELECT "odd?column" FROM t -- what about ?\nWHERE id = ? /* or ? here */`,
    );
    expect(text).toContain('"odd?column"');
    expect(text).toContain("-- what about ?");
    expect(text).toContain("/* or ? here */");
    expect(text).toContain("WHERE id = $1");
    expect(parameterCount).toBe(1);
  });

  it("converts INSERT OR IGNORE to an ON CONFLICT clause", () => {
    const { text } = translateStatement(
      "INSERT OR IGNORE INTO subjects (id, name) VALUES (?, ?)",
    );
    expect(text).toBe(
      "INSERT INTO subjects (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    );
  });

  it("keeps a conflict target the statement already declares", () => {
    const { text } = translateStatement(
      "INSERT OR IGNORE INTO progress (id, percent) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET percent = ?",
    );
    expect(text).toBe(
      "INSERT INTO progress (id, percent) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET percent = $3",
    );
    /* Exactly one conflict clause: appending a second would be a syntax
       error, and silently replacing the author's target would change which
       rows are ignored. */
    expect(text.match(/ON CONFLICT/g)).toHaveLength(1);
  });

  it("keeps RETURNING last when adding the conflict clause", () => {
    const { text } = translateStatement(
      "INSERT OR IGNORE INTO t (id) VALUES (?) RETURNING id",
    );
    expect(text).toBe(
      "INSERT INTO t (id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id",
    );
  });

  it("is not fooled by the words ON CONFLICT inside a literal", () => {
    const { text } = translateStatement(
      "INSERT OR IGNORE INTO notes (id, body) VALUES (?, 'see ON CONFLICT docs')",
    );
    expect(text).toMatch(/ON CONFLICT DO NOTHING$/);
  });

  it("refuses SQLite constructs it does not translate", () => {
    for (const sql of [
      "SELECT json_extract(config, '$.videoUrl') FROM lesson_blocks",
      "SELECT group_concat(code) FROM curriculum_standards",
      "SELECT strftime('%Y', created_at) FROM lessons",
      "INSERT OR REPLACE INTO lessons (id) VALUES (?)",
      "SELECT last_insert_rowid()",
    ]) {
      expect(() => translateStatement(sql), sql).toThrow(
        /does not translate/,
      );
    }
  });

  it("does not mistake those names inside literals for real usage", () => {
    expect(() =>
      translateStatement(
        "INSERT INTO notes (body) VALUES ('remember to avoid json_extract(x)')",
      ),
    ).not.toThrow();
  });
});

describe("the adapter's D1 surface", () => {
  /* A pool stub, so the result shapes the repositories destructure are pinned
     without needing a PostgreSQL server. */
  function stubPool(rows: Array<Record<string, unknown>>, rowCount = rows.length) {
    const queries: Array<{ text: string; values: unknown[] }> = [];
    const pool = {
      connect: async () => ({
        query: async (config: unknown) => {
          if (typeof config === "string") {
            queries.push({ text: config, values: [] });
            return { rowCount: 0, rows: [] };
          }
          const typed = config as { text: string; values: unknown[] };
          queries.push(typed);
          return { rowCount, rows };
        },
        release: () => undefined,
      }),
      query: async (config: { text: string; values: unknown[] }) => {
        queries.push(config);
        return { rowCount, rows };
      },
    };
    return { pool: pool as never, queries };
  }

  it("returns the first row, or null when there is none", async () => {
    const withRow = createSchoolDatabase(
      stubPool([{ id: "lesson-1" }]).pool,
    );
    expect(await withRow.prepare("SELECT 1").bind().first()).toEqual({
      id: "lesson-1",
    });

    const empty = createSchoolDatabase(stubPool([]).pool);
    expect(await empty.prepare("SELECT 1").bind().first()).toBeNull();
  });

  it("returns results and success from all()", async () => {
    const database = createSchoolDatabase(
      stubPool([{ id: "a" }, { id: "b" }]).pool,
    );
    const result = await database.prepare("SELECT 1").bind().all();
    expect(result.results).toEqual([{ id: "a" }, { id: "b" }]);
    expect(result.success).toBe(true);
  });

  it("reports affected rows from run()", async () => {
    const database = createSchoolDatabase(stubPool([], 3).pool);
    const result = await database.prepare("DELETE FROM t").bind().run();
    expect(result.meta.changes).toBe(3);
    expect(result.success).toBe(true);
  });

  it("passes bound values through in order", async () => {
    const { pool, queries } = stubPool([]);
    const database = createSchoolDatabase(pool);
    await database
      .prepare("SELECT * FROM t WHERE a = ? AND b = ?")
      .bind("first", "second")
      .all();
    expect(queries.at(-1)?.values).toEqual(["first", "second"]);
    expect(queries.at(-1)?.text).toBe(
      "SELECT * FROM t WHERE a = $1 AND b = $2",
    );
  });

  it("stores booleans the way the integer columns expect", async () => {
    const { pool, queries } = stubPool([]);
    const database = createSchoolDatabase(pool);
    await database
      .prepare("INSERT INTO lesson_blocks (ready, flagged) VALUES (?, ?)")
      .bind(true, false)
      .run();
    expect(queries.at(-1)?.values).toEqual([1, 0]);
  });

  it("binds undefined as NULL rather than dropping it", async () => {
    const { pool, queries } = stubPool([]);
    const database = createSchoolDatabase(pool);
    await database
      .prepare("INSERT INTO t (a, b) VALUES (?, ?)")
      .bind("set", undefined)
      .run();
    expect(queries.at(-1)?.values).toEqual(["set", null]);
  });

  it("names the statement when the bind count is wrong", async () => {
    const database = createSchoolDatabase(stubPool([]).pool);
    await expect(
      database.prepare("SELECT * FROM t WHERE a = ? AND b = ?").bind("only").all(),
    ).rejects.toThrow(/2 placeholders but was bound with 1/);
  });

  it("leaves the original statement reusable after bind()", async () => {
    const { pool, queries } = stubPool([]);
    const database = createSchoolDatabase(pool);
    const statement = database.prepare("SELECT ?");
    await statement.bind("one").all();
    await statement.bind("two").all();
    expect(queries.map((query) => query.values)).toEqual([["one"], ["two"]]);
  });

  it("wraps a batch in a single transaction", async () => {
    const { pool, queries } = stubPool([]);
    const database = createSchoolDatabase(pool);
    await database.batch([
      database.prepare("INSERT INTO a (id) VALUES (?)").bind("1"),
      database.prepare("INSERT INTO b (id) VALUES (?)").bind("2"),
    ]);
    /* Placeholders are numbered per statement, not across the batch — each is
       sent to PostgreSQL as its own prepared statement. */
    expect(queries.map((query) => query.text)).toEqual([
      "BEGIN",
      "INSERT INTO a (id) VALUES ($1)",
      "INSERT INTO b (id) VALUES ($1)",
      "COMMIT",
    ]);
  });

  it("rolls a batch back when a statement fails", async () => {
    const queries: string[] = [];
    const pool = {
      connect: async () => ({
        query: async (config: unknown) => {
          const text =
            typeof config === "string" ? config : (config as { text: string }).text;
          queries.push(text);
          if (text.startsWith("INSERT INTO b")) throw new Error("constraint");
          return { rowCount: 0, rows: [] };
        },
        release: () => undefined,
      }),
      query: async () => ({ rowCount: 0, rows: [] }),
    };
    const database = createSchoolDatabase(pool as never);
    await expect(
      database.batch([
        database.prepare("INSERT INTO a (id) VALUES (?)").bind("1"),
        database.prepare("INSERT INTO b (id) VALUES (?)").bind("2"),
      ]),
    ).rejects.toThrow("constraint");
    expect(queries).toContain("ROLLBACK");
    expect(queries).not.toContain("COMMIT");
  });
});

describe("the generated learning schema", () => {
  const createdTables = [
    ...learningSchema.matchAll(/CREATE TABLE IF NOT EXISTS "([a-z_]+)"/g),
  ].map((match) => match[1]);

  /* Created by db/postgres.ts before the learning schema runs. */
  const identityTables = new Set([
    "admission_application_records",
    "audit_events",
    "guardian_relationships",
    "identity_accounts",
    "people",
    "tenant_bootstrap",
    "tenant_memberships",
    "tenants",
  ]);

  it("creates every table and creates each one once", () => {
    expect(createdTables.length).toBeGreaterThan(35);
    expect(new Set(createdTables).size).toBe(createdTables.length);
  });

  it("does not redefine a table db/postgres.ts already owns", () => {
    for (const table of createdTables) {
      expect(identityTables, table).not.toContain(table);
    }
  });

  it("declares every referenced table before it is referenced", () => {
    /* PostgreSQL resolves foreign keys at CREATE TABLE time, unlike SQLite.
       Getting this wrong fails the migration on a fresh database only, which
       is the deployment nobody tests. */
    const seen = new Set<string>(identityTables);
    const statements = learningSchema.split(/;\s*\n/);
    for (const statement of statements) {
      const created = /CREATE TABLE IF NOT EXISTS "([a-z_]+)"/.exec(statement);
      if (!created) continue;
      for (const [, target] of statement.matchAll(
        /REFERENCES "([a-z_]+)"/g,
      )) {
        const isSelfReference = target === created[1];
        expect(
          seen.has(target) || isSelfReference,
          `${created[1]} references ${target} before it exists`,
        ).toBe(true);
      }
      seen.add(created[1]);
    }
  });

  it("covers every table the repositories actually query", () => {
    const repositories = [
      "assessment",
      "content",
      "learning",
      "operations",
      "reporting",
    ].map((name) =>
      readFileSync(
        new URL(`../db/${name}-repository.ts`, import.meta.url),
        "utf8",
      ),
    );
    const referenced = new Set<string>();
    for (const source of repositories) {
      /* Only backtick templates that look like SQL, with their own quoted
         literals blanked out. Scanning the whole file would match English
         prose in lesson content — "from mouth to small intestine" reads as a
         FROM clause to a loose pattern. */
      for (const [template] of source.matchAll(/`[^`]*`/g)) {
        if (!/\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(template)) continue;
        const sql = template.replace(/'[^']*'/g, "''");
        for (const [, table] of sql.matchAll(
          /(?:INSERT(?:\s+OR\s+IGNORE)?\s+INTO|UPDATE|DELETE\s+FROM|\bFROM|\bJOIN)\s+([a-z_]{4,})\b/gi,
        )) {
          referenced.add(table.toLowerCase());
        }
      }
    }
    /* The scan has to have found the schema's real tables, or it is passing
       by looking at nothing. */
    expect(referenced.size).toBeGreaterThan(15);

    const known = new Set([...createdTables, ...identityTables]);
    const missing = [...referenced].filter((table) => !known.has(table));
    expect(missing, `not in the generated schema: ${missing.join(", ")}`)
      .toEqual([]);
  });

  it("stores timestamps as text in SQLite's own format", () => {
    /* The repositories write ISO strings and never compare them in SQL, so
       these stay text. The default has to match SQLite's CURRENT_TIMESTAMP
       rather than PostgreSQL's, or rows written either side of the port would
       be distinguishable. */
    expect(learningSchema).toContain(
      "to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')",
    );
    expect(learningSchema).not.toContain("timestamptz");
  });

  it("stores booleans as integers, matching what the repositories bind", () => {
    /* db/schema.ts declares `ready` as integer with boolean mode, and the
       repositories bind `block.ready ? 1 : 0`. A PostgreSQL boolean column
       would reject that. */
    expect(learningSchema).toMatch(/"ready" bigint NOT NULL DEFAULT 0/);
    expect(learningSchema).not.toContain(" boolean");
  });
});
