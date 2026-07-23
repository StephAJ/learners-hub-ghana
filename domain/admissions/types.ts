import type { ClassPlacement } from "../academic/types";

export type AdmissionStatus =
  | "draft"
  | "submitted"
  | "under-review"
  | "offered"
  | "rejected"
  | "accepted"
  | "enrolled";

export type AdmissionDocumentType =
  | "birth-certificate"
  | "previous-report"
  | "passport-photo"
  | "medical-note";

export type ApplicantDetails = {
  dateOfBirth: string;
  firstName: string;
  lastName: string;
  previousSchool?: string;
};

export type GuardianDetails = {
  email: string;
  fullName: string;
  phone: string;
  relationship: string;
};

export type AdmissionReview = {
  reviewerId: string;
  startedAt: string;
};

export type AdmissionDecision = {
  decidedAt: string;
  decidedBy: string;
  decision: "offered" | "rejected";
  note: string;
  offerExpiresAt?: string;
};

export type OfferAcceptance = {
  acceptedAt: string;
  acceptedByGuardianId: string;
};

export type AdmissionApplication = {
  applicant: ApplicantDetails;
  applicationNumber: string;
  decision?: AdmissionDecision;
  desiredClassGroupId: string;
  guardian: GuardianDetails;
  id: string;
  offerAcceptance?: OfferAcceptance;
  review?: AdmissionReview;
  status: AdmissionStatus;
  submittedAt?: string;
  submittedDocumentTypes: AdmissionDocumentType[];
  tenantId: string;
};

export type CreateAdmissionApplicationCommand = Omit<
  AdmissionApplication,
  | "decision"
  | "offerAcceptance"
  | "review"
  | "status"
  | "submittedAt"
>;

export type ConvertAcceptedApplicationCommand = {
  academicYearId: string;
  effectiveFrom: string;
  guardianId: string;
  learnerId: string;
  placementId: string;
  studentId: string;
};

export type LearnerRecord = {
  dateOfBirth: string;
  firstName: string;
  id: string;
  lastName: string;
  sourceApplicationId: string;
  studentId: string;
  tenantId: string;
};

export type Guardianship = {
  guardianId: string;
  learnerId: string;
  relationship: string;
  tenantId: string;
};

export type AdmissionConversion = {
  application: AdmissionApplication;
  guardianship: Guardianship;
  learner: LearnerRecord;
  placement: ClassPlacement;
};
