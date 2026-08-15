import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPostgresPool } from "../../db/postgres";
import { ensurePlatformReady } from "../../server/platform-ready";
import { listDirectoryPeople } from "../../db/people-repository";
import {
  DirectoryError,
  importDirectoryPeople,
  linkGuardianToLearner,
  listGuardianLinks,
  offboardDirectoryPerson,
  reinstateDirectoryPerson,
  revokeGuardianLink,
  updateDirectoryPerson,
} from "../../db/directory-repository";
import {
  createTimetablePeriod,
  loadSchoolTimetable,
  setTimetableEntry,
} from "../../db/timetable-repository";
import { parsePeopleImport } from "../../domain/identity/bulk-import";
import { DailyOperationsPolicyError } from "../../domain/operations/daily-operations";
import { accessFor, makeSchool, resetTestDatabase } from "./harness";

/* ==========================================================================
   Setting a school up without a database client

   Four things a school has to be able to do, none of which it could:

   correct a person, because the directory's whole write surface was one
   invitation form; bring a roll in at once, because it was one form per
   learner; link a guardian to a child already on the roll, because links were
   only ever written by admissions; and build a timetable, because periods and
   entries came from the operations seed and nothing else.
   ========================================================================== */

const OSU = "tenant-osu";
const CLASS_ID = "class-osu-jhs1";
const HEAD = "person-osu-head";

beforeAll(async () => {
  await ensurePlatformReady();
});

beforeEach(async () => {
  const database = getPostgresPool();
  await resetTestDatabase(database);

  const osu = await makeSchool(database, OSU, "Osu Community Basic School");
  await osu.addClass({ id: CLASS_ID, name: "JHS 1 Blue" });
  await osu.addStaff({ id: HEAD, name: "Ama Darko", role: "school-admin" });
});

function head() {
  return accessFor(OSU, "school-admin", HEAD);
}

describe("correcting a person", () => {
  it("changes their name, address and role", async () => {
    const { failed } = await importDirectoryPeople(head(), [
      {
        className: "",
        email: "kofi@example.gh",
        firstName: "Kofi",
        kind: "staff",
        lastName: "Mensa",
        phone: "",
        role: "teacher",
      },
    ]);
    expect(failed).toEqual([]);
    const before = await listDirectoryPeople(head());
    const person = before.find((row) => row.name === "Kofi Mensa")!;

    await updateDirectoryPerson(head(), person.id, {
      email: "kofi.mensah@example.gh",
      firstName: "Kofi",
      lastName: "Mensah",
      role: "class-teacher",
      scopeId: CLASS_ID,
      scopeType: "class",
    });

    const after = await listDirectoryPeople(head());
    const updated = after.find((row) => row.id === person.id)!;
    expect(updated.name).toBe("Kofi Mensah");
    expect(updated.email).toBe("kofi.mensah@example.gh");
    expect(updated.role).toBe("class-teacher");
  });

  it("refuses an address that is not one", async () => {
    await expect(
      updateDirectoryPerson(head(), HEAD, {
        email: "not-an-address",
        firstName: "Ama",
        lastName: "Darko",
        role: "school-admin",
      }),
    ).rejects.toBeInstanceOf(DirectoryError);
  });
});

describe("somebody who leaves", () => {
  it("loses access without losing their record", async () => {
    await importDirectoryPeople(head(), [
      {
        className: "",
        email: "leaver@example.gh",
        firstName: "Yaw",
        kind: "staff",
        lastName: "Owusu",
        phone: "",
        role: "teacher",
      },
    ]);
    const person = (await listDirectoryPeople(head())).find(
      (row) => row.email === "leaver@example.gh",
    )!;

    await offboardDirectoryPerson(head(), person.id, "Left at end of term");

    const after = (await listDirectoryPeople(head())).find(
      (row) => row.id === person.id,
    );
    expect(
      after,
      "the person stays on the record; only their access goes",
    ).toBeDefined();
    expect(after?.status).toBe("revoked");
  });

  it("can be brought back", async () => {
    await importDirectoryPeople(head(), [
      {
        className: "",
        email: "returner@example.gh",
        firstName: "Esi",
        kind: "staff",
        lastName: "Boateng",
        phone: "",
        role: "teacher",
      },
    ]);
    const person = (await listDirectoryPeople(head())).find(
      (row) => row.email === "returner@example.gh",
    )!;
    await offboardDirectoryPerson(head(), person.id, "Maternity leave");

    await reinstateDirectoryPerson(head(), person.id);

    const after = (await listDirectoryPeople(head())).find(
      (row) => row.id === person.id,
    );
    expect(after?.status).toBe("active");
  });

  it("is refused when it is the administrator themselves", async () => {
    /* An administrator locking themselves out of their own school at four on
       a Friday is not a thing to make possible by accident. */
    await expect(
      offboardDirectoryPerson(head(), HEAD, "Testing"),
    ).rejects.toBeInstanceOf(DirectoryError);
  });
});

describe("importing a roll", () => {
  it("adds everybody in one paste", async () => {
    const preview = parsePeopleImport(
      [
        "First name\tLast name\tEmail\tRole\tClass\tPhone",
        "Kofi\tAsante\tkofi@example.gh\tlearner\tJHS 1 Blue\t",
        "Adwoa\tNkrumah\tadwoa@example.gh\tlearner\tJHS 1 Blue\t",
        "Yaa\tAsante\tyaa@example.gh\tguardian\t\t0244000000",
      ].join("\n"),
    );

    const outcome = await importDirectoryPeople(head(), preview.accepted);

    expect(outcome.imported).toBe(3);
    expect(outcome.failed).toEqual([]);
    const people = await listDirectoryPeople(head());
    expect(people.filter((row) => row.kind === "learner")).toHaveLength(2);
  });

  it("imports the rows it can and reports the ones it cannot", async () => {
    /* The rule the scope is firmest about: a bulk import never silently
       skips a row. One clash must not cost the other hundred and nineteen. */
    await importDirectoryPeople(head(), [
      {
        className: "",
        email: "taken@example.gh",
        firstName: "Kofi",
        kind: "learner",
        lastName: "Asante",
        phone: "",
        role: "learner",
      },
    ]);

    const outcome = await importDirectoryPeople(head(), [
      {
        className: "",
        email: "taken@example.gh",
        firstName: "Kofi",
        kind: "learner",
        lastName: "Asante",
        phone: "",
        role: "learner",
      },
      {
        className: "",
        email: "fresh@example.gh",
        firstName: "Adwoa",
        kind: "learner",
        lastName: "Nkrumah",
        phone: "",
        role: "learner",
      },
    ]);

    expect(outcome.imported).toBe(1);
    expect(outcome.failed).toHaveLength(1);
    expect(outcome.failed[0].email).toBe("taken@example.gh");
  });
});

describe("linking a guardian to a child already on the roll", () => {
  async function twoPeople() {
    await importDirectoryPeople(head(), [
      {
        className: "JHS 1 Blue",
        email: "child@example.gh",
        firstName: "Kofi",
        kind: "learner",
        lastName: "Asante",
        phone: "",
        role: "learner",
      },
      {
        className: "",
        email: "parent@example.gh",
        firstName: "Yaa",
        kind: "guardian",
        lastName: "Asante",
        phone: "",
        role: "guardian",
      },
    ]);
    const people = await listDirectoryPeople(head());
    return {
      guardianId: people.find((row) => row.email === "parent@example.gh")!.id,
      learnerId: people.find((row) => row.email === "child@example.gh")!.id,
    };
  }

  it("creates the link admissions would have", async () => {
    const { guardianId, learnerId } = await twoPeople();

    await linkGuardianToLearner(head(), {
      guardianId,
      learnerId,
      relationship: "Mother",
    });

    const links = await listGuardianLinks(head());
    expect(links).toHaveLength(1);
    expect(links[0].relationship).toBe("Mother");
    expect(links[0].status).toBe("active");
  });

  it("refuses to link two learners to each other", async () => {
    const { learnerId } = await twoPeople();

    await expect(
      linkGuardianToLearner(head(), {
        guardianId: learnerId,
        learnerId,
        relationship: "Sibling",
      }),
    ).rejects.toBeInstanceOf(DirectoryError);
  });

  it("revokes with a reason, and re-linking reactivates rather than duplicating", async () => {
    const { guardianId, learnerId } = await twoPeople();
    await linkGuardianToLearner(head(), {
      guardianId,
      learnerId,
      relationship: "Mother",
    });
    const [link] = await listGuardianLinks(head());

    await revokeGuardianLink(head(), link.linkId, "Court order, Sept 2026");
    expect((await listGuardianLinks(head()))[0].status).toBe("revoked");

    await linkGuardianToLearner(head(), {
      guardianId,
      learnerId,
      relationship: "Mother",
    });

    const after = await listGuardianLinks(head());
    expect(
      after,
      "two rows for one relationship is a question nobody should have to answer",
    ).toHaveLength(1);
    expect(after[0].status).toBe("active");
  });

  it("insists on a reason for revoking", async () => {
    const { guardianId, learnerId } = await twoPeople();
    await linkGuardianToLearner(head(), {
      guardianId,
      learnerId,
      relationship: "Mother",
    });
    const [link] = await listGuardianLinks(head());

    await expect(
      revokeGuardianLink(head(), link.linkId, "   "),
    ).rejects.toBeInstanceOf(DirectoryError);
  });
});

describe("building a timetable", () => {
  it("creates periods and puts a subject in a slot", async () => {
    const osu = await makeSchool(
      getPostgresPool(),
      OSU,
      "Osu Community Basic School",
    );
    await osu.addStaff({ id: "person-teacher", name: "Kofi M", role: "teacher" });
    await osu.addOffering({
      classGroupId: CLASS_ID,
      className: "JHS 1 Blue",
      id: "offering-science",
      subjectCode: "SCI",
      subjectName: "Integrated Science",
      teacherPersonId: "person-teacher",
    });

    await createTimetablePeriod(head(), {
      endsAt: "08:40",
      kind: "lesson",
      name: "Period 1",
      startsAt: "08:00",
    });
    const { periods } = await loadSchoolTimetable(head());

    await setTimetableEntry(head(), {
      classGroupId: CLASS_ID,
      offeringId: "offering-science",
      periodId: periods[0].id,
      room: "Room 2",
      weekday: 1,
    });

    const after = await loadSchoolTimetable(head(), CLASS_ID);
    expect(after.entries).toHaveLength(1);
    expect(
      after.entries[0].subjectName,
      "the subject name comes off the offering rather than being typed",
    ).toBe("Integrated Science");
    expect(after.entries[0].teacherPersonId).toBe("person-teacher");
  });

  it("refuses a period that ends before it starts", async () => {
    await expect(
      createTimetablePeriod(head(), {
        endsAt: "08:00",
        kind: "lesson",
        name: "Impossible",
        startsAt: "08:40",
      }),
    ).rejects.toBeInstanceOf(DailyOperationsPolicyError);
  });

  it("refuses to put one teacher in two classes at once", async () => {
    const osu = await makeSchool(
      getPostgresPool(),
      OSU,
      "Osu Community Basic School",
    );
    await osu.addClass({ id: "class-osu-jhs2", name: "JHS 2 Gold" });
    await osu.addStaff({ id: "person-teacher", name: "Kofi M", role: "teacher" });
    await osu.addOffering({
      classGroupId: CLASS_ID,
      className: "JHS 1 Blue",
      id: "offering-a",
      subjectCode: "SCI",
      subjectName: "Integrated Science",
      teacherPersonId: "person-teacher",
    });
    await osu.addOffering({
      classGroupId: "class-osu-jhs2",
      className: "JHS 2 Gold",
      id: "offering-b",
      subjectCode: "SCI",
      subjectName: "Integrated Science",
      teacherPersonId: "person-teacher",
    });

    await createTimetablePeriod(head(), {
      endsAt: "08:40",
      kind: "lesson",
      name: "Period 1",
      startsAt: "08:00",
    });
    const { periods } = await loadSchoolTimetable(head());
    await setTimetableEntry(head(), {
      classGroupId: CLASS_ID,
      offeringId: "offering-a",
      periodId: periods[0].id,
      room: "Room 2",
      weekday: 1,
    });

    await expect(
      setTimetableEntry(head(), {
        classGroupId: "class-osu-jhs2",
        offeringId: "offering-b",
        periodId: periods[0].id,
        room: "Room 5",
        weekday: 1,
      }),
    ).rejects.toBeInstanceOf(DailyOperationsPolicyError);
  });

  it("clears a slot rather than leaving a blank subject in it", async () => {
    const osu = await makeSchool(
      getPostgresPool(),
      OSU,
      "Osu Community Basic School",
    );
    await osu.addOffering({
      classGroupId: CLASS_ID,
      className: "JHS 1 Blue",
      id: "offering-science",
      subjectCode: "SCI",
      subjectName: "Integrated Science",
    });
    await createTimetablePeriod(head(), {
      endsAt: "08:40",
      kind: "lesson",
      name: "Period 1",
      startsAt: "08:00",
    });
    const { periods } = await loadSchoolTimetable(head());
    await setTimetableEntry(head(), {
      classGroupId: CLASS_ID,
      offeringId: "offering-science",
      periodId: periods[0].id,
      room: "",
      weekday: 1,
    });

    await setTimetableEntry(head(), {
      classGroupId: CLASS_ID,
      offeringId: "",
      periodId: periods[0].id,
      room: "",
      weekday: 1,
    });

    expect((await loadSchoolTimetable(head(), CLASS_ID)).entries).toEqual([]);
  });
});
