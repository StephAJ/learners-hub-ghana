import { describe, expect, it } from "vitest";
import {
  intakeClosedReason,
  isIntakeAcceptingApplications,
  normaliseAcademicYear,
  normaliseClassGroup,
  normaliseIntake,
  normaliseSubject,
  schoolReadiness,
  SchoolStructureError,
  type AdmissionIntake,
} from "../domain/academic/structure";
import {
  applySchoolProfileEdit,
  greenfieldProfile,
  parseSchoolProfile,
  SchoolProfileError,
  toSchoolProfileEdit,
} from "../domain/school/public-profile";

describe("academic years", () => {
  it("keeps the school's own wording, trimmed", () => {
    const year = normaliseAcademicYear({
      endsOn: "2027-07-23",
      name: "  2026 / 2027  ",
      startsOn: "2026-09-08",
    });
    expect(year.name).toBe("2026 / 2027");
  });

  it("refuses a year that ends before it starts", () => {
    expect(() =>
      normaliseAcademicYear({
        endsOn: "2026-07-23",
        name: "2026 / 2027",
        startsOn: "2026-09-08",
      }),
    ).toThrow(SchoolStructureError);
  });

  it("refuses a duplicate that only differs by case and spacing", () => {
    const existing = [{ id: "year-1", name: "2026 / 2027" }];
    expect(() =>
      normaliseAcademicYear(
        { endsOn: "2027-07-23", name: "2026  /  2027", startsOn: "2026-09-08" },
        existing,
      ),
    ).toThrow(/already has an academic year/);
  });

  it("lets a year keep its own name when it is being edited", () => {
    const existing = [{ id: "year-1", name: "2026 / 2027" }];
    expect(() =>
      normaliseAcademicYear(
        { endsOn: "2027-07-23", name: "2026 / 2027", startsOn: "2026-09-08" },
        existing,
        "year-1",
      ),
    ).not.toThrow();
  });
});

describe("classes", () => {
  const existing = [
    { academicYearId: "year-2026", id: "class-1", name: "JHS 1 Blue" },
  ];

  it("refuses a duplicate name inside one year", () => {
    expect(() =>
      normaliseClassGroup(
        { academicYearId: "year-2026", name: "jhs 1 blue" },
        existing,
      ),
    ).toThrow(/already has a class/);
  });

  /* The case that matters most: "JHS 1 Blue" exists every September, and a
     school setting up next year must be able to name it the same thing. */
  it("allows the same name in a different year", () => {
    expect(() =>
      normaliseClassGroup(
        { academicYearId: "year-2027", name: "JHS 1 Blue" },
        existing,
      ),
    ).not.toThrow();
  });

  it("treats a blank class teacher as unassigned rather than as an id", () => {
    const group = normaliseClassGroup(
      { academicYearId: "year-2026", classTeacherPersonId: "   ", name: "JHS 2 Gold" },
      existing,
    );
    expect(group.classTeacherPersonId).toBeNull();
  });

  it("refuses a class with no name", () => {
    expect(() =>
      normaliseClassGroup({ academicYearId: "year-2026", name: "  " }),
    ).toThrow(SchoolStructureError);
  });
});

describe("subjects", () => {
  it("upper-cases and trims a code rather than refusing it", () => {
    const subject = normaliseSubject({ code: " ma ", name: "Mathematics" });
    expect(subject.code).toBe("MA");
  });

  it("refuses a code that will not fit a markbook column", () => {
    expect(() =>
      normaliseSubject({ code: "MATHEMATICS", name: "Mathematics" }),
    ).toThrow(/two to six/);
    expect(() => normaliseSubject({ code: "M", name: "Mathematics" })).toThrow();
  });

  it("refuses a code another subject already uses", () => {
    expect(() =>
      normaliseSubject({ code: "ma", name: "Further Mathematics" }, [
        { code: "MA", id: "subject-ma" },
      ]),
    ).toThrow(/already used/);
  });
});

describe("admissions intakes", () => {
  const intake: AdmissionIntake = {
    academicYearId: "year-2026",
    capacity: 120,
    closesOn: "2026-08-28",
    id: "intake-1",
    label: "2026 / 2027 intake",
    opensOn: "2026-04-01",
    status: "open",
    tenantId: "tenant-greenfield",
  };

  it("accepts applications between the dates when open", () => {
    expect(isIntakeAcceptingApplications(intake, "2026-06-01")).toBe(true);
    expect(intakeClosedReason(intake, "2026-06-01")).toBeNull();
  });

  /* The bug the intake record exists to fix: the old constant went on taking
     applications past the date the public site advertised. */
  it("stops accepting once the closing date has passed, without being closed", () => {
    expect(isIntakeAcceptingApplications(intake, "2026-08-29")).toBe(false);
    expect(intakeClosedReason(intake, "2026-08-29")).toMatch(/have closed/);
  });

  it("does not open itself when the opening date arrives", () => {
    const draft = { ...intake, status: "draft" as const };
    expect(isIntakeAcceptingApplications(draft, "2026-06-01")).toBe(false);
  });

  it("tells an early applicant when to come back", () => {
    expect(intakeClosedReason(intake, "2026-03-01")).toMatch(
      /open on 1 April 2026/,
    );
  });

  it("refuses an intake that closes before it opens", () => {
    expect(() =>
      normaliseIntake({
        academicYearId: "year-2026",
        closesOn: "2026-03-01",
        label: "2026 intake",
        opensOn: "2026-08-01",
      }),
    ).toThrow(/close after it opens/);
  });

  it("refuses a fractional or negative capacity", () => {
    const base = {
      academicYearId: "year-2026",
      closesOn: "2026-08-28",
      label: "2026 intake",
      opensOn: "2026-04-01",
    };
    expect(() => normaliseIntake({ ...base, capacity: -5 })).toThrow();
    expect(() => normaliseIntake({ ...base, capacity: 12.5 })).toThrow();
    expect(normaliseIntake({ ...base, capacity: 0 }).capacity).toBe(0);
  });
});

describe("school readiness", () => {
  const blank = {
    classesWithTeacher: 0,
    classGroupCount: 0,
    hasCurrentYear: false,
    hasOpenIntake: false,
    hasProfile: false,
    offeringCount: 0,
    teacherCount: 0,
    unstaffedOfferingCount: 0,
  };

  /* The old admin home showed four of five ticks to every school, including
     one that had just been created. */
  it("gives a brand new school no ticks at all", () => {
    expect(schoolReadiness(blank).every((step) => !step.complete)).toBe(true);
  });

  it("does not count classes as done when they have no subjects", () => {
    const steps = schoolReadiness({ ...blank, classGroupCount: 4 });
    expect(steps.find((step) => step.label.startsWith("Classes"))?.complete).toBe(
      false,
    );
  });

  const staffed = {
    ...blank,
    classesWithTeacher: 4,
    classGroupCount: 4,
    offeringCount: 24,
    teacherCount: 6,
  };

  it("counts staffing as done only when every class has a teacher", () => {
    const partial = schoolReadiness({ ...staffed, classesWithTeacher: 3 });
    expect(partial.find((step) => step.label.startsWith("Staff"))?.complete).toBe(
      false,
    );
    expect(schoolReadiness(staffed).find((step) => step.label.startsWith("Staff"))
      ?.complete).toBe(true);
  });

  /* A class can have a form tutor and still have three subjects nobody is
     down to teach, and a learner opening one of those finds it empty. Until
     assignments could be made at all, this could not be asked. */
  it("counts staffing as unfinished while a subject has no teacher", () => {
    const step = schoolReadiness({
      ...staffed,
      unstaffedOfferingCount: 3,
    }).find((item) => item.label.startsWith("Staff"));
    expect(step?.complete).toBe(false);
    expect(step?.detail).toMatch(/3 subjects have nobody/);
  });

  it("says how many, in the singular when there is one", () => {
    const step = schoolReadiness({
      ...staffed,
      unstaffedOfferingCount: 1,
    }).find((item) => item.label.startsWith("Staff"));
    expect(step?.detail).toMatch(/1 subject has nobody/);
  });

  it("does not claim staffing is done for a school with no subjects", () => {
    const step = schoolReadiness({
      ...staffed,
      offeringCount: 0,
    }).find((item) => item.label.startsWith("Staff"));
    expect(step?.complete).toBe(false);
  });

  it("does not call a school with no classes fully staffed", () => {
    const steps = schoolReadiness({ ...blank, teacherCount: 6 });
    expect(steps.find((step) => step.label.startsWith("Staff"))?.complete).toBe(
      false,
    );
  });
});

describe("the school profile document", () => {
  it("renders a complete profile from nothing at all", () => {
    const profile = parseSchoolProfile(undefined);
    expect(profile.name).toBe(greenfieldProfile.name);
    expect(profile.programmes.length).toBeGreaterThan(0);
  });

  /* A school part-way through filling its profile in should see its own
     answers and defaults for the rest, not all-or-nothing. */
  it("keeps the fields a school has written and falls back field by field", () => {
    const profile = parseSchoolProfile({
      contact: { telephone: "+233 30 000 0000" },
      name: "Akosombo Basic School",
    });
    expect(profile.name).toBe("Akosombo Basic School");
    expect(profile.contact.telephone).toBe("+233 30 000 0000");
    expect(profile.contact.email).toBe(greenfieldProfile.contact.email);
  });

  it("survives a document of the wrong shape entirely", () => {
    expect(parseSchoolProfile("not a profile").name).toBe(
      greenfieldProfile.name,
    );
    expect(parseSchoolProfile({ contact: 7, name: 42 }).name).toBe(
      greenfieldProfile.name,
    );
  });

  it("honours a school that has deliberately removed all its news", () => {
    expect(parseSchoolProfile({ news: [] }).news).toEqual([]);
  });

  it("drops blank address lines but refuses an empty address", () => {
    const edit = toSchoolProfileEdit(greenfieldProfile);
    const saved = applySchoolProfileEdit(greenfieldProfile, {
      ...edit,
      contactAddress: ["12 Otswe Street", "", "  ", "Accra"],
    });
    expect(saved.contact.address).toEqual(["12 Otswe Street", "Accra"]);

    expect(() =>
      applySchoolProfileEdit(greenfieldProfile, {
        ...edit,
        contactAddress: ["", "   "],
      }),
    ).toThrow(SchoolProfileError);
  });

  it("refuses a school with no name and an address that is not an email", () => {
    const edit = toSchoolProfileEdit(greenfieldProfile);
    expect(() =>
      applySchoolProfileEdit(greenfieldProfile, { ...edit, name: "  " }),
    ).toThrow(/needs a name/);
    expect(() =>
      applySchoolProfileEdit(greenfieldProfile, {
        ...edit,
        contactEmail: "office.greenfield.edu.gh",
      }),
    ).toThrow(/email address/);
  });

  it("refuses a founding year in the future", () => {
    const edit = toSchoolProfileEdit(greenfieldProfile);
    expect(() =>
      applySchoolProfileEdit(greenfieldProfile, {
        ...edit,
        established: new Date().getUTCFullYear() + 1,
      }),
    ).toThrow(/1800/);
  });

  /* The parts a school cannot edit yet must survive the parts it can. */
  it("carries hero slides and programmes through an edit untouched", () => {
    const edit = toSchoolProfileEdit(greenfieldProfile);
    const saved = applySchoolProfileEdit(greenfieldProfile, {
      ...edit,
      name: "Greenfield Academy Trust",
    });
    expect(saved.heroSlides).toEqual(greenfieldProfile.heroSlides);
    expect(saved.programmes).toEqual(greenfieldProfile.programmes);
    expect(saved.name).toBe("Greenfield Academy Trust");
  });

  it("round-trips through the editable subset without losing anything", () => {
    const saved = applySchoolProfileEdit(
      greenfieldProfile,
      toSchoolProfileEdit(greenfieldProfile),
    );
    expect(saved).toEqual(greenfieldProfile);
  });
});
