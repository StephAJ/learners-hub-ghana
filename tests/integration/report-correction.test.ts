import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPostgresPool } from "../../db/postgres";
import { ensurePlatformReady } from "../../server/platform-ready";
import {
  approvePersistentReport,
  correctReleasedReport,
  releasePersistentReport,
} from "../../db/reporting-repository";
import { ensureGradingPeriod } from "../../db/grading-period-repository";
import { getSchoolDatabase } from "../../db/index";
import { ReportingPolicyError } from "../../domain/reporting/gradebook";
import { accessFor, makeSchool, resetTestDatabase } from "./harness";

/* ==========================================================================
   Correcting a report a family has already read

   The queue could approve and release, and that was all. A head who spotted a
   wrong mark on a report that had gone home had no route through the product
   at all — the fix was a database client.

   Two of the data integrity rules meet here, and both say the same thing:
   "Report correction creates a new version and does not replace the audit
   history", and "No destructive recalculation of already issued reports". So
   what a family was issued has to survive the correction untouched, and the
   test that matters is the one asserting the old version is still there and
   still says what it said.
   ========================================================================== */

const OSU = "tenant-osu";
const CLASS_ID = "class-osu-jhs1";
const HEAD = "person-osu-head";
const LEARNER = "person-osu-learner";
const REPORT_ID = "report-osu-1";

beforeAll(async () => {
  await ensurePlatformReady();
});

beforeEach(async () => {
  const database = getPostgresPool();
  await resetTestDatabase(database);

  const osu = await makeSchool(database, OSU, "Osu Community Basic School");
  await osu.addClass({ id: CLASS_ID, name: "JHS 1 Blue" });
  await osu.addStaff({ id: HEAD, name: "Ama Darko", role: "school-admin" });
  await osu.addLearner({
    classGroupId: CLASS_ID,
    id: LEARNER,
    name: "Kofi Asante",
  });

  const period = await ensureGradingPeriod(await getSchoolDatabase(), OSU);
  await database.query(
    `INSERT INTO report_cards
      (id, tenant_id, learner_person_id, period_id, class_group_id, class_name,
       status, current_version)
     VALUES ($1, $2, $3, $4, $5, 'JHS 1 Blue', 'submitted', 0)`,
    [REPORT_ID, OSU, LEARNER, period.id, CLASS_ID],
  );
  await database.query(
    `INSERT INTO report_card_versions
      (id, tenant_id, report_card_id, version, status, overall_average_tenths,
       attendance_present, attendance_total, conduct, class_teacher_comment,
       headteacher_comment, promotion_decision, submitted_at,
       created_by_person_id)
     VALUES ($1, $2, $3, 0, 'submitted', 742, 56, 58, 'Good',
       'A steady term.', '', 'Promoted', '2026-12-18', $4)`,
    [`${REPORT_ID}:v0`, OSU, REPORT_ID, HEAD],
  );
  await database.query(
    `INSERT INTO report_subject_results
      (id, tenant_id, report_version_id, offering_id, subject_code,
       subject_name, score_tenths, grade, remark, teacher_comment, position)
     VALUES ($1, $2, $3, 'offering-a', 'SCI', 'Integrated Science', 450, 'E',
       'Pass', 'Needs to revise.', 1)`,
    [crypto.randomUUID(), OSU, `${REPORT_ID}:v0`],
  );
});

function head() {
  return accessFor(OSU, "school-admin", HEAD);
}

async function release() {
  await approvePersistentReport(head(), REPORT_ID);
  await releasePersistentReport(head(), REPORT_ID);
}

describe("a released report", () => {
  it("can be opened for correction", async () => {
    await release();

    await correctReleasedReport(
      head(),
      REPORT_ID,
      "Science mark entered as 45, should be 54",
    );

    const report = await getPostgresPool().query<{
      current_version: number;
      status: string;
    }>(`SELECT status, current_version FROM report_cards WHERE id = $1`, [
      REPORT_ID,
    ]);
    expect(report.rows[0].status).toBe("submitted");
    /* v0 submitted, approval leaves it, release makes v1, correction makes
       v2 — and v2 goes back into the queue rather than out to the family. */
    expect(Number(report.rows[0].current_version)).toBe(2);
  });

  it("keeps the version the family was issued, exactly as it was", async () => {
    await release();
    const before = await getPostgresPool().query<{
      class_teacher_comment: string;
      status: string;
      version: number;
    }>(
      `SELECT version, status, class_teacher_comment FROM report_card_versions
       WHERE report_card_id = $1 AND status = 'released'`,
      [REPORT_ID],
    );
    const issued = before.rows[0];

    await correctReleasedReport(head(), REPORT_ID, "Wrong science mark");

    const after = await getPostgresPool().query<{
      class_teacher_comment: string;
      status: string;
    }>(
      `SELECT status, class_teacher_comment FROM report_card_versions
       WHERE report_card_id = $1 AND version = $2`,
      [REPORT_ID, issued.version],
    );
    expect(
      after.rowCount,
      "the issued version is never deleted, only superseded",
    ).toBe(1);
    expect(after.rows[0].status).toBe("superseded");
    expect(after.rows[0].class_teacher_comment).toBe(
      issued.class_teacher_comment,
    );
  });

  it("carries the subject results forward into the new version", async () => {
    await release();

    await correctReleasedReport(head(), REPORT_ID, "Wrong science mark");

    const report = await getPostgresPool().query<{ current_version: number }>(
      `SELECT current_version FROM report_cards WHERE id = $1`,
      [REPORT_ID],
    );
    const subjects = await getPostgresPool().query<{ subject_name: string }>(
      `SELECT subject_name FROM report_subject_results
       WHERE report_version_id = $1`,
      [`${REPORT_ID}:v${report.rows[0].current_version}`],
    );
    expect(subjects.rows.map((row) => row.subject_name)).toEqual([
      "Integrated Science",
    ]);
  });

  it("records why, against the report, for good", async () => {
    await release();

    await correctReleasedReport(head(), REPORT_ID, "Science mark 45 not 54");

    const events = await getPostgresPool().query<{ metadata: unknown }>(
      `SELECT metadata FROM audit_events
       WHERE tenant_id = $1 AND action = 'report.correction_opened'`,
      [OSU],
    );
    expect(events.rowCount).toBe(1);
    expect(JSON.stringify(events.rows[0].metadata)).toContain("45 not 54");
  });

  it("insists on a reason", async () => {
    await release();

    await expect(
      correctReleasedReport(head(), REPORT_ID, "   "),
    ).rejects.toBeInstanceOf(ReportingPolicyError);
  });
});

describe("a report still in the queue", () => {
  it("is not corrected — it is edited in the markbook", async () => {
    await expect(
      correctReleasedReport(head(), REPORT_ID, "Wrong mark"),
    ).rejects.toBeInstanceOf(ReportingPolicyError);
  });
});
