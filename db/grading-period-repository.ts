import {
  AuthorizationError,
  canPerform,
} from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import { ReportingPolicyError } from "../domain/reporting/gradebook";
import { getSchoolDatabase } from "./index";
import type { SchoolDatabase } from "./school-database";

/* ==========================================================================
   The term a mark belongs to

   Every markbook query in db/reporting-repository.ts bound one constant:

     export const CURRENT_PERIOD_ID = "period-2026-term1";

   That id belongs to a row the demo seed writes. So a real school's markbook
   read a period that did not exist — no categories, no columns, no scale — and
   a school that reached the end of Term 1 had nowhere to put Term 2's marks,
   because nothing anywhere could create a second period.

   Two things replace it. `resolveCurrentPeriod()` asks the table which period
   is open, and `ensureGradingPeriod()` gives a school that has never had one a
   first term derived from its own academic year, so the markbook is openable
   on the first morning rather than after a developer has run an INSERT.

   A grading period owns its grading scale. That is deliberate: a school that
   changes its bands mid-year must not silently restate the grades it has
   already issued, and the product's integrity rules require a historical
   formula to stay reproducible. A new period copies the scale the school last
   used rather than inheriting a shared mutable one.
   ========================================================================== */

export type GradingPeriodStatus = "open" | "closed" | "locked";

export type GradingPeriod = {
  academicYearId: string;
  endsOn: string;
  id: string;
  name: string;
  policyVersion: number;
  startsOn: string;
  status: GradingPeriodStatus;
};

/** The Ghanaian basic-school bands, as a starting point a school can change. */
const DEFAULT_SCALE: ReadonlyArray<
  [minimum: number, maximum: number, grade: string, remark: string]
> = [
  [80, 100, "A", "Excellent"],
  [70, 79.9, "B", "Very good"],
  [60, 69.9, "C", "Good"],
  [50, 59.9, "D", "Credit"],
  [40, 49.9, "E", "Pass"],
  [0, 39.9, "F", "Needs support"],
];

const periodRow = `
  SELECT id, tenant_id, academic_year_id, name, starts_on, ends_on, status,
         policy_version
  FROM grading_periods`;

type Row = {
  academic_year_id: string;
  ends_on: string;
  id: string;
  name: string;
  policy_version: number;
  starts_on: string;
  status: GradingPeriodStatus;
};

function toPeriod(row: Row): GradingPeriod {
  return {
    academicYearId: row.academic_year_id,
    endsOn: row.ends_on,
    id: row.id,
    name: row.name,
    policyVersion: row.policy_version,
    startsOn: row.starts_on,
    status: row.status,
  };
}

/**
 * The period marks are being entered against right now.
 *
 * An open period wins; among several, the one that started most recently.
 * Falling back to the newest closed period means a school looking at last
 * term's markbook between terms sees last term rather than an error.
 */
export async function resolveCurrentPeriod(
  database: SchoolDatabase,
  tenantId: string,
): Promise<GradingPeriod | null> {
  const open = await database
    .prepare(
      `${periodRow}
      WHERE tenant_id = ? AND status = 'open'
      ORDER BY starts_on DESC
      LIMIT 1`,
    )
    .bind(tenantId)
    .first<Row>();
  if (open) return toPeriod(open);

  const latest = await database
    .prepare(
      `${periodRow}
      WHERE tenant_id = ?
      ORDER BY starts_on DESC
      LIMIT 1`,
    )
    .bind(tenantId)
    .first<Row>();
  return latest ? toPeriod(latest) : null;
}

/**
 * The current period, creating a first one if the school has never had any.
 *
 * Derived from the school's current academic year so the dates mean something.
 * A school with no academic year either is refused with a message that says
 * which screen fixes it, rather than a markbook that renders empty and
 * explains nothing.
 */
export async function ensureGradingPeriod(
  database: SchoolDatabase,
  tenantId: string,
): Promise<GradingPeriod> {
  const existing = await resolveCurrentPeriod(database, tenantId);
  if (existing) return existing;

  const year = await database
    .prepare(
      `SELECT id, name, starts_on, ends_on
      FROM academic_years
      WHERE tenant_id = ?
      ORDER BY CASE WHEN status = 'current' THEN 0 ELSE 1 END, starts_on DESC
      LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ ends_on: string; id: string; name: string; starts_on: string }>();
  if (!year) {
    throw new ReportingPolicyError(
      "This school has no academic year yet. An administrator creates one on the Academics screen, and the first term follows from it.",
    );
  }

  const id = crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO grading_periods
        (id, tenant_id, academic_year_id, name, starts_on, ends_on, status,
         policy_version)
      VALUES (?, ?, ?, 'Term 1', ?, ?, 'open', 1)`,
    )
    .bind(id, tenantId, year.id, year.starts_on, year.ends_on)
    .run();
  await seedScale(database, tenantId, id);

  return {
    academicYearId: year.id,
    endsOn: year.ends_on,
    id,
    name: "Term 1",
    policyVersion: 1,
    startsOn: year.starts_on,
    status: "open",
  };
}

export async function listGradingPeriods(
  access: AccessContext,
): Promise<GradingPeriod[]> {
  requirePermission(access, "gradebook:manage");
  const database = await getSchoolDatabase();
  const result = await database
    .prepare(
      `${periodRow}
      WHERE tenant_id = ?
      ORDER BY starts_on DESC`,
    )
    .bind(access.tenantId)
    .all<Row>();
  return result.results.map(toPeriod);
}

export type CreateGradingPeriodInput = {
  academicYearId: string;
  endsOn: string;
  name: string;
  startsOn: string;
};

export async function createGradingPeriod(
  access: AccessContext,
  input: CreateGradingPeriodInput,
): Promise<GradingPeriod> {
  requirePermission(access, "academic:manage");
  const database = await getSchoolDatabase();

  const name = input.name.trim();
  if (!name) throw new ReportingPolicyError("The term needs a name.");
  if (!input.startsOn || !input.endsOn) {
    throw new ReportingPolicyError("The term needs a start and an end date.");
  }
  if (input.endsOn < input.startsOn) {
    throw new ReportingPolicyError("The term ends before it starts.");
  }

  const year = await database
    .prepare(
      `SELECT id FROM academic_years WHERE id = ? AND tenant_id = ? LIMIT 1`,
    )
    .bind(input.academicYearId, access.tenantId)
    .first<{ id: string }>();
  if (!year) {
    throw new AuthorizationError("That academic year belongs to another school.");
  }

  const clash = await database
    .prepare(
      `SELECT id FROM grading_periods
      WHERE tenant_id = ? AND academic_year_id = ? AND name = ?
      LIMIT 1`,
    )
    .bind(access.tenantId, input.academicYearId, name)
    .first<{ id: string }>();
  if (clash) {
    throw new ReportingPolicyError(`${name} already exists in that year.`);
  }

  const id = crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO grading_periods
        (id, tenant_id, academic_year_id, name, starts_on, ends_on, status,
         policy_version)
      VALUES (?, ?, ?, ?, ?, ?, 'open', 1)`,
    )
    .bind(
      id,
      access.tenantId,
      input.academicYearId,
      name,
      input.startsOn,
      input.endsOn,
    )
    .run();

  /* Copied from the period the school last used rather than from a constant,
     so a school that has changed its bands keeps them, and closed periods keep
     the bands their reports were issued under. */
  await copyScale(database, access.tenantId, id);
  await audit(database, access, "gradebook.period_created", id, { name });

  return {
    academicYearId: input.academicYearId,
    endsOn: input.endsOn,
    id,
    name,
    policyVersion: 1,
    startsOn: input.startsOn,
    status: "open",
  };
}

/**
 * Opens, closes or locks a term.
 *
 * Only one period is open at a time: marks go somewhere definite, and "which
 * term am I entering" stops being a question a teacher has to answer on every
 * screen.
 */
export async function setGradingPeriodStatus(
  access: AccessContext,
  periodId: string,
  status: GradingPeriodStatus,
): Promise<GradingPeriod[]> {
  requirePermission(access, "academic:manage");
  const database = await getSchoolDatabase();

  const period = await database
    .prepare(
      `SELECT id FROM grading_periods WHERE id = ? AND tenant_id = ? LIMIT 1`,
    )
    .bind(periodId, access.tenantId)
    .first<{ id: string }>();
  if (!period) {
    throw new AuthorizationError("That term belongs to another school.");
  }

  if (status === "open") {
    await database
      .prepare(
        `UPDATE grading_periods SET status = 'closed'
        WHERE tenant_id = ? AND status = 'open' AND id <> ?`,
      )
      .bind(access.tenantId, periodId)
      .run();
  }
  await database
    .prepare(`UPDATE grading_periods SET status = ? WHERE id = ? AND tenant_id = ?`)
    .bind(status, periodId, access.tenantId)
    .run();
  await audit(database, access, "gradebook.period_status_changed", periodId, {
    status,
  });

  return listGradingPeriods(access);
}

async function copyScale(
  database: SchoolDatabase,
  tenantId: string,
  periodId: string,
) {
  const previous = await database
    .prepare(
      `SELECT position, minimum_tenths, maximum_tenths, grade, remark
      FROM grading_scale_bands
      WHERE tenant_id = ? AND period_id = (
        SELECT period_id FROM grading_scale_bands
        WHERE tenant_id = ? AND period_id <> ?
        LIMIT 1
      )
      ORDER BY position`,
    )
    .bind(tenantId, tenantId, periodId)
    .all<{
      grade: string;
      maximum_tenths: number;
      minimum_tenths: number;
      position: number;
      remark: string;
    }>();

  if (previous.results.length === 0) {
    await seedScale(database, tenantId, periodId);
    return;
  }

  for (const band of previous.results) {
    await database
      .prepare(
        `INSERT INTO grading_scale_bands
          (id, tenant_id, period_id, position, minimum_tenths, maximum_tenths,
           grade, remark)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        tenantId,
        periodId,
        band.position,
        band.minimum_tenths,
        band.maximum_tenths,
        band.grade,
        band.remark,
      )
      .run();
  }
}

async function seedScale(
  database: SchoolDatabase,
  tenantId: string,
  periodId: string,
) {
  for (const [index, band] of DEFAULT_SCALE.entries()) {
    const [minimum, maximum, grade, remark] = band;
    await database
      .prepare(
        `INSERT INTO grading_scale_bands
          (id, tenant_id, period_id, position, minimum_tenths, maximum_tenths,
           grade, remark)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        tenantId,
        periodId,
        index + 1,
        Math.round(minimum * 10),
        Math.round(maximum * 10),
        grade,
        remark,
      )
      .run();
  }
}

async function audit(
  database: SchoolDatabase,
  access: AccessContext,
  action: string,
  entityId: string,
  metadata: Record<string, unknown>,
) {
  await database
    .prepare(
      `INSERT INTO audit_events
        (id, tenant_id, actor_person_id, action, entity_type, entity_id,
         metadata)
      VALUES (?, ?, ?, ?, 'grading_period', ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      access.tenantId,
      access.actorPersonId,
      action,
      entityId,
      JSON.stringify(metadata),
    )
    .run();
}

function requirePermission(
  access: AccessContext,
  permission: Parameters<typeof canPerform>[1],
) {
  if (!canPerform(access, permission)) {
    throw new AuthorizationError("Your school role does not allow this action.");
  }
}
