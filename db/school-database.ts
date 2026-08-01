import type { Pool, PoolClient } from "pg";
import { translateStatement } from "./sqlite-to-postgres";

/* ==========================================================================
   A D1 database backed by PostgreSQL

   The learning, content, assessment, operations and reporting repositories are
   written against Cloudflare's D1 API. The VPS has no D1 binding, so every one
   of their calls throws there and the app falls back to preview data.

   This implements the slice of that API the repositories use — prepare, bind,
   first, all, run, and batch — on top of node-postgres. The repositories keep
   working unchanged, which matters: they are around 7,800 lines and there is
   no practical way to test a hand rewrite of all of them.

   The slice is deliberately narrow. D1 methods the repositories never call are
   absent rather than approximated, so reaching for one is a compile error
   instead of a subtly wrong result.
   ========================================================================== */

type DatabaseRow = Record<string, unknown>;

export type StatementResult = {
  meta: { changes: number; duration: number };
  results: DatabaseRow[];
  success: true;
};

export interface SchoolStatement {
  all<T = DatabaseRow>(): Promise<{ meta: StatementResult["meta"]; results: T[]; success: true }>;
  bind(...values: unknown[]): SchoolStatement;
  first<T = DatabaseRow>(): Promise<T | null>;
  run(): Promise<StatementResult>;
}

export interface SchoolDatabase {
  batch(statements: SchoolStatement[]): Promise<StatementResult[]>;
  prepare(sql: string): SchoolStatement;
}

/** Creates a D1-shaped facade over a node-postgres pool. */
export function createSchoolDatabase(pool: Pool): SchoolDatabase {
  return {
    async batch(statements) {
      const prepared = statements.map(asPreparedStatement);
      /* D1 runs a batch as one implicit transaction. Anything less would let a
         half-written lesson — its version row saved, its blocks not — survive a
         failure partway through. */
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const results: StatementResult[] = [];
        for (const statement of prepared) {
          results.push(await statement.execute(client));
        }
        await client.query("COMMIT");
        return results;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    prepare(sql) {
      return new PostgresStatement(pool, sql, []);
    },
  };
}

class PostgresStatement implements SchoolStatement {
  readonly #pool: Pool;
  readonly #sql: string;
  readonly #values: unknown[];

  constructor(pool: Pool, sql: string, values: unknown[]) {
    this.#pool = pool;
    this.#sql = sql;
    this.#values = values;
  }

  /* D1 statements are immutable: bind() returns a new statement rather than
     mutating, which is what lets a prepared statement be reused with different
     values. */
  bind(...values: unknown[]): SchoolStatement {
    return new PostgresStatement(this.#pool, this.#sql, values);
  }

  async first<T = DatabaseRow>(): Promise<T | null> {
    const { results } = await this.execute(this.#pool);
    return (results[0] as T) ?? null;
  }

  async all<T = DatabaseRow>() {
    const result = await this.execute(this.#pool);
    return {
      meta: result.meta,
      results: result.results as T[],
      success: true as const,
    };
  }

  async run(): Promise<StatementResult> {
    return this.execute(this.#pool);
  }

  /** Runs against the pool, or against one client when inside a batch. */
  async execute(executor: Pool | PoolClient): Promise<StatementResult> {
    const { parameterCount, text } = translateStatement(this.#sql);

    if (parameterCount !== this.#values.length) {
      /* D1 reports this clearly; node-postgres reports "bind message supplies
         N parameters" with no statement text, which is hard to place among 202
         of them. */
      throw new Error(
        `This statement has ${parameterCount} placeholders but was bound with ${this.#values.length} values: ${summarise(this.#sql)}`,
      );
    }

    const startedAt = Date.now();
    const result = await executor.query({
      text,
      values: this.#values.map(toPostgresValue),
    });

    return {
      meta: {
        changes: result.rowCount ?? 0,
        duration: Date.now() - startedAt,
      },
      results: result.rows as DatabaseRow[],
      success: true,
    };
  }
}

/**
 * D1 accepts booleans and stores them as 1/0 in an INTEGER column; the
 * repositories already bind 1/0 directly for those columns, but a stray
 * boolean would otherwise reach a bigint column and fail. Undefined is bound
 * as NULL, which is what D1 does.
 */
function toPostgresValue(value: unknown): unknown {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === undefined) return null;
  return value;
}

function summarise(sql: string): string {
  const collapsed = sql.replace(/\s+/g, " ").trim();
  return collapsed.length > 120 ? `${collapsed.slice(0, 117)}...` : collapsed;
}

/**
 * batch() is typed against the interface, but the transaction needs the
 * concrete statement so it can run on the batch's client rather than the pool.
 */
function asPreparedStatement(statement: SchoolStatement): PostgresStatement {
  if (statement instanceof PostgresStatement) return statement;
  throw new Error(
    "batch() was given a statement this adapter did not create. Prepare every statement from the same database handle.",
  );
}
