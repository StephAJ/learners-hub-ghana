export type SubjectRequirement = "compulsory" | "optional";
export type PlacementStatus = "active" | "transferred";
export type EntitlementStatus = "active" | "closed";
export type EntitlementSource = "class-policy" | "approved-optional";

export type ClassPlacement = {
  academicYearId: string;
  classGroupId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  id: string;
  learnerId: string;
  status: PlacementStatus;
  tenantId: string;
};

export type CreatePlacementCommand = Omit<
  ClassPlacement,
  "status" | "effectiveTo"
>;

export type SubjectOffering = {
  active: boolean;
  classGroupId: string;
  id: string;
  requirement: SubjectRequirement;
  subjectCode: string;
  subjectName: string;
  tenantId: string;
};

export type SubjectEntitlement = {
  effectiveTo?: string;
  id: string;
  learnerId: string;
  offeringId: string;
  placementId: string;
  requirement: SubjectRequirement;
  source: EntitlementSource;
  status: EntitlementStatus;
  tenantId: string;
};

export type PlacementTransfer = {
  current: ClassPlacement;
  previous: ClassPlacement;
};
