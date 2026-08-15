import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPostgresPool } from "../../db/postgres";
import { ensurePlatformReady } from "../../server/platform-ready";
import { listDirectoryPeople } from "../../db/people-repository";
import { getGuardianReportWorkspace } from "../../db/reporting-repository";
import { getGuardianSchoolDay } from "../../db/operations-repository";
import { AuthorizationError } from "../../domain/identity/authorization";
import { accessFor, makeSchool, resetTestDatabase } from "./harness";

/* ==========================================================================
   Two schools on one deployment, and the wall between them

   "Tenant A data never appears in tenant B search, job, cache, file, analytics
   or export" is the first of the product's mandatory go-live scenarios, and
   until now nothing checked it: the tenant filter is a WHERE clause in a
   repository, and no test had ever run one.

   Everything here uses two schools deliberately. A single-school test cannot
   fail in the way that matters — a missing `tenant_id = ?` looks perfectly
   correct until there is a second school's row to find.
   ========================================================================== */

const OSU = "tenant-osu";
const TEMA = "tenant-tema";

beforeAll(async () => {
  await ensurePlatformReady();
});

beforeEach(async () => {
  const database = getPostgresPool();
  await resetTestDatabase(database);

  const osu = await makeSchool(database, OSU, "Osu Community Basic School");
  await osu.addClass({ id: "class-osu-jhs1", name: "JHS 1 Blue" });
  await osu.addStaff({
    id: "person-osu-head",
    name: "Ama Darko",
    role: "school-admin",
  });
  await osu.addLearner({
    classGroupId: "class-osu-jhs1",
    id: "person-osu-learner",
    name: "Kofi Asante",
  });
  await osu.addGuardian({ id: "person-osu-guardian", name: "Yaa Asante" });
  await osu.linkGuardian({
    guardianId: "person-osu-guardian",
    id: "link-osu",
    learnerId: "person-osu-learner",
  });

  const tema = await makeSchool(database, TEMA, "Tema Model School");
  await tema.addClass({ id: "class-tema-jhs1", name: "JHS 1 Gold" });
  await tema.addStaff({
    id: "person-tema-head",
    name: "Kwesi Mensah",
    role: "school-admin",
  });
  await tema.addLearner({
    classGroupId: "class-tema-jhs1",
    id: "person-tema-learner",
    name: "Efua Boateng",
  });
});

describe("the school directory", () => {
  it("shows a head only the people at their own school", async () => {
    const people = await listDirectoryPeople(
      accessFor(OSU, "school-admin", "person-osu-head"),
    );

    const names = people.map((person) => person.name);
    expect(names).toContain("Kofi Asante");
    expect(
      names,
      "a learner at another school is not this school's to list",
    ).not.toContain("Efua Boateng");
  });

  it("shows each head a different directory", async () => {
    const [osuPeople, temaPeople] = await Promise.all([
      listDirectoryPeople(accessFor(OSU, "school-admin", "person-osu-head")),
      listDirectoryPeople(accessFor(TEMA, "school-admin", "person-tema-head")),
    ]);

    const osuIds = osuPeople.map((person) => person.id);
    const temaIds = temaPeople.map((person) => person.id);
    expect(osuIds.some((id) => temaIds.includes(id))).toBe(false);
  });
});

describe("a guardian", () => {
  it("reads the child they are linked to", async () => {
    const workspace = await getGuardianReportWorkspace(
      accessFor(OSU, "guardian", "person-osu-guardian", {
        linkedLearnerIds: ["person-osu-learner"],
      }),
    );

    expect(workspace.child.name).toBe("Kofi Asante");
  });

  it("is refused a learner at another school, even when asked for by id", async () => {
    /* The context claims the link, which is the shape of the attack worth
       testing: the repository must not take the caller's word for who their
       children are when the row is in a different tenant. */
    await expect(
      getGuardianReportWorkspace(
        accessFor(OSU, "guardian", "person-osu-guardian", {
          linkedLearnerIds: ["person-tema-learner"],
        }),
        "person-tema-learner",
      ),
    ).rejects.toThrow();
  });

  it("is refused an unlinked learner at their own school", async () => {
    const database = getPostgresPool();
    const osu = await makeSchool(database, OSU, "Osu Community Basic School");
    await osu.addLearner({
      classGroupId: "class-osu-jhs1",
      id: "person-osu-other",
      name: "Adwoa Nkrumah",
    });

    await expect(
      getGuardianReportWorkspace(
        accessFor(OSU, "guardian", "person-osu-guardian", {
          linkedLearnerIds: ["person-osu-learner"],
        }),
        "person-osu-other",
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("a learner", () => {
  it("cannot open another learner's school day", async () => {
    await expect(
      getGuardianSchoolDay(
        accessFor(OSU, "learner", "person-osu-learner"),
        "person-osu-other-learner",
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("the report card header", () => {
  it("names the class the child is actually in", async () => {
    /* Both of these were string literals — "JHS 2 Gold" and "Greenfield
       Academy" — so every guardian in every school read the same two. */
    const workspace = await getGuardianReportWorkspace(
      accessFor(OSU, "guardian", "person-osu-guardian", {
        linkedLearnerIds: ["person-osu-learner"],
      }),
    );

    expect(workspace.child.className).toBe("JHS 1 Blue");
    expect(workspace.schoolName).toBe("Osu Community Basic School");
  });

  it("names a different school for a different tenant", async () => {
    const database = getPostgresPool();
    const tema = await makeSchool(database, TEMA, "Tema Model School");
    await tema.addGuardian({ id: "person-tema-guardian", name: "Kojo Boateng" });
    await tema.linkGuardian({
      guardianId: "person-tema-guardian",
      id: "link-tema",
      learnerId: "person-tema-learner",
    });

    const workspace = await getGuardianReportWorkspace(
      accessFor(TEMA, "guardian", "person-tema-guardian", {
        linkedLearnerIds: ["person-tema-learner"],
      }),
    );

    expect(workspace.child.className).toBe("JHS 1 Gold");
    expect(workspace.schoolName).toBe("Tema Model School");
  });
});
