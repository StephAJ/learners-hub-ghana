import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPostgresPool } from "../../db/postgres";
import { ensurePlatformReady } from "../../server/platform-ready";
import {
  addLibraryResource,
  archiveLibraryResource,
  getLibraryDownload,
  listLibrary,
  seedDemoLibrary,
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

const DEMO_TENANT = "tenant-greenfield";
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

describe("the demo school's shelf", () => {
  /* Seeded rows are only half of it. The reason this is an integration test
     rather than a dataset one is that the file has to actually be there — a
     listing whose Download answers 404 is the fiction this codebase has had
     to remove twice already.

     The seed is called directly rather than through listLibrary: that runs
     the whole learning foundation first, which the harness deliberately
     disables so a demo school does not seed itself into every fixture. */
  async function seedShelf() {
    process.env.DEMO_SCHOOL = "true";
    const database = getPostgresPool();
    await database.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [DEMO_TENANT, "Greenfield Academy", "greenfield"],
    );
    await database.query(
      `INSERT INTO subjects (id, tenant_id, code, name)
       VALUES ('demo-subject-sci', $1, 'SCI', 'Integrated Science')
       ON CONFLICT (id) DO NOTHING`,
      [DEMO_TENANT],
    );
    /* The uploader is a foreign key, and the seed resolves whoever the staff
       seed created rather than naming one. */
    await database.query(
      `INSERT INTO people (id, tenant_id, kind, first_name, last_name, status)
       VALUES ('demo-person-head', $1, 'staff', 'Mary', 'Asante', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [DEMO_TENANT],
    );
    await seedDemoLibrary();
    return accessFor(DEMO_TENANT, "academic-admin", "demo-person-head");
  }

  it("writes a real, openable file behind every listing", async () => {
    try {
      const reader = await seedShelf();
      const database = getPostgresPool();
      const rows = await database.query<{ id: string; title: string }>(
        `SELECT id, title FROM library_resources WHERE tenant_id = $1`,
        [DEMO_TENANT],
      );
      expect(rows.rowCount).toBeGreaterThan(0);

      for (const row of rows.rows) {
        const response = await getLibraryDownload(reader, row.id);
        expect(response.status, row.title).toBe(200);

        const body = await response.arrayBuffer();
        expect(body.byteLength, row.title).toBeGreaterThan(0);
        /* The size on the row has to match the bytes behind it, or the
           response promises a content-length it cannot fill. */
        expect(Number(response.headers.get("content-length")), row.title).toBe(
          body.byteLength,
        );
        /* Openable, not merely non-empty. */
        expect(new TextDecoder().decode(body.slice(0, 5)), row.title).toBe(
          "%PDF-",
        );
      }
    } finally {
      delete process.env.DEMO_SCHOOL;
    }
  });

  /* A dictionary and a storybook belong to anybody. A demo where every
     listing is filed identically would not show that both filters are
     optional. */
  it("files some resources under no subject and no year", async () => {
    try {
      await seedShelf();
      const database = getPostgresPool();
      const loose = await database.query(
        `SELECT id FROM library_resources
         WHERE tenant_id = $1 AND subject_id IS NULL AND year_group IS NULL`,
        [DEMO_TENANT],
      );
      expect(loose.rowCount).toBeGreaterThan(0);
    } finally {
      delete process.env.DEMO_SCHOOL;
    }
  });

  it("adds nothing when the demo school is off", async () => {
    delete process.env.DEMO_SCHOOL;
    await seedDemoLibrary();
    const database = getPostgresPool();
    const rows = await database.query(
      `SELECT id FROM library_resources WHERE tenant_id = $1`,
      [DEMO_TENANT],
    );
    expect(rows.rowCount).toBe(0);
  });
});
