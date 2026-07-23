import { canPerform, canTeachOffering, AuthorizationError } from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import {
  addLessonBlock,
  createLessonDraft,
  LessonPolicyError,
  publishLesson,
  recordLessonProgress,
} from "../domain/learning/lessons";
import type {
  Lesson,
  LessonBlock,
  LessonBlockType,
  LessonProgress,
} from "../domain/learning/types";
import { getD1Database } from "./index";

const TENANT_ID = "tenant-greenfield";
export const SCIENCE_OFFERING_ID = "offering-science-jhs2";

export type LessonSummary = {
  blockCount: number;
  id: string;
  objectiveCount: number;
  status: Lesson["status"];
  title: string;
  unitId: string;
  unitTitle: string;
  updatedAt: string;
  version: number;
};

export type TeacherLessonWorkspace = {
  className: string;
  code: string;
  coveragePercent: number;
  lessons: LessonSummary[];
  offeringId: string;
  subjectName: string;
  units: Array<{ id: string; lessonCount: number; title: string }>;
};

export type LearnerLesson = {
  blocks: LessonBlock[];
  id: string;
  objectives: string[];
  progressPercent: number;
  summary: string;
  title: string;
  unitTitle: string;
  version: number;
};

export type LearnerSubject = {
  className: string;
  code: string;
  lessons: LearnerLesson[];
  offeringId: string;
  subjectName: string;
  teacherName: string;
};

export type CreateDraftInput = {
  blockContent: string;
  blockTitle: string;
  blockType: LessonBlockType;
  objective: string;
  offeringId: string;
  summary: string;
  title: string;
  unitId: string;
};

export async function listTeacherLessonWorkspace(
  access: AccessContext,
): Promise<TeacherLessonWorkspace> {
  requireLessonPermission(access);
  await ensureLearningSeed();
  const offering = await findAccessibleOffering(access);
  const database = await getD1Database();
  const unitsResult = await database
    .prepare(
      `SELECT
        u.id,
        u.title,
        COUNT(l.id) AS lesson_count
      FROM curriculum_units u
      LEFT JOIN lessons l ON l.unit_id = u.id
      WHERE u.tenant_id = ? AND u.offering_id = ?
      GROUP BY u.id, u.title, u.position
      ORDER BY u.position`,
    )
    .bind(access.tenantId, offering.offering_id)
    .all<{ id: string; lesson_count: number; title: string }>();
  const lessonsResult = await database
    .prepare(
      `SELECT
        l.id,
        l.status,
        l.current_version,
        l.updated_at,
        v.title,
        v.objectives,
        u.id AS unit_id,
        u.title AS unit_title,
        COUNT(b.id) AS block_count
      FROM lessons l
      INNER JOIN lesson_versions v
        ON v.lesson_id = l.id AND v.version = l.current_version
      INNER JOIN curriculum_units u ON u.id = l.unit_id
      LEFT JOIN lesson_blocks b ON b.lesson_version_id = v.id
      WHERE l.tenant_id = ? AND l.offering_id = ?
      GROUP BY l.id, v.id, u.id
      ORDER BY u.position, l.created_at`,
    )
    .bind(access.tenantId, offering.offering_id)
    .all<{
      block_count: number;
      current_version: number;
      id: string;
      objectives: string;
      status: Lesson["status"];
      title: string;
      unit_id: string;
      unit_title: string;
      updated_at: string;
    }>();

  const lessons = lessonsResult.results.map(toLessonSummary);
  const publishedCount = lessons.filter(
    (lesson) => lesson.status === "published",
  ).length;

  return {
    className: offering.class_name,
    code: offering.code,
    coveragePercent: lessons.length
      ? Math.round((publishedCount / lessons.length) * 100)
      : 0,
    lessons,
    offeringId: offering.offering_id,
    subjectName: offering.subject_name,
    units: unitsResult.results.map((unit) => ({
      id: unit.id,
      lessonCount: Number(unit.lesson_count),
      title: unit.title,
    })),
  };
}

export async function createPersistentLessonDraft(
  access: AccessContext,
  input: CreateDraftInput,
): Promise<LessonSummary> {
  await ensureLearningSeed();
  validateDraftInput(input);
  const scopedAccess = await withTeacherAssignments(access);
  if (!canTeachOffering(scopedAccess, input.offeringId)) {
    throw new AuthorizationError(
      "You are not assigned to this subject offering.",
    );
  }
  const database = await getD1Database();
  await requireOfferingUnit(
    database,
    access.tenantId,
    input.offeringId,
    input.unitId,
  );

  const lessonId = crypto.randomUUID();
  const versionId = `${lessonId}:v0`;
  const draft = addLessonBlock(
    createLessonDraft({
      authorPersonId: access.actorPersonId,
      id: lessonId,
      objectives: [input.objective.trim()],
      offeringId: input.offeringId,
      summary: input.summary.trim(),
      tenantId: access.tenantId,
      title: input.title.trim(),
      unitId: input.unitId,
    }),
    {
      content: input.blockContent.trim(),
      id: crypto.randomUUID(),
      ready: true,
      title: input.blockTitle.trim(),
      type: input.blockType,
    },
  );

  await database.batch([
    database
      .prepare(
        `INSERT INTO lessons
          (id, tenant_id, offering_id, unit_id, author_person_id, status, current_version)
        VALUES (?, ?, ?, ?, ?, 'draft', 0)`,
      )
      .bind(
        draft.id,
        draft.tenantId,
        draft.offeringId,
        draft.unitId,
        draft.authorPersonId,
      ),
    database
      .prepare(
        `INSERT INTO lesson_versions
          (id, tenant_id, lesson_id, version, title, summary, objectives, status, created_by_person_id)
        VALUES (?, ?, ?, 0, ?, ?, ?, 'draft', ?)`,
      )
      .bind(
        versionId,
        draft.tenantId,
        draft.id,
        draft.title,
        draft.summary,
        JSON.stringify(draft.objectives),
        draft.authorPersonId,
      ),
    database
      .prepare(
        `INSERT INTO lesson_blocks
          (id, tenant_id, lesson_version_id, type, position, title, content, ready)
        VALUES (?, ?, ?, ?, 1, ?, ?, 1)`,
      )
      .bind(
        draft.blocks[0].id,
        draft.tenantId,
        versionId,
        draft.blocks[0].type,
        draft.blocks[0].title,
        draft.blocks[0].content,
      ),
    auditStatement(
      database,
      access,
      "lesson.draft_created",
      draft.id,
      { offeringId: draft.offeringId },
    ),
  ]);

  return {
    blockCount: 1,
    id: draft.id,
    objectiveCount: draft.objectives.length,
    status: draft.status,
    title: draft.title,
    unitId: draft.unitId,
    unitTitle: await findUnitTitle(database, draft.unitId),
    updatedAt: new Date().toISOString(),
    version: draft.version,
  };
}

export async function publishPersistentLesson(
  access: AccessContext,
  lessonId: string,
): Promise<LessonSummary> {
  await ensureLearningSeed();
  const scopedAccess = await withTeacherAssignments(access);
  const database = await getD1Database();
  const draft = await loadLesson(database, access.tenantId, lessonId);
  const published = publishLesson(
    scopedAccess,
    draft,
    new Date().toISOString(),
  );
  const publishedVersionId = `${lessonId}:v${published.version}`;

  await database.batch([
    database
      .prepare(
        `INSERT INTO lesson_versions
          (id, tenant_id, lesson_id, version, title, summary, objectives, status, published_at, created_by_person_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)`,
      )
      .bind(
        publishedVersionId,
        published.tenantId,
        published.id,
        published.version,
        published.title,
        published.summary,
        JSON.stringify(published.objectives),
        published.publishedAt,
        published.authorPersonId,
      ),
    ...published.blocks.map((block) =>
      database
        .prepare(
          `INSERT INTO lesson_blocks
            (id, tenant_id, lesson_version_id, type, position, title, content, ready)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          published.tenantId,
          publishedVersionId,
          block.type,
          block.position,
          block.title,
          block.content,
          block.ready ? 1 : 0,
        ),
    ),
    database
      .prepare(
        `UPDATE lessons
        SET status = 'published', current_version = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?`,
      )
      .bind(published.version, published.id, published.tenantId),
    auditStatement(
      database,
      access,
      "lesson.published",
      published.id,
      { version: published.version },
    ),
  ]);

  return {
    blockCount: published.blocks.length,
    id: published.id,
    objectiveCount: published.objectives.length,
    status: published.status,
    title: published.title,
    unitId: published.unitId,
    unitTitle: await findUnitTitle(database, published.unitId),
    updatedAt: published.publishedAt ?? "",
    version: published.version,
  };
}

export async function getLearnerSubject(
  access: AccessContext,
  offeringId: string,
): Promise<LearnerSubject> {
  if (access.membershipStatus !== "active") {
    throw new AuthorizationError("An active school membership is required.");
  }
  await ensureLearningSeed();
  const database = await getD1Database();
  const offering = await database
    .prepare(
      `SELECT
        o.id AS offering_id,
        o.class_name,
        s.code,
        s.name AS subject_name,
        COALESCE(p.first_name || ' ' || p.last_name, 'Assigned teacher') AS teacher_name
      FROM subject_offerings o
      INNER JOIN subjects s ON s.id = o.subject_id
      LEFT JOIN teacher_assignments a
        ON a.offering_id = o.id AND a.status = 'active'
      LEFT JOIN people p ON p.id = a.teacher_person_id
      WHERE o.id = ? AND o.tenant_id = ? AND o.status = 'active'
      LIMIT 1`,
    )
    .bind(offeringId, access.tenantId)
    .first<{
      class_name: string;
      code: string;
      offering_id: string;
      subject_name: string;
      teacher_name: string;
    }>();
  if (!offering) {
    throw new Error("Subject offering was not found.");
  }

  const lessonRows = await database
    .prepare(
      `SELECT
        l.id,
        l.current_version,
        v.id AS version_id,
        v.title,
        v.summary,
        v.objectives,
        u.title AS unit_title,
        COALESCE(pr.percent, 0) AS progress_percent
      FROM lessons l
      INNER JOIN lesson_versions v
        ON v.lesson_id = l.id AND v.version = l.current_version
      INNER JOIN curriculum_units u ON u.id = l.unit_id
      LEFT JOIN lesson_progress pr
        ON pr.lesson_id = l.id
        AND pr.lesson_version = l.current_version
        AND pr.learner_person_id = ?
      WHERE l.tenant_id = ?
        AND l.offering_id = ?
        AND l.status = 'published'
      ORDER BY u.position, l.created_at`,
    )
    .bind(access.actorPersonId, access.tenantId, offeringId)
    .all<{
      current_version: number;
      id: string;
      objectives: string;
      progress_percent: number;
      summary: string;
      title: string;
      unit_title: string;
      version_id: string;
    }>();

  const lessons = await Promise.all(
    lessonRows.results.map(async (row) => ({
      blocks: await loadVersionBlocks(database, access.tenantId, row.version_id),
      id: row.id,
      objectives: parseObjectives(row.objectives),
      progressPercent: Number(row.progress_percent),
      summary: row.summary,
      title: row.title,
      unitTitle: row.unit_title,
      version: row.current_version,
    })),
  );

  return {
    className: offering.class_name,
    code: offering.code,
    lessons,
    offeringId: offering.offering_id,
    subjectName: offering.subject_name,
    teacherName: offering.teacher_name,
  };
}

export async function saveLessonProgress(
  access: AccessContext,
  lessonId: string,
  lessonVersion: number,
  percent: number,
): Promise<LessonProgress> {
  await ensureLearningSeed();
  if (access.membershipStatus !== "active") {
    throw new AuthorizationError("An active school membership is required.");
  }
  const database = await getD1Database();
  const publishedVersion = await database
    .prepare(
      `SELECT v.id
      FROM lessons l
      INNER JOIN lesson_versions v
        ON v.lesson_id = l.id AND v.version = l.current_version
      WHERE l.id = ?
        AND l.tenant_id = ?
        AND l.status = 'published'
        AND l.current_version = ?
        AND v.status = 'published'
      LIMIT 1`,
    )
    .bind(lessonId, access.tenantId, lessonVersion)
    .first<{ id: string }>();
  if (!publishedVersion) {
    throw new LessonPolicyError(
      "Progress can only be recorded for the current published lesson.",
    );
  }
  const current = await database
    .prepare(
      `SELECT
        tenant_id,
        learner_person_id,
        lesson_id,
        lesson_version,
        percent,
        status,
        updated_at,
        completed_at
      FROM lesson_progress
      WHERE tenant_id = ?
        AND learner_person_id = ?
        AND lesson_id = ?
        AND lesson_version = ?`,
    )
    .bind(
      access.tenantId,
      access.actorPersonId,
      lessonId,
      lessonVersion,
    )
    .first<{
      completed_at: string | null;
      learner_person_id: string;
      lesson_id: string;
      lesson_version: number;
      percent: number;
      status: LessonProgress["status"];
      tenant_id: string;
      updated_at: string;
    }>();
  const updatedAt = new Date().toISOString();
  const progress = recordLessonProgress(
    current
      ? {
          completedAt: current.completed_at ?? undefined,
          learnerId: current.learner_person_id,
          lessonId: current.lesson_id,
          lessonVersion: current.lesson_version,
          percent: current.percent,
          status: current.status,
          tenantId: current.tenant_id,
          updatedAt: current.updated_at,
        }
      : undefined,
    {
      learnerId: access.actorPersonId,
      lessonId,
      lessonVersion,
      percent,
      tenantId: access.tenantId,
      updatedAt,
    },
  );

  await database
    .prepare(
      `INSERT INTO lesson_progress
        (id, tenant_id, learner_person_id, lesson_id, lesson_version, percent, status, updated_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (tenant_id, learner_person_id, lesson_id, lesson_version)
      DO UPDATE SET
        percent = excluded.percent,
        status = excluded.status,
        updated_at = excluded.updated_at,
        completed_at = excluded.completed_at`,
    )
    .bind(
      crypto.randomUUID(),
      progress.tenantId,
      progress.learnerId,
      progress.lessonId,
      progress.lessonVersion,
      progress.percent,
      progress.status,
      progress.updatedAt,
      progress.completedAt ?? null,
    )
    .run();

  return progress;
}

async function ensureLearningSeed() {
  const database = await getD1Database();
  await database.batch([
    database
      .prepare(
        `INSERT OR IGNORE INTO subjects
          (id, tenant_id, code, name, description)
        VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        "subject-integrated-science",
        TENANT_ID,
        "IS",
        "Integrated Science",
        "Explore living systems, matter, energy, and the environment.",
      ),
    database
      .prepare(
        `INSERT OR IGNORE INTO subject_offerings
          (id, tenant_id, subject_id, class_group_id, class_name, academic_year_id, requirement, status)
        VALUES (?, ?, ?, ?, ?, ?, 'compulsory', 'active')`,
      )
      .bind(
        SCIENCE_OFFERING_ID,
        TENANT_ID,
        "subject-integrated-science",
        "class-jhs2-gold",
        "JHS 2 Gold",
        "year-2026-27",
      ),
    seedUnit(
      database,
      "unit-human-systems",
      "Human body systems",
      "How body systems work together to sustain life.",
      1,
    ),
    seedUnit(
      database,
      "unit-food-nutrition",
      "Food and nutrition",
      "Nutrients, balanced diets, and healthy choices.",
      2,
    ),
    database
      .prepare(
        `INSERT OR IGNORE INTO teacher_assignments
          (id, tenant_id, offering_id, teacher_person_id, status)
        VALUES (?, ?, ?, ?, 'active')`,
      )
      .bind(
        "assignment-grace-science",
        TENANT_ID,
        SCIENCE_OFFERING_ID,
        "person-grace",
      ),
    database
      .prepare(
        `INSERT OR IGNORE INTO lessons
          (id, tenant_id, offering_id, unit_id, author_person_id, status, current_version)
        VALUES (?, ?, ?, ?, ?, 'published', 1)`,
      )
      .bind(
        "lesson-digestive-system",
        TENANT_ID,
        SCIENCE_OFFERING_ID,
        "unit-human-systems",
        "person-grace",
      ),
    database
      .prepare(
        `INSERT OR IGNORE INTO lesson_versions
          (id, tenant_id, lesson_id, version, title, summary, objectives, status, published_at, created_by_person_id)
        VALUES (?, ?, ?, 1, ?, ?, ?, 'published', ?, ?)`,
      )
      .bind(
        "lesson-digestive-system:v1",
        TENANT_ID,
        "lesson-digestive-system",
        "The human digestive system",
        "Follow food through the body and discover how nutrients reach your cells.",
        JSON.stringify([
          "Identify the main organs of the digestive system.",
          "Explain how food is broken down and absorbed.",
        ]),
        "2026-07-21T09:00:00Z",
        "person-grace",
      ),
    seedBlock(
      database,
      "block-digestion-intro",
      "lesson-digestive-system:v1",
      "text",
      1,
      "Your body’s food-processing journey",
      "Digestion turns the food you eat into small nutrients that can pass into the blood and support growth, repair, and energy.",
    ),
    seedBlock(
      database,
      "block-digestion-video",
      "lesson-digestive-system:v1",
      "video",
      2,
      "Watch: from mouth to small intestine",
      "A four-minute guided animation tracing swallowing, stomach churning, and nutrient absorption.",
    ),
    seedBlock(
      database,
      "block-digestion-check",
      "lesson-digestive-system:v1",
      "interactive",
      3,
      "Check your understanding",
      "Where does most nutrient absorption take place?",
    ),
    seedBlock(
      database,
      "block-digestion-resource",
      "lesson-digestive-system:v1",
      "resource",
      4,
      "Digestive system study sheet",
      "Download the low-data revision sheet and labelled-organ guide.",
    ),
    database
      .prepare(
        `INSERT OR IGNORE INTO lessons
          (id, tenant_id, offering_id, unit_id, author_person_id, status, current_version)
        VALUES (?, ?, ?, ?, ?, 'draft', 0)`,
      )
      .bind(
        "lesson-balanced-diet",
        TENANT_ID,
        SCIENCE_OFFERING_ID,
        "unit-food-nutrition",
        "person-grace",
      ),
    database
      .prepare(
        `INSERT OR IGNORE INTO lesson_versions
          (id, tenant_id, lesson_id, version, title, summary, objectives, status, created_by_person_id)
        VALUES (?, ?, ?, 0, ?, ?, ?, 'draft', ?)`,
      )
      .bind(
        "lesson-balanced-diet:v0",
        TENANT_ID,
        "lesson-balanced-diet",
        "Building a balanced Ghanaian meal",
        "Use familiar foods to plan a balanced plate.",
        JSON.stringify(["Group common Ghanaian foods by their main nutrients."]),
        "person-grace",
      ),
    seedBlock(
      database,
      "block-balanced-diet-intro",
      "lesson-balanced-diet:v0",
      "text",
      1,
      "What makes a meal balanced?",
      "A balanced meal combines energy-giving, body-building, and protective foods in suitable amounts.",
    ),
  ]);
}

function seedUnit(
  database: D1Database,
  id: string,
  title: string,
  description: string,
  position: number,
) {
  return database
    .prepare(
      `INSERT OR IGNORE INTO curriculum_units
        (id, tenant_id, offering_id, title, description, term, position)
      VALUES (?, ?, ?, ?, ?, 'Term 1', ?)`,
    )
    .bind(id, TENANT_ID, SCIENCE_OFFERING_ID, title, description, position);
}

function seedBlock(
  database: D1Database,
  id: string,
  versionId: string,
  type: LessonBlockType,
  position: number,
  title: string,
  content: string,
) {
  return database
    .prepare(
      `INSERT OR IGNORE INTO lesson_blocks
        (id, tenant_id, lesson_version_id, type, position, title, content, ready)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    .bind(id, TENANT_ID, versionId, type, position, title, content);
}

async function findAccessibleOffering(access: AccessContext) {
  const database = await getD1Database();
  const administrator =
    access.role === "school-admin" || access.role === "academic-admin";
  const query = administrator
    ? `SELECT
        o.id AS offering_id,
        o.class_name,
        s.code,
        s.name AS subject_name
      FROM subject_offerings o
      INNER JOIN subjects s ON s.id = o.subject_id
      WHERE o.tenant_id = ? AND o.status = 'active'
      ORDER BY s.name
      LIMIT 1`
    : `SELECT
        o.id AS offering_id,
        o.class_name,
        s.code,
        s.name AS subject_name
      FROM teacher_assignments a
      INNER JOIN subject_offerings o ON o.id = a.offering_id
      INNER JOIN subjects s ON s.id = o.subject_id
      WHERE a.tenant_id = ?
        AND a.teacher_person_id = ?
        AND a.status = 'active'
        AND o.status = 'active'
      ORDER BY s.name
      LIMIT 1`;
  const statement = database.prepare(query);
  const offering = administrator
    ? await statement.bind(access.tenantId).first<OfferingRow>()
    : await statement
        .bind(access.tenantId, access.actorPersonId)
        .first<OfferingRow>();
  if (!offering) {
    throw new AuthorizationError(
      "No active subject offering is assigned to your account.",
    );
  }
  return offering;
}

async function withTeacherAssignments(
  access: AccessContext,
): Promise<AccessContext> {
  if (access.role === "school-admin" || access.role === "academic-admin") {
    return access;
  }
  const database = await getD1Database();
  const result = await database
    .prepare(
      `SELECT offering_id
      FROM teacher_assignments
      WHERE tenant_id = ? AND teacher_person_id = ? AND status = 'active'`,
    )
    .bind(access.tenantId, access.actorPersonId)
    .all<{ offering_id: string }>();
  return {
    ...access,
    subjectOfferingIds: result.results.map((row) => row.offering_id),
  };
}

async function loadLesson(
  database: D1Database,
  tenantId: string,
  lessonId: string,
): Promise<Lesson> {
  const row = await database
    .prepare(
      `SELECT
        l.id,
        l.tenant_id,
        l.offering_id,
        l.unit_id,
        l.author_person_id,
        l.status,
        l.current_version,
        v.id AS version_id,
        v.title,
        v.summary,
        v.objectives,
        v.published_at
      FROM lessons l
      INNER JOIN lesson_versions v
        ON v.lesson_id = l.id AND v.version = l.current_version
      WHERE l.id = ? AND l.tenant_id = ?
      LIMIT 1`,
    )
    .bind(lessonId, tenantId)
    .first<{
      author_person_id: string;
      current_version: number;
      id: string;
      objectives: string;
      offering_id: string;
      published_at: string | null;
      status: Lesson["status"];
      summary: string;
      tenant_id: string;
      title: string;
      unit_id: string;
      version_id: string;
    }>();
  if (!row) throw new Error("Lesson was not found.");

  return {
    authorPersonId: row.author_person_id,
    blocks: await loadVersionBlocks(database, tenantId, row.version_id),
    id: row.id,
    objectives: parseObjectives(row.objectives),
    offeringId: row.offering_id,
    publishedAt: row.published_at ?? undefined,
    status: row.status,
    summary: row.summary,
    tenantId: row.tenant_id,
    title: row.title,
    unitId: row.unit_id,
    version: row.current_version,
  };
}

async function loadVersionBlocks(
  database: D1Database,
  tenantId: string,
  versionId: string,
): Promise<LessonBlock[]> {
  const result = await database
    .prepare(
      `SELECT id, type, position, title, content, ready
      FROM lesson_blocks
      WHERE tenant_id = ? AND lesson_version_id = ?
      ORDER BY position`,
    )
    .bind(tenantId, versionId)
    .all<{
      content: string;
      id: string;
      position: number;
      ready: number;
      title: string;
      type: LessonBlockType;
    }>();
  return result.results.map((block) => ({
    ...block,
    ready: Boolean(block.ready),
  }));
}

async function findUnitTitle(database: D1Database, unitId: string) {
  const row = await database
    .prepare("SELECT title FROM curriculum_units WHERE id = ? LIMIT 1")
    .bind(unitId)
    .first<{ title: string }>();
  return row?.title ?? "Curriculum unit";
}

function toLessonSummary(row: {
  block_count: number;
  current_version: number;
  id: string;
  objectives: string;
  status: Lesson["status"];
  title: string;
  unit_id: string;
  unit_title: string;
  updated_at: string;
}): LessonSummary {
  return {
    blockCount: Number(row.block_count),
    id: row.id,
    objectiveCount: parseObjectives(row.objectives).length,
    status: row.status,
    title: row.title,
    unitId: row.unit_id,
    unitTitle: row.unit_title,
    updatedAt: row.updated_at,
    version: row.current_version,
  };
}

function auditStatement(
  database: D1Database,
  access: AccessContext,
  action: string,
  lessonId: string,
  metadata: Record<string, unknown>,
) {
  return database
    .prepare(
      `INSERT INTO audit_events
        (id, tenant_id, actor_person_id, action, entity_type, entity_id, metadata)
      VALUES (?, ?, ?, ?, 'lesson', ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      access.tenantId,
      access.actorPersonId,
      action,
      lessonId,
      JSON.stringify(metadata),
    );
}

function requireLessonPermission(access: AccessContext) {
  if (!canPerform(access, "lesson:create")) {
    throw new AuthorizationError(
      "Your school role does not allow lesson authoring.",
    );
  }
}

function validateDraftInput(input: CreateDraftInput) {
  if (
    typeof input.title !== "string" ||
    typeof input.objective !== "string" ||
    typeof input.blockTitle !== "string" ||
    typeof input.blockContent !== "string" ||
    typeof input.offeringId !== "string" ||
    typeof input.unitId !== "string" ||
    !input.title.trim() ||
    !input.objective.trim() ||
    !input.blockTitle.trim() ||
    !input.blockContent.trim() ||
    !input.offeringId.trim() ||
    !input.unitId.trim()
  ) {
    throw new LessonPolicyError(
      "Offering, unit, title, objective, block title, and block content are required.",
    );
  }
  if (
    !["text", "video", "interactive", "practice", "resource"].includes(
      input.blockType,
    )
  ) {
    throw new LessonPolicyError("Select a supported lesson block type.");
  }
}

async function requireOfferingUnit(
  database: D1Database,
  tenantId: string,
  offeringId: string,
  unitId: string,
) {
  const unit = await database
    .prepare(
      `SELECT id
      FROM curriculum_units
      WHERE id = ? AND tenant_id = ? AND offering_id = ?
      LIMIT 1`,
    )
    .bind(unitId, tenantId, offeringId)
    .first<{ id: string }>();
  if (!unit) {
    throw new LessonPolicyError(
      "The curriculum unit does not belong to this subject offering.",
    );
  }
}

function parseObjectives(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

type OfferingRow = {
  class_name: string;
  code: string;
  offering_id: string;
  subject_name: string;
};
