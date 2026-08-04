import type {
  AccessContext,
  Permission,
  SchoolRole,
} from "./types";

const rolePermissions: Record<SchoolRole, ReadonlySet<Permission>> = {
  "school-admin": new Set([
    "people:read",
    "people:invite",
    "academic:manage",
    "admissions:manage",
    "student-record:read",
    "lesson:create",
    "content:manage",
    "assessment:publish",
    "assignment:manage",
    "attendance:manage",
    "timetable:manage",
    "gradebook:manage",
    "report:approve",
    "report:release",
    "report:read",
    "messages:moderate",
  ]),
  "academic-admin": new Set([
    "people:read",
    "academic:manage",
    "student-record:read",
    "lesson:create",
    "content:manage",
    "assessment:publish",
    "assignment:manage",
    "attendance:manage",
    "timetable:manage",
    "gradebook:manage",
    "report:approve",
    "report:release",
    "report:read",
    "messages:moderate",
  ]),
  "admissions-officer": new Set([
    "people:read",
    "admissions:manage",
    "student-record:read",
  ]),
  teacher: new Set([
    "people:read",
    "lesson:create",
    "content:manage",
    "assessment:publish",
    "assignment:manage",
    "attendance:manage",
    "gradebook:manage",
    "report:read",
  ]),
  "class-teacher": new Set([
    "people:read",
    "lesson:create",
    "content:manage",
    "assessment:publish",
    "assignment:manage",
    "attendance:manage",
    "gradebook:manage",
    "student-record:read",
    "report:read",
  ]),
  guardian: new Set(["student-record:read", "report:read"]),
  learner: new Set(["student-record:read", "report:read"]),
};

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function canPerform(
  context: AccessContext,
  permission: Permission,
): boolean {
  if (context.membershipStatus !== "active") return false;
  return rolePermissions[context.role].has(permission);
}

export function canAccessLearner(
  context: AccessContext,
  learnerPersonId: string,
): boolean {
  if (
    !canPerform(context, "student-record:read") &&
    !canPerform(context, "report:read")
  ) {
    return false;
  }

  if (context.role === "learner") {
    return context.actorPersonId === learnerPersonId;
  }

  if (context.role === "guardian") {
    return context.linkedLearnerIds?.includes(learnerPersonId) ?? false;
  }

  return context.role !== "teacher";
}

export function canTeachOffering(
  context: AccessContext,
  offeringId: string,
): boolean {
  if (!canPerform(context, "lesson:create")) return false;
  if (context.role === "school-admin" || context.role === "academic-admin") {
    return true;
  }
  return context.subjectOfferingIds?.includes(offeringId) ?? false;
}

export function requireTenantMatch(
  context: AccessContext,
  recordTenantId: string,
) {
  if (context.tenantId !== recordTenantId) {
    throw new AuthorizationError(
      "The requested record belongs to another school.",
    );
  }
}
