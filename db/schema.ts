import { sql } from "drizzle-orm";
import {
  index,
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
