import type {
  ClassPlacement,
  CreatePlacementCommand,
  PlacementTransfer,
  SubjectEntitlement,
  SubjectOffering,
} from "./types";

export class AcademicPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AcademicPolicyError";
  }
}

export function createClassPlacement(
  command: CreatePlacementCommand,
): ClassPlacement {
  requireValue(command.tenantId, "School is required.");
  requireValue(command.learnerId, "Learner is required.");
  requireValue(command.classGroupId, "Class is required.");

  return {
    ...command,
    status: "active",
  };
}

export function createSubjectEntitlements(
  placement: ClassPlacement,
  offerings: SubjectOffering[],
  approvedOptionalOfferingIds = new Set<string>(),
): SubjectEntitlement[] {
  return offerings
    .filter((offering) => isOfferingEligible(placement, offering))
    .filter((offering) =>
      isEntitledOffering(offering, approvedOptionalOfferingIds),
    )
    .map((offering) => createEntitlement(placement, offering));
}

export function closeSubjectEntitlement(
  entitlement: SubjectEntitlement,
  effectiveTo: string,
): SubjectEntitlement {
  if (entitlement.requirement === "compulsory") {
    throw new AcademicPolicyError(
      "Compulsory subject access cannot be removed.",
    );
  }

  return {
    ...entitlement,
    effectiveTo,
    status: "closed",
  };
}

export function transferClassPlacement(
  activePlacement: ClassPlacement,
  command: CreatePlacementCommand,
): PlacementTransfer {
  requireMatchingTransfer(activePlacement, command);

  return {
    previous: {
      ...activePlacement,
      effectiveTo: previousIsoDate(command.effectiveFrom),
      status: "transferred",
    },
    current: createClassPlacement(command),
  };
}

function isOfferingEligible(
  placement: ClassPlacement,
  offering: SubjectOffering,
): boolean {
  if (offering.tenantId !== placement.tenantId) {
    throw new AcademicPolicyError(
      "Subject offering belongs to another school.",
    );
  }

  return offering.active && offering.classGroupId === placement.classGroupId;
}

function isEntitledOffering(
  offering: SubjectOffering,
  approvedOptionalOfferingIds: Set<string>,
): boolean {
  return (
    offering.requirement === "compulsory" ||
    approvedOptionalOfferingIds.has(offering.id)
  );
}

function createEntitlement(
  placement: ClassPlacement,
  offering: SubjectOffering,
): SubjectEntitlement {
  return {
    id: `entitlement-${placement.id}-${offering.id}`,
    tenantId: placement.tenantId,
    learnerId: placement.learnerId,
    placementId: placement.id,
    offeringId: offering.id,
    requirement: offering.requirement,
    source:
      offering.requirement === "compulsory"
        ? "class-policy"
        : "approved-optional",
    status: "active",
  };
}

function requireMatchingTransfer(
  current: ClassPlacement,
  command: CreatePlacementCommand,
) {
  if (
    current.tenantId !== command.tenantId ||
    current.learnerId !== command.learnerId ||
    current.academicYearId !== command.academicYearId
  ) {
    throw new AcademicPolicyError(
      "Class transfer must remain within the learner's school and academic year.",
    );
  }
}

function previousIsoDate(date: string): string {
  const previousDate = new Date(`${date}T00:00:00.000Z`);
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  return previousDate.toISOString().slice(0, 10);
}

function requireValue(value: string, message: string) {
  if (!value.trim()) {
    throw new AcademicPolicyError(message);
  }
}
