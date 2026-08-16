import { validateUpload } from "../domain/content/content-policy";
import { AuthorizationError } from "../domain/identity/authorization";
import { canPerform } from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import {
  LibraryError,
  cleanLibraryResource,
  isLibraryCategory,
  type LibraryCategory,
  type LibraryResourceInput,
} from "../domain/library/library";
import { scanUpload } from "../server/content-scan";
import { demoSchoolEnabled } from "../server/demo-school";
import {
  DEMO_TENANT_ID,
  demoLibrary,
} from "../domain/demo/greenfield";
import { placeholderPdf } from "./demo-media";
import { getMediaStore, getSchoolDatabase } from "./index";
import { ensureLearningFoundation } from "./learning-repository";

/* ==========================================================================
   The library

   A shelf rather than a lesson. Lesson resources belong to one lesson in one
   subject and are reached by working through it; these are the things a
   school hands out — past papers, textbooks, worksheets — and a learner comes
   looking for them directly.

   Two access rules, and they are deliberately different from everything else
   in this codebase:

   1. Reading is school-wide. Any active member may browse and download a
      published resource, including a guardian. A library that only showed a
      learner their own class's shelf would be a worse library, and the
      material is what the school has chosen to hand out anyway.
   2. Writing needs content:manage — the same permission that governs lesson
      material, held by teachers and administrators.

   The file itself goes through media_assets, so this inherits the upload
   validation, the virus scan and the object store rather than growing a
   second copy of each.
   ========================================================================== */

export type LibraryResource = {
  addedByName: string;
  category: LibraryCategory;
  createdAt: string;
  description: string;
  filename: string;
  id: string;
  sizeBytes: number;
  subjectId?: string;
  subjectName?: string;
  title: string;
  yearGroup?: string;
};

export type LibraryShelf = {
  /** Every category present, so the filter offers only shelves with something on them. */
  categories: LibraryCategory[];
  resources: LibraryResource[];
  /** Subjects with at least one resource, for the filter. */
  subjects: Array<{ id: string; name: string }>;
  yearGroups: string[];
};

function requireMember(access: AccessContext) {
  if (access.membershipStatus !== "active") {
    throw new AuthorizationError("An active school membership is required.");
  }
}

function requireLibrarian(access: AccessContext) {
  requireMember(access);
  if (!canPerform(access, "content:manage")) {
    throw new AuthorizationError(
      "Your school role does not allow adding to the library.",
    );
  }
}

/* ==========================================================================
   The demo school's shelf

   Seeded with real bytes rather than rows alone. A listing whose Download
   answers 404 is the same fiction as a question with no answer behind it, and
   both have already been removed from this codebase once — see the note at the
   top of db/demo-media.ts, whose placeholder PDF this reuses.

   Idempotent, and it never overwrites: the seed runs on every cold start, and
   replacing a file a school has since uploaded would be the demo destroying
   real work.
   ========================================================================== */
export async function seedDemoLibrary(): Promise<void> {
  if (!demoSchoolEnabled()) return;

  const database = await getSchoolDatabase();
  const existing = await database
    .prepare(
      `SELECT id FROM library_resources WHERE tenant_id = ? LIMIT 1`,
    )
    .bind(DEMO_TENANT_ID)
    .first<{ id: string }>();
  if (existing) return;

  /* Only subjects the learning seed actually created — a resource filed under
     a subject that does not exist would join to nothing and show no name. */
  const subjects = await database
    .prepare(`SELECT id, code FROM subjects WHERE tenant_id = ?`)
    .bind(DEMO_TENANT_ID)
    .all<{ code: string; id: string }>();
  const subjectByCode = new Map(
    (subjects.results ?? []).map((row) => [row.code, row.id]),
  );

  /* Whoever the school's staff seed created, rather than a hardcoded id: the
     uploader is a foreign key, and naming a person who may not exist yet
     makes the whole seed depend on the order two seeds happen to run in. */
  const librarian = await database
    .prepare(
      `SELECT id FROM people
      WHERE tenant_id = ? AND kind = 'staff' AND status = 'active'
      ORDER BY id
      LIMIT 1`,
    )
    .bind(DEMO_TENANT_ID)
    .first<{ id: string }>();
  if (!librarian) return;

  const store = await getMediaStore();

  for (const resource of demoLibrary) {
    const assetId = `${resource.id}:asset`;
    const objectKey = `demo/library/${resource.filename}`;
    const bytes = placeholderPdf(resource.title);

    /* The size on the row has to match the bytes behind it, or the download
       sends a content-length it cannot fill. */
    if (!(await store.get(objectKey))) {
      await store.put(objectKey, bytes, {
        httpMetadata: { contentType: "application/pdf" },
      });
    }

    await database.batch([
      database
        .prepare(
          `INSERT OR IGNORE INTO media_assets
            (id, tenant_id, offering_id, uploaded_by_person_id, kind,
             original_filename, content_type, size_bytes, object_key, status)
          VALUES (?, ?, NULL, ?, 'document', ?, 'application/pdf', ?, ?, 'ready')`,
        )
        .bind(
          assetId,
          DEMO_TENANT_ID,
          librarian.id,
          resource.filename,
          bytes.byteLength,
          objectKey,
        ),
      database
        .prepare(
          `INSERT OR IGNORE INTO library_resources
            (id, tenant_id, title, description, category, subject_id,
             year_group, media_asset_id, added_by_person_id, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`,
        )
        .bind(
          resource.id,
          DEMO_TENANT_ID,
          resource.title,
          resource.description,
          resource.category,
          resource.subjectCode
            ? (subjectByCode.get(resource.subjectCode) ?? null)
            : null,
          resource.yearGroup ?? null,
          assetId,
          librarian.id,
        ),
    ]);
  }
}

/**
 * The shelf, filtered.
 *
 * Filtering happens in SQL rather than in the browser because a school's
 * library grows without bound and the learners reading it are on metered
 * connections — sending four hundred listings so the page can hide most of
 * them is the wrong trade twice over.
 */
export async function listLibrary(
  access: AccessContext,
  filters: { category?: string; search?: string; subjectId?: string } = {},
): Promise<LibraryShelf> {
  requireMember(access);
  await ensureLearningFoundation();
  await seedDemoLibrary();
  const database = await getSchoolDatabase();

  const where: string[] = [
    "r.tenant_id = ?",
    "r.status = 'published'",
  ];
  const bindings: unknown[] = [access.tenantId];

  if (filters.category && isLibraryCategory(filters.category)) {
    where.push("r.category = ?");
    bindings.push(filters.category);
  }
  if (filters.subjectId) {
    where.push("r.subject_id = ?");
    bindings.push(filters.subjectId);
  }
  if (filters.search?.trim()) {
    /* Title, description and year group together: "2024" is the year printed
       on a past paper and "fractions" is a word in the description, and a
       learner types whichever they remember. */
    where.push(
      "(lower(r.title) LIKE ? OR lower(r.description) LIKE ? OR lower(COALESCE(r.year_group, '')) LIKE ?)",
    );
    const term = `%${filters.search.trim().toLowerCase()}%`;
    bindings.push(term, term, term);
  }

  const rows = await database
    .prepare(
      `SELECT
        r.id, r.title, r.description, r.category, r.subject_id, r.year_group,
        r.created_at,
        a.original_filename, a.size_bytes,
        s.name AS subject_name,
        p.first_name, p.last_name
      FROM library_resources r
      INNER JOIN media_assets a ON a.id = r.media_asset_id
      LEFT JOIN subjects s ON s.id = r.subject_id
      LEFT JOIN people p ON p.id = r.added_by_person_id
      WHERE ${where.join(" AND ")}
      ORDER BY r.created_at DESC`,
    )
    .bind(...bindings)
    .all<{
      category: LibraryCategory;
      created_at: string;
      description: string;
      first_name: string | null;
      id: string;
      last_name: string | null;
      original_filename: string;
      size_bytes: number;
      subject_id: string | null;
      subject_name: string | null;
      title: string;
      year_group: string | null;
    }>();

  const resources = (rows.results ?? []).map((row) => ({
    addedByName: [row.first_name, row.last_name].filter(Boolean).join(" "),
    category: row.category,
    createdAt: String(row.created_at),
    description: row.description,
    filename: row.original_filename,
    id: row.id,
    sizeBytes: Number(row.size_bytes),
    subjectId: row.subject_id ?? undefined,
    subjectName: row.subject_name ?? undefined,
    title: row.title,
    yearGroup: row.year_group ?? undefined,
  }));

  /* The filters describe the whole shelf, not the filtered view — otherwise
     narrowing to one category removes every other category from the filter
     and a learner cannot get back. */
  const facets = await loadFacets(database, access.tenantId);

  return { ...facets, resources };
}

async function loadFacets(
  database: Awaited<ReturnType<typeof getSchoolDatabase>>,
  tenantId: string,
) {
  const rows = await database
    .prepare(
      `SELECT DISTINCT r.category, r.subject_id, r.year_group, s.name AS subject_name
      FROM library_resources r
      LEFT JOIN subjects s ON s.id = r.subject_id
      WHERE r.tenant_id = ? AND r.status = 'published'`,
    )
    .bind(tenantId)
    .all<{
      category: LibraryCategory;
      subject_id: string | null;
      subject_name: string | null;
      year_group: string | null;
    }>();

  const categories = new Set<LibraryCategory>();
  const subjects = new Map<string, string>();
  const yearGroups = new Set<string>();

  for (const row of rows.results ?? []) {
    categories.add(row.category);
    if (row.subject_id && row.subject_name) {
      subjects.set(row.subject_id, row.subject_name);
    }
    if (row.year_group) yearGroups.add(row.year_group);
  }

  return {
    categories: [...categories].sort(),
    subjects: [...subjects].map(([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    yearGroups: [...yearGroups].sort(),
  };
}

/**
 * Puts a file on the shelf.
 *
 * The file is validated and scanned before anything is written, so a resource
 * row never points at bytes nobody has looked at.
 */
export async function addLibraryResource(
  access: AccessContext,
  input: LibraryResourceInput & { file: File },
): Promise<LibraryResource> {
  requireLibrarian(access);
  await ensureLearningFoundation();

  const clean = cleanLibraryResource(input);
  const contentType = input.file.type || "application/octet-stream";
  const validated = validateUpload({
    contentType,
    filename: input.file.name,
    /* Everything on a shelf is a document as far as the upload rules are
       concerned — a past paper is a PDF, a worksheet is a PDF or a Word file.
       An image or a video belongs in a lesson, not a catalogue. */
    kind: "document",
    sizeBytes: input.file.size,
  });

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  await scanUpload({ bytes, extension: validated.extension, kind: "document" });

  const database = await getSchoolDatabase();

  /* A subject that is not this school's would file the resource under a name
     nobody here recognises, and the browse query joins on it. */
  if (clean.subjectId) {
    const subject = await database
      .prepare(`SELECT id FROM subjects WHERE tenant_id = ? AND id = ? LIMIT 1`)
      .bind(access.tenantId, clean.subjectId)
      .first<{ id: string }>();
    if (!subject) {
      throw new LibraryError("That subject is not one this school teaches.");
    }
  }

  const assetId = crypto.randomUUID();
  const objectKey = [
    access.tenantId,
    "library",
    `${assetId}.${validated.extension}`,
  ].join("/");
  const bucket = await getMediaStore();
  await bucket.put(objectKey, bytes, {
    customMetadata: { assetId, tenantId: access.tenantId },
    httpMetadata: { contentType },
  });

  const resourceId = crypto.randomUUID();
  await database.batch([
    database
      .prepare(
        `INSERT INTO media_assets
          (id, tenant_id, offering_id, uploaded_by_person_id, kind,
           original_filename, content_type, size_bytes, object_key, status)
        VALUES (?, ?, NULL, ?, 'document', ?, ?, ?, ?, 'ready')`,
      )
      .bind(
        assetId,
        access.tenantId,
        access.actorPersonId,
        validated.filename,
        contentType,
        input.file.size,
        objectKey,
      ),
    database
      .prepare(
        `INSERT INTO library_resources
          (id, tenant_id, title, description, category, subject_id,
           year_group, media_asset_id, added_by_person_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`,
      )
      .bind(
        resourceId,
        access.tenantId,
        clean.title,
        clean.description,
        clean.category,
        clean.subjectId ?? null,
        clean.yearGroup ?? null,
        assetId,
        access.actorPersonId,
      ),
    database
      .prepare(
        `INSERT INTO audit_events
          (id, tenant_id, actor_person_id, action, entity_type, entity_id, metadata)
        VALUES (?, ?, ?, 'library.added', 'library-resource', ?, ?::jsonb)`,
      )
      .bind(
        crypto.randomUUID(),
        access.tenantId,
        access.actorPersonId,
        resourceId,
        JSON.stringify({ category: clean.category, title: clean.title }),
      ),
  ]);

  return {
    addedByName: "",
    category: clean.category,
    createdAt: new Date().toISOString(),
    description: clean.description,
    filename: validated.filename,
    id: resourceId,
    sizeBytes: input.file.size,
    subjectId: clean.subjectId,
    title: clean.title,
    yearGroup: clean.yearGroup,
  };
}

/**
 * Takes a resource off the shelf.
 *
 * Archived rather than deleted, and the file stays: a school that pulls last
 * year's paper by mistake the week before an examination needs it back, and
 * an audit trail that ends in a hole is not one.
 */
export async function archiveLibraryResource(
  access: AccessContext,
  resourceId: string,
): Promise<void> {
  requireLibrarian(access);
  const database = await getSchoolDatabase();
  const result = await database
    .prepare(
      `UPDATE library_resources SET status = 'archived'
      WHERE tenant_id = ? AND id = ?`,
    )
    .bind(access.tenantId, resourceId)
    .run();
  if (!result.meta?.changes) {
    throw new LibraryError("That resource is not in this school's library.");
  }
  await database
    .prepare(
      `INSERT INTO audit_events
        (id, tenant_id, actor_person_id, action, entity_type, entity_id, metadata)
      VALUES (?, ?, ?, 'library.archived', 'library-resource', ?, '{}'::jsonb)`,
    )
    .bind(
      crypto.randomUUID(),
      access.tenantId,
      access.actorPersonId,
      resourceId,
    )
    .run();
}

/**
 * The file itself.
 *
 * Its own route rather than the lesson media one, which requires the asset to
 * belong to an offering the reader can reach — a library asset belongs to no
 * offering by design, so that check would refuse every download.
 */
export async function getLibraryDownload(
  access: AccessContext,
  resourceId: string,
): Promise<Response> {
  requireMember(access);
  const database = await getSchoolDatabase();
  const row = await database
    .prepare(
      `SELECT a.object_key, a.content_type, a.size_bytes, a.original_filename
      FROM library_resources r
      INNER JOIN media_assets a ON a.id = r.media_asset_id
      WHERE r.tenant_id = ? AND r.id = ? AND r.status = 'published'
      LIMIT 1`,
    )
    .bind(access.tenantId, resourceId)
    .first<{
      content_type: string;
      object_key: string;
      original_filename: string;
      size_bytes: number;
    }>();
  if (!row) {
    throw new LibraryError("That resource is not in this school's library.");
  }

  const bucket = await getMediaStore();
  const object = await bucket.get(row.object_key);
  if (!object) {
    throw new LibraryError("That file is no longer stored.");
  }

  return new Response(object.body, {
    headers: {
      "cache-control": "private, max-age=300",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.original_filename)}`,
      "content-length": String(row.size_bytes),
      "content-type": row.content_type,
      "x-content-type-options": "nosniff",
    },
  });
}
