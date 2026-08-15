import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPostgresPool } from "../../db/postgres";
import { ensurePlatformReady } from "../../server/platform-ready";
import { getSchoolDatabase } from "../../db/index";
import {
  createGradeCategory,
  createGradeItem,
  excludeGradeItem,
} from "../../db/gradebook-structure-repository";
import {
  ensureGradingPeriod,
  createGradingPeriod,
  listGradingPeriods,
  resolveCurrentPeriod,
  setGradingPeriodStatus,
} from "../../db/grading-period-repository";
import { listTeacherGradebookWorkspace } from "../../db/reporting-repository";
import { recordReleasedResultInMarkbook } from "../../db/assessment-markbook";
import { ReportingPolicyError } from "../../domain/reporting/gradebook";
import { accessFor, makeSchool, resetTestDatabase } from "./harness";

/* ==========================================================================
   From a paper to a report card

   Three things were broken between those two ends, and they compounded.

   Every markbook query bound `CURRENT_PERIOD_ID = "period-2026-term1"` — a row
   only the demo seed writes — so a real school read a term that did not exist.
   `seedGradeItem()` bound the demo's Integrated Science offering for every
   column it wrote and was the only thing anywhere that inserted one, so no
   other subject had a column to mark against. And `grade_items.assessment_id`
   was written once by that seed and read nowhere, so a released result never
   reached the markbook at all.

   A teacher marked a paper and then typed the same figures in by hand, into a
   markbook that for most subjects had nothing to type into.
   ========================================================================== */

const OSU = "tenant-osu";
const CLASS_ID = "class-osu-jhs1";
const OFFERING_ID = "offering-osu-science";
const TEACHER = "person-osu-teacher";
const HEAD = "person-osu-head";
const LEARNER = "person-osu-learner";

beforeAll(async () => {
  await ensurePlatformReady();
});

beforeEach(async () => {
  const database = getPostgresPool();
  await resetTestDatabase(database);

  const osu = await makeSchool(database, OSU, "Osu Community Basic School");
  await osu.addClass({ id: CLASS_ID, name: "JHS 1 Blue" });
  await osu.addStaff({ id: HEAD, name: "Ama Darko", role: "school-admin" });
  await osu.addStaff({ id: TEACHER, name: "Kofi Mensah", role: "teacher" });
  await osu.addOffering({
    classGroupId: CLASS_ID,
    className: "JHS 1 Blue",
    id: OFFERING_ID,
    subjectCode: "SCI",
    subjectName: "Integrated Science",
    teacherPersonId: TEACHER,
  });
  await osu.addLearner({
    classGroupId: CLASS_ID,
    id: LEARNER,
    name: "Adwoa Nkrumah",
  });
});

function teacher() {
  return accessFor(OSU, "teacher", TEACHER, {
    subjectOfferingIds: [OFFERING_ID],
  });
}

function head() {
  return accessFor(OSU, "school-admin", HEAD);
}

describe("a school that has never had a grading period", () => {
  it("gets one covering its academic year", async () => {
    const database = await getSchoolDatabase();

    const period = await ensureGradingPeriod(database, OSU);

    expect(period.name).toBe("Term 1");
    expect(period.status).toBe("open");
    expect(period.startsOn).toBe("2026-09-08");
  });

  it("gets a grading scale with it", async () => {
    const database = await getSchoolDatabase();
    const period = await ensureGradingPeriod(database, OSU);

    const bands = await getPostgresPool().query(
      `SELECT 1 FROM grading_scale_bands WHERE tenant_id = $1 AND period_id = $2`,
      [OSU, period.id],
    );
    expect(bands.rowCount).toBe(6);
  });

  it("opens a markbook rather than failing", async () => {
    /* This is what the hardcoded period id cost: no categories, no columns and
       no scale, on every subject in every school that was not the demo. */
    const workspace = await listTeacherGradebookWorkspace(
      teacher(),
      OFFERING_ID,
    );

    expect(workspace.period.name).toBe("Term 1");
    expect(workspace.learners.map((learner) => learner.name)).toEqual([
      "Adwoa Nkrumah",
    ]);
  });
});

describe("a second term", () => {
  it("can be created and opened, closing the first", async () => {
    const database = await getSchoolDatabase();
    const first = await ensureGradingPeriod(database, OSU);

    const second = await createGradingPeriod(head(), {
      academicYearId: `${OSU}-year`,
      endsOn: "2027-04-02",
      name: "Term 2",
      startsOn: "2027-01-06",
    });
    await setGradingPeriodStatus(head(), second.id, "open");

    const periods = await listGradingPeriods(head());
    const byId = new Map(periods.map((period) => [period.id, period]));
    expect(byId.get(second.id)?.status).toBe("open");
    expect(
      byId.get(first.id)?.status,
      "two open terms means marks with no definite home",
    ).toBe("closed");
    expect((await resolveCurrentPeriod(database, OSU))?.id).toBe(second.id);
  });

  it("keeps the scale the school last used", async () => {
    const database = await getSchoolDatabase();
    await ensureGradingPeriod(database, OSU);
    await getPostgresPool().query(
      `UPDATE grading_scale_bands SET grade = 'A+' WHERE grade = 'A' AND tenant_id = $1`,
      [OSU],
    );

    const second = await createGradingPeriod(head(), {
      academicYearId: `${OSU}-year`,
      endsOn: "2027-04-02",
      name: "Term 2",
      startsOn: "2027-01-06",
    });

    const bands = await getPostgresPool().query<{ grade: string }>(
      `SELECT grade FROM grading_scale_bands
       WHERE tenant_id = $1 AND period_id = $2 ORDER BY position`,
      [OSU, second.id],
    );
    expect(bands.rows[0].grade).toBe("A+");
  });

  it("refuses a term that ends before it starts", async () => {
    await expect(
      createGradingPeriod(head(), {
        academicYearId: `${OSU}-year`,
        endsOn: "2027-01-06",
        name: "Term 2",
        startsOn: "2027-04-02",
      }),
    ).rejects.toBeInstanceOf(ReportingPolicyError);
  });
});

describe("a teacher building their markbook", () => {
  it("adds a category and a column, and every learner gets a blank cell", async () => {
    await createGradeCategory(teacher(), OFFERING_ID, {
      kind: "continuous-assessment",
      name: "Class work",
      weightPercent: 100,
    });
    const workspace = await listTeacherGradebookWorkspace(
      teacher(),
      OFFERING_ID,
    );
    await createGradeItem(teacher(), OFFERING_ID, {
      categoryId: workspace.categories[0].id,
      maximumMarks: 20,
      title: "Class test 1",
    });

    const after = await listTeacherGradebookWorkspace(teacher(), OFFERING_ID);
    expect(after.items.map((item) => item.title)).toEqual(["Class test 1"]);
    expect(after.learners[0].cells).toHaveLength(1);
    expect(
      after.learners[0].cells[0].status,
      "a column with no cell for a learner is how a markbook loses somebody",
    ).toBe("missing");
  });

  it("refuses a weight outside nought to a hundred", async () => {
    await expect(
      createGradeCategory(teacher(), OFFERING_ID, {
        kind: "other",
        name: "Impossible",
        weightPercent: 140,
      }),
    ).rejects.toBeInstanceOf(ReportingPolicyError);
  });

  it("refuses another teacher's markbook", async () => {
    const stranger = accessFor(OSU, "teacher", "person-osu-other", {
      subjectOfferingIds: [],
    });

    await expect(
      createGradeCategory(stranger, OFFERING_ID, {
        kind: "other",
        name: "Not theirs",
        weightPercent: 50,
      }),
    ).rejects.toThrow();
  });

  it("keeps the marks when a column is removed", async () => {
    await createGradeCategory(teacher(), OFFERING_ID, {
      kind: "continuous-assessment",
      name: "Class work",
      weightPercent: 100,
    });
    const workspace = await listTeacherGradebookWorkspace(
      teacher(),
      OFFERING_ID,
    );
    const itemId = await createGradeItem(teacher(), OFFERING_ID, {
      categoryId: workspace.categories[0].id,
      maximumMarks: 20,
      title: "Class test 1",
    });

    await excludeGradeItem(teacher(), itemId);

    const after = await listTeacherGradebookWorkspace(teacher(), OFFERING_ID);
    expect(after.items).toHaveLength(0);
    const entries = await getPostgresPool().query(
      `SELECT 1 FROM grade_entries WHERE item_id = $1`,
      [itemId],
    );
    expect(
      entries.rowCount,
      "submitted marks are never hard-deleted through ordinary UI",
    ).toBe(1);
  });
});

describe("a released result", () => {
  it("lands in the column the paper created", async () => {
    const database = await getSchoolDatabase();
    const period = await ensureGradingPeriod(database, OSU);

    await createGradeCategory(teacher(), OFFERING_ID, {
      kind: "continuous-assessment",
      name: "Class work",
      weightPercent: 100,
    });
    const workspace = await listTeacherGradebookWorkspace(
      teacher(),
      OFFERING_ID,
    );
    /* Standing in for the paper a learner sat and a teacher marked. The
       assessment row goes in first: grade_items.assessment_id is a foreign
       key, which is exactly the join that was never used. */
    await getPostgresPool().query(
      `INSERT INTO assessments
        (id, tenant_id, offering_id, author_person_id, status, current_version)
       VALUES ('assessment-1', $1, $2, $3, 'published', 1)`,
      [OSU, OFFERING_ID, TEACHER],
    );
    const itemId = await createGradeItem(teacher(), OFFERING_ID, {
      assessmentId: "assessment-1",
      categoryId: workspace.categories[0].id,
      maximumMarks: 20,
      title: "Digestive system check",
    });
    await getPostgresPool().query(
      `INSERT INTO assessment_attempts
        (id, tenant_id, assessment_id, assessment_version, learner_person_id,
         status, started_at, deadline_at, auto_marks, manual_marks,
         maximum_marks)
       VALUES ('attempt-1', $1, 'assessment-1', 1, $2, 'marked',
         '2026-09-14 09:00:00', '2026-09-14 09:30:00', 9, 5, 20)`,
      [OSU, LEARNER],
    );

    await recordReleasedResultInMarkbook(teacher(), {
      assessmentId: "assessment-1",
      attemptId: "attempt-1",
    });

    const entry = await getPostgresPool().query<{
      raw_marks: number;
      status: string;
    }>(
      `SELECT raw_marks, status FROM grade_entries
       WHERE item_id = $1 AND learner_person_id = $2`,
      [itemId, LEARNER],
    );
    expect(Number(entry.rows[0].raw_marks)).toBe(14);
    expect(entry.rows[0].status).toBe("recorded");
    expect(period.id).toBeTruthy();
  });
});
