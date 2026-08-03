import { describe, expect, it } from "vitest";
import {
  applicationCompletion,
  emptyApplicationDraft,
  isApplicationSubmittable,
  stepForField,
  validateApplication,
  validateApplicationStep,
  type ApplicationDraft,
} from "../domain/admissions/application-form";

function completeDraft(overrides: Partial<ApplicationDraft> = {}) {
  return {
    ...emptyApplicationDraft(),
    applicantFirstName: "Ama",
    applicantLastName: "Boateng",
    dateOfBirth: "2014-04-12",
    desiredClass: "JHS 1",
    emergencyName: "Kofi Boateng",
    emergencyPhone: "+233 24 111 2222",
    emergencyRelationship: "Uncle",
    entryTerm: "Term 1, September 2026",
    gender: "Female",
    guardianEmail: "abena@example.com",
    guardianName: "Abena Boateng",
    guardianPhone: "+233 20 555 0101",
    guardianRelationship: "Mother",
    homeAddress: "12 Otswe Street, Osu, Accra",
    ...overrides,
  };
}

describe("validateApplication", () => {
  it("accepts a complete application", () => {
    expect(validateApplication(completeDraft())).toEqual([]);
    expect(isApplicationSubmittable(completeDraft())).toBe(true);
  });

  it("reports every missing required field at once, not just the first", () => {
    const issues = validateApplication(emptyApplicationDraft());
    expect(issues.length).toBeGreaterThan(5);
    expect(issues.map((issue) => issue.field)).toContain("applicantFirstName");
    expect(issues.map((issue) => issue.field)).toContain("emergencyPhone");
  });

  it("does not require the optional fields", () => {
    const draft = completeDraft({
      allergies: "",
      applicantMiddleName: "",
      previousSchool: "",
      secondGuardianName: "",
    });
    expect(validateApplication(draft)).toEqual([]);
  });

  it("rejects a malformed email", () => {
    const issues = validateApplication(
      completeDraft({ guardianEmail: "abena@example" }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe("guardianEmail");
  });

  it("rejects a phone number that is too short to dial", () => {
    const issues = validateApplication(
      completeDraft({ guardianPhone: "0244" }),
    );
    expect(issues.map((issue) => issue.field)).toContain("guardianPhone");
  });

  it("rejects an emergency contact on the guardian's own number", () => {
    const issues = validateApplication(
      completeDraft({
        emergencyPhone: "+233 20 555 0101",
        guardianPhone: "+233 20 555 0101",
      }),
    );
    expect(issues.map((issue) => issue.field)).toContain("emergencyPhone");
  });

  it("ignores formatting when comparing the two phone numbers", () => {
    const issues = validateApplication(
      completeDraft({
        emergencyPhone: "233-20-555-0101",
        guardianPhone: "+233 20 555 0101",
      }),
    );
    expect(issues.map((issue) => issue.field)).toContain("emergencyPhone");
  });

  it("rejects a date of birth in the future", () => {
    const issues = validateApplication(
      completeDraft({ dateOfBirth: "2099-01-01" }),
    );
    expect(issues[0].field).toBe("dateOfBirth");
  });

  it("catches a mistyped birth year", () => {
    expect(
      validateApplication(completeDraft({ dateOfBirth: "1914-04-12" })),
    ).toHaveLength(1);
  });
});

describe("validateApplicationStep", () => {
  it("reports only the issues belonging to that step", () => {
    const draft = emptyApplicationDraft();
    const learner = validateApplicationStep("learner", draft);
    expect(learner.length).toBeGreaterThan(0);
    for (const issue of learner) {
      expect(stepForField(issue.field)).toBe("learner");
    }
  });

  it("lets a step pass while later steps are still empty", () => {
    const draft = emptyApplicationDraft();
    draft.applicantFirstName = "Ama";
    draft.applicantLastName = "Boateng";
    draft.dateOfBirth = "2014-04-12";
    draft.gender = "Female";
    draft.homeAddress = "12 Otswe Street, Osu";
    expect(validateApplicationStep("learner", draft)).toEqual([]);
    expect(validateApplicationStep("guardian", draft).length).toBeGreaterThan(0);
  });

  it("re-reports everything outstanding on the review step", () => {
    const draft = emptyApplicationDraft();
    expect(validateApplicationStep("review", draft)).toEqual(
      validateApplication(draft),
    );
  });
});

describe("applicationCompletion", () => {
  it("is 0 for an empty draft and 100 for a complete one", () => {
    expect(applicationCompletion(emptyApplicationDraft())).toBe(0);
    expect(applicationCompletion(completeDraft())).toBe(100);
  });

  it("does not move when an optional field is filled in", () => {
    const before = applicationCompletion(emptyApplicationDraft());
    const after = applicationCompletion(
      { ...emptyApplicationDraft(), allergies: "Peanuts" },
    );
    expect(after).toBe(before);
  });
});
