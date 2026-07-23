import { describe, expect, it } from "vitest";
import {
  acceptAdmissionOffer,
  convertAcceptedApplication,
  createAdmissionApplication,
  recordAdmissionDecision,
  startApplicationReview,
  submitAdmissionApplication,
} from "../domain/admissions/admissions";
import type { AdmissionApplication } from "../domain/admissions/types";

const completeApplication = createAdmissionApplication({
  id: "application-1",
  tenantId: "school-1",
  applicationNumber: "GA-2026-001",
  applicant: {
    dateOfBirth: "2013-04-18",
    firstName: "Adwoa",
    lastName: "Mensah",
  },
  guardian: {
    email: "akua@example.com",
    fullName: "Akua Mensah",
    phone: "+233241234567",
    relationship: "Mother",
  },
  desiredClassGroupId: "class-jhs2-gold",
  submittedDocumentTypes: ["birth-certificate", "previous-report"],
});

describe("admissions lifecycle", () => {
  it("starts a new application as a draft", () => {
    expect(completeApplication.status).toBe("draft");
  });

  it("requires both admission documents before submission", () => {
    const incomplete = createAdmissionApplication({
      ...completeApplication,
      id: "application-2",
      submittedDocumentTypes: ["birth-certificate"],
    });

    expect(() => submitAdmissionApplication(incomplete, "2026-07-23")).toThrow(
      "Birth certificate and previous school report are required.",
    );
  });

  it("moves a complete application through submission and review", () => {
    const submitted = submitAdmissionApplication(
      completeApplication,
      "2026-07-23",
    );
    const reviewing = startApplicationReview(
      submitted,
      "staff-1",
      "2026-07-24",
    );

    expect(reviewing.status).toBe("under-review");
    expect(reviewing.review?.reviewerId).toBe("staff-1");
  });

  it("only allows a decision while an application is under review", () => {
    expect(() =>
      recordAdmissionDecision(completeApplication, {
        decidedAt: "2026-07-24",
        decidedBy: "staff-1",
        decision: "offered",
        note: "Meets entry requirements.",
        offerExpiresAt: "2026-08-10",
      }),
    ).toThrow("Only an application under review can receive a decision.");
  });

  it("rejects acceptance of an expired offer", () => {
    const offered = applicationAtOffer();

    expect(() =>
      acceptAdmissionOffer(offered, "2026-08-11", "guardian-1"),
    ).toThrow("This admission offer has expired.");
  });

  it("converts an accepted offer into linked learner records and placement", () => {
    const accepted = acceptAdmissionOffer(
      applicationAtOffer(),
      "2026-08-02",
      "guardian-1",
    );
    const result = convertAcceptedApplication(accepted, {
      academicYearId: "year-2026-27",
      effectiveFrom: "2026-09-08",
      guardianId: "guardian-1",
      learnerId: "learner-100",
      placementId: "placement-100",
      studentId: "GA-260100",
    });

    expect(result.application.status).toBe("enrolled");
    expect(result.learner.studentId).toBe("GA-260100");
    expect(result.guardianship.learnerId).toBe("learner-100");
    expect(result.placement.classGroupId).toBe("class-jhs2-gold");
  });
});

function applicationAtOffer(): AdmissionApplication {
  const submitted = submitAdmissionApplication(
    completeApplication,
    "2026-07-23",
  );
  const reviewing = startApplicationReview(
    submitted,
    "staff-1",
    "2026-07-24",
  );

  return recordAdmissionDecision(reviewing, {
    decidedAt: "2026-07-25",
    decidedBy: "staff-1",
    decision: "offered",
    note: "Meets entry requirements.",
    offerExpiresAt: "2026-08-10",
  });
}
