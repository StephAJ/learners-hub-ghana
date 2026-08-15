import { beforeAll, describe, expect, it } from "vitest";
import { getPostgresPool } from "../../db/postgres";
import { ensurePlatformReady } from "../../server/platform-ready";
import { loadSchoolProfile } from "../../db/school-profile-repository";
import { listDirectoryPeople } from "../../db/people-repository";
import { listAuditEvents } from "../../db/audit-repository";
import { SCHOOL_TENANT_ID } from "../../server/school-tenant";
import { accessFor, resetTestDatabase } from "./harness";

/* ==========================================================================
   A school on its first morning

   The single largest thing wrong with this product was that every deployment
   was the demo. Two seeds ran at boot and four more ran lazily on first read,
   none of them behind a switch — so a real school signed in to a directory
   holding a cast it had never met, a markbook holding somebody else's marks,
   and a released report card for a child who does not attend.

   This is the test for the thing that replaced it: boot a database with the
   demo off, and check that what comes up is an empty school with its own name
   on it, rather than Greenfield Academy.

   It runs against the same test database as everything else here, truncated
   first, because `pointAtTestDatabase()` already unsets both demo switches —
   so every other file in this directory has been exercising the demo-off boot
   path all along. This one says so out loud, and checks the parts nothing
   else looks at: the tenant row, the public profile, and the register.
   ========================================================================== */

beforeAll(async () => {
  await resetTestDatabase(getPostgresPool());
  await ensurePlatformReady();
});

describe("booting with the demo off", () => {
  it("creates the school's own tenant row", async () => {
    const result = await getPostgresPool().query<{ name: string }>(
      `SELECT name FROM tenants WHERE id = $1`,
      [SCHOOL_TENANT_ID],
    );

    expect(
      result.rowCount,
      "a deployment with no administrator configured still needs a school",
    ).toBe(1);
    expect(result.rows[0].name).not.toBe("Greenfield Academy");
  });

  it("writes none of the demo's people", async () => {
    const people = await getPostgresPool().query(
      `SELECT 1 FROM people WHERE tenant_id = $1`,
      [SCHOOL_TENANT_ID],
    );

    expect(people.rowCount).toBe(0);
  });

  it("writes none of the demo's subjects, lessons or marks", async () => {
    for (const table of [
      "subjects",
      "subject_offerings",
      "lessons",
      "assessments",
      "grade_items",
      "report_cards",
      "timetable_entries",
    ]) {
      const rows = await getPostgresPool().query(
        `SELECT 1 FROM ${table} WHERE tenant_id = $1`,
        [SCHOOL_TENANT_ID],
      );
      expect(rows.rowCount, table).toBe(0);
    }
  });
});

describe("the public site of a school that has written nothing", () => {
  it("does not tell Greenfield's story", async () => {
    const profile = await loadSchoolProfile(SCHOOL_TENANT_ID);

    const everything = JSON.stringify(profile);
    expect(
      everything.includes("Greenfield"),
      "a school that has never seen the demo must not publish its address, its BECE results or its testimonials",
    ).toBe(false);
    expect(everything).not.toContain("Otswe Street");
  });

  it("uses the school's own name and claims nothing on its behalf", async () => {
    const profile = await loadSchoolProfile(SCHOOL_TENANT_ID);

    expect(profile.name).toBeTruthy();
    expect(profile.programmes).toEqual([]);
    expect(profile.news).toEqual([]);
    expect(profile.testimonials).toEqual([]);
    expect(profile.about.facts).toEqual([]);
  });

  it("still has the headings every section needs to render", async () => {
    const profile = await loadSchoolProfile(SCHOOL_TENANT_ID);

    expect(profile.about.heading).not.toBe("");
    expect(profile.academics.heading).not.toBe("");
    expect(profile.studentLife.heading).not.toBe("");
    expect(profile.heroSlides.length).toBeGreaterThan(0);
  });
});

describe("the first administrator", () => {
  it("opens an empty directory rather than somebody else's", async () => {
    /* Standing in for the account bootstrapAdministrator() would create. The
       point is what they see, not how they got there. */
    const people = await listDirectoryPeople(
      accessFor(SCHOOL_TENANT_ID, "school-admin", "person-head"),
    );

    expect(people).toEqual([]);
  });

  it("opens an empty activity log", async () => {
    const events = await listAuditEvents(
      accessFor(SCHOOL_TENANT_ID, "school-admin", "person-head"),
    );

    expect(events).toEqual([]);
  });
});
