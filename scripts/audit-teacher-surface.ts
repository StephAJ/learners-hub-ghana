/**
 * Runs every teacher action against a real database and reports what works.
 *
 * Not a vitest test: the suite is deliberately pure-domain and runs in under a
 * second with no server, and gating a test on a live PostgreSQL would make
 * `npm test` conditional on Docker being up. This is the other thing — an
 * integration smoke check you run against a database on purpose.
 *
 *   DATABASE_URL=postgresql://learners_hub:learners_hub@127.0.0.1:5432/learners_hub \
 *     npx tsx scripts/audit-teacher-surface.ts
 *
 * It exists because reading the code said Duplicate was wired correctly —
 * client handler, route, repository function all present — and running it said
 * "Every attached media asset must be ready in this subject" on every lesson in
 * the subject. Only one of those two answers was true.
 *
 * Read-only apart from the duplicate, which is created and then deleted.
 */
import type { AccessContext } from "../domain/identity/types";

const access: AccessContext = {
  actorPersonId: "person-grace",
  classGroupIds: ["class-jhs2-gold"],
  classLearnerIds: [],
  linkedLearnerIds: [],
  membershipStatus: "active",
  role: "teacher",
  subjectOfferingIds: ["offering-science-jhs2"],
  tenantId: "tenant-greenfield",
};

let failures = 0;

async function check(label: string, run: () => Promise<unknown>) {
  try {
    await run();
    console.log(`  PASS  ${label}`);
  } catch (error) {
    failures += 1;
    console.log(
      `  FAIL  ${label}\n        ${
        error instanceof Error ? `${error.name}: ${error.message}` : error
      }`,
    );
  }
}

async function main() {
  if (!process.env.DATABASE_URL && !process.env.PGHOST) {
    console.error(
      "Set DATABASE_URL (or the PG* variables) to the database to audit.",
    );
    process.exit(2);
  }

  const learning = await import("../db/learning-repository");
  const content = await import("../db/content-repository");
  const assessment = await import("../db/assessment-repository");
  const operations = await import("../db/operations-repository");
  const reporting = await import("../db/reporting-repository");
  const { getPostgresPool } = await import("../db/postgres");

  const workspace = await learning.listTeacherLessonWorkspace(access);
  const published = workspace.lessons.find(
    (lesson) => lesson.status === "published",
  );

  console.log("\nMy subjects");
  await check("load the lesson workspace", () =>
    learning.listTeacherLessonWorkspace(access),
  );
  let duplicateId: string | undefined;
  await check("duplicate a published lesson", async () => {
    if (!published) throw new Error("no published lesson to duplicate");
    const copy = await learning.duplicatePersistentLesson(
      access,
      published.id,
    );
    duplicateId = copy.id;
  });
  await check("open the subject in the learner player", () =>
    learning.getLearnerSubject(access, "offering-science-jhs2"),
  );

  console.log("\nContent library");
  await check("load the content workspace", () =>
    content.getTeacherContentWorkspace(access),
  );

  console.log("\nAssessments");
  await check("load the assessment workspace", () =>
    assessment.listTeacherAssessmentWorkspace(access),
  );

  console.log("\nMy classes");
  await check("load the daily class workspace", () =>
    operations.getTeacherOperationsWorkspace(access),
  );

  console.log("\nMarkbook");
  await check("load the markbook", () =>
    reporting.listTeacherGradebookWorkspace(access),
  );

  console.log("\nLesson attachments");
  await check("every attached asset and activity resolves", async () => {
    const dangling = await getPostgresPool().query<{
      id: string;
      missing: string;
    }>(
      `SELECT b.id, b.config::jsonb->>'mediaAssetId' AS missing
         FROM lesson_blocks b
        WHERE b.config::jsonb->>'mediaAssetId' IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM media_assets a
             WHERE a.id = b.config::jsonb->>'mediaAssetId'
               AND a.status = 'ready')
        UNION ALL
       SELECT b.id, b.config::jsonb->>'activityId'
         FROM lesson_blocks b
        WHERE b.config::jsonb->>'activityId' IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM interactive_activities a
             WHERE a.id = b.config::jsonb->>'activityId'
               AND a.status = 'launchable')`,
    );
    if (dangling.rowCount) {
      throw new Error(
        `${dangling.rowCount} block(s) name something that is not there: ${dangling.rows
          .map((row) => row.missing)
          .join(", ")}`,
      );
    }
  });

  /* The audit leaves the database as it found it. */
  if (duplicateId) {
    const pool = getPostgresPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM lesson_standard_links WHERE lesson_id = $1`,
        [duplicateId],
      );
      await client.query(
        `DELETE FROM lesson_release_rules WHERE lesson_id = $1`,
        [duplicateId],
      );
      await client.query(
        `DELETE FROM lesson_blocks WHERE lesson_version_id IN
           (SELECT id FROM lesson_versions WHERE lesson_id = $1)`,
        [duplicateId],
      );
      await client.query(`DELETE FROM lesson_progress WHERE lesson_id = $1`, [
        duplicateId,
      ]);
      await client.query(`DELETE FROM lesson_versions WHERE lesson_id = $1`, [
        duplicateId,
      ]);
      await client.query(
        `DELETE FROM audit_events WHERE entity_type = 'lesson' AND entity_id = $1`,
        [duplicateId],
      );
      await client.query(`DELETE FROM lessons WHERE id = $1`, [duplicateId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      console.log(`\n  note: the duplicate ${duplicateId} could not be removed`);
      console.log(`        ${error instanceof Error ? error.message : error}`);
    } finally {
      client.release();
    }
  }

  console.log(
    failures === 0
      ? "\nEverything the teacher app offers, runs.\n"
      : `\n${failures} teacher action(s) failed.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
