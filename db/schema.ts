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
