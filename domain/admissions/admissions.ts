import { createClassPlacement } from "../academic/enrolment";
import type {
  AdmissionApplication,
  AdmissionConversion,
  AdmissionDecision,
  AdmissionDocumentType,
  ConvertAcceptedApplicationCommand,
  CreateAdmissionApplicationCommand,
} from "./types";

const requiredDocuments = new Set<AdmissionDocumentType>([
  "birth-certificate",
  "previous-report",
]);

export class AdmissionPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdmissionPolicyError";
  }
}

export function createAdmissionApplication(
  command: CreateAdmissionApplicationCommand,
): AdmissionApplication {
  requireValue(command.tenantId, "School is required.");
  requireValue(command.applicationNumber, "Application number is required.");
  requireValue(command.applicant.firstName, "Applicant first name is required.");
  requireValue(command.applicant.lastName, "Applicant last name is required.");
  requireValue(command.guardian.fullName, "Guardian name is required.");
  requireValue(command.guardian.phone, "Guardian phone is required.");
  requireValue(command.desiredClassGroupId, "Desired class is required.");

  return {
    applicant: command.applicant,
    applicationNumber: command.applicationNumber,
    desiredClassGroupId: command.desiredClassGroupId,
    guardian: command.guardian,
    id: command.id,
    status: "draft",
    submittedDocumentTypes: [...command.submittedDocumentTypes],
    tenantId: command.tenantId,
  };
}

export function submitAdmissionApplication(
  application: AdmissionApplication,
  submittedAt: string,
): AdmissionApplication {
  requireStatus(application, "draft", "Only a draft application can be submitted.");

  const availableDocuments = new Set(application.submittedDocumentTypes);
  const isComplete = [...requiredDocuments].every((documentType) =>
    availableDocuments.has(documentType),
  );

  if (!isComplete) {
    throw new AdmissionPolicyError(
      "Birth certificate and previous school report are required.",
    );
  }

  return {
    ...application,
    status: "submitted",
    submittedAt,
  };
}

export function startApplicationReview(
  application: AdmissionApplication,
  reviewerId: string,
  startedAt: string,
): AdmissionApplication {
  requireStatus(
    application,
    "submitted",
    "Only a submitted application can enter review.",
  );
  requireValue(reviewerId, "Reviewer is required.");

  return {
    ...application,
    review: { reviewerId, startedAt },
    status: "under-review",
  };
}

export function recordAdmissionDecision(
  application: AdmissionApplication,
  decision: AdmissionDecision,
): AdmissionApplication {
  requireStatus(
    application,
    "under-review",
    "Only an application under review can receive a decision.",
  );

  if (decision.decision === "offered" && !decision.offerExpiresAt) {
    throw new AdmissionPolicyError("An admission offer must have an expiry date.");
  }

  return {
    ...application,
    decision,
    status: decision.decision,
  };
}

export function acceptAdmissionOffer(
  application: AdmissionApplication,
  acceptedAt: string,
  acceptedByGuardianId: string,
): AdmissionApplication {
  requireStatus(
    application,
    "offered",
    "Only an offered application can be accepted.",
  );
  requireValue(acceptedByGuardianId, "Accepting guardian is required.");

  if (
    application.decision?.offerExpiresAt &&
    acceptedAt > application.decision.offerExpiresAt
  ) {
    throw new AdmissionPolicyError("This admission offer has expired.");
  }

  return {
    ...application,
    offerAcceptance: { acceptedAt, acceptedByGuardianId },
    status: "accepted",
  };
}

export function convertAcceptedApplication(
  application: AdmissionApplication,
  command: ConvertAcceptedApplicationCommand,
): AdmissionConversion {
  requireStatus(
    application,
    "accepted",
    "Only an accepted application can become a learner.",
  );

  const placement = createClassPlacement({
    academicYearId: command.academicYearId,
    classGroupId: application.desiredClassGroupId,
    effectiveFrom: command.effectiveFrom,
    id: command.placementId,
    learnerId: command.learnerId,
    tenantId: application.tenantId,
  });

  return {
    application: {
      ...application,
      status: "enrolled",
    },
    learner: {
      ...application.applicant,
      id: command.learnerId,
      sourceApplicationId: application.id,
      studentId: command.studentId,
      tenantId: application.tenantId,
    },
    guardianship: {
      guardianId: command.guardianId,
      learnerId: command.learnerId,
      relationship: application.guardian.relationship,
      tenantId: application.tenantId,
    },
    placement,
  };
}

function requireStatus(
  application: AdmissionApplication,
  expectedStatus: AdmissionApplication["status"],
  message: string,
) {
  if (application.status !== expectedStatus) {
    throw new AdmissionPolicyError(message);
  }
}

function requireValue(value: string, message: string) {
  if (!value.trim()) {
    throw new AdmissionPolicyError(message);
  }
}
