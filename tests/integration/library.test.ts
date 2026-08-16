import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPostgresPool } from "../../db/postgres";
import { ensurePlatformReady } from "../../server/platform-ready";
import {
  addLibraryResource,
  archiveLibraryResource,
  listLibrary,
} from "../../db/library-repository";
import { AuthorizationError } from "../../domain/identity/authorization";
import { LibraryError } from "../../domain/library/library";
import { accessFor, makeSchool, resetTestDatabase } from "./harness";

/* ==========================================================================
   The library

   Its access rules are deliberately unlike everything else here — reading is
   school-wide rather than scoped to a class — so they are what most of this
   pins down, along with the tenancy boundary that has to hold regardless.
   ========================================================================== */

const OSU = "tenant-osu";
const LABONE = "tenant-labone";
const CLASS_ID = "class-osu-jhs1";
const OFFERING_ID = "offering-osu-science";
const TEACHER = "person-osu-teacher";
const LEARNER = "person-osu-learner";

beforeAll(async () => {
  await ensurePlatformReady();
});

beforeEach(async () => {
  const database = getPostgresPool();
  await resetTestDatabase(database);

  const osu = await makeSchool(database, OSU, "Osu Community Basic School");
  await osu.addClass({ id: CLASS_ID, name: "JHS 1 Blue" });
  await osu.addStaff({ id: TEACHER, name: "Ama Darko", role: "teacher" });
  await osu.addOffering({
    classGroupId: CLASS_ID,
    className: "JHS 1 Blue",
    id: OFFERING_ID,
    subjectCode: "SCI",
    subjectName: "Integrated Science",
    teacherPersonId: TEACHER,
  });
  await osu.addLearner({ classGroupId: CLASS_ID, id: LEARNER, name: "Kofi" });
});

function teacher() {
  return accessFor(OSU, "teacher", TEACHER, {
    subjectOfferingIds: [OFFERING_ID],
  });
}

function learner() {
  return accessFor(OSU, "learner", LEARNER, { classGroupIds: [CLASS_ID] });
}

function pdf(name = "bece-2024.pdf") {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e])], name, {
    type: "application/pdf",
  });
}

async function shelve(
  overrides: Partial<Parameters<typeof addLibraryResource>[1]> = {},
) {
  return addLibraryResource(teacher(), {
    category: "past-paper",
    description: "The 2024 paper.",
    file: pdf(),
    title: "BECE Integrated Science 2024",
    ...overrides,
  });
}

describe("putting something on the shelf", () => {
  it("catalogues a file a teacher adds", async () => {
    await shelve();
    const shelf = await listLibrary(teacher());

    expect(shelf.resources).toHaveLength(1);
    expect(shelf.resources[0]).toMatchObject({
      category: "past-paper",
      title: "BECE Integrated Science 2024",
    });
    expect(shelf.resources[0].sizeBytes).toBeGreaterThan(0);
  });

  /* Both are filters rather than permissions, so neither is required. */
  it("accepts a resource belonging to no subject and no year", async () => {
    const resource = await shelve({ title: "School dictionary" });
    expect(resource.subjectId).toBeUndefined();
    expect(resource.yearGroup).toBeUndefined();
  });

  it("refuses a subject from another school", async () => {
    const database = getPostgresPool();
    await makeSchool(database, LABONE, "Labone Model School");
    await expect(
      shelve({ subjectId: "tenant-labone-subject-sci" }),
    ).rejects.toBeInstanceOf(LibraryError);
  });

  it("refuses a listing with no title", async () => {
    await expect(shelve({ title: "  " })).rejects.toBeInstanceOf(LibraryError);
  });

  /* A shelf is not where a video goes; the upload rules for a document are
     what the library inherits. */
  it("refuses a file type the document rules do not allow", async () => {
    await expect(
      shelve({ file: new File([new Uint8Array([1, 2, 3])], "clip.mp4", { type: "video/mp4" }) }),
    ).rejects.toThrow();
  });

  it("writes an audit event naming what was added", async () => {
    await shelve();
    const database = getPostgresPool();
    const events = await database.query(
      "SELECT action, metadata FROM audit_events WHERE action = 'library.added'",
    );
    expect(events.rowCount).toBe(1);
    expect(events.rows[0].metadata).toMatchObject({
      title: "BECE Integrated Science 2024",
    });
  });
});

describe("who may read it", () => {
  /* The rule that makes it a library rather than a class folder. */
  it("shows a learner the whole school's shelf", async () => {
    await shelve();
    const shelf = await listLibrary(learner());
    expect(shelf.resources).toHaveLength(1);
  });

  it("shows nothing from another school", async () => {
    const database = getPostgresPool();
    await makeSchool(database, LABONE, "Labone Model School");
    await shelve();

    const outsider = accessFor(LABONE, "learner", "person-labone-learner", {
      classGroupIds: ["class-labone"],
    });
    const shelf = await listLibrary(outsider);
    expect(shelf.resources).toEqual([]);
  });

  it("refuses a learner trying to add to it", async () => {
    await expect(
      addLibraryResource(learner(), {
        category: "past-paper",
        description: "",
        file: pdf(),
        title: "Mine",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("finding something", () => {
  beforeEach(async () => {
    await shelve({ title: "BECE Mathematics 2024", yearGroup: "JHS 3" });
    await shelve({
      category: "textbook",
      description: "Covers the whole JHS syllabus.",
      title: "Integrated Science textbook",
    });
  });

  it("narrows to one shelf", async () => {
    const shelf = await listLibrary(teacher(), { category: "textbook" });
    expect(shelf.resources.map((r) => r.title)).toEqual([
      "Integrated Science textbook",
    ]);
  });

  it("matches a word in the title", async () => {
    const shelf = await listLibrary(teacher(), { search: "mathematics" });
    expect(shelf.resources).toHaveLength(1);
  });

  it("matches a word only the description has", async () => {
    const shelf = await listLibrary(teacher(), { search: "syllabus" });
    expect(shelf.resources.map((r) => r.title)).toEqual([
      "Integrated Science textbook",
    ]);
  });

  it("matches the year printed on a paper", async () => {
    const shelf = await listLibrary(teacher(), { search: "JHS 3" });
    expect(shelf.resources).toHaveLength(1);
  });

  /* Narrowing to one category must not remove the others from the filter, or
     a learner cannot get back. */
  it("keeps offering every shelf while one is selected", async () => {
    const shelf = await listLibrary(teacher(), { category: "textbook" });
    expect(shelf.categories).toEqual(
      expect.arrayContaining(["past-paper", "textbook"]),
    );
  });
});

describe("taking something off the shelf", () => {
  it("hides it from everyone without deleting it", async () => {
    const resource = await shelve();
    await archiveLibraryResource(teacher(), resource.id);

    expect((await listLibrary(learner())).resources).toEqual([]);

    const database = getPostgresPool();
    const rows = await database.query(
      "SELECT status FROM library_resources WHERE id = $1",
      [resource.id],
    );
    expect(rows.rows[0].status).toBe("archived");
  });

  it("refuses a learner", async () => {
    const resource = await shelve();
    await expect(
      archiveLibraryResource(learner(), resource.id),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("refuses a resource from another school", async () => {
    const database = getPostgresPool();
    await makeSchool(database, LABONE, "Labone Model School");
    const resource = await shelve();

    const outsider = accessFor(LABONE, "teacher", "person-labone-teacher");
    await expect(
      archiveLibraryResource(outsider, resource.id),
    ).rejects.toBeInstanceOf(LibraryError);
  });
});
