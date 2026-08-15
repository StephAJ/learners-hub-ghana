import {
  AuthorizationError,
  canPerform,
} from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import { DailyOperationsPolicyError } from "../domain/operations/daily-operations";
import { getSchoolDatabase } from "./index";
import type { SchoolDatabase } from "./school-database";

/* ==========================================================================
   Building a timetable

   `timetable_periods` and `timetable_entries` were written by the operations
   seed and by nothing else. A teacher could cancel a period or arrange a
   substitute; no role anywhere could create one. So the timetable every
   learner and guardian read — the one on the home screen, the one the school
   day is built from — was the demo school's four periods, in every school.

   Two levels, because they change at different rates. The periods are the
   school's bell times and are set once a year. The entries are what happens
   in each of them, per class, and change when staffing does.
   ========================================================================== */

export type TimetablePeriod = {
  endsAt: string;
  id: string;
  kind: "lesson" | "break" | "assembly";
  name: string;
  position: number;
  startsAt: string;
};

export type TimetableEntry = {
  classGroupId: string;
  id: string;
  offeringId: string | null;
  periodId: string;
  room: string;
  status: "scheduled" | "cancelled" | "substituted";
  subjectName: string;
  teacherPersonId: string | null;
  weekday: number;
};

export type SchoolTimetable = {
  entries: TimetableEntry[];
  periods: TimetablePeriod[];
};

export async function loadSchoolTimetable(
  access: AccessContext,
  classGroupId?: string,
): Promise<SchoolTimetable> {
  requirePermission(access, "people:read");
  const database = await getSchoolDatabase();

  const periods = await database
    .prepare(
      `SELECT id, name, position, starts_at, ends_at, kind
      FROM timetable_periods
      WHERE tenant_id = ?
      ORDER BY position`,
    )
    .bind(access.tenantId)
    .all<{
      ends_at: string;
      id: string;
      kind: TimetablePeriod["kind"];
      name: string;
      position: number;
      starts_at: string;
    }>();

  const entries = await database
    .prepare(
      `SELECT id, period_id, weekday, class_group_id, offering_id,
        teacher_person_id, subject_name, room, status
      FROM timetable_entries
      WHERE tenant_id = ?
        AND (? = '' OR class_group_id = ?)
      ORDER BY weekday, period_id`,
    )
    .bind(access.tenantId, classGroupId ?? "", classGroupId ?? "")
    .all<{
      class_group_id: string;
      id: string;
      offering_id: string | null;
      period_id: string;
      room: string;
      status: TimetableEntry["status"];
      subject_name: string;
      teacher_person_id: string | null;
      weekday: number;
    }>();

  return {
    entries: entries.results.map((row) => ({
      classGroupId: row.class_group_id,
      id: row.id,
      offeringId: row.offering_id,
      periodId: row.period_id,
      room: row.room,
      status: row.status,
      subjectName: row.subject_name,
      teacherPersonId: row.teacher_person_id,
      weekday: Number(row.weekday),
    })),
    periods: periods.results.map((row) => ({
      endsAt: row.ends_at,
      id: row.id,
      kind: row.kind,
      name: row.name,
      position: Number(row.position),
      startsAt: row.starts_at,
    })),
  };
}

export type CreatePeriodInput = {
  endsAt: string;
  kind: TimetablePeriod["kind"];
  name: string;
  startsAt: string;
};

export async function createTimetablePeriod(
  access: AccessContext,
  input: CreatePeriodInput,
): Promise<void> {
  requirePermission(access, "timetable:manage");
  const database = await getSchoolDatabase();

  const name = requireText(input.name, "The period needs a name.");
  requireTime(input.startsAt);
  requireTime(input.endsAt);
  if (input.endsAt <= input.startsAt) {
    throw new DailyOperationsPolicyError(
      "A period has to end after it starts.",
    );
  }

  const highest = await database
    .prepare(
      `SELECT COALESCE(MAX(position), 0) AS highest FROM timetable_periods
      WHERE tenant_id = ?`,
    )
    .bind(access.tenantId)
    .first<{ highest: number }>();

  await database
    .prepare(
      `INSERT INTO timetable_periods
        (id, tenant_id, name, position, starts_at, ends_at, kind)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      access.tenantId,
      name,
      Number(highest?.highest ?? 0) + 1,
      input.startsAt,
      input.endsAt,
      input.kind,
    )
    .run();
  await audit(database, access, "timetable.period_created", { name });
}

export async function removeTimetablePeriod(
  access: AccessContext,
  periodId: string,
): Promise<void> {
  requirePermission(access, "timetable:manage");
  const database = await getSchoolDatabase();

  const held = await database
    .prepare(
      `SELECT COUNT(*) AS held FROM timetable_entries
      WHERE tenant_id = ? AND period_id = ?`,
    )
    .bind(access.tenantId, periodId)
    .first<{ held: number }>();
  if (Number(held?.held ?? 0) > 0) {
    throw new DailyOperationsPolicyError(
      "Lessons are timetabled in this period. Clear them before removing it.",
    );
  }

  await database
    .prepare(`DELETE FROM timetable_periods WHERE id = ? AND tenant_id = ?`)
    .bind(periodId, access.tenantId)
    .run();
  await audit(database, access, "timetable.period_removed", { periodId });
}

export type SetEntryInput = {
  classGroupId: string;
  /** Blank clears the slot. */
  offeringId: string;
  periodId: string;
  room: string;
  weekday: number;
};

/**
 * Puts a subject in one slot of one class's week, or clears it.
 *
 * The subject name and teacher are read off the offering rather than typed:
 * a timetable that names a teacher who does not teach that class is how a
 * register ends up with the wrong person's name on it.
 */
export async function setTimetableEntry(
  access: AccessContext,
  input: SetEntryInput,
): Promise<void> {
  requirePermission(access, "timetable:manage");
  const database = await getSchoolDatabase();

  if (input.weekday < 1 || input.weekday > 5) {
    throw new DailyOperationsPolicyError(
      "A timetabled lesson falls on a school day, Monday to Friday.",
    );
  }
  await requireOwned(
    database,
    access,
    "timetable_periods",
    input.periodId,
    "That period belongs to another school.",
  );
  await requireOwned(
    database,
    access,
    "class_groups",
    input.classGroupId,
    "That class belongs to another school.",
  );

  const existing = await database
    .prepare(
      `SELECT id FROM timetable_entries
      WHERE tenant_id = ? AND period_id = ? AND weekday = ? AND class_group_id = ?
      LIMIT 1`,
    )
    .bind(
      access.tenantId,
      input.periodId,
      input.weekday,
      input.classGroupId,
    )
    .first<{ id: string }>();

  if (!input.offeringId) {
    if (existing) {
      await database
        .prepare(`DELETE FROM timetable_entries WHERE id = ? AND tenant_id = ?`)
        .bind(existing.id, access.tenantId)
        .run();
      await audit(database, access, "timetable.entry_cleared", {
        entryId: existing.id,
      });
    }
    return;
  }

  const offering = await database
    .prepare(
      `SELECT o.id, s.name AS subject_name,
        (SELECT ta.teacher_person_id FROM teacher_assignments ta
         WHERE ta.offering_id = o.id AND ta.status = 'active'
         LIMIT 1) AS teacher_person_id
      FROM subject_offerings o
      INNER JOIN subjects s ON s.id = o.subject_id
      WHERE o.id = ? AND o.tenant_id = ? AND o.class_group_id = ?
      LIMIT 1`,
    )
    .bind(input.offeringId, access.tenantId, input.classGroupId)
    .first<{ id: string; subject_name: string; teacher_person_id: string | null }>();
  if (!offering) {
    throw new DailyOperationsPolicyError(
      "That subject is not offered to this class. Put it on the class first, on the Academics screen.",
    );
  }

  /* A clash is two classes needing the same teacher in the same slot, which is
     the one thing a timetable exists to prevent. */
  if (offering.teacher_person_id) {
    const clash = await database
      .prepare(
        `SELECT class_group_id FROM timetable_entries
        WHERE tenant_id = ? AND period_id = ? AND weekday = ?
          AND teacher_person_id = ? AND class_group_id <> ?
          AND status <> 'cancelled'
        LIMIT 1`,
      )
      .bind(
        access.tenantId,
        input.periodId,
        input.weekday,
        offering.teacher_person_id,
        input.classGroupId,
      )
      .first<{ class_group_id: string }>();
    if (clash) {
      throw new DailyOperationsPolicyError(
        "That teacher is already timetabled with another class in this period.",
      );
    }
  }

  if (existing) {
    await database
      .prepare(
        `UPDATE timetable_entries
        SET offering_id = ?, teacher_person_id = ?, subject_name = ?, room = ?,
          status = 'scheduled', substitute_teacher_person_id = NULL,
          change_reason = NULL
        WHERE id = ? AND tenant_id = ?`,
      )
      .bind(
        offering.id,
        offering.teacher_person_id,
        offering.subject_name,
        input.room.trim(),
        existing.id,
        access.tenantId,
      )
      .run();
  } else {
    await database
      .prepare(
        `INSERT INTO timetable_entries
          (id, tenant_id, period_id, weekday, class_group_id, offering_id,
           teacher_person_id, subject_name, room, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
      )
      .bind(
        crypto.randomUUID(),
        access.tenantId,
        input.periodId,
        input.weekday,
        input.classGroupId,
        offering.id,
        offering.teacher_person_id,
        offering.subject_name,
        input.room.trim(),
      )
      .run();
  }

  await audit(database, access, "timetable.entry_set", {
    classGroupId: input.classGroupId,
    offeringId: offering.id,
    weekday: input.weekday,
  });
}

async function requireOwned(
  database: SchoolDatabase,
  access: AccessContext,
  table: "class_groups" | "timetable_periods",
  id: string,
  message: string,
) {
  /* The table name is a literal from the union above, never from a request. */
  const row = await database
    .prepare(`SELECT id FROM ${table} WHERE id = ? AND tenant_id = ? LIMIT 1`)
    .bind(id, access.tenantId)
    .first<{ id: string }>();
  if (!row) throw new AuthorizationError(message);
}

function requireText(value: string, message: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new DailyOperationsPolicyError(message);
  return trimmed;
}

function requireTime(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value ?? "")) {
    throw new DailyOperationsPolicyError(
      "A period's times are written as HH:MM, like 08:15.",
    );
  }
}

async function audit(
  database: SchoolDatabase,
  access: AccessContext,
  action: string,
  metadata: Record<string, unknown>,
) {
  await database
    .prepare(
      `INSERT INTO audit_events
        (id, tenant_id, actor_person_id, action, entity_type, entity_id,
         metadata)
      VALUES (?, ?, ?, ?, 'timetable', ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      access.tenantId,
      access.actorPersonId,
      action,
      access.tenantId,
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
