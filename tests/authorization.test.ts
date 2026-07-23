import { describe, expect, it } from "vitest";
import {
  canAccessLearner,
  canPerform,
  requireTenantMatch,
} from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";

const administrator: AccessContext = {
  actorPersonId: "person-admin",
  membershipStatus: "active",
  role: "school-admin",
  tenantId: "school-1",
};

describe("tenant-scoped authorisation", () => {
  it("allows a school administrator to manage people in their school", () => {
    expect(canPerform(administrator, "people:invite")).toBe(true);
    expect(canPerform(administrator, "academic:manage")).toBe(true);
  });

  it("limits an admissions officer to admissions and learner intake", () => {
    const admissionsOfficer: AccessContext = {
      ...administrator,
      role: "admissions-officer",
    };

    expect(canPerform(admissionsOfficer, "admissions:manage")).toBe(true);
    expect(canPerform(admissionsOfficer, "people:invite")).toBe(false);
    expect(canPerform(admissionsOfficer, "assessment:publish")).toBe(false);
  });

  it("rejects every permission for an inactive membership", () => {
    const inactiveTeacher: AccessContext = {
      ...administrator,
      membershipStatus: "revoked",
      role: "teacher",
    };

    expect(canPerform(inactiveTeacher, "lesson:create")).toBe(false);
  });

  it("allows guardians to access only linked children", () => {
    const guardian: AccessContext = {
      ...administrator,
      actorPersonId: "guardian-1",
      linkedLearnerIds: ["learner-1", "learner-2"],
      role: "guardian",
    };

    expect(canAccessLearner(guardian, "learner-2")).toBe(true);
    expect(canAccessLearner(guardian, "learner-3")).toBe(false);
  });

  it("allows a learner to access only their own record", () => {
    const learner: AccessContext = {
      ...administrator,
      actorPersonId: "learner-1",
      role: "learner",
    };

    expect(canAccessLearner(learner, "learner-1")).toBe(true);
    expect(canAccessLearner(learner, "learner-2")).toBe(false);
  });

  it("blocks cross-tenant records before any role check", () => {
    expect(() => requireTenantMatch(administrator, "school-2")).toThrow(
      "The requested record belongs to another school.",
    );
  });
});
