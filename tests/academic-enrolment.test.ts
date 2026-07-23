import { describe, expect, it } from "vitest";
import {
  closeSubjectEntitlement,
  createClassPlacement,
  createSubjectEntitlements,
  transferClassPlacement,
} from "../domain/academic/enrolment";
import type {
  ClassPlacement,
  SubjectEntitlement,
  SubjectOffering,
} from "../domain/academic/types";

const tenantId = "school-accra-01";

const offerings: SubjectOffering[] = [
  {
    id: "offering-maths",
    tenantId,
    classGroupId: "class-jhs2-gold",
    subjectCode: "MA",
    subjectName: "Mathematics",
    requirement: "compulsory",
    active: true,
  },
  {
    id: "offering-science",
    tenantId,
    classGroupId: "class-jhs2-gold",
    subjectCode: "IS",
    subjectName: "Integrated Science",
    requirement: "compulsory",
    active: true,
  },
  {
    id: "offering-french",
    tenantId,
    classGroupId: "class-jhs2-gold",
    subjectCode: "FR",
    subjectName: "French",
    requirement: "optional",
    active: true,
  },
];

describe("academic enrolment policy", () => {
  it("creates every compulsory entitlement when a learner joins a class", () => {
    const placement = createClassPlacement({
      id: "placement-001",
      tenantId,
      learnerId: "learner-ama",
      classGroupId: "class-jhs2-gold",
      academicYearId: "year-2026",
      effectiveFrom: "2026-09-08",
    });

    const entitlements = createSubjectEntitlements(placement, offerings);

    expect(entitlements.map((item) => item.offeringId)).toEqual([
      "offering-maths",
      "offering-science",
    ]);
    expect(entitlements.every((item) => item.source === "class-policy")).toBe(true);
  });

  it("adds only optional subjects that have been approved", () => {
    const placement = createClassPlacement({
      id: "placement-002",
      tenantId,
      learnerId: "learner-kwame",
      classGroupId: "class-jhs2-gold",
      academicYearId: "year-2026",
      effectiveFrom: "2026-09-08",
    });

    const entitlements = createSubjectEntitlements(
      placement,
      offerings,
      new Set(["offering-french"]),
    );

    expect(entitlements).toHaveLength(3);
    expect(entitlements.at(-1)?.source).toBe("approved-optional");
  });

  it("prevents compulsory subject access from being removed", () => {
    const entitlement: SubjectEntitlement = {
      id: "entitlement-001",
      tenantId,
      learnerId: "learner-ama",
      placementId: "placement-001",
      offeringId: "offering-maths",
      requirement: "compulsory",
      source: "class-policy",
      status: "active",
    };

    expect(() =>
      closeSubjectEntitlement(entitlement, "2026-10-01"),
    ).toThrowError("Compulsory subject access cannot be removed.");
  });

  it("preserves placement history when a learner transfers class", () => {
    const activePlacement: ClassPlacement = {
      id: "placement-001",
      tenantId,
      learnerId: "learner-ama",
      classGroupId: "class-jhs2-gold",
      academicYearId: "year-2026",
      effectiveFrom: "2026-09-08",
      status: "active",
    };

    const transfer = transferClassPlacement(activePlacement, {
      id: "placement-003",
      tenantId,
      learnerId: "learner-ama",
      classGroupId: "class-jhs2-green",
      academicYearId: "year-2026",
      effectiveFrom: "2026-10-01",
    });

    expect(transfer.previous.status).toBe("transferred");
    expect(transfer.previous.effectiveTo).toBe("2026-09-30");
    expect(transfer.current.classGroupId).toBe("class-jhs2-green");
  });

  it("rejects offerings from another school tenant", () => {
    const placement = createClassPlacement({
      id: "placement-004",
      tenantId,
      learnerId: "learner-yaa",
      classGroupId: "class-jhs2-gold",
      academicYearId: "year-2026",
      effectiveFrom: "2026-09-08",
    });
    const foreignOffering: SubjectOffering = {
      ...offerings[0],
      id: "foreign-offering",
      tenantId: "school-kumasi-02",
    };

    expect(() =>
      createSubjectEntitlements(placement, [foreignOffering]),
    ).toThrowError("Subject offering belongs to another school.");
  });
});
