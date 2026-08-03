import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const people = sqliteTable(
  "people",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    kind: text("kind", { enum: ["staff", "learner", "guardian"] }).notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    status: text("status", {
      enum: ["active", "invited", "inactive", "alumni"],
    })
      .notNull()
      .default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("people_tenant_kind_idx").on(table.tenantId, table.kind),
    uniqueIndex("people_tenant_email_idx").on(table.tenantId, table.email),
  ],
);

export const identityAccounts = sqliteTable(
  "identity_accounts",
  {
    id: text("id").primaryKey(),
    personId: text("person_id")
      .notNull()
      .references(() => people.id),
    provider: text("provider").notNull(),
    providerSubject: text("provider_subject").notNull(),
    email: text("email").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("identity_provider_subject_idx").on(
      table.provider,
      table.providerSubject,
    ),
  ],
);

export const tenantMemberships = sqliteTable(
  "tenant_memberships",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    personId: text("person_id")
      .notNull()
      .references(() => people.id),
    role: text("role", {
      enum: [
        "school-admin",
        "academic-admin",
        "admissions-officer",
        "teacher",
        "class-teacher",
        "guardian",
        "learner",
      ],
    }).notNull(),
    status: text("status", {
      enum: ["invited", "active", "revoked"],
    })
      .notNull()
      .default("invited"),
    scopeType: text("scope_type", {
      enum: ["tenant", "class", "subject", "learner"],
    })
      .notNull()
      .default("tenant"),
    scopeId: text("scope_id"),
    invitedAt: text("invited_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    acceptedAt: text("accepted_at"),
  },
  (table) => [
    index("memberships_tenant_person_idx").on(table.tenantId, table.personId),
    index("memberships_tenant_role_idx").on(table.tenantId, table.role),
  ],
);

export const guardianRelationships = sqliteTable(
  "guardian_relationships",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    guardianPersonId: text("guardian_person_id")
      .notNull()
      .references(() => people.id),
    learnerPersonId: text("learner_person_id")
      .notNull()
      .references(() => people.id),
    relationship: text("relationship").notNull(),
    status: text("status", { enum: ["active", "revoked"] })
      .notNull()
      .default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("guardian_tenant_guardian_idx").on(
      table.tenantId,
      table.guardianPersonId,
    ),
    uniqueIndex("guardian_learner_relationship_idx").on(
      table.tenantId,
      table.guardianPersonId,
      table.learnerPersonId,
    ),
  ],
);

export const tenantBootstrap = sqliteTable("tenant_bootstrap", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => tenants.id),
  claimedByIdentityId: text("claimed_by_identity_id").notNull(),
  claimedAt: text("claimed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    actorPersonId: text("actor_person_id").references(() => people.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("audit_tenant_created_idx").on(table.tenantId, table.createdAt),
  ],
);

export const subjects = sqliteTable(
  "subjects",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("subjects_tenant_code_idx").on(table.tenantId, table.code),
  ],
);

export const subjectOfferings = sqliteTable(
  "subject_offerings",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    subjectId: text("subject_id")
      .notNull()
      .references(() => subjects.id),
    classGroupId: text("class_group_id").notNull(),
    className: text("class_name").notNull(),
    academicYearId: text("academic_year_id").notNull(),
    requirement: text("requirement", {
      enum: ["compulsory", "optional"],
    }).notNull(),
    status: text("status", { enum: ["active", "closed"] })
      .notNull()
      .default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("offerings_tenant_class_idx").on(table.tenantId, table.classGroupId),
    uniqueIndex("offerings_subject_class_year_idx").on(
      table.tenantId,
      table.subjectId,
      table.classGroupId,
      table.academicYearId,
    ),
  ],
);

export const curriculumUnits = sqliteTable(
  "curriculum_units",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    offeringId: text("offering_id")
      .notNull()
      .references(() => subjectOfferings.id),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    term: text("term").notNull(),
    position: integer("position").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("units_offering_position_idx").on(
      table.offeringId,
      table.position,
    ),
  ],
);

export const teacherAssignments = sqliteTable(
  "teacher_assignments",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    offeringId: text("offering_id")
      .notNull()
      .references(() => subjectOfferings.id),
    teacherPersonId: text("teacher_person_id")
      .notNull()
      .references(() => people.id),
    status: text("status", { enum: ["active", "closed"] })
      .notNull()
      .default("active"),
    assignedAt: text("assigned_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("teacher_offering_assignment_idx").on(
      table.tenantId,
      table.offeringId,
      table.teacherPersonId,
    ),
  ],
);

export const lessons = sqliteTable(
  "lessons",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    offeringId: text("offering_id")
      .notNull()
      .references(() => subjectOfferings.id),
    unitId: text("unit_id")
      .notNull()
      .references(() => curriculumUnits.id),
    authorPersonId: text("author_person_id")
      .notNull()
      .references(() => people.id),
    status: text("status", {
      enum: ["draft", "published", "archived"],
    })
      .notNull()
      .default("draft"),
    currentVersion: integer("current_version").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("lessons_tenant_offering_idx").on(
      table.tenantId,
      table.offeringId,
      table.status,
    ),
  ],
);

export const lessonVersions = sqliteTable(
  "lesson_versions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    objectives: text("objectives").notNull().default("[]"),
    status: text("status", { enum: ["draft", "published", "archived"] })
      .notNull()
      .default("draft"),
    publishedAt: text("published_at"),
    createdByPersonId: text("created_by_person_id")
      .notNull()
      .references(() => people.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("lesson_version_number_idx").on(
      table.lessonId,
      table.version,
    ),
  ],
);

export const lessonBlocks = sqliteTable(
  "lesson_blocks",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    lessonVersionId: text("lesson_version_id")
      .notNull()
      .references(() => lessonVersions.id),
    type: text("type", {
      enum: ["text", "video", "interactive", "practice", "resource"],
    }).notNull(),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    config: text("config").notNull().default("{}"),
    ready: integer("ready", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    uniqueIndex("lesson_block_position_idx").on(
      table.lessonVersionId,
      table.position,
    ),
  ],
);

export const lessonProgress = sqliteTable(
  "lesson_progress",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    learnerPersonId: text("learner_person_id")
      .notNull()
      .references(() => people.id),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id),
    lessonVersion: integer("lesson_version").notNull(),
    percent: integer("percent").notNull().default(0),
    status: text("status", { enum: ["in-progress", "completed"] })
      .notNull()
      .default("in-progress"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("lesson_progress_learner_version_idx").on(
      table.tenantId,
      table.learnerPersonId,
      table.lessonId,
      table.lessonVersion,
    ),
  ],
);

export const curriculumStandards = sqliteTable(
  "curriculum_standards",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    offeringId: text("offering_id")
      .notNull()
      .references(() => subjectOfferings.id),
    code: text("code").notNull(),
    strand: text("strand").notNull(),
    subStrand: text("sub_strand").notNull(),
    description: text("description").notNull(),
    position: integer("position").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("standards_offering_code_idx").on(
      table.tenantId,
      table.offeringId,
      table.code,
    ),
    index("standards_offering_position_idx").on(
      table.tenantId,
      table.offeringId,
      table.position,
    ),
  ],
);

export const lessonStandardLinks = sqliteTable(
  "lesson_standard_links",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id),
    standardId: text("standard_id")
      .notNull()
      .references(() => curriculumStandards.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("lesson_standard_link_idx").on(
      table.tenantId,
      table.lessonId,
      table.standardId,
    ),
    index("standard_lesson_lookup_idx").on(
      table.tenantId,
      table.standardId,
    ),
  ],
);

export const lessonReleaseRules = sqliteTable(
  "lesson_release_rules",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id),
    availableFrom: text("available_from"),
    availableUntil: text("available_until"),
    prerequisiteLessonId: text("prerequisite_lesson_id").references(
      () => lessons.id,
    ),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("lesson_release_rule_idx").on(table.tenantId, table.lessonId),
    index("lesson_prerequisite_lookup_idx").on(
      table.tenantId,
      table.prerequisiteLessonId,
    ),
  ],
);

export const mediaAssets = sqliteTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    offeringId: text("offering_id")
      .notNull()
      .references(() => subjectOfferings.id),
    uploadedByPersonId: text("uploaded_by_person_id")
      .notNull()
      .references(() => people.id),
    kind: text("kind", {
      enum: ["image", "audio", "video", "document", "h5p-package"],
    }).notNull(),
    originalFilename: text("original_filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    objectKey: text("object_key").notNull(),
    status: text("status", {
      enum: ["ready", "awaiting-runtime", "quarantined", "deleted"],
    })
      .notNull()
      .default("ready"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("media_object_key_idx").on(table.objectKey),
    index("media_tenant_offering_idx").on(
      table.tenantId,
      table.offeringId,
      table.status,
    ),
  ],
);

export const interactiveActivities = sqliteTable(
  "interactive_activities",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    offeringId: text("offering_id")
      .notNull()
      .references(() => subjectOfferings.id),
    createdByPersonId: text("created_by_person_id")
      .notNull()
      .references(() => people.id),
    title: text("title").notNull(),
    provider: text("provider", { enum: ["h5p"] })
      .notNull()
      .default("h5p"),
    contentType: text("content_type").notNull(),
    launchUrl: text("launch_url"),
    launchOrigin: text("launch_origin"),
    packageAssetId: text("package_asset_id").references(() => mediaAssets.id),
    runtimeContentId: text("runtime_content_id"),
    runtimeImportedAt: text("runtime_imported_at"),
    fallbackText: text("fallback_text").notNull().default(""),
    status: text("status", {
      enum: ["draft", "launchable", "awaiting-runtime", "archived"],
    })
      .notNull()
      .default("draft"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("activities_tenant_offering_idx").on(
      table.tenantId,
      table.offeringId,
      table.status,
    ),
  ],
);

export const interactiveActivityResults = sqliteTable(
  "interactive_activity_results",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    activityId: text("activity_id")
      .notNull()
      .references(() => interactiveActivities.id),
    learnerPersonId: text("learner_person_id")
      .notNull()
      .references(() => people.id),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id),
    lessonVersion: integer("lesson_version").notNull(),
    verb: text("verb", {
      enum: ["experienced", "answered", "completed"],
    }).notNull(),
    scorePercent: integer("score_percent"),
    success: integer("success", { mode: "boolean" }),
    completion: integer("completion", { mode: "boolean" })
      .notNull()
      .default(false),
    statementJson: text("statement_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("activity_results_learner_idx").on(
      table.tenantId,
      table.learnerPersonId,
      table.activityId,
      table.createdAt,
    ),
  ],
);

export const questionBankItems = sqliteTable(
  "question_bank_items",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    offeringId: text("offering_id")
      .notNull()
      .references(() => subjectOfferings.id),
    authorPersonId: text("author_person_id")
      .notNull()
      .references(() => people.id),
    type: text("type", {
      enum: [
        "single-choice",
        "multiple-choice",
        "true-false",
        "short-text",
        "numeric",
        "matching",
        "ordering",
        "essay",
        "file-upload",
        "hotspot",
        "composite",
      ],
    }).notNull(),
    status: text("status", {
      enum: ["draft", "approved", "retired"],
    })
      .notNull()
      .default("draft"),
    difficulty: text("difficulty", {
      enum: ["foundation", "standard", "challenge"],
    })
      .notNull()
      .default("standard"),
    topic: text("topic").notNull(),
    tags: text("tags").notNull().default("[]"),
    currentVersion: integer("current_version").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("questions_tenant_offering_idx").on(
      table.tenantId,
      table.offeringId,
      table.status,
    ),
  ],
);

export const questionVersions = sqliteTable(
  "question_versions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    questionId: text("question_id")
      .notNull()
      .references(() => questionBankItems.id),
    version: integer("version").notNull(),
    prompt: text("prompt").notNull(),
    options: text("options").notNull().default("[]"),
    answerKey: text("answer_key").notNull().default("{}"),
    rationale: text("rationale").notNull().default(""),
    marks: integer("marks").notNull(),
    status: text("status", {
      enum: ["draft", "approved", "retired"],
    })
      .notNull()
      .default("draft"),
    createdByPersonId: text("created_by_person_id")
      .notNull()
      .references(() => people.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("question_version_number_idx").on(
      table.questionId,
      table.version,
    ),
  ],
);

export const assessments = sqliteTable(
  "assessments",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    offeringId: text("offering_id")
      .notNull()
      .references(() => subjectOfferings.id),
    authorPersonId: text("author_person_id")
      .notNull()
      .references(() => people.id),
    status: text("status", {
      enum: ["draft", "published", "archived"],
    })
      .notNull()
      .default("draft"),
    currentVersion: integer("current_version").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("assessments_tenant_offering_idx").on(
      table.tenantId,
      table.offeringId,
      table.status,
    ),
  ],
);

export const assessmentVersions = sqliteTable(
  "assessment_versions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => assessments.id),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    purpose: text("purpose", {
      enum: [
        "diagnostic",
        "formative",
        "homework",
        "summative",
        "mock-examination",
        "timed-examination",
        "survey",
      ],
    }).notNull(),
    instructions: text("instructions").notNull().default(""),
    timeLimitMinutes: integer("time_limit_minutes").notNull(),
    passMarkPercent: integer("pass_mark_percent").notNull(),
    attemptsAllowed: integer("attempts_allowed").notNull().default(1),
    shuffleQuestions: integer("shuffle_questions", { mode: "boolean" })
      .notNull()
      .default(false),
    feedbackPolicy: text("feedback_policy", {
      enum: ["immediate", "after-submit", "after-release"],
    })
      .notNull()
      .default("after-release"),
    status: text("status", {
      enum: ["draft", "published", "archived"],
    })
      .notNull()
      .default("draft"),
    publishedAt: text("published_at"),
    createdByPersonId: text("created_by_person_id")
      .notNull()
      .references(() => people.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("assessment_version_number_idx").on(
      table.assessmentId,
      table.version,
    ),
  ],
);

export const assessmentQuestions = sqliteTable(
  "assessment_questions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    assessmentVersionId: text("assessment_version_id")
      .notNull()
      .references(() => assessmentVersions.id),
    questionVersionId: text("question_version_id")
      .notNull()
      .references(() => questionVersions.id),
    position: integer("position").notNull(),
    marks: integer("marks").notNull(),
    required: integer("required", { mode: "boolean" }).notNull().default(true),
    snapshot: text("snapshot").notNull(),
  },
  (table) => [
    uniqueIndex("assessment_question_position_idx").on(
      table.assessmentVersionId,
      table.position,
    ),
  ],
);

export const assessmentAttempts = sqliteTable(
  "assessment_attempts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => assessments.id),
    assessmentVersion: integer("assessment_version").notNull(),
    learnerPersonId: text("learner_person_id")
      .notNull()
      .references(() => people.id),
    status: text("status", {
      enum: [
        "in-progress",
        "submitted",
        "needs-marking",
        "marked",
        "released",
        "invalidated",
      ],
    })
      .notNull()
      .default("in-progress"),
    questionOrder: text("question_order").notNull().default("[]"),
    startedAt: text("started_at").notNull(),
    deadlineAt: text("deadline_at").notNull(),
    submittedAt: text("submitted_at"),
    autoMarks: integer("auto_marks").notNull().default(0),
    manualMarks: integer("manual_marks").notNull().default(0),
    maximumMarks: integer("maximum_marks").notNull(),
    releasedAt: text("released_at"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("attempts_learner_assessment_idx").on(
      table.tenantId,
      table.learnerPersonId,
      table.assessmentId,
    ),
    index("attempts_marking_queue_idx").on(
      table.tenantId,
      table.status,
      table.updatedAt,
    ),
  ],
);

export const assessmentResponses = sqliteTable(
  "assessment_responses",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => assessmentAttempts.id),
    questionVersionId: text("question_version_id")
      .notNull()
      .references(() => questionVersions.id),
    response: text("response").notNull().default("{}"),
    flagged: integer("flagged", { mode: "boolean" }).notNull().default(false),
    autoMarks: integer("auto_marks").notNull().default(0),
    manualMarks: integer("manual_marks"),
    markingStatus: text("marking_status", {
      enum: ["unanswered", "auto-marked", "needs-marking", "marked"],
    })
      .notNull()
      .default("unanswered"),
    feedback: text("feedback"),
    markedByPersonId: text("marked_by_person_id").references(() => people.id),
    markedAt: text("marked_at"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("response_attempt_question_idx").on(
      table.attemptId,
      table.questionVersionId,
    ),
  ],
);

export const gradingPeriods = sqliteTable(
  "grading_periods",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    academicYearId: text("academic_year_id").notNull(),
    name: text("name").notNull(),
    startsOn: text("starts_on").notNull(),
    endsOn: text("ends_on").notNull(),
    status: text("status", { enum: ["open", "closed", "archived"] })
      .notNull()
      .default("open"),
    policyVersion: integer("policy_version").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("period_tenant_year_name_idx").on(
      table.tenantId,
      table.academicYearId,
      table.name,
    ),
  ],
);

export const gradeCategories = sqliteTable(
  "grade_categories",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    periodId: text("period_id")
      .notNull()
      .references(() => gradingPeriods.id),
    offeringId: text("offering_id")
      .notNull()
      .references(() => subjectOfferings.id),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["continuous-assessment", "examination"] })
      .notNull(),
    weightPercent: integer("weight_percent").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    uniqueIndex("category_offering_position_idx").on(
      table.periodId,
      table.offeringId,
      table.position,
    ),
  ],
);

export const gradeItems = sqliteTable(
  "grade_items",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    periodId: text("period_id")
      .notNull()
      .references(() => gradingPeriods.id),
    offeringId: text("offering_id")
      .notNull()
      .references(() => subjectOfferings.id),
    categoryId: text("category_id")
      .notNull()
      .references(() => gradeCategories.id),
    assessmentId: text("assessment_id").references(() => assessments.id),
    title: text("title").notNull(),
    maximumMarks: integer("maximum_marks").notNull(),
    dueOn: text("due_on"),
    status: text("status", { enum: ["open", "closed", "excluded"] })
      .notNull()
      .default("open"),
    position: integer("position").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("grade_item_offering_position_idx").on(
      table.periodId,
      table.offeringId,
      table.position,
    ),
  ],
);

export const gradeEntries = sqliteTable(
  "grade_entries",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    itemId: text("item_id")
      .notNull()
      .references(() => gradeItems.id),
    learnerPersonId: text("learner_person_id")
      .notNull()
      .references(() => people.id),
    rawMarks: integer("raw_marks"),
    adjustedMarks: integer("adjusted_marks"),
    status: text("status", {
      enum: ["recorded", "missing", "absent", "excused", "excluded"],
    })
      .notNull()
      .default("missing"),
    adjustmentReason: text("adjustment_reason"),
    recordedByPersonId: text("recorded_by_person_id")
      .notNull()
      .references(() => people.id),
    recordedAt: text("recorded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("grade_entry_item_learner_idx").on(
      table.itemId,
      table.learnerPersonId,
    ),
    index("grade_entries_learner_idx").on(
      table.tenantId,
      table.learnerPersonId,
    ),
  ],
);

export const gradingScaleBands = sqliteTable(
  "grading_scale_bands",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    periodId: text("period_id")
      .notNull()
      .references(() => gradingPeriods.id),
    position: integer("position").notNull(),
    minimumTenths: integer("minimum_tenths").notNull(),
    maximumTenths: integer("maximum_tenths").notNull(),
    grade: text("grade").notNull(),
    remark: text("remark").notNull(),
  },
  (table) => [
    uniqueIndex("scale_period_position_idx").on(
      table.periodId,
      table.position,
    ),
  ],
);

export const gradebookSubmissions = sqliteTable(
  "gradebook_submissions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    periodId: text("period_id")
      .notNull()
      .references(() => gradingPeriods.id),
    offeringId: text("offering_id")
      .notNull()
      .references(() => subjectOfferings.id),
    status: text("status", {
      enum: ["open", "submitted", "reviewed", "locked"],
    })
      .notNull()
      .default("open"),
    submittedByPersonId: text("submitted_by_person_id").references(
      () => people.id,
    ),
    submittedAt: text("submitted_at"),
    reviewedByPersonId: text("reviewed_by_person_id").references(
      () => people.id,
    ),
    reviewedAt: text("reviewed_at"),
    lockedAt: text("locked_at"),
  },
  (table) => [
    uniqueIndex("gradebook_period_offering_idx").on(
      table.tenantId,
      table.periodId,
      table.offeringId,
    ),
  ],
);

export const reportCards = sqliteTable(
  "report_cards",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    learnerPersonId: text("learner_person_id")
      .notNull()
      .references(() => people.id),
    periodId: text("period_id")
      .notNull()
      .references(() => gradingPeriods.id),
    classGroupId: text("class_group_id").notNull(),
    className: text("class_name").notNull(),
    status: text("status", {
      enum: ["draft", "submitted", "approved", "released", "superseded"],
    })
      .notNull()
      .default("draft"),
    currentVersion: integer("current_version").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("report_learner_period_idx").on(
      table.tenantId,
      table.learnerPersonId,
      table.periodId,
    ),
  ],
);

export const reportCardVersions = sqliteTable(
  "report_card_versions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    reportCardId: text("report_card_id")
      .notNull()
      .references(() => reportCards.id),
    version: integer("version").notNull(),
    status: text("status", {
      enum: ["draft", "submitted", "approved", "released", "superseded"],
    }).notNull(),
    overallAverageTenths: integer("overall_average_tenths").notNull(),
    attendancePresent: integer("attendance_present").notNull(),
    attendanceTotal: integer("attendance_total").notNull(),
    conduct: text("conduct").notNull(),
    classTeacherComment: text("class_teacher_comment").notNull(),
    headteacherComment: text("headteacher_comment").notNull(),
    promotionDecision: text("promotion_decision").notNull(),
    nextTermBeginsOn: text("next_term_begins_on"),
    submittedAt: text("submitted_at"),
    approvedByPersonId: text("approved_by_person_id").references(
      () => people.id,
    ),
    approvedAt: text("approved_at"),
    releasedAt: text("released_at"),
    createdByPersonId: text("created_by_person_id")
      .notNull()
      .references(() => people.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("report_version_number_idx").on(
      table.reportCardId,
      table.version,
    ),
  ],
);

export const reportSubjectResults = sqliteTable(
  "report_subject_results",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    reportVersionId: text("report_version_id")
      .notNull()
      .references(() => reportCardVersions.id),
    offeringId: text("offering_id").notNull(),
    subjectCode: text("subject_code").notNull(),
    subjectName: text("subject_name").notNull(),
    scoreTenths: integer("score_tenths").notNull(),
    grade: text("grade").notNull(),
    remark: text("remark").notNull(),
    teacherComment: text("teacher_comment").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    uniqueIndex("report_subject_position_idx").on(
      table.reportVersionId,
      table.position,
    ),
  ],
);

export const assignments = sqliteTable(
  "assignments",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    offeringId: text("offering_id")
      .notNull()
      .references(() => subjectOfferings.id),
    authorPersonId: text("author_person_id")
      .notNull()
      .references(() => people.id),
    status: text("status", {
      enum: ["draft", "published", "closed", "archived"],
    })
      .notNull()
      .default("draft"),
    currentVersion: integer("current_version").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("assignments_offering_status_idx").on(
      table.tenantId,
      table.offeringId,
      table.status,
    ),
  ],
);

export const assignmentVersions = sqliteTable(
  "assignment_versions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignments.id),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    brief: text("brief").notNull(),
    opensAt: text("opens_at").notNull(),
    dueAt: text("due_at").notNull(),
    maximumPoints: integer("maximum_points").notNull(),
    submissionMode: text("submission_mode", {
      enum: ["text", "link", "offline"],
    }).notNull(),
    status: text("status", {
      enum: ["draft", "published", "closed", "archived"],
    }).notNull(),
    publishedAt: text("published_at"),
    createdByPersonId: text("created_by_person_id")
      .notNull()
      .references(() => people.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("assignment_version_number_idx").on(
      table.assignmentId,
      table.version,
    ),
  ],
);

export const rubricCriteria = sqliteTable(
  "rubric_criteria",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    assignmentVersionId: text("assignment_version_id")
      .notNull()
      .references(() => assignmentVersions.id),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    maximumPoints: integer("maximum_points").notNull(),
  },
  (table) => [
    uniqueIndex("rubric_criterion_position_idx").on(
      table.assignmentVersionId,
      table.position,
    ),
  ],
);

export const rubricLevels = sqliteTable(
  "rubric_levels",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    criterionId: text("criterion_id")
      .notNull()
      .references(() => rubricCriteria.id),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    points: integer("points").notNull(),
    descriptor: text("descriptor").notNull(),
  },
  (table) => [
    uniqueIndex("rubric_level_position_idx").on(
      table.criterionId,
      table.position,
    ),
  ],
);

export const assignmentSubmissions = sqliteTable(
  "assignment_submissions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignments.id),
    assignmentVersion: integer("assignment_version").notNull(),
    learnerPersonId: text("learner_person_id")
      .notNull()
      .references(() => people.id),
    status: text("status", {
      enum: ["not-started", "submitted", "late", "marked", "released"],
    })
      .notNull()
      .default("not-started"),
    responseText: text("response_text").notNull().default(""),
    submittedAt: text("submitted_at"),
    markedByPersonId: text("marked_by_person_id").references(() => people.id),
    markedAt: text("marked_at"),
    totalPoints: integer("total_points"),
    feedback: text("feedback"),
    releasedAt: text("released_at"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("submission_assignment_learner_idx").on(
      table.assignmentId,
      table.assignmentVersion,
      table.learnerPersonId,
    ),
    index("submission_marking_queue_idx").on(
      table.tenantId,
      table.status,
      table.updatedAt,
    ),
  ],
);

/**
 * Files a learner attaches to their submission.
 *
 * A separate table rather than a column on the submission because handed-in
 * work is rarely one file — a scanned exercise is several photographs, and a
 * project is a document plus its data. The bytes live in media_assets like any
 * other upload; this only records which of them belong to whose submission,
 * which is also what makes the download check possible: an asset id alone
 * cannot tell you whether the person asking is allowed to see it.
 */
export const submissionAttachments = sqliteTable(
  "submission_attachments",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    submissionId: text("submission_id")
      .notNull()
      .references(() => assignmentSubmissions.id),
    mediaAssetId: text("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id),
    uploadedAt: text("uploaded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    /* Attaching the same file twice is a double-click, not an intention. */
    uniqueIndex("submission_attachment_asset_idx").on(
      table.submissionId,
      table.mediaAssetId,
    ),
    index("submission_attachment_submission_idx").on(
      table.tenantId,
      table.submissionId,
    ),
  ],
);

export const rubricScores = sqliteTable(
  "rubric_scores",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    submissionId: text("submission_id")
      .notNull()
      .references(() => assignmentSubmissions.id),
    criterionId: text("criterion_id")
      .notNull()
      .references(() => rubricCriteria.id),
    points: integer("points").notNull(),
    comment: text("comment").notNull().default(""),
    markedByPersonId: text("marked_by_person_id")
      .notNull()
      .references(() => people.id),
    markedAt: text("marked_at").notNull(),
  },
  (table) => [
    uniqueIndex("rubric_score_submission_criterion_idx").on(
      table.submissionId,
      table.criterionId,
    ),
  ],
);

export const attendanceSessions = sqliteTable(
  "attendance_sessions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    classGroupId: text("class_group_id").notNull(),
    sessionDate: text("session_date").notNull(),
    mode: text("mode", { enum: ["daily", "period"] }).notNull(),
    timetableEntryId: text("timetable_entry_id"),
    status: text("status", {
      enum: ["draft", "submitted", "corrected"],
    })
      .notNull()
      .default("draft"),
    takenByPersonId: text("taken_by_person_id")
      .notNull()
      .references(() => people.id),
    submittedAt: text("submitted_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("attendance_class_date_mode_idx").on(
      table.tenantId,
      table.classGroupId,
      table.sessionDate,
      table.mode,
    ),
  ],
);

export const attendanceRecords = sqliteTable(
  "attendance_records",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sessionId: text("session_id")
      .notNull()
      .references(() => attendanceSessions.id),
    learnerPersonId: text("learner_person_id")
      .notNull()
      .references(() => people.id),
    code: text("code", {
      enum: [
        "present",
        "absent",
        "late",
        "excused",
        "sick",
        "school-activity",
        "remote",
      ],
    }).notNull(),
    note: text("note").notNull().default(""),
    recordedByPersonId: text("recorded_by_person_id")
      .notNull()
      .references(() => people.id),
    recordedAt: text("recorded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("attendance_session_learner_idx").on(
      table.sessionId,
      table.learnerPersonId,
    ),
    index("attendance_learner_idx").on(
      table.tenantId,
      table.learnerPersonId,
    ),
  ],
);

export const attendanceCorrections = sqliteTable(
  "attendance_corrections",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    attendanceRecordId: text("attendance_record_id")
      .notNull()
      .references(() => attendanceRecords.id),
    previousCode: text("previous_code").notNull(),
    newCode: text("new_code").notNull(),
    reason: text("reason").notNull(),
    correctedByPersonId: text("corrected_by_person_id")
      .notNull()
      .references(() => people.id),
    correctedAt: text("corrected_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("attendance_corrections_record_idx").on(
      table.tenantId,
      table.attendanceRecordId,
    ),
  ],
);

export const timetablePeriods = sqliteTable(
  "timetable_periods",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    kind: text("kind", { enum: ["lesson", "break", "assembly"] })
      .notNull()
      .default("lesson"),
  },
  (table) => [
    uniqueIndex("timetable_period_position_idx").on(
      table.tenantId,
      table.position,
    ),
  ],
);

export const timetableEntries = sqliteTable(
  "timetable_entries",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    periodId: text("period_id")
      .notNull()
      .references(() => timetablePeriods.id),
    weekday: integer("weekday").notNull(),
    classGroupId: text("class_group_id").notNull(),
    offeringId: text("offering_id").references(() => subjectOfferings.id),
    teacherPersonId: text("teacher_person_id").references(() => people.id),
    subjectName: text("subject_name").notNull(),
    room: text("room").notNull(),
    status: text("status", {
      enum: ["scheduled", "substituted", "cancelled", "completed"],
    })
      .notNull()
      .default("scheduled"),
    substituteTeacherPersonId: text("substitute_teacher_person_id").references(
      () => people.id,
    ),
    changeReason: text("change_reason"),
  },
  (table) => [
    index("timetable_class_day_idx").on(
      table.tenantId,
      table.classGroupId,
      table.weekday,
    ),
    index("timetable_teacher_day_idx").on(
      table.tenantId,
      table.teacherPersonId,
      table.weekday,
    ),
  ],
);

export const guardianAlerts = sqliteTable(
  "guardian_alerts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    guardianPersonId: text("guardian_person_id")
      .notNull()
      .references(() => people.id),
    learnerPersonId: text("learner_person_id")
      .notNull()
      .references(() => people.id),
    sourceType: text("source_type", {
      enum: ["attendance", "assignment"],
    }).notNull(),
    sourceId: text("source_id").notNull(),
    kind: text("kind", {
      enum: ["absence", "late-work", "missing-work"],
    }).notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    status: text("status", { enum: ["issued", "read", "dismissed"] })
      .notNull()
      .default("issued"),
    issuedAt: text("issued_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    readAt: text("read_at"),
  },
  (table) => [
    uniqueIndex("guardian_alert_source_idx").on(
      table.tenantId,
      table.guardianPersonId,
      table.sourceType,
      table.sourceId,
      table.kind,
    ),
  ],
);

export const admissionApplicationRecords = sqliteTable(
  "admission_application_records",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    intakeId: text("intake_id").notNull(),
    applicantEmail: text("applicant_email").notNull(),
    applicantFirstName: text("applicant_first_name").notNull().default(""),
    applicantLastName: text("applicant_last_name").notNull().default(""),
    dateOfBirth: text("date_of_birth").notNull().default(""),
    guardianName: text("guardian_name").notNull().default(""),
    guardianEmail: text("guardian_email").notNull().default(""),
    guardianPhone: text("guardian_phone").notNull().default(""),
    previousSchool: text("previous_school").notNull().default(""),
    desiredClass: text("desired_class").notNull().default(""),
    supportNeeds: text("support_needs").notNull().default(""),

    /* The rest of a standard basic-school application. Every one of these
       defaults to empty rather than being nullable: a half-finished draft is
       the normal state of this record for days at a time, and "not filled in
       yet" and "left blank on purpose" are the same thing to the form. What
       must be present before submitting is decided in
       domain/admissions/application-form.ts, not by the column. */
    applicantMiddleName: text("applicant_middle_name").notNull().default(""),
    gender: text("gender").notNull().default(""),
    nationality: text("nationality").notNull().default(""),
    placeOfBirth: text("place_of_birth").notNull().default(""),
    homeAddress: text("home_address").notNull().default(""),

    previousSchoolLocation: text("previous_school_location")
      .notNull()
      .default(""),
    lastClassCompleted: text("last_class_completed").notNull().default(""),
    reasonForLeaving: text("reason_for_leaving").notNull().default(""),
    entryTerm: text("entry_term").notNull().default(""),

    guardianRelationship: text("guardian_relationship").notNull().default(""),
    guardianOccupation: text("guardian_occupation").notNull().default(""),
    guardianAddress: text("guardian_address").notNull().default(""),
    secondGuardianName: text("second_guardian_name").notNull().default(""),
    secondGuardianPhone: text("second_guardian_phone").notNull().default(""),

    emergencyName: text("emergency_name").notNull().default(""),
    emergencyPhone: text("emergency_phone").notNull().default(""),
    emergencyRelationship: text("emergency_relationship")
      .notNull()
      .default(""),

    allergies: text("allergies").notNull().default(""),
    medicalConditions: text("medical_conditions").notNull().default(""),
    medications: text("medications").notNull().default(""),

    /* Set when the guardian ticks the declaration, so the school can show what
       was agreed to and when if an application is ever disputed. */
    declarationAcceptedAt: text("declaration_accepted_at"),
    /* Stops the abandoned-draft reminder repeating every time the job runs. */
    lastReminderAt: text("last_reminder_at"),
    status: text("status", {
      enum: [
        "draft",
        "submitted",
        "under-review",
        "offered",
        "accepted",
        "rejected",
        "enrolled",
      ],
    })
      .notNull()
      .default("draft"),
    submittedAt: text("submitted_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("admission_records_tenant_intake_email_unique").on(
      table.tenantId,
      table.intakeId,
      table.applicantEmail,
    ),
    index("admission_records_tenant_status_idx").on(
      table.tenantId,
      table.status,
    ),
  ],
);
