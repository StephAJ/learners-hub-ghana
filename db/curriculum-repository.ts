import {
  AuthorizationError,
  canPerform,
} from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import {
  CurriculumStandardError,
  normaliseStandard,
  type CurriculumStandardInput,
  type CurriculumStandardStatus,
} from "../domain/academic/standards";
import { ensurePlatformReady } from "../server/platform-ready";
import { getPostgresPool } from "./postgres";

/* ==========================================================================
   A school's own curriculum standards

   seedStandard() in db/learning-repository.ts was the only writer of
   curriculum_standards, so the four demo subjects had standards and the
   twenty-eight a school created for itself had none, permanently. The read
   side was already right — the table is offering-scoped and lessons link to
   it — so what follows is only the authoring that was never built.

   Writes need `academic:manage`, which school-admin and academic-admin hold
   and teachers do not: a teacher maps their lessons to the curriculum, they
   do not decide what the curriculum is.
   ========================================================================== */

export type OfferingStandard = {
  code: string;
  description: string;
  id: string;
  /* How many lessons map to this standard. The number is what makes retiring
     a considered act rather than a guess — and it is why the screen can say
     what will be affected before anything happens. */
  lessonCount: number;
  position: number;
  status: CurriculumStandardStatus;
  strand: string;
  subStrand: string;
};

export type StandardImportResult = {
  created: number;
  standards: OfferingStandard[];
  /* Codes already in this subject. Reported rather than treated as an error:
     re-pasting a curriculum after adding two lines to it is the normal way
     this gets used a second time. */
  skipped: string[];
};

export async function listOfferingStandards(
  access: AccessContext,
  offeringId: string,
): Promise<OfferingStandard[]> {
  requireRead(access);
  await ensurePlatformReady();
  return loadStandards(access, offeringId);
}

export async function createStandard(
  access: AccessContext,
  offeringId: string,
  input: CurriculumStandardInput,
): Promise<OfferingStandard[]> {
  requireManage(access);
  await ensurePlatformReady();
  const standard = normaliseStandard(input);
  await requireOffering(access, offeringId);

  const pool = await getPostgresPool();
  const clash = await pool.query(
    `SELECT id FROM curriculum_standards
     WHERE tenant_id = $1 AND offering_id = $2 AND lower(code) = lower($3)`,
    [access.tenantId, offeringId, standard.code],
  );
  if (clash.rowCount) {
    throw new CurriculumStandardError(
      `${standard.code} is already a standard in this subject.`,
    );
  }

  await pool.query(
    `INSERT INTO curriculum_standards
       (id, tenant_id, offering_id, code, strand, sub_strand, description,
        position, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
       COALESCE((SELECT MAX(position) FROM curriculum_standards
                 WHERE tenant_id = $2 AND offering_id = $3), 0) + 1,
       'active')`,
    [
      crypto.randomUUID(),
      access.tenantId,
      offeringId,
      standard.code,
      standard.strand,
      standard.subStrand,
      standard.description,
    ],
  );
  return loadStandards(access, offeringId);
}

export async function updateStandard(
  access: AccessContext,
  standardId: string,
  input: CurriculumStandardInput,
): Promise<OfferingStandard[]> {
  requireManage(access);
  await ensurePlatformReady();
  const standard = normaliseStandard(input);
  const existing = await requireStandard(access, standardId);

  /* Wording can be corrected; the code cannot be reassigned once lessons
     point at it. Changing it would leave those lessons claiming to cover a
     line of the curriculum that no longer says what it said — see the note
     in domain/academic/standards.ts. */
  if (
    standard.code.toLowerCase() !== existing.code.toLowerCase() &&
    existing.lessonCount > 0
  ) {
    throw new CurriculumStandardError(
      `${existing.code} is mapped by ${existing.lessonCount} ${
        existing.lessonCount === 1 ? "lesson" : "lessons"
      }, so its code cannot change. Retire it and add the replacement instead.`,
    );
  }

  const pool = await getPostgresPool();
  if (standard.code.toLowerCase() !== existing.code.toLowerCase()) {
    const clash = await pool.query(
      `SELECT id FROM curriculum_standards
       WHERE tenant_id = $1 AND offering_id = $2 AND lower(code) = lower($3)
         AND id <> $4`,
      [access.tenantId, existing.offeringId, standard.code, standardId],
    );
    if (clash.rowCount) {
      throw new CurriculumStandardError(
        `${standard.code} is already a standard in this subject.`,
      );
    }
  }

  await pool.query(
    `UPDATE curriculum_standards
     SET code = $1, strand = $2, sub_strand = $3, description = $4
     WHERE id = $5 AND tenant_id = $6`,
    [
      standard.code,
      standard.strand,
      standard.subStrand,
      standard.description,
      standardId,
      access.tenantId,
    ],
  );
  return loadStandards(access, existing.offeringId);
}

export async function setStandardStatus(
  access: AccessContext,
  standardId: string,
  status: CurriculumStandardStatus,
): Promise<OfferingStandard[]> {
  requireManage(access);
  await ensurePlatformReady();
  const existing = await requireStandard(access, standardId);
  const pool = await getPostgresPool();
  await pool.query(
    `UPDATE curriculum_standards SET status = $1 WHERE id = $2 AND tenant_id = $3`,
    [status, standardId, access.tenantId],
  );
  return loadStandards(access, existing.offeringId);
}

/**
 * Removes a standard outright.
 *
 * Only when nothing maps to it. A standard a lesson covers is retired, not
 * deleted: the link is a foreign key, and the honest record of a curriculum
 * that changed mid-year is that the old line existed and was withdrawn.
 */
export async function deleteStandard(
  access: AccessContext,
  standardId: string,
): Promise<OfferingStandard[]> {
  requireManage(access);
  await ensurePlatformReady();
  const existing = await requireStandard(access, standardId);
  if (existing.lessonCount > 0) {
    throw new CurriculumStandardError(
      `${existing.code} is mapped by ${existing.lessonCount} ${
        existing.lessonCount === 1 ? "lesson" : "lessons"
      }. Retire it instead, so those lessons keep their record.`,
    );
  }
  const pool = await getPostgresPool();
  await pool.query(
    `DELETE FROM curriculum_standards WHERE id = $1 AND tenant_id = $2`,
    [standardId, access.tenantId],
  );
  return loadStandards(access, existing.offeringId);
}

export async function reorderStandards(
  access: AccessContext,
  offeringId: string,
  orderedIds: string[],
): Promise<OfferingStandard[]> {
  requireManage(access);
  await ensurePlatformReady();
  await requireOffering(access, offeringId);
  const pool = await getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [index, id] of orderedIds.entries()) {
      await client.query(
        `UPDATE curriculum_standards SET position = $1
         WHERE id = $2 AND tenant_id = $3 AND offering_id = $4`,
        [index + 1, id, access.tenantId, offeringId],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return loadStandards(access, offeringId);
}

/**
 * A whole curriculum at once.
 *
 * Codes already present are skipped rather than overwritten. Re-pasting a
 * curriculum after two lines were added to it is the ordinary second use, and
 * an import that silently rewrote existing descriptions would undo any
 * correction a school had made by hand.
 */
export async function importStandards(
  access: AccessContext,
  offeringId: string,
  rows: CurriculumStandardInput[],
): Promise<StandardImportResult> {
  requireManage(access);
  await ensurePlatformReady();
  await requireOffering(access, offeringId);
  const standards = rows.map(normaliseStandard);

  const pool = await getPostgresPool();
  const existing = await pool.query<{ code: string }>(
    `SELECT code FROM curriculum_standards WHERE tenant_id = $1 AND offering_id = $2`,
    [access.tenantId, offeringId],
  );
  const taken = new Set(existing.rows.map((row) => row.code.toLowerCase()));
  const fresh = standards.filter((row) => !taken.has(row.code.toLowerCase()));
  const skipped = standards
    .filter((row) => taken.has(row.code.toLowerCase()))
    .map((row) => row.code);

  if (fresh.length > 0) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const start = await client.query<{ next: number }>(
        `SELECT COALESCE(MAX(position), 0) AS next FROM curriculum_standards
         WHERE tenant_id = $1 AND offering_id = $2`,
        [access.tenantId, offeringId],
      );
      let position = Number(start.rows[0]?.next ?? 0);
      for (const row of fresh) {
        position += 1;
        await client.query(
          `INSERT INTO curriculum_standards
             (id, tenant_id, offering_id, code, strand, sub_strand, description,
              position, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')`,
          [
            crypto.randomUUID(),
            access.tenantId,
            offeringId,
            row.code,
            row.strand,
            row.subStrand,
            row.description,
            position,
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    created: fresh.length,
    skipped,
    standards: await loadStandards(access, offeringId),
  };
}

async function loadStandards(
  access: AccessContext,
  offeringId: string,
): Promise<OfferingStandard[]> {
  const pool = await getPostgresPool();
  const result = await pool.query<{
    code: string;
    description: string;
    id: string;
    lesson_count: string;
    position: number;
    status: CurriculumStandardStatus;
    strand: string;
    sub_strand: string;
  }>(
    `SELECT
       s.id, s.code, s.strand, s.sub_strand, s.description, s.position, s.status,
       COUNT(link.id) AS lesson_count
     FROM curriculum_standards s
     LEFT JOIN lesson_standard_links link ON link.standard_id = s.id
     WHERE s.tenant_id = $1 AND s.offering_id = $2
     GROUP BY s.id
     ORDER BY s.position, s.code`,
    [access.tenantId, offeringId],
  );
  return result.rows.map((row) => ({
    code: row.code,
    description: row.description,
    id: row.id,
    lessonCount: Number(row.lesson_count),
    position: Number(row.position),
    status: row.status,
    strand: row.strand,
    subStrand: row.sub_strand,
  }));
}

async function requireOffering(access: AccessContext, offeringId: string) {
  const pool = await getPostgresPool();
  const offering = await pool.query(
    `SELECT id FROM subject_offerings
     WHERE id = $1 AND tenant_id = $2 AND status = 'active'`,
    [offeringId, access.tenantId],
  );
  if (!offering.rowCount) {
    throw new CurriculumStandardError(
      "That subject is not one this school teaches.",
    );
  }
}

async function requireStandard(access: AccessContext, standardId: string) {
  const pool = await getPostgresPool();
  const result = await pool.query<{
    code: string;
    lesson_count: string;
    offering_id: string;
  }>(
    `SELECT s.code, s.offering_id, COUNT(link.id) AS lesson_count
     FROM curriculum_standards s
     LEFT JOIN lesson_standard_links link ON link.standard_id = s.id
     WHERE s.id = $1 AND s.tenant_id = $2
     GROUP BY s.id`,
    [standardId, access.tenantId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new CurriculumStandardError("That standard was not found.");
  }
  return {
    code: row.code,
    lessonCount: Number(row.lesson_count),
    offeringId: row.offering_id,
  };
}

function requireManage(access: AccessContext) {
  if (!canPerform(access, "academic:manage")) {
    throw new AuthorizationError(
      "Only a school or academic administrator changes the curriculum.",
    );
  }
}

function requireRead(access: AccessContext) {
  if (!canPerform(access, "people:read")) {
    throw new AuthorizationError(
      "Your school role cannot read the curriculum.",
    );
  }
}
