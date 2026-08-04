import { describe, expect, it } from "vitest";
import {
  canAccessLearner,
  canPerform,
  canTeachOffering,
  requireTenantMatch,
} from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";

const administrator: AccessContext = {
  actorPersonId: "person-admin",
  classGroupIds: [],
  linkedLearnerIds: [],
  membershipStatus: "active",
  role: "school-admin",
  subjectOfferingIds: [],
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

describe("teaching a subject offering", () => {
  const teacher: AccessContext = {
    ...administrator,
    actorPersonId: "teacher-1",
    role: "teacher",
    subjectOfferingIds: [
      "offering-maths-jhs1",
      "offering-maths-jhs2",
      "offering-science-jhs2",
    ],
  };

  it("lets a teacher reach every offering they hold, not only the first", () => {
    for (const offeringId of teacher.subjectOfferingIds) {
      expect(canTeachOffering(teacher, offeringId)).toBe(true);
    }
  });

  it("refuses an offering the teacher does not hold", () => {
    expect(canTeachOffering(teacher, "offering-english-jhs2")).toBe(false);
  });

  /* The failure this whole arrangement exists to prevent. An unresolved list
     is indistinguishable from "assigned to nothing", so a teacher who is in
     fact assigned gets an authorisation error. It used to be reachable by
     forgetting a call; it is now only reachable by passing [] on purpose. */
  it("refuses everything when the list was never resolved", () => {
    expect(
      canTeachOffering({ ...teacher, subjectOfferingIds: [] }, "offering-maths-jhs2"),
    ).toBe(false);
  });

  it("lets an academic administrator reach an offering they do not teach", () => {
    expect(
      canTeachOffering(
        { ...administrator, role: "academic-admin" },
        "offering-maths-jhs2",
      ),
    ).toBe(true);
  });

  it("refuses a teacher whose membership is no longer active", () => {
    expect(
      canTeachOffering(
        { ...teacher, membershipStatus: "revoked" },
        "offering-maths-jhs2",
      ),
    ).toBe(false);
  });
});
