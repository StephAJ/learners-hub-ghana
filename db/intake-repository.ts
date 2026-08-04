import {
  AuthorizationError,
  canPerform,
} from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import {
  intakeClosedReason,
  isIntakeAcceptingApplications,
  normaliseIntake,
  type AdmissionIntake,
  type CreateIntakeCommand,
  type IntakeStatus,
} from "../domain/academic/structure";
import { ensurePlatformReady } from "../server/platform-ready";
import { getPostgresPool } from "./postgres";

/* ==========================================================================
   Whether the school is taking applications

   This replaces `const CURRENT_INTAKE_ID = "2026-2027"` in
   db/applicant-repository.ts. That constant decided, at build time, which
   year every application in the system belonged to — so a school could not
   open next year's admissions without a developer, and could not close this
   year's at all. The public form went on accepting applications past its own
   advertised closing date, because nothing had ever been asked.

   `resolveOpenIntake` is the question the public side asks and is deliberately
   permission-free: an applicant who is not signed in still has to be told
   whether they may apply.
   ========================================================================== */

/** How the public side reads the school's admissions state. */
export type PublicIntakeState = {
  /** Why the form is not accepting applications. Null when it is. */
  closedReason: string | null;
  intake: AdmissionIntake | null;
  isOpen: boolean;
};

export async function resolveIntakeState(
  tenantId: string,
  today = isoToday(),
): Promise<PublicIntakeState> {
  await ensurePlatformReady();

  /* Open intakes first, then the one closing soonest — a school running an
     early intake alongside a main one is normal, and the applicant should be
     offered the one they can actually complete. */
  const result = await getPostgresPool().query<IntakeRow>(
    `SELECT id, academic_year_id, label, opens_on, closes_on, status, capacity
       FROM admission_intakes
      WHERE tenant_id = $1 AND status <> 'draft'
      ORDER BY (status = 'open') DESC, closes_on ASC
      LIMIT 1`,
    [tenantId],
  );

  const row = result.rows[0];
  if (!row) {
    return {
      closedReason:
        "The school is not taking applications online at the moment. The school office can tell you when the next intake opens.",
      intake: null,
      isOpen: false,
    };
  }

  const intake = toIntake(row, tenantId);
  return {
    closedReason: intakeClosedReason(intake, today),
    intake,
    isOpen: isIntakeAcceptingApplications(intake, today),
  };
}

/**
 * The intake an application belongs to, or a refusal.
 *
 * Called on the write path in db/applicant-repository.ts. Saving a draft and
 * submitting one both go through it, so an intake that closes while a family
 * is part-way through the form stops them at the next save rather than
 * accepting an application the school will not look at.
 */
export async function requireOpenIntakeId(tenantId: string): Promise<string> {
  const state = await resolveIntakeState(tenantId);
  if (!state.isOpen || !state.intake) {
    throw new IntakeClosedError(
      state.closedReason ?? "Applications are not open at the moment.",
    );
  }
  return state.intake.id;
}

export class IntakeClosedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntakeClosedError";
  }
}

/**
 * The intake the school is currently working on, open or not.
 *
 * The read counterpart to `requireOpenIntakeId`. An admissions officer spends
 * the weeks after the closing date reviewing what came in, so every read path
 * has to keep resolving to the intake that just closed rather than failing
 * with it. Returns null only when the school has never set one up, which the
 * callers render as an empty queue.
 */
export async function resolveCurrentIntakeId(
  tenantId: string,
): Promise<string | null> {
  const state = await resolveIntakeState(tenantId);
  return state.intake?.id ?? null;
}

export async function listIntakes(
  access: AccessContext,
): Promise<AdmissionIntake[]> {
  requirePermission(access, "admissions:manage");
  await ensurePlatformReady();

  const result = await getPostgresPool().query<IntakeRow>(
    `SELECT id, academic_year_id, label, opens_on, closes_on, status, capacity
       FROM admission_intakes
      WHERE tenant_id = $1
      ORDER BY opens_on DESC`,
    [access.tenantId],
  );

  return result.rows.map((row) => toIntake(row, access.tenantId));
}

export async function createIntake(
  access: AccessContext,
  command: CreateIntakeCommand,
): Promise<AdmissionIntake> {
  requirePermission(access, "admissions:manage");
  await ensurePlatformReady();

  const existing = await listIntakes(access);
  const intake = normaliseIntake(command, existing);

  const owned = await getPostgresPool().query(
    `SELECT 1 FROM academic_years WHERE id = $1 AND tenant_id = $2`,
    [intake.academicYearId, access.tenantId],
  );
  if (owned.rowCount === 0) {
    throw new AuthorizationError(
      "That academic year belongs to another school.",
    );
  }

  const id = crypto.randomUUID();
  await getPostgresPool().query(
    `INSERT INTO admission_intakes
       (id, tenant_id, academic_year_id, label, opens_on, closes_on,
        status, capacity)
     VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7)`,
    [
      id,
      access.tenantId,
      intake.academicYearId,
      intake.label,
      intake.opensOn,
      intake.closesOn,
      intake.capacity,
    ],
  );
  await recordAudit(access, "admissions.intake-created", id, {
    label: intake.label,
  });

  return { ...intake, id, status: "draft", tenantId: access.tenantId };
}

export async function updateIntake(
  access: AccessContext,
  intakeId: string,
  command: CreateIntakeCommand,
): Promise<AdmissionIntake> {
  requirePermission(access, "admissions:manage");
  await ensurePlatformReady();

  const existing = await listIntakes(access);
  const current = existing.find((item) => item.id === intakeId);
  if (!current) {
    throw new AuthorizationError("That intake belongs to another school.");
  }

  const intake = normaliseIntake(command, existing, intakeId);
  await getPostgresPool().query(
    `UPDATE admission_intakes
        SET academic_year_id = $2,
            label = $3,
            opens_on = $4,
            closes_on = $5,
            capacity = $6
      WHERE id = $1`,
    [
      intakeId,
      intake.academicYearId,
      intake.label,
      intake.opensOn,
      intake.closesOn,
      intake.capacity,
    ],
  );
  await recordAudit(access, "admissions.intake-updated", intakeId, {
    label: intake.label,
  });

  return { ...intake, id: intakeId, status: current.status, tenantId: access.tenantId };
}

/**
 * Opens or closes an intake.
 *
 * Opening one closes any other that is open. Two open intakes would leave
 * `resolveIntakeState` picking between them by closing date, which is a
 * coin-toss the school did not make — if a school genuinely runs two at once,
 * that is a feature to design rather than a state to fall into by accident.
 *
 * Closing is never deletion: every application already made stays readable
 * and reviewable, which is the whole reason the admissions queue exists.
 */
export async function setIntakeStatus(
  access: AccessContext,
  intakeId: string,
  status: IntakeStatus,
): Promise<AdmissionIntake> {
  requirePermission(access, "admissions:manage");
  await ensurePlatformReady();

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const owned = await client.query<IntakeRow>(
      `SELECT id, academic_year_id, label, opens_on, closes_on, status, capacity
         FROM admission_intakes
        WHERE id = $1 AND tenant_id = $2`,
      [intakeId, access.tenantId],
    );
    if (owned.rowCount === 0) {
      throw new AuthorizationError("That intake belongs to another school.");
    }

    if (status === "open") {
      await client.query(
        `UPDATE admission_intakes
            SET status = 'closed'
          WHERE tenant_id = $1 AND status = 'open' AND id <> $2`,
        [access.tenantId, intakeId],
      );
    }
    await client.query(
      `UPDATE admission_intakes SET status = $2 WHERE id = $1`,
      [intakeId, status],
    );
    await client.query("COMMIT");

    await recordAudit(access, `admissions.intake-${status}`, intakeId, {});
    return { ...toIntake(owned.rows[0], access.tenantId), status };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Applications received against an intake, for the admin screen's counts. */
export async function countApplicationsByIntake(
  access: AccessContext,
): Promise<Record<string, number>> {
  requirePermission(access, "admissions:manage");
  await ensurePlatformReady();

  const result = await getPostgresPool().query<{
    intake_id: string;
    total: number;
  }>(
    `SELECT intake_id, COUNT(*) AS total
       FROM admission_application_records
      WHERE tenant_id = $1 AND status <> 'draft'
      GROUP BY intake_id`,
    [access.tenantId],
  );

  return Object.fromEntries(
    result.rows.map((row) => [row.intake_id, Number(row.total)]),
  );
}

type IntakeRow = {
  academic_year_id: string;
  capacity: number;
  closes_on: string;
  id: string;
  label: string;
  opens_on: string;
  status: IntakeStatus;
};

function toIntake(row: IntakeRow, tenantId: string): AdmissionIntake {
  return {
    academicYearId: row.academic_year_id,
    capacity: Number(row.capacity),
    closesOn: row.closes_on,
    id: row.id,
    label: row.label,
    opensOn: row.opens_on,
    status: row.status,
    tenantId,
  };
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

async function recordAudit(
  access: AccessContext,
  action: string,
  entityId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getPostgresPool().query(
    `INSERT INTO audit_events
       (id, tenant_id, actor_person_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, 'admission-intake', $5, $6::jsonb)`,
    [
      crypto.randomUUID(),
      access.tenantId,
      access.actorPersonId,
      action,
      entityId,
      JSON.stringify(metadata),
    ],
  );
}

function requirePermission(
  access: AccessContext,
  permission: Parameters<typeof canPerform>[1],
) {
  if (!canPerform(access, permission)) {
    throw new AuthorizationError(
      "Your school role does not allow this action.",
    );
  }
}
