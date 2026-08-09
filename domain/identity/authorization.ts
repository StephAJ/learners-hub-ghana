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
    "announcement:post",
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
    "announcement:post",
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
    "announcement:post",
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
    "announcement:post",
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
    return context.linkedLearnerIds.includes(learnerPersonId);
  }

  /* A class teacher answers for their own class. This used to end
     `return context.role !== "teacher"`, which said yes to every role that
     was not a subject teacher — so a class teacher could open any learner in
     the school, and so could an admissions officer, who holds
     student-record:read to review applicants rather than to read a current
     learner's report card. */
  if (context.role === "class-teacher") {
    return context.classLearnerIds.includes(learnerPersonId);
  }

  /* The two administrative roles answer for the whole school; a subject
     teacher reaches learners through the offering they teach, not through
     this. */
  return context.role === "school-admin" || context.role === "academic-admin";
}

export function canTeachOffering(
  context: AccessContext,
  offeringId: string,
): boolean {
  if (!canPerform(context, "lesson:create")) return false;
  if (context.role === "school-admin" || context.role === "academic-admin") {
    return true;
  }
  return context.subjectOfferingIds.includes(offeringId);
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
