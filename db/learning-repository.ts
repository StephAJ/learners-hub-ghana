import { canPerform, canTeachOffering, AuthorizationError } from "../domain/identity/authorization";
import type { QuestionType } from "../domain/assessment/types";
import type { MediaKind } from "../domain/content/types";
import type { AccessContext } from "../domain/identity/types";
import {
  addLessonBlock,
  createLessonDraft,
  evaluateLessonAvailability,
  LessonPolicyError,
  publishLesson,
  recordLessonProgress,
} from "../domain/learning/lessons";
import type {
  CurriculumStandard,
  Lesson,
  LessonAvailability,
  LessonBlock,
  LessonBlockType,
  LessonProgress,
  LessonReleaseRule,
} from "../domain/learning/types";
import {
  DEMO_ACADEMIC_YEAR_ID,
  DEMO_CLASS_GROUP_ID,
  DEMO_CLASS_NAME,
  demoActivities,
  demoMediaAssets,
  demoSubjects,
  type DemoSubject,
} from "../domain/demo/greenfield";
import { getSchoolDatabase } from "./index";
import type { SchoolDatabase, SchoolStatement } from "./school-database";
import { ensurePeopleSeed } from "./people-repository";
import { ensureDemoMediaObjects } from "./demo-media";
import {
  loadTeachingOfferings,
  selectOffering,
  type TeachingOffering,
} from "./teaching-offerings";

const TENANT_ID = "tenant-greenfield";
export const SCIENCE_OFFERING_ID = "offering-science-jhs2";

export type LessonSummary = {
  blockCount: number;
  id: string;
  objectiveCount: number;
  prerequisiteTitle?: string;
  releaseMode: "immediate" | "scheduled" | "prerequisite";
  standardCodes: string[];
  status: Lesson["status"];
  title: string;
  unitId: string;
  unitTitle: string;
  updatedAt: string;
  version: number;
};

/** A question a checkpoint can ask, as the block editor lists it. */
export type CheckpointQuestionOption = {
  id: string;
  marks: number;
  prompt: string;
  topic: string;
  type: QuestionType;
};

export type TeacherLessonWorkspace = {
  className: string;
  code: string;
  coveragePercent: number;
  lessons: LessonSummary[];
  offeringId: string;
  /* Every subject this teacher may write lessons for, the selected one
     included. The library named one offering and had no way to change it, so
     a teacher of four subjects reached exactly one lesson library. */
  offerings: TeachingOffering[];
  /* The approved questions in this subject's bank. Carried on the lesson
     workspace so an interactive block can be built from real questions
     without the editor reaching into the assessment workspace for them.

     Scoped to the selected offering like everything else here — a checkpoint
     in a Mathematics lesson must not be able to ask a Science question. */
  questionBank: CheckpointQuestionOption[];
  standards: CurriculumStandard[];
  subjectName: string;
  units: Array<{ id: string; lessonCount: number; title: string }>;
};

export type LearnerLesson = {
  availability: LessonAvailability;
  blocks: LessonBlock[];
  estimatedMinutes: number;
  id: string;
  objectives: string[];
  progressPercent: number;
  releaseHint?: string;
  standardCodes: string[];
  summary: string;
  /** Card artwork. Absent lessons fall back to generated art. */
  thumbnailUrl?: string;
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
  availableFrom?: string;
  blocks: Array<{
    config?: LessonBlock["config"];
    content: string;
    title: string;
    type: LessonBlockType;
  }>;
  objectives: string[];
  offeringId: string;
  prerequisiteLessonId?: string;
  summary: string;
  standardIds: string[];
  title: string;
  unitId: string;
};

export async function listTeacherLessonWorkspace(
  access: AccessContext,
  requestedOfferingId?: string,
): Promise<TeacherLessonWorkspace> {
  requireLessonPermission(access);
  await ensureLearningFoundation();
  const database = await getSchoolDatabase();
  const offerings = await loadTeachingOfferings(database, access);
  const offering = requireTeachingOffering(
    access,
    offerings,
    requestedOfferingId,
  );
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

  const standardsResult = await database
    .prepare(
      /* Active only. A retired standard stays in the table so the lessons
         that already cover it keep their record, but it is no longer part of
         the curriculum a teacher maps new work to — and it must not sit in
         the denominator of the coverage figure. */
      `SELECT id, code, strand, sub_strand, description, position
      FROM curriculum_standards
      WHERE tenant_id = ? AND offering_id = ? AND status = 'active'
      ORDER BY position`,
    )
    .bind(access.tenantId, offering.offering_id)
    .all<{
      code: string;
      description: string;
      id: string;
      position: number;
      strand: string;
      sub_strand: string;
    }>();
  const planningResult = await database
    .prepare(
      `SELECT
        l.id AS lesson_id,
        s.code AS standard_code,
        r.available_from,
        r.prerequisite_lesson_id,
        pv.title AS prerequisite_title
      FROM lessons l
      LEFT JOIN lesson_standard_links link ON link.lesson_id = l.id
      LEFT JOIN curriculum_standards s ON s.id = link.standard_id
      LEFT JOIN lesson_release_rules r ON r.lesson_id = l.id
      LEFT JOIN lessons prerequisite ON prerequisite.id = r.prerequisite_lesson_id
      LEFT JOIN lesson_versions pv
        ON pv.lesson_id = prerequisite.id
        AND pv.version = prerequisite.current_version
      WHERE l.tenant_id = ? AND l.offering_id = ?
      ORDER BY s.position`,
    )
    .bind(access.tenantId, offering.offering_id)
    .all<{
      available_from: string | null;
      lesson_id: string;
      prerequisite_lesson_id: string | null;
      prerequisite_title: string | null;
      standard_code: string | null;
    }>();
  /* Approved only. A checkpoint is shown to a class, so a question still
     being drafted has no business being offered for one — and requireBlock
     Attachments refuses it at publish time regardless. */
  const questionBankResult = await database
    .prepare(
      `SELECT q.id, q.type, q.topic, v.prompt, v.marks
      FROM question_bank_items q
      INNER JOIN question_versions v
        ON v.question_id = q.id AND v.version = q.current_version
      WHERE q.tenant_id = ? AND q.offering_id = ? AND q.status = 'approved'
      ORDER BY q.topic, q.updated_at DESC`,
    )
    .bind(access.tenantId, offering.offering_id)
    .all<{
      id: string;
      marks: number;
      prompt: string;
      topic: string;
      type: QuestionType;
    }>();
  const planningByLesson = buildLessonPlanningMap(planningResult.results);
  const lessons = lessonsResult.results.map((row) => {
    const summary = toLessonSummary(row);
    const planning = planningByLesson.get(summary.id);
    return {
      ...summary,
      prerequisiteTitle: planning?.prerequisiteTitle,
      releaseMode: planning?.prerequisiteLessonId
        ? "prerequisite"
        : planning?.availableFrom
          ? "scheduled"
          : "immediate",
      standardCodes: planning?.standardCodes ?? [],
    } satisfies LessonSummary;
  });
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
    offerings,
    questionBank: questionBankResult.results.map((question) => ({
      id: question.id,
      marks: Number(question.marks),
      prompt: question.prompt,
      topic: question.topic,
      type: question.type,
    })),
    standards: standardsResult.results.map((standard) => ({
      code: standard.code,
      description: standard.description,
      id: standard.id,
      position: standard.position,
      strand: standard.strand,
      subStrand: standard.sub_strand,
    })),
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
  /* Duplicating an existing lesson reaches this function too, and it is not
     the same act as authoring one. See duplicatePersistentLesson(). */
  options: { copyingExistingBlocks?: boolean } = {},
): Promise<LessonSummary> {
  await ensureLearningFoundation();
  validateDraftInput(input);
  if (!canTeachOffering(access, input.offeringId)) {
    throw new AuthorizationError(
      "You are not assigned to this subject offering.",
    );
  }
  const database = await getSchoolDatabase();
  await requireOfferingUnit(
    database,
    access.tenantId,
    input.offeringId,
    input.unitId,
  );
  await requireOfferingStandards(
    database,
    access.tenantId,
    input.offeringId,
    input.standardIds,
  );
  await requirePrerequisiteLesson(
    database,
    access.tenantId,
    input.offeringId,
    input.prerequisiteLessonId,
  );
  if (!options.copyingExistingBlocks) {
    await requireBlockAttachments(
      database,
      access.tenantId,
      input.offeringId,
      input.blocks,
    );
  }

  const lessonId = crypto.randomUUID();
  const versionId = `${lessonId}:v0`;
  const emptyDraft = createLessonDraft({
      authorPersonId: access.actorPersonId,
      id: lessonId,
      objectives: input.objectives.map((objective) => objective.trim()),
      offeringId: input.offeringId,
      summary: input.summary.trim(),
      tenantId: access.tenantId,
      title: input.title.trim(),
      unitId: input.unitId,
    });
  const draft = input.blocks.reduce(
    (lesson, block) =>
      addLessonBlock(lesson, {
        config: block.config,
        content: block.content.trim(),
        id: crypto.randomUUID(),
        ready: true,
        title: block.title.trim(),
        type: block.type,
      }),
    emptyDraft,
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
    ...draft.blocks.map((block) =>
      database
        .prepare(
          `INSERT INTO lesson_blocks
            (id, tenant_id, lesson_version_id, type, position, title, content, config, ready)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        )
        .bind(
          block.id,
          draft.tenantId,
          versionId,
          block.type,
          block.position,
          block.title,
          block.content,
          JSON.stringify(block.config ?? {}),
        ),
    ),
    ...input.standardIds.map((standardId) =>
      database
        .prepare(
          `INSERT INTO lesson_standard_links
            (id, tenant_id, lesson_id, standard_id)
          VALUES (?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          draft.tenantId,
          draft.id,
          standardId,
        ),
    ),
    database
      .prepare(
        `INSERT INTO lesson_release_rules
          (id, tenant_id, lesson_id, available_from, prerequisite_lesson_id)
        VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        draft.tenantId,
        draft.id,
        input.availableFrom?.trim() || null,
        input.prerequisiteLessonId?.trim() || null,
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
    blockCount: draft.blocks.length,
    id: draft.id,
    objectiveCount: draft.objectives.length,
    prerequisiteTitle: input.prerequisiteLessonId
      ? await findLessonTitle(database, input.prerequisiteLessonId)
      : undefined,
    releaseMode: input.prerequisiteLessonId
      ? "prerequisite"
      : input.availableFrom
        ? "scheduled"
        : "immediate",
    standardCodes: await findStandardCodes(
      database,
      draft.tenantId,
      draft.id,
    ),
    status: draft.status,
    title: draft.title,
    unitId: draft.unitId,
    unitTitle: await findUnitTitle(database, draft.unitId),
    updatedAt: new Date().toISOString(),
    version: draft.version,
  };
}

/**
 * Rewrites a draft in place.
 *
 * Only drafts. A published lesson is a version learners have already been
 * taught from and may hold progress against, so changing it under them would
 * be a different operation — a new version — not an edit. Attempting it is
 * refused rather than silently ignored.
 *
 * The version's contents are replaced wholesale rather than diffed: blocks are
 * ordered and a partial update would have to reconcile positions, which is a
 * lot of machinery for a draft nobody else can see yet.
 */
export async function updatePersistentLessonDraft(
  access: AccessContext,
  lessonId: string,
  input: CreateDraftInput,
): Promise<LessonSummary> {
  await ensureLearningFoundation();
  validateDraftInput(input);
  if (!canTeachOffering(access, input.offeringId)) {
    throw new AuthorizationError(
      "You are not assigned to this subject offering.",
    );
  }

  const database = await getSchoolDatabase();
  const existing = await database
    .prepare(
      `SELECT id, offering_id, status, current_version
       FROM lessons
       WHERE tenant_id = ? AND id = ?`,
    )
    .bind(access.tenantId, lessonId)
    .first<{
      current_version: number;
      id: string;
      offering_id: string;
      status: string;
    }>();

  if (!existing) {
    throw new AuthorizationError("That lesson is not in this school.");
  }
  if (existing.offering_id !== input.offeringId) {
    throw new AuthorizationError(
      "A lesson cannot be moved to a different subject.",
    );
  }
  if (existing.status !== "draft") {
    throw new AuthorizationError(
      "Published lessons cannot be edited. Duplicate it to make changes.",
    );
  }

  await requireOfferingUnit(
    database,
    access.tenantId,
    input.offeringId,
    input.unitId,
  );
  await requireOfferingStandards(
    database,
    access.tenantId,
    input.offeringId,
    input.standardIds,
  );
  await requirePrerequisiteLesson(
    database,
    access.tenantId,
    input.offeringId,
    input.prerequisiteLessonId,
  );
  await requireBlockAttachments(
    database,
    access.tenantId,
    input.offeringId,
    input.blocks,
  );

  const versionId = `${lessonId}:v${existing.current_version}`;
  const objectives = input.objectives.map((objective) => objective.trim());

  await database.batch([
    database
      .prepare(
        `UPDATE lessons SET unit_id = ? WHERE tenant_id = ? AND id = ?`,
      )
      .bind(input.unitId, access.tenantId, lessonId),
    database
      .prepare(
        `UPDATE lesson_versions
         SET title = ?, summary = ?, objectives = ?
         WHERE tenant_id = ? AND id = ?`,
      )
      .bind(
        input.title.trim(),
        input.summary.trim(),
        JSON.stringify(objectives),
        access.tenantId,
        versionId,
      ),
    database
      .prepare(
        `DELETE FROM lesson_blocks WHERE tenant_id = ? AND lesson_version_id = ?`,
      )
      .bind(access.tenantId, versionId),
    ...input.blocks.map((block, index) =>
      database
        .prepare(
          `INSERT INTO lesson_blocks
            (id, tenant_id, lesson_version_id, type, position, title, content, config, ready)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        )
        .bind(
          crypto.randomUUID(),
          access.tenantId,
          versionId,
          block.type,
          index + 1,
          block.title.trim(),
          block.content.trim(),
          JSON.stringify(block.config ?? {}),
        ),
    ),
    database
      .prepare(
        `DELETE FROM lesson_standard_links WHERE tenant_id = ? AND lesson_id = ?`,
      )
      .bind(access.tenantId, lessonId),
    ...input.standardIds.map((standardId) =>
      database
        .prepare(
          `INSERT INTO lesson_standard_links
            (id, tenant_id, lesson_id, standard_id)
          VALUES (?, ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), access.tenantId, lessonId, standardId),
    ),
    database
      .prepare(
        `DELETE FROM lesson_release_rules WHERE tenant_id = ? AND lesson_id = ?`,
      )
      .bind(access.tenantId, lessonId),
    database
      .prepare(
        `INSERT INTO lesson_release_rules
          (id, tenant_id, lesson_id, available_from, prerequisite_lesson_id)
        VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        access.tenantId,
        lessonId,
        input.availableFrom?.trim() || null,
        input.prerequisiteLessonId?.trim() || null,
      ),
    auditStatement(database, access, "lesson.draft_updated", lessonId, {
      offeringId: input.offeringId,
    }),
  ]);

  return {
    blockCount: input.blocks.length,
    id: lessonId,
    objectiveCount: objectives.length,
    prerequisiteTitle: input.prerequisiteLessonId
      ? await findLessonTitle(database, input.prerequisiteLessonId)
      : undefined,
    releaseMode: input.prerequisiteLessonId
      ? "prerequisite"
      : input.availableFrom
        ? "scheduled"
        : "immediate",
    standardCodes: await findStandardCodes(database, access.tenantId, lessonId),
    status: "draft",
    title: input.title.trim(),
    unitId: input.unitId,
    unitTitle: await findUnitTitle(database, input.unitId),
    updatedAt: new Date().toISOString(),
    version: existing.current_version,
  };
}

export async function publishPersistentLesson(
  access: AccessContext,
  lessonId: string,
): Promise<LessonSummary> {
  await ensureLearningFoundation();
  const database = await getSchoolDatabase();
  const draft = await loadLesson(database, access.tenantId, lessonId);
  const published = publishLesson(access, draft, new Date().toISOString());
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
            (id, tenant_id, lesson_version_id, type, position, title, content, config, ready)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          published.tenantId,
          publishedVersionId,
          block.type,
          block.position,
          block.title,
          block.content,
          JSON.stringify(block.config ?? {}),
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

  const releaseRule = await findReleaseRule(
    database,
    published.tenantId,
    published.id,
  );
  return {
    blockCount: published.blocks.length,
    id: published.id,
    objectiveCount: published.objectives.length,
    prerequisiteTitle: releaseRule?.prerequisiteLessonId
      ? await findLessonTitle(database, releaseRule.prerequisiteLessonId)
      : undefined,
    releaseMode: releaseRule?.prerequisiteLessonId
      ? "prerequisite"
      : releaseRule?.availableFrom
        ? "scheduled"
        : "immediate",
    standardCodes: await findStandardCodes(
      database,
      published.tenantId,
      published.id,
    ),
    status: published.status,
    title: published.title,
    unitId: published.unitId,
    unitTitle: await findUnitTitle(database, published.unitId),
    updatedAt: published.publishedAt ?? "",
    version: published.version,
  };
}

export async function duplicatePersistentLesson(
  access: AccessContext,
  lessonId: string,
): Promise<LessonSummary> {
  await ensureLearningFoundation();
  const database = await getSchoolDatabase();
  const source = await loadLesson(database, access.tenantId, lessonId);
  if (!canTeachOffering(access, source.offeringId)) {
    throw new AuthorizationError(
      "You are not assigned to this subject offering.",
    );
  }
  const standardIds = await findStandardIds(
    database,
    source.tenantId,
    source.id,
  );
  /* The attachment check is skipped here, and that is the point of the flag.
     It asks that every media asset a block names is present and `ready` in
     this offering, which is the right question to ask of a teacher attaching
     something new. It is the wrong question to ask of a copy: these blocks are
     already in the database, on a lesson learners may already be reading.

     Asking it anyway made Duplicate fail outright on any lesson carrying a
     resource or interactive block whose asset had since been removed — or, on
     a fresh database, was never there: every seeded Integrated Science lesson
     names an asset id, and `media_assets` and `interactive_activities` are
     both empty, so Duplicate raised "Every attached media asset must be ready
     in this subject" on all three of them and no lesson could be copied at
     all. A teacher cannot fix that from the screen they are on, and the
     lesson they were copying was fine. */
  const duplicate = await createPersistentLessonDraft(
    access,
    {
      blocks: source.blocks.map((block) => ({
        config: block.config,
        content: block.content,
        title: block.title,
        type: block.type,
      })),
      objectives: source.objectives,
      offeringId: source.offeringId,
      standardIds,
      summary: source.summary,
      title: `${source.title} — copy`,
      unitId: source.unitId,
    },
    { copyingExistingBlocks: true },
  );
  await database
    .prepare(
      `INSERT INTO audit_events
        (id, tenant_id, actor_person_id, action, entity_type, entity_id, metadata)
      VALUES (?, ?, ?, 'lesson.duplicated', 'lesson', ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      access.tenantId,
      access.actorPersonId,
      duplicate.id,
      JSON.stringify({ sourceLessonId: source.id }),
    )
    .run();
  return duplicate;
}

/** One card on "My subjects", and on the learner's Today screen. */
export type LearnerSubjectCard = {
  className: string;
  code: string;
  lessonCount: number;
  nextLessonTitle?: string;
  offeringId: string;
  progressPercent: number;
  subjectName: string;
  teacherName: string;
  /** The year the material is pitched at, without the stream. */
  yearGroup: string;
};

/**
 * Every subject this learner is taught.
 *
 * This did not exist. "My subjects" and the learner's Today screen both
 * called demoSubjectCards(), so every learner in every school opened their
 * subjects and saw Greenfield Academy's four demo subjects, with demo
 * teachers and invented progress — and the cards linked into demo lessons.
 * There was no fetch to fail and no error to notice; the screen simply was
 * not about them.
 *
 * A learner reaches a subject through their class: the offerings of the class
 * their active membership scopes them to. That is the same rule
 * requireOfferingContentAccess() enforces when they open a lesson, so what
 * they can see here and what they can open agree.
 */
export async function listLearnerSubjects(
  access: AccessContext,
): Promise<LearnerSubjectCard[]> {
  if (access.membershipStatus !== "active") {
    throw new AuthorizationError("An active school membership is required.");
  }
  await ensureLearningFoundation();
  const database = await getSchoolDatabase();

  const result = await database
    .prepare(
      `SELECT
        o.id AS offering_id,
        o.class_name,
        s.code,
        s.name AS subject_name,
        COALESCE(p.first_name || ' ' || p.last_name, 'Assigned teacher')
          AS teacher_name,
        COUNT(DISTINCT l.id) AS lesson_count,
        COUNT(DISTINCT CASE WHEN pr.status = 'completed' THEN l.id END)
          AS completed_count
      FROM tenant_memberships m
      INNER JOIN subject_offerings o
        ON o.tenant_id = m.tenant_id AND o.class_name = m.scope_id
        AND o.status = 'active'
      INNER JOIN subjects s ON s.id = o.subject_id
      LEFT JOIN teacher_assignments a
        ON a.offering_id = o.id AND a.status = 'active'
      LEFT JOIN people p ON p.id = a.teacher_person_id
      LEFT JOIN lessons l
        ON l.offering_id = o.id AND l.status = 'published'
      LEFT JOIN lesson_progress pr
        ON pr.lesson_id = l.id AND pr.learner_person_id = m.person_id
      WHERE m.tenant_id = ? AND m.person_id = ?
        AND m.status = 'active' AND m.scope_type = 'class'
      GROUP BY o.id, o.class_name, s.code, s.name, p.first_name, p.last_name
      ORDER BY s.name`,
    )
    .bind(access.tenantId, access.actorPersonId)
    .all<{
      class_name: string;
      code: string;
      completed_count: number;
      lesson_count: number;
      offering_id: string;
      subject_name: string;
      teacher_name: string;
    }>();

  /* The next unfinished lesson in each subject, in one query rather than one
     per subject — a learner taking eight subjects should not cost eight round
     trips to fill in eight card subtitles. */
  const nextByOffering = await loadNextLessons(database, access);

  return result.results.map((row) => {
    const lessonCount = Number(row.lesson_count);
    const completed = Number(row.completed_count);
    return {
      className: row.class_name,
      code: row.code,
      /* No cover column on subjects — only the demo fixtures carried one.
         SubjectCoverArt generates artwork from the offering id when there is
         no photograph, which is every real subject today. */
      lessonCount,
      nextLessonTitle: nextByOffering.get(row.offering_id),
      offeringId: row.offering_id,
      progressPercent:
        lessonCount === 0 ? 0 : Math.round((completed / lessonCount) * 100),
      subjectName: row.subject_name,
      teacherName: row.teacher_name,
      yearGroup: yearGroupOf(row.class_name),
    };
  });
}

async function loadNextLessons(
  database: SchoolDatabase,
  access: AccessContext,
): Promise<Map<string, string>> {
  const result = await database
    .prepare(
      `SELECT l.offering_id, v.title
      FROM lessons l
      INNER JOIN lesson_versions v
        ON v.lesson_id = l.id AND v.version = l.current_version
      LEFT JOIN lesson_progress pr
        ON pr.lesson_id = l.id AND pr.learner_person_id = ?
      WHERE l.tenant_id = ? AND l.status = 'published'
        AND COALESCE(pr.status, '') <> 'completed'
      ORDER BY l.offering_id, l.created_at`,
    )
    .bind(access.actorPersonId, access.tenantId)
    .all<{ offering_id: string; title: string }>();

  const next = new Map<string, string>();
  for (const row of result.results) {
    if (!next.has(row.offering_id)) next.set(row.offering_id, row.title);
  }
  return next;
}

/**
 * That this person may open this subject at all.
 *
 * getLearnerSubject() checked only that the membership was active and then
 * looked the offering up by id, so any learner could open any subject in the
 * school by changing the id in the address bar — including one their class
 * does not take. A teacher or administrator reaches every offering, which is
 * what the subject preview depends on.
 *
 * Written here rather than reusing content-repository's version of the same
 * rule: that module already imports this one, and a cycle between the two
 * repositories is a worse problem than one small repeated query.
 */
async function requireSubjectReach(
  database: SchoolDatabase,
  access: AccessContext,
  offeringId: string,
) {
  if (access.role !== "learner") return;
  const reachable = await database
    .prepare(
      `SELECT m.id
      FROM tenant_memberships m
      INNER JOIN subject_offerings o
        ON o.tenant_id = m.tenant_id AND o.class_name = m.scope_id
      WHERE m.tenant_id = ? AND m.person_id = ? AND m.status = 'active'
        AND m.scope_type = 'class' AND o.id = ?
      LIMIT 1`,
    )
    .bind(access.tenantId, access.actorPersonId, offeringId)
    .first<{ id: string }>();
  if (!reachable) {
    throw new AuthorizationError(
      "This subject belongs to another class.",
    );
  }
}

/* "JHS 2 Gold" is the room; "JHS 2" is what the material is pitched at. The
   stream tells a learner which desk they sit at, not what they are studying. */
function yearGroupOf(className: string): string {
  const match = /^([A-Za-z]+\s*\d+)/.exec(className.trim());
  return match ? match[1].replace(/\s+/g, " ") : className;
}

export async function getLearnerSubject(
  access: AccessContext,
  offeringId: string,
): Promise<LearnerSubject> {
  if (access.membershipStatus !== "active") {
    throw new AuthorizationError("An active school membership is required.");
  }
  await ensureLearningFoundation();
  const database = await getSchoolDatabase();
  await requireSubjectReach(database, access, offeringId);
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
        r.available_from,
        r.available_until,
        r.prerequisite_lesson_id,
        prerequisite_version.title AS prerequisite_title,
        COALESCE(pr.percent, 0) AS progress_percent
      FROM lessons l
      INNER JOIN lesson_versions v
        ON v.lesson_id = l.id AND v.version = l.current_version
      INNER JOIN curriculum_units u ON u.id = l.unit_id
      LEFT JOIN lesson_release_rules r ON r.lesson_id = l.id
      LEFT JOIN lessons prerequisite ON prerequisite.id = r.prerequisite_lesson_id
      LEFT JOIN lesson_versions prerequisite_version
        ON prerequisite_version.lesson_id = prerequisite.id
        AND prerequisite_version.version = prerequisite.current_version
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
      available_from: string | null;
      available_until: string | null;
      current_version: number;
      id: string;
      objectives: string;
      prerequisite_lesson_id: string | null;
      prerequisite_title: string | null;
      progress_percent: number;
      summary: string;
      title: string;
      unit_title: string;
      version_id: string;
    }>();

  const completedResult = await database
    .prepare(
      `SELECT lesson_id
      FROM lesson_progress
      WHERE tenant_id = ? AND learner_person_id = ? AND status = 'completed'`,
    )
    .bind(access.tenantId, access.actorPersonId)
    .all<{ lesson_id: string }>();
  const completedLessonIds = new Set(
    completedResult.results.map((row) => row.lesson_id),
  );
  const now = new Date();
  const lessons = await Promise.all(
    lessonRows.results.map(async (row) => {
      const rule: LessonReleaseRule = {
        availableFrom: row.available_from ?? undefined,
        availableUntil: row.available_until ?? undefined,
        lessonId: row.id,
        prerequisiteLessonId: row.prerequisite_lesson_id ?? undefined,
      };
      const availability = evaluateLessonAvailability(
        rule,
        completedLessonIds,
        now,
      );
      return {
        availability,
        blocks:
          availability === "available"
            ? await loadVersionBlocks(
                database,
                access.tenantId,
                row.version_id,
              )
            : [],
        estimatedMinutes: estimateLessonMinutes(
          await countVersionBlocks(
            database,
            access.tenantId,
            row.version_id,
          ),
        ),
        id: row.id,
        objectives: parseObjectives(row.objectives),
        progressPercent: Number(row.progress_percent),
        releaseHint: lessonReleaseHint(
          availability,
          row.available_from,
          row.prerequisite_title,
        ),
        standardCodes: await findStandardCodes(
          database,
          access.tenantId,
          row.id,
        ),
        summary: row.summary,
        title: row.title,
        unitTitle: row.unit_title,
        version: row.current_version,
      };
    }),
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
  await ensureLearningFoundation();
  if (access.membershipStatus !== "active") {
    throw new AuthorizationError("An active school membership is required.");
  }
  const database = await getSchoolDatabase();
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
  const releaseRule = await findReleaseRule(database, access.tenantId, lessonId);
  const completedResult = await database
    .prepare(
      `SELECT lesson_id
      FROM lesson_progress
      WHERE tenant_id = ? AND learner_person_id = ? AND status = 'completed'`,
    )
    .bind(access.tenantId, access.actorPersonId)
    .all<{ lesson_id: string }>();
  const availability = evaluateLessonAvailability(
    releaseRule,
    new Set(completedResult.results.map((row) => row.lesson_id)),
    new Date(),
  );
  if (availability !== "available") {
    throw new LessonPolicyError(
      "This lesson is not currently available to the learner.",
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

/**
 * Creates the school's subjects, curriculum and lessons if they are not there.
 *
 * Driven by the shared demo dataset rather than a hand-written copy of it, so
 * the content a learner reads from the database is the same content the
 * preview fallbacks show when the database is unreachable. The two used to be
 * separate transcriptions of Integrated Science and had already drifted.
 */
export async function ensureLearningFoundation() {
  /* Everything seeded below carries a foreign key to a tenant or a person.
     PostgreSQL enforces those at insert time, so the school and its staff have
     to exist first — under D1 this happened to work through ordering luck, and
     would have failed on a fresh database the moment a learning route was the
     first one hit. Every other foundation chains through this one. */
  await ensurePeopleSeed();
  const database = await getSchoolDatabase();

  /* The subject and its offering first, and in their own transaction, because
     everything after them is keyed by the offering id and there is no way to
     know whether that id exists without asking the table. */
  await database.batch(
    demoSubjects.flatMap((subject) => seedOfferingStatements(database, subject)),
  );

  const owned = await seededDemoOfferingIds();
  const statements = demoSubjects
    .filter((subject) => owned.has(subject.offeringId))
    .flatMap((subject) => seedSubjectStatements(database, subject));

  /* One transaction. A partially seeded subject — units without their lessons,
     lessons without their blocks — would render as a broken course rather than
     an absent one. */
  await database.batch(statements);

  /* After the rows, because it corrects the sizes on them. Outside the batch
     because it writes files, and a filesystem write cannot join a database
     transaction. A failure here costs the demo its downloads, not its
     lessons, so it is logged rather than raised. */
  try {
    await ensureDemoMediaObjects();
  } catch (error) {
    console.warn("Demo study resources could not be written.", error);
  }
}

/**
 * The demo offerings that exist under the id the rest of this seed binds.
 *
 * Not every one of them will. `subject_offerings` is unique on (tenant, subject,
 * class group, year), and a school that put Integrated Science on JHS 2 Gold
 * through the admin screen holds that slot under an id of its own — a UUID from
 * setClassOffering(). The insert below is an IGNORE, so it quietly does nothing,
 * and `offering-science-jhs2` is an id that does not exist.
 *
 * Everything downstream — the teacher's assignment, the units, the standards,
 * the lessons — then pointed at it anyway and violated
 * teacher_assignments_offering_id_fkey on the first of them. Because the seed is
 * one transaction and every learning screen waits on it, one school-owned
 * offering took down the teacher's classes, their markbook and their messages
 * with the same PostgreSQL error.
 *
 * A demo subject whose slot the school already owns is skipped whole instead.
 * The school's own offering is the real one; the demo has no business hanging
 * a fabricated teacher and a term of lessons off it.
 *
 * Exported because the assessment, reporting and daily-operations seeds stack
 * on top of this one and key their own rows to the same offerings. Each of them
 * held the identical assumption and would have failed on its own foreign key
 * the moment this one stopped failing first.
 */
export async function seededDemoOfferingIds(): Promise<Set<string>> {
  const database = await getSchoolDatabase();
  const ids = demoSubjects.map((subject) => subject.offeringId);
  const result = await database
    .prepare(
      `SELECT id FROM subject_offerings
        WHERE tenant_id = ? AND id IN (${ids.map(() => "?").join(", ")})`,
    )
    .bind(TENANT_ID, ...ids)
    .all<{ id: string }>();

  return new Set(result.results.map((row) => row.id));
}

function seedOfferingStatements(
  database: SchoolDatabase,
  subject: DemoSubject,
): SchoolStatement[] {
  return [
    database
      .prepare(
        `INSERT OR IGNORE INTO subjects
          (id, tenant_id, code, name, description)
        VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        `subject-${subject.slug}`,
        TENANT_ID,
        subject.code,
        subject.subjectName,
        subject.units.map((unit) => unit.title).join(" · "),
      ),
    /* subject_id is selected back out of the table rather than bound as the
       id above, because the insert above is an IGNORE: if some other row
       already holds this tenant's `MA`, it did nothing, and `subject-
       mathematics` is an id that does not exist. Binding it anyway violated
       the foreign key, and since this whole seed is one transaction it took
       down every screen that waits on ensureLearningFoundation().

       db/academic-seed.ts now shares these ids so the two seeds land on the
       same rows, but selecting is what makes it structurally impossible for
       the offering to point at a subject that is not there. */
    database
      .prepare(
        `INSERT OR IGNORE INTO subject_offerings
          (id, tenant_id, subject_id, class_group_id, class_name, academic_year_id, requirement, status)
        SELECT ?, ?, existing.id, ?, ?, ?, 'compulsory', 'active'
        FROM subjects AS existing
        WHERE existing.tenant_id = ? AND existing.code = ?`,
      )
      .bind(
        subject.offeringId,
        TENANT_ID,
        DEMO_CLASS_GROUP_ID,
        DEMO_CLASS_NAME,
        DEMO_ACADEMIC_YEAR_ID,
        TENANT_ID,
        subject.code,
      ),
  ];
}

/**
 * The files and interactive activities the lessons attach.
 *
 * These were defined in the shared dataset and seeded nowhere, so `media_assets`
 * and `interactive_activities` were empty on every database while the seeded
 * lessons carried blocks naming `asset-digestion-study-sheet`,
 * `activity-organ-hotspots` and nine others. A resource block rendered against
 * a row that did not exist, and Duplicate refused every lesson in the subject
 * because `requireBlockAttachments()` could not find what the blocks named.
 *
 * Ordered before the lessons that reference them, and the packages before the
 * activities that carry a `package_asset_id` across a foreign key.
 */
function seedAttachmentStatements(
  database: SchoolDatabase,
  subject: DemoSubject,
): SchoolStatement[] {
  const assets = demoMediaAssets.filter(
    (asset) => asset.offeringId === subject.offeringId,
  );
  const activities = demoActivities.filter(
    (activity) => activity.offeringId === subject.offeringId,
  );

  return [
    ...assets.map((asset) =>
      database
        .prepare(
          `INSERT OR IGNORE INTO media_assets
            (id, tenant_id, offering_id, uploaded_by_person_id, kind,
             original_filename, content_type, size_bytes, object_key, status,
             created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          asset.id,
          TENANT_ID,
          asset.offeringId,
          asset.uploadedByPersonId,
          asset.kind,
          asset.originalFilename,
          asset.contentType,
          asset.sizeBytes,
          /* Opaque, like every real upload: the storage key is never the
             filename. Nothing is on disk for these, which is why the demo
             assets are documents and packages rather than videos. */
          `demo/${asset.id}`,
          asset.status,
          asset.createdAt,
        ),
    ),
    ...activities.map((activity) =>
      database
        .prepare(
          `INSERT OR IGNORE INTO interactive_activities
            (id, tenant_id, offering_id, created_by_person_id, title, provider,
             content_type, launch_url, package_asset_id, fallback_text, status)
          VALUES (?, ?, ?, ?, ?, 'h5p', ?, ?, ?, ?, ?)`,
        )
        .bind(
          activity.id,
          TENANT_ID,
          activity.offeringId,
          subject.teacherPersonId,
          activity.title,
          activity.contentType,
          activity.launchUrl ?? null,
          activity.packageAssetId ?? null,
          activity.fallbackText,
          activity.status,
        ),
    ),
  ];
}

function seedSubjectStatements(
  database: SchoolDatabase,
  subject: DemoSubject,
): SchoolStatement[] {
  const statements: SchoolStatement[] = [
    database
      .prepare(
        `INSERT OR IGNORE INTO teacher_assignments
          (id, tenant_id, offering_id, teacher_person_id, status)
        VALUES (?, ?, ?, ?, 'active')`,
      )
      .bind(
        `assignment-${subject.slug}`,
        TENANT_ID,
        subject.offeringId,
        subject.teacherPersonId,
      ),
    ...seedAttachmentStatements(database, subject),
  ];

  subject.units.forEach((unit, index) => {
    statements.push(
      seedUnit(database, subject.offeringId, unit.id, unit.title, index + 1),
    );
  });

  for (const standard of subject.standards) {
    statements.push(seedStandard(database, subject.offeringId, standard));
  }

  const standardIdByCode = new Map(
    subject.standards.map((standard) => [standard.code, standard.id]),
  );

  for (const lesson of subject.lessons) {
    const versionId = `${lesson.id}:v${lesson.version}`;
    statements.push(
      database
        .prepare(
          `INSERT OR IGNORE INTO lessons
            (id, tenant_id, offering_id, unit_id, author_person_id, status, current_version)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          lesson.id,
          TENANT_ID,
          subject.offeringId,
          lesson.unitId,
          subject.teacherPersonId,
          lesson.status,
          lesson.version,
        ),
      database
        .prepare(
          `INSERT OR IGNORE INTO lesson_versions
            (id, tenant_id, lesson_id, version, title, summary, objectives, status, published_at, created_by_person_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          versionId,
          TENANT_ID,
          lesson.id,
          lesson.version,
          lesson.title,
          lesson.summary,
          JSON.stringify(lesson.objectives),
          lesson.status,
          lesson.publishedAt ?? null,
          subject.teacherPersonId,
        ),
    );

    for (const block of lesson.blocks) {
      statements.push(
        seedBlock(
          database,
          block.id,
          versionId,
          block.type,
          block.position,
          block.title,
          block.content,
          block.config,
        ),
      );
    }

    for (const code of lesson.standardCodes) {
      const standardId = standardIdByCode.get(code);
      if (!standardId) continue;
      statements.push(
        seedStandardLink(
          database,
          `link-${lesson.id}-${standardId}`,
          lesson.id,
          standardId,
        ),
      );
    }

    /* A locked lesson names its prerequisite in the hint the learner reads, so
       the release rule is derived from that rather than stated twice. */
    const prerequisite = lesson.releaseHint
      ? subject.lessons.find(
          (candidate) =>
            candidate.id !== lesson.id &&
            lesson.releaseHint?.includes(candidate.title),
        )
      : undefined;
    statements.push(
      seedReleaseRule(
        database,
        `release-${lesson.id}`,
        lesson.id,
        prerequisite?.id,
      ),
    );
  }

  return statements;
}

function seedUnit(
  database: SchoolDatabase,
  offeringId: string,
  id: string,
  title: string,
  position: number,
) {
  return database
    .prepare(
      `INSERT OR IGNORE INTO curriculum_units
        (id, tenant_id, offering_id, title, description, term, position)
      VALUES (?, ?, ?, ?, ?, 'Term 1', ?)`,
    )
    .bind(id, TENANT_ID, offeringId, title, title, position);
}

function seedBlock(
  database: SchoolDatabase,
  id: string,
  versionId: string,
  type: LessonBlockType,
  position: number,
  title: string,
  content: string,
  config: LessonBlock["config"] = {},
) {
  return database
    .prepare(
      `INSERT OR IGNORE INTO lesson_blocks
        (id, tenant_id, lesson_version_id, type, position, title, content, config, ready)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    .bind(
      id,
      TENANT_ID,
      versionId,
      type,
      position,
      title,
      content,
      JSON.stringify(config ?? {}),
    );
}

function seedStandard(
  database: SchoolDatabase,
  offeringId: string,
  standard: CurriculumStandard,
) {
  return database
    .prepare(
      `INSERT OR IGNORE INTO curriculum_standards
        (id, tenant_id, offering_id, code, strand, sub_strand, description, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      standard.id,
      TENANT_ID,
      offeringId,
      standard.code,
      standard.strand,
      standard.subStrand,
      standard.description,
      standard.position,
    );
}

function seedStandardLink(
  database: SchoolDatabase,
  id: string,
  lessonId: string,
  standardId: string,
) {
  return database
    .prepare(
      `INSERT OR IGNORE INTO lesson_standard_links
        (id, tenant_id, lesson_id, standard_id)
      VALUES (?, ?, ?, ?)`,
    )
    .bind(id, TENANT_ID, lessonId, standardId);
}

function seedReleaseRule(
  database: SchoolDatabase,
  id: string,
  lessonId: string,
  prerequisiteLessonId?: string,
) {
  return database
    .prepare(
      `INSERT OR IGNORE INTO lesson_release_rules
        (id, tenant_id, lesson_id, prerequisite_lesson_id)
      VALUES (?, ?, ?, ?)`,
    )
    .bind(id, TENANT_ID, lessonId, prerequisiteLessonId ?? null);
}


/* The subject the lesson library is about, or a refusal saying which of the
   two things went wrong: holding no subjects at all, and asking for one that
   is not yours, are different problems with different fixes.

   This replaced a query ending ORDER BY s.name LIMIT 1, which meant a teacher
   of Integrated Science and Mathematics could author lessons for whichever
   sorted first and had no route to the other at all. The list arrives from
   db/teaching-offerings.ts, resolved once by the caller because the workspace
   sends it to the switcher as well. */
function requireTeachingOffering(
  access: AccessContext,
  offerings: TeachingOffering[],
  requestedOfferingId?: string,
): OfferingRow {
  if (offerings.length === 0) {
    throw new AuthorizationError(
      "No subject offering is assigned to your account. An administrator assigns subjects on the Academics screen.",
    );
  }
  if (requestedOfferingId && !canTeachOffering(access, requestedOfferingId)) {
    throw new AuthorizationError(
      "You are not assigned to this subject offering.",
    );
  }
  const offering = selectOffering(offerings, requestedOfferingId);
  if (!offering) {
    throw new AuthorizationError(
      "You are not assigned to this subject offering.",
    );
  }
  /* The rest of the workspace query already speaks the row shape the old
     lookup returned, so the two meet here. */
  return {
    class_name: offering.className,
    code: offering.subjectCode,
    offering_id: offering.id,
    subject_name: offering.subjectName,
  };
}

async function loadLesson(
  database: SchoolDatabase,
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
  database: SchoolDatabase,
  tenantId: string,
  versionId: string,
): Promise<LessonBlock[]> {
  const result = await database
    .prepare(
      `SELECT id, type, position, title, content, config, ready
      FROM lesson_blocks
      WHERE tenant_id = ? AND lesson_version_id = ?
      ORDER BY position`,
    )
    .bind(tenantId, versionId)
    .all<{
      content: string;
      config: string;
      id: string;
      position: number;
      ready: number;
      title: string;
      type: LessonBlockType;
    }>();
  const blocks = result.results.map((block) => ({
    ...block,
    config: parseBlockConfiguration(block.config),
    ready: Boolean(block.ready),
  }));
  return attachAssetMetadata(database, tenantId, blocks);
}

/**
 * Resolves each block's attached asset id into what the file actually is.
 *
 * One query for the whole lesson rather than one per block: a lesson with six
 * resources was six round trips for three columns each. Blocks whose asset has
 * since been deleted come back without an attachment, which is what the player
 * needs to distinguish "nothing attached" from "here is a file".
 */
async function attachAssetMetadata(
  database: SchoolDatabase,
  tenantId: string,
  blocks: LessonBlock[],
): Promise<LessonBlock[]> {
  const assetIds = [
    ...new Set(
      blocks
        .map((block) => block.config?.mediaAssetId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (assetIds.length === 0) return blocks;

  const placeholders = assetIds.map(() => "?").join(", ");
  const result = await database
    .prepare(
      `SELECT id, kind, original_filename, content_type, size_bytes
      FROM media_assets
      WHERE tenant_id = ? AND status = 'ready' AND id IN (${placeholders})`,
    )
    .bind(tenantId, ...assetIds)
    .all<{
      content_type: string;
      id: string;
      kind: MediaKind;
      original_filename: string;
      size_bytes: number;
    }>();

  const byId = new Map(
    result.results.map((row) => [
      row.id,
      {
        contentType: row.content_type,
        filename: row.original_filename,
        kind: row.kind,
        sizeBytes: Number(row.size_bytes),
      },
    ]),
  );

  return blocks.map((block) => {
    const assetId = block.config?.mediaAssetId;
    const attachment = assetId ? byId.get(assetId) : undefined;
    return attachment ? { ...block, attachment } : block;
  });
}

function parseBlockConfiguration(value: string): LessonBlock["config"] {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as LessonBlock["config"])
      : {};
  } catch {
    return {};
  }
}

async function findUnitTitle(database: SchoolDatabase, unitId: string) {
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
    releaseMode: "immediate",
    standardCodes: [],
    status: row.status,
    title: row.title,
    unitId: row.unit_id,
    unitTitle: row.unit_title,
    updatedAt: row.updated_at,
    version: row.current_version,
  };
}

function buildLessonPlanningMap(
  rows: Array<{
    available_from: string | null;
    lesson_id: string;
    prerequisite_lesson_id: string | null;
    prerequisite_title: string | null;
    standard_code: string | null;
  }>,
) {
  const planning = new Map<
    string,
    {
      availableFrom?: string;
      prerequisiteLessonId?: string;
      prerequisiteTitle?: string;
      standardCodes: string[];
    }
  >();
  for (const row of rows) {
    const current = planning.get(row.lesson_id) ?? { standardCodes: [] };
    if (row.available_from) current.availableFrom = row.available_from;
    if (row.prerequisite_lesson_id) {
      current.prerequisiteLessonId = row.prerequisite_lesson_id;
    }
    if (row.prerequisite_title) {
      current.prerequisiteTitle = row.prerequisite_title;
    }
    if (
      row.standard_code &&
      !current.standardCodes.includes(row.standard_code)
    ) {
      current.standardCodes.push(row.standard_code);
    }
    planning.set(row.lesson_id, current);
  }
  return planning;
}

async function findStandardCodes(
  database: SchoolDatabase,
  tenantId: string,
  lessonId: string,
) {
  const result = await database
    .prepare(
      `SELECT s.code
      FROM lesson_standard_links link
      INNER JOIN curriculum_standards s ON s.id = link.standard_id
      WHERE link.tenant_id = ? AND link.lesson_id = ?
      ORDER BY s.position`,
    )
    .bind(tenantId, lessonId)
    .all<{ code: string }>();
  return result.results.map((row) => row.code);
}

async function findStandardIds(
  database: SchoolDatabase,
  tenantId: string,
  lessonId: string,
) {
  const result = await database
    .prepare(
      `SELECT standard_id
      FROM lesson_standard_links
      WHERE tenant_id = ? AND lesson_id = ?`,
    )
    .bind(tenantId, lessonId)
    .all<{ standard_id: string }>();
  return result.results.map((row) => row.standard_id);
}

async function findReleaseRule(
  database: SchoolDatabase,
  tenantId: string,
  lessonId: string,
): Promise<LessonReleaseRule | undefined> {
  const row = await database
    .prepare(
      `SELECT available_from, available_until, prerequisite_lesson_id
      FROM lesson_release_rules
      WHERE tenant_id = ? AND lesson_id = ?
      LIMIT 1`,
    )
    .bind(tenantId, lessonId)
    .first<{
      available_from: string | null;
      available_until: string | null;
      prerequisite_lesson_id: string | null;
    }>();
  if (!row) return undefined;
  return {
    availableFrom: row.available_from ?? undefined,
    availableUntil: row.available_until ?? undefined,
    lessonId,
    prerequisiteLessonId: row.prerequisite_lesson_id ?? undefined,
  };
}

async function findLessonTitle(database: SchoolDatabase, lessonId: string) {
  const row = await database
    .prepare(
      `SELECT v.title
      FROM lessons l
      INNER JOIN lesson_versions v
        ON v.lesson_id = l.id AND v.version = l.current_version
      WHERE l.id = ?
      LIMIT 1`,
    )
    .bind(lessonId)
    .first<{ title: string }>();
  return row?.title;
}

async function countVersionBlocks(
  database: SchoolDatabase,
  tenantId: string,
  versionId: string,
) {
  const row = await database
    .prepare(
      `SELECT COUNT(*) AS block_count
      FROM lesson_blocks
      WHERE tenant_id = ? AND lesson_version_id = ?`,
    )
    .bind(tenantId, versionId)
    .first<{ block_count: number }>();
  return Number(row?.block_count ?? 0);
}

function estimateLessonMinutes(blockCount: number) {
  return Math.max(8, blockCount * 5);
}

function lessonReleaseHint(
  availability: LessonAvailability,
  availableFrom: string | null,
  prerequisiteTitle: string | null,
) {
  if (availability === "locked" && prerequisiteTitle) {
    return `Complete “${prerequisiteTitle}” first`;
  }
  if (availability === "scheduled" && availableFrom) {
    return `Opens ${new Date(availableFrom).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    })}`;
  }
  if (availability === "closed") return "The lesson window has closed";
  return undefined;
}

function auditStatement(
  database: SchoolDatabase,
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
    typeof input.offeringId !== "string" ||
    typeof input.unitId !== "string" ||
    !Array.isArray(input.objectives) ||
    !Array.isArray(input.blocks) ||
    !Array.isArray(input.standardIds) ||
    !input.title.trim() ||
    !input.offeringId.trim() ||
    !input.unitId.trim() ||
    input.objectives.length === 0 ||
    input.blocks.length === 0 ||
    input.objectives.some(
      (objective) => typeof objective !== "string" || !objective.trim(),
    ) ||
    input.blocks.some(
      (block) =>
        typeof block.title !== "string" ||
        typeof block.content !== "string" ||
        !block.title.trim() ||
        !block.content.trim(),
    )
  ) {
    throw new LessonPolicyError(
      "Offering, unit, title, objectives, and complete lesson blocks are required.",
    );
  }
  if (input.blocks.some((block) => !isLessonBlockType(block.type))) {
    throw new LessonPolicyError("Select a supported lesson block type.");
  }
}

function isLessonBlockType(value: string): value is LessonBlockType {
  return ["text", "video", "interactive", "practice", "resource"].includes(
    value,
  );
}

async function requireOfferingUnit(
  database: SchoolDatabase,
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

async function requireOfferingStandards(
  database: SchoolDatabase,
  tenantId: string,
  offeringId: string,
  standardIds: string[],
) {
  if (standardIds.length === 0) return;
  const placeholders = standardIds.map(() => "?").join(", ");
  const result = await database
    .prepare(
      `SELECT id
      FROM curriculum_standards
      WHERE tenant_id = ? AND offering_id = ? AND id IN (${placeholders})`,
    )
    .bind(tenantId, offeringId, ...standardIds)
    .all<{ id: string }>();
  if (result.results.length !== new Set(standardIds).size) {
    throw new LessonPolicyError(
      "Every selected curriculum standard must belong to this subject.",
    );
  }
}

async function requirePrerequisiteLesson(
  database: SchoolDatabase,
  tenantId: string,
  offeringId: string,
  prerequisiteLessonId?: string,
) {
  if (!prerequisiteLessonId) return;
  const prerequisite = await database
    .prepare(
      `SELECT id
      FROM lessons
      WHERE id = ? AND tenant_id = ? AND offering_id = ? AND status = 'published'
      LIMIT 1`,
    )
    .bind(prerequisiteLessonId, tenantId, offeringId)
    .first<{ id: string }>();
  if (!prerequisite) {
    throw new LessonPolicyError(
      "A prerequisite must be a published lesson in this subject.",
    );
  }
}

async function requireBlockAttachments(
  database: SchoolDatabase,
  tenantId: string,
  offeringId: string,
  blocks: CreateDraftInput["blocks"],
) {
  const mediaAssetIds = new Set(
    blocks
      .map((block) => block.config?.mediaAssetId)
      .filter((id): id is string => Boolean(id)),
  );
  const activityIds = new Set(
    blocks
      .map((block) => block.config?.activityId)
      .filter((id): id is string => Boolean(id)),
  );
  const questionIds = new Set(
    blocks.flatMap((block) => block.config?.questionIds ?? []),
  );
  for (const assetId of mediaAssetIds) {
    const asset = await database
      .prepare(
        `SELECT id
        FROM media_assets
        WHERE id = ? AND tenant_id = ? AND offering_id = ?
          AND status = 'ready'
        LIMIT 1`,
      )
      .bind(assetId, tenantId, offeringId)
      .first<{ id: string }>();
    if (!asset) {
      throw new LessonPolicyError(
        "Every attached media asset must be ready in this subject.",
      );
    }
  }
  for (const activityId of activityIds) {
    const activity = await database
      .prepare(
        `SELECT id
        FROM interactive_activities
        WHERE id = ? AND tenant_id = ? AND offering_id = ?
          AND status = 'launchable'
        LIMIT 1`,
      )
      .bind(activityId, tenantId, offeringId)
      .first<{ id: string }>();
    if (!activity) {
      throw new LessonPolicyError(
        "Every attached H5P activity must be launchable in this subject.",
      );
    }
  }
  /* A checkpoint may only ask this subject's own approved questions. Without
     this a block could name any question id in the school and the player,
     which resolves ids server-side, would happily serve it — a Physics paper
     leaking through a Social Studies lesson. */
  for (const questionId of questionIds) {
    const question = await database
      .prepare(
        `SELECT id
        FROM question_bank_items
        WHERE id = ? AND tenant_id = ? AND offering_id = ?
          AND status = 'approved'
        LIMIT 1`,
      )
      .bind(questionId, tenantId, offeringId)
      .first<{ id: string }>();
    if (!question) {
      throw new LessonPolicyError(
        "Every checkpoint question must be an approved question in this subject.",
      );
    }
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
