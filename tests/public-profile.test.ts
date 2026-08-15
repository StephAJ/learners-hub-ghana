import { describe, expect, it } from "vitest";
import {
  applySchoolProfileEdit,
  defaultSchoolProfile,
  greenfieldProfile,
  parseSchoolProfile,
  toSchoolProfileEdit,
  type SchoolProfileEdit,
} from "../domain/school/public-profile";

/* ==========================================================================
   What a school publishes about itself

   Two failures are being pinned here, and they are the same failure seen from
   two sides.

   The public page took a profile and then told Greenfield's story anyway: the
   school's name, the town, the class size, a mural, a clubs count and a
   timetable were prose in the markup. And the edit form reached ten fields,
   carrying hero slides, programmes, news and testimonials through untouched —
   so a school that filled the form in completely still published Greenfield's
   three programmes and two testimonials from people who do not work there.

   Asserting on the absence of the string "Greenfield" is deliberately blunt.
   It is the one check that keeps failing if somebody adds a new section to the
   page and copies the demo's copy into the default alongside it.
   ========================================================================== */

/** Every string anywhere in a profile, so a stray literal cannot hide in one. */
function allText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allText);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(allText);
  }
  return [];
}

describe("the profile a school starts from", () => {
  it("says nothing about Greenfield", () => {
    const profile = defaultSchoolProfile("Osu Community Basic School");

    const mentions = allText(profile).filter((text) =>
      /greenfield/i.test(text),
    );
    expect(
      mentions,
      "a school that has never seen the demo must not publish its story",
    ).toEqual([]);
  });

  it("uses the school's own name", () => {
    const profile = defaultSchoolProfile("Osu Community Basic School");

    expect(profile.name).toBe("Osu Community Basic School");
    expect(profile.about.heading).toContain("Osu Community Basic School");
    expect(profile.heroSlides[0].headline).toBe("Osu Community Basic School");
  });

  it("makes no claims the school has not made", () => {
    const profile = defaultSchoolProfile("Osu Community Basic School");

    /* Figures, programmes, news and testimonials are assertions about a
       school. An empty list renders nothing; a borrowed one renders a lie. */
    expect(profile.about.facts).toEqual([]);
    expect(profile.programmes).toEqual([]);
    expect(profile.news).toEqual([]);
    expect(profile.testimonials).toEqual([]);
    expect(profile.studentLife.highlights.items).toEqual([]);
  });

  it("still hands the page something to render", () => {
    const profile = defaultSchoolProfile("Osu Community Basic School");

    /* A section with no heading is a gap in the layout rather than an empty
       state, so every heading the page reads has to be there. */
    expect(profile.about.heading).not.toBe("");
    expect(profile.academics.heading).not.toBe("");
    expect(profile.studentLife.heading).not.toBe("");
    expect(profile.heroSlides.length).toBeGreaterThan(0);
  });
});

describe("editing a profile", () => {
  const base: SchoolProfileEdit = {
    ...toSchoolProfileEdit(greenfieldProfile),
    contactEmail: "office@osucommunity.edu.gh",
    name: "Osu Community Basic School",
  };

  it("replaces the parts that used to be uneditable", () => {
    const updated = applySchoolProfileEdit(greenfieldProfile, {
      ...base,
      aboutHeading: "A school on the Ring Road",
      news: [
        {
          category: "Admissions",
          date: "2026-09-01",
          href: "/admissions",
          id: "news-open",
          summary: "Two mornings in September.",
          title: "Open mornings",
        },
      ],
      programmes: [
        {
          ages: "Ages 6 – 11",
          id: "programme-primary",
          name: "Primary",
          points: ["GES curriculum"],
          summary: "Six years.",
          years: "Primary 1 – 6",
        },
      ],
      testimonials: [
        {
          id: "testimonial-one",
          name: "Akosua Darko",
          quote: "The reports arrive on time.",
          role: "Parent, Primary 3",
        },
      ],
    });

    expect(updated.about.heading).toBe("A school on the Ring Road");
    expect(updated.programmes).toHaveLength(1);
    expect(updated.programmes[0].name).toBe("Primary");
    expect(updated.news[0].title).toBe("Open mornings");
    expect(updated.testimonials[0].name).toBe("Akosua Darko");
  });

  it("drops rows that were added and never filled in", () => {
    const updated = applySchoolProfileEdit(greenfieldProfile, {
      ...base,
      aboutFacts: [
        { id: "fact-1", label: "Learners", value: "312" },
        { id: "fact-2", label: "", value: "" },
      ],
      programmes: [
        {
          ages: "",
          id: "programme-blank",
          name: "",
          points: [],
          summary: "",
          years: "",
        },
      ],
      testimonials: [
        { id: "testimonial-blank", name: "", quote: "", role: "" },
      ],
    });

    expect(updated.about.facts).toHaveLength(1);
    expect(updated.programmes).toEqual([]);
    expect(updated.testimonials).toEqual([]);
  });

  it("keeps the photograph behind a slide whose words changed", () => {
    const [first] = greenfieldProfile.heroSlides;
    const updated = applySchoolProfileEdit(greenfieldProfile, {
      ...base,
      heroSlides: [{ ...first, headline: "A different headline" }],
    });

    expect(updated.heroSlides[0].headline).toBe("A different headline");
    expect(updated.heroSlides[0].image).toEqual(first.image);
  });

  it("survives a body that omits the repeated sections entirely", () => {
    /* The route hands a JSON body straight to this. A caller that sends only
       the identity fields used to take the whole save down on a .map of
       undefined. */
    const partial = {
      aboutBody: "",
      aboutHeading: "About us",
      aboutLead: "",
      academicsHeading: "What we teach",
      academicsLead: "",
      admissionsNote: "",
      contactEmail: "office@osucommunity.edu.gh",
      established: 2011,
      location: "Osu",
      name: "Osu Community Basic School",
      officeHours: "",
      strapline: "",
      studentLifeHeading: "Beyond the classroom",
      studentNumberPrefix: "OC",
      telephone: "",
    } as unknown as SchoolProfileEdit;

    expect(() =>
      applySchoolProfileEdit(greenfieldProfile, {
        ...partial,
        contactAddress: ["1 Ring Road"],
      }),
    ).not.toThrow();
  });
});

describe("reading a stored profile", () => {
  it("falls back field by field rather than all at once", () => {
    const starting = defaultSchoolProfile("Osu Community Basic School");
    const parsed = parseSchoolProfile(
      { about: { heading: "A school on the Ring Road" } },
      starting,
    );

    expect(parsed.about.heading).toBe("A school on the Ring Road");
    /* The rest of the section is the school's starting point, not the demo's. */
    expect(parsed.about.lead).toBe(starting.about.lead);
    expect(parsed.name).toBe("Osu Community Basic School");
  });

  it("renders a document written before these sections existed", () => {
    const starting = defaultSchoolProfile("Osu Community Basic School");
    const parsed = parseSchoolProfile(
      { name: "Osu Community Basic School", strapline: "Since 2011" },
      starting,
    );

    expect(parsed.studentLife.highlights.items).toEqual([]);
    expect(parsed.academics.heading).toBe(starting.academics.heading);
  });
});
