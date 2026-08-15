import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPostgresPool } from "../../db/postgres";
import { ensurePlatformReady } from "../../server/platform-ready";
import { submitPersistentAttendance } from "../../db/operations-repository";
import { schoolDate } from "../../domain/operations/school-calendar";
import { accessFor, makeSchool, resetTestDatabase } from "./harness";

/* ==========================================================================
   Telling a family their child was absent

   This path had never been run against a database, and it did not work. The
   query that finds a learner's guardians filtered on
   `guardian_relationships.status`, a column the table did not have, so
   submitting a register containing an absence raised "column status does not
   exist" and lost the whole submission — while a register where everybody was
   present saved perfectly. That is the worst shape a bug can have in a school:
   it only appears on the days that matter.

   The message was wrong too. It read "was marked absent from JHS 2 Gold" to
   every guardian in every school, because it interpolated a module constant
   rather than the learner's own class.
   ========================================================================== */

const OSU = "tenant-osu";
const CLASS_ID = "class-osu-jhs1";
const OFFERING_ID = "offering-osu-science";
const TEACHER = "person-osu-teacher";
const ABSENTEE = "person-osu-absent";
const PRESENT = "person-osu-present";
const GUARDIAN = "person-osu-guardian";

beforeAll(async () => {
  await ensurePlatformReady();
});

beforeEach(async () => {
  const database = getPostgresPool();
  await resetTestDatabase(database);

  const osu = await makeSchool(database, OSU, "Osu Community Basic School");
  await osu.addClass({ id: CLASS_ID, name: "JHS 1 Blue" });
  await osu.addStaff({
    id: TEACHER,
    name: "Ama Darko",
    role: "class-teacher",
    scopeId: CLASS_ID,
  });
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
    id: ABSENTEE,
    name: "Kofi Asante",
  });
  await osu.addLearner({
    classGroupId: CLASS_ID,
    id: PRESENT,
    name: "Adwoa Nkrumah",
  });
  await osu.addGuardian({ id: GUARDIAN, name: "Yaa Asante" });
  await osu.linkGuardian({
    guardianId: GUARDIAN,
    id: "link-osu",
    learnerId: ABSENTEE,
  });
  await osu.addRegister({
    classGroupId: CLASS_ID,
    /* The register the workspace opens is today's, at the school's own clock —
       a fixed date here would pass on the day it was written and never
       again. */
    date: schoolDate(),
    marks: [
      { code: "absent", learnerId: ABSENTEE },
      { code: "present", learnerId: PRESENT },
    ],
    sessionId: "session-osu-1",
    takenByPersonId: TEACHER,
  });
});

function teacherAccess() {
  return accessFor(OSU, "class-teacher", TEACHER, {
    classGroupIds: [CLASS_ID],
    classLearnerIds: [ABSENTEE, PRESENT],
    subjectOfferingIds: [OFFERING_ID],
  });
}

describe("submitting a register with an absence in it", () => {
  it("does not fail", async () => {
    await expect(
      submitPersistentAttendance(teacherAccess(), OFFERING_ID),
    ).resolves.toBeDefined();
  });

  it("raises one alert, for the absent learner's guardian only", async () => {
    await submitPersistentAttendance(teacherAccess(), OFFERING_ID);

    const alerts = await getPostgresPool().query<{
      guardian_person_id: string;
      learner_person_id: string;
      message: string;
    }>(
      `SELECT guardian_person_id, learner_person_id, message
       FROM guardian_alerts WHERE tenant_id = $1`,
      [OSU],
    );

    expect(alerts.rows).toHaveLength(1);
    expect(alerts.rows[0].guardian_person_id).toBe(GUARDIAN);
    expect(alerts.rows[0].learner_person_id).toBe(ABSENTEE);
  });

  it("names the class the child is actually in", async () => {
    await submitPersistentAttendance(teacherAccess(), OFFERING_ID);

    const alerts = await getPostgresPool().query<{ message: string }>(
      `SELECT message FROM guardian_alerts WHERE tenant_id = $1`,
      [OSU],
    );

    expect(alerts.rows[0].message).toContain("JHS 1 Blue");
    expect(
      alerts.rows[0].message,
      "the demo school's class name has no business in another school's alert",
    ).not.toContain("JHS 2 Gold");
  });

  it("tells a guardian whose link was revoked nothing", async () => {
    await getPostgresPool().query(
      `UPDATE guardian_relationships
       SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP
       WHERE id = 'link-osu'`,
    );

    await submitPersistentAttendance(teacherAccess(), OFFERING_ID);

    const alerts = await getPostgresPool().query(
      `SELECT 1 FROM guardian_alerts WHERE tenant_id = $1`,
      [OSU],
    );
    expect(alerts.rowCount).toBe(0);
  });
});
