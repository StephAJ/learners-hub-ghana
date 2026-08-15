/* ==========================================================================
   The school's public profile

   Everything the marketing site shows about a school lives here rather than
   being written into the page, because none of it is ours to write: a school
   supplies its own photographs, its own results, and its own news. The page
   renders whatever profile it is handed.

   `greenfieldProfile` is no longer what the site renders — it is the default
   a school starts from, written into `school_profiles` the first time a
   tenant is seeded and edited from /admin/school after that. It stays here
   rather than in a seed file because it doubles as the worked example of a
   filled-in profile, and because a school whose stored document is somehow
   unreadable should still get a page rather than a stack trace.
   ========================================================================== */

export type SchoolImage = {
  /** Short description for screen readers. Never decorative here — every
      image on the public site carries meaning about the school. */
  alt: string;
  src: string;
};

export type HeroSlide = {
  body: string;
  eyebrow: string;
  headline: string;
  id: string;
  image: SchoolImage;
  /** The one number this slide is making a case with. */
  stat: { label: string; value: string };
};

export type QuickLink = {
  blurb: string;
  href: string;
  id: string;
  image: SchoolImage;
  label: string;
};

export type Programme = {
  ages: string;
  id: string;
  name: string;
  points: string[];
  summary: string;
  years: string;
};

export type NewsItem = {
  category: string;
  /** ISO date. Formatted at render so the page stays locale-correct. */
  date: string;
  href: string;
  id: string;
  summary: string;
  title: string;
};

export type Testimonial = {
  id: string;
  name: string;
  quote: string;
  role: string;
};

export type AdmissionStep = {
  detail: string;
  id: string;
  title: string;
};

/** A figure a school makes a case with: "640" against "Learners". */
export type SchoolFact = {
  id: string;
  label: string;
  value: string;
};

/* ==========================================================================
   The three narrative sections

   These used to be prose in app/components/public/landing.tsx: the school's
   name, the town, its class size and the number of years it had been teaching
   were written into the markup, alongside a mural, a clubs count, a timetable
   list and four photograph captions. So a school that filled in this profile
   got its own name in the header and Greenfield's story underneath it.

   Everything the public page says now comes from here.
   ========================================================================== */

export type AboutSection = {
  /** The second paragraph — what the school wants said after the summary. */
  body: string;
  facts: SchoolFact[];
  heading: string;
  image: SchoolImage;
  /** The opening paragraph, directly under the heading. */
  lead: string;
};

export type AcademicsSection = {
  heading: string;
  lead: string;
};

export type StudentLifeSection = {
  feature: {
    body: string;
    eyebrow: string;
    image: SchoolImage;
    title: string;
  };
  heading: string;
  highlights: { heading: string; items: string[] };
  portrait: SchoolImage;
  stat: { label: string; value: string };
  studio: { caption: string; image: SchoolImage };
};

export type SchoolProfile = {
  about: AboutSection;
  academics: AcademicsSection;
  admissions: {
    /* The closing date and the intake's name are deliberately not here. They
       live on the intake record, which is also what decides whether the form
       accepts an application — see domain/academic/structure.ts. Held in two
       places they disagree, and the version a family reads on the way in is
       the one that is wrong. */
    note: string;
    steps: AdmissionStep[];
  };
  contact: {
    address: string[];
    email: string;
    officeHours: string;
    telephone: string;
  };
  established: number;
  heroSlides: HeroSlide[];
  location: string;
  name: string;
  news: NewsItem[];
  programmes: Programme[];
  quickLinks: QuickLink[];
  /** The line under the crest — a school's own summary of itself. */
  strapline: string;
  studentLife: StudentLifeSection;
  testimonials: Testimonial[];
};

export const greenfieldProfile: SchoolProfile = {
  about: {
    body: "Every mark, register and report is recorded against one record per learner, and families can read it the same day rather than waiting for the terminal report.",
    facts: [
      { id: "fact-established", label: "Established", value: "2004" },
      { id: "fact-learners", label: "Learners", value: "640" },
      { id: "fact-teachers", label: "Teachers", value: "48" },
    ],
    heading: "A basic school small enough to know every child by name.",
    image: {
      alt: "A pupil smiling on the school steps with her workbook",
      src: "/341463.jpg",
    },
    lead: "Greenfield Academy has taught the Ghana Education Service curriculum in Osu since 2004. We take children from Kindergarten 1 through to the BECE, and we keep classes at eighteen so a teacher can tell you how your child is actually getting on.",
  },
  academics: {
    heading: "Three stages, one continuous record.",
    lead: "A child who joins us in Kindergarten leaves with eleven years of marks, reports and teacher comments attached to the same file.",
  },
  admissions: {
    note: "Applying is free. Most families finish the form in about twenty minutes, and you can save it and come back.",
    steps: [
      {
        detail:
          "One account for the whole family. You can add a second child later without starting again.",
        id: "step-account",
        title: "Create an applicant account",
      },
      {
        detail:
          "Your child's details, the year group you are applying for, and the school they are coming from.",
        id: "step-form",
        title: "Fill in the application form",
      },
      {
        detail:
          "Birth certificate, the last two terminal reports, and a passport photograph. Photos of the originals are fine.",
        id: "step-documents",
        title: "Upload the required documents",
      },
      {
        detail:
          "We invite shortlisted families to a campus morning, then publish the decision to the same account.",
        id: "step-decision",
        title: "Visit, then read the decision",
      },
    ],
  },
  contact: {
    address: ["12 Otswe Street, Osu", "Accra, Greater Accra Region", "Ghana"],
    email: "admissions@greenfieldacademy.edu.gh",
    officeHours: "Monday to Friday, 7:30am – 4:00pm",
    telephone: "+233 30 276 4180",
  },
  established: 2004,
  heroSlides: [
    {
      body: "We teach the Ghana Education Service curriculum in classes small enough that a teacher knows how every child is getting on — not just how the class is getting on.",
      eyebrow: "Kindergarten to JHS 3 · Osu, Accra",
      headline: "A school where curiosity is the first subject.",
      id: "hero-welcome",
      image: {
        alt: "Pupils raising their hands to answer a question in class",
        src: "/5217.jpg",
      },
      stat: { label: "Average class size", value: "18" },
    },
    {
      body: "Our JHS 3 pupils sit the BECE with a full year of past-paper practice behind them, and a teacher who has marked every one of those papers with them.",
      eyebrow: "Academics",
      headline: "Prepared for the BECE, and for what comes after it.",
      id: "hero-academics",
      image: {
        alt: "A pupil answering a question with her hand raised at her desk",
        src: "/4126.jpg",
      },
      stat: { label: "Passed BECE in 2025", value: "94%" },
    },
    {
      body: "Creative arts, Ghanaian languages, coding club and sport are timetabled subjects here, not things we fit in when there is room left over.",
      eyebrow: "Student life",
      headline: "Every child leaves here having made something.",
      id: "hero-arts",
      image: {
        alt: "A pupil drawing in the creative arts studio",
        src: "/2714267.jpg",
      },
      stat: { label: "Clubs and teams", value: "21" },
    },
  ],
  location: "Osu, Accra",
  name: "Greenfield Academy",
  news: [
    {
      category: "Admissions",
      date: "2026-07-21",
      href: "/admissions",
      id: "news-open-morning",
      summary:
        "Two campus mornings before the intake closes. You will meet the class teachers, walk the block, and can ask about fees without an appointment.",
      title: "Open mornings on 8 and 15 August",
    },
    {
      category: "Results",
      date: "2026-07-04",
      href: "/admissions",
      id: "news-bece",
      summary:
        "Sixty-one of our sixty-five candidates passed, and nineteen placed into their first-choice senior high school.",
      title: "BECE 2026 results are in",
    },
    {
      category: "Student life",
      date: "2026-06-18",
      href: "/admissions",
      id: "news-mural",
      summary:
        "Upper primary and JHS pupils spent the term designing and painting the wall along the assembly ground. It stays up.",
      title: "The courtyard mural is finished",
    },
  ],
  programmes: [
    {
      ages: "Ages 4 – 5",
      id: "programme-kindergarten",
      name: "Kindergarten",
      points: [
        "Play-led numeracy and phonics",
        "Two teachers in every classroom",
        "Daily outdoor learning",
      ],
      summary:
        "Children arrive able to hold a pencil and leave able to hold a conversation about what they have read.",
      years: "KG 1 – KG 2",
    },
    {
      ages: "Ages 6 – 11",
      id: "programme-primary",
      name: "Primary",
      points: [
        "GES curriculum, taught in full",
        "Twi and Ga from Primary 1",
        "Weekly library and swimming",
      ],
      summary:
        "The six years where reading, number sense and study habits are either built properly or patched up later.",
      years: "Primary 1 – 6",
    },
    {
      ages: "Ages 12 – 15",
      id: "programme-jhs",
      name: "Junior High",
      points: [
        "BECE preparation from JHS 1",
        "Science laboratory and computer lab",
        "Termly guidance on SHS choices",
      ],
      summary:
        "Three years aimed squarely at the BECE, and at the senior high school placement that follows it.",
      years: "JHS 1 – 3",
    },
  ],
  quickLinks: [
    {
      blurb:
        "Twenty-two years in Osu, and what we believe a basic education owes a child.",
      href: "#about",
      id: "quick-about",
      image: {
        alt: "A pupil on the school steps holding her workbook",
        src: "/341463.jpg",
      },
      label: "Who we are",
    },
    {
      blurb: "Kindergarten through JHS 3, and how each stage is taught.",
      href: "#academics",
      id: "quick-academics",
      image: {
        alt: "A pupil carrying her folder across the school courtyard",
        src: "/341343.jpg",
      },
      label: "Academics",
    },
    {
      blurb: "Clubs, sport, the arts, and the mural on the assembly wall.",
      href: "#student-life",
      id: "quick-student-life",
      image: {
        alt: "A pupil painting in the creative arts studio",
        src: "/227646.jpg",
      },
      label: "Student life",
    },
  ],
  strapline: "Basic education in Osu, Accra, since 2004",
  studentLife: {
    feature: {
      body: "Designed and painted by upper primary and JHS pupils over one term. It stays on the assembly wall.",
      eyebrow: "Creative arts",
      image: {
        alt: "The mural painted by pupils along the assembly ground",
        src: "/5641.jpg",
      },
      title: "The courtyard mural",
    },
    heading: "What the rest of the timetable looks like.",
    highlights: {
      heading: "On the timetable",
      items: [
        "Twi and Ga from Primary 1",
        "Creative arts, weekly",
        "Swimming and athletics",
        "Coding club, JHS 1–3",
      ],
    },
    portrait: {
      alt: "A pupil carrying her folder across the courtyard",
      src: "/341343.jpg",
    },
    stat: {
      label: "clubs and teams, from coding to the drumming ensemble",
      value: "21",
    },
    studio: {
      caption: "Creative arts studio",
      image: {
        alt: "A pupil painting in the creative arts studio",
        src: "/227646.jpg",
      },
    },
  },
  testimonials: [
    {
      id: "testimonial-mensah",
      name: "Abena Mensah",
      quote:
        "I can see the mark and the teacher's comment the evening it is given, instead of waiting for the terminal report to tell me something I could have fixed in week three.",
      role: "Parent, Primary 4 and JHS 1",
    },
    {
      id: "testimonial-owusu",
      name: "Daniel Owusu",
      quote:
        "My register takes two minutes and my marks are already in the report by the end of term. That time goes back into planning lessons.",
      role: "JHS Mathematics teacher",
    },
  ],
};

/* ==========================================================================
   Reading and writing a stored profile

   The profile is held as one JSON document per school. That makes reading it
   an act of trust in a blob, so nothing below trusts it: `parseSchoolProfile`
   takes unknown input and returns a complete, renderable profile whatever it
   is handed, falling back field by field rather than all at once. A school
   that has filled in its address but not yet its programmes gets its own
   address and the default programmes, not the default address.

   The alternative — throwing on a malformed document — means one bad edit
   takes down the public site of a school that is otherwise fine.
   ========================================================================== */

/** What /admin/school lets a school change. */
/* What the School details form edits. Deliberately not the same shape as
   SchoolProfile: that document is the public site's, served unauthenticated,
   and studentNumberPrefix is an internal setting that has no business being
   published. It lives on the tenant row and travels through this form because
   this is where a school edits itself. */
export type SchoolProfileEdit = {
  aboutBody: string;
  aboutFacts: SchoolFact[];
  aboutHeading: string;
  aboutLead: string;
  academicsHeading: string;
  academicsLead: string;
  admissionsNote: string;
  contactAddress: string[];
  contactEmail: string;
  established: number;
  heroSlides: HeroSlide[];
  location: string;
  name: string;
  news: NewsItem[];
  officeHours: string;
  programmes: Programme[];
  strapline: string;
  studentLifeHeading: string;
  studentLifeHighlights: string[];
  /** In front of a learner's number: "GA" gives GA-260001. */
  studentNumberPrefix: string;
  telephone: string;
  testimonials: Testimonial[];
};

export class SchoolProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchoolProfileError";
  }
}

export function parseSchoolProfile(
  value: unknown,
  fallback: SchoolProfile = greenfieldProfile,
): SchoolProfile {
  const source = isRecord(value) ? value : {};
  const admissions = isRecord(source.admissions) ? source.admissions : {};
  const contact = isRecord(source.contact) ? source.contact : {};
  const about = isRecord(source.about) ? source.about : {};
  const academics = isRecord(source.academics) ? source.academics : {};
  const life = isRecord(source.studentLife) ? source.studentLife : {};
  const highlights = isRecord(life.highlights) ? life.highlights : {};

  return {
    about: {
      body: text(about.body, fallback.about.body),
      facts: array(about.facts, fallback.about.facts),
      heading: text(about.heading, fallback.about.heading),
      image: isRecord(about.image)
        ? (about.image as SchoolImage)
        : fallback.about.image,
      lead: text(about.lead, fallback.about.lead),
    },
    academics: {
      heading: text(academics.heading, fallback.academics.heading),
      lead: text(academics.lead, fallback.academics.lead),
    },
    admissions: {
      note: text(admissions.note, fallback.admissions.note),
      steps: array(admissions.steps, fallback.admissions.steps),
    },
    contact: {
      address: stringArray(contact.address, fallback.contact.address),
      email: text(contact.email, fallback.contact.email),
      officeHours: text(contact.officeHours, fallback.contact.officeHours),
      telephone: text(contact.telephone, fallback.contact.telephone),
    },
    established: wholeNumber(source.established, fallback.established),
    heroSlides: array(source.heroSlides, fallback.heroSlides),
    location: text(source.location, fallback.location),
    name: text(source.name, fallback.name),
    news: array(source.news, fallback.news),
    programmes: array(source.programmes, fallback.programmes),
    quickLinks: array(source.quickLinks, fallback.quickLinks),
    strapline: text(source.strapline, fallback.strapline),
    studentLife: {
      feature: isRecord(life.feature)
        ? (life.feature as StudentLifeSection["feature"])
        : fallback.studentLife.feature,
      heading: text(life.heading, fallback.studentLife.heading),
      highlights: {
        heading: text(
          highlights.heading,
          fallback.studentLife.highlights.heading,
        ),
        items: stringArray(
          highlights.items,
          fallback.studentLife.highlights.items,
        ),
      },
      portrait: isRecord(life.portrait)
        ? (life.portrait as SchoolImage)
        : fallback.studentLife.portrait,
      stat: isRecord(life.stat)
        ? (life.stat as StudentLifeSection["stat"])
        : fallback.studentLife.stat,
      studio: isRecord(life.studio)
        ? (life.studio as StudentLifeSection["studio"])
        : fallback.studentLife.studio,
    },
    testimonials: array(source.testimonials, fallback.testimonials),
  };
}

/**
 * Applies an administrator's edit to a profile.
 *
 * Reaches everything the public site says in words. It used to cover ten
 * fields and carry the rest through untouched, which meant a school that
 * filled in this form still published Greenfield's story, Greenfield's
 * programmes, Greenfield's news and two named people who do not work there.
 *
 * Photographs are the exception, and stay carried through: choosing one is a
 * media-library job rather than a text field, and a school part-way through
 * replacing them is better served by the stock images than by empty frames.
 */
export function applySchoolProfileEdit(
  current: SchoolProfile,
  input: SchoolProfileEdit,
): SchoolProfile {
  /* The route hands this straight off a JSON body, so a caller that omits one
     of the repeated sections would otherwise take the whole save down on a
     `.map` of undefined. A missing list means "no rows", which is a thing a
     school is allowed to want. */
  const edit: SchoolProfileEdit = {
    ...input,
    aboutFacts: list(input.aboutFacts),
    contactAddress: list(input.contactAddress),
    heroSlides: list(input.heroSlides),
    news: list(input.news),
    programmes: list(input.programmes),
    studentLifeHighlights: list(input.studentLifeHighlights),
    testimonials: list(input.testimonials),
  };
  const name = requireProfileText(edit.name, "The school needs a name.");
  const email = requireProfileText(
    edit.contactEmail,
    "The school needs a contact email address.",
  );
  if (!email.includes("@")) {
    throw new SchoolProfileError(
      `${email} does not look like an email address.`,
    );
  }

  const thisYear = new Date().getUTCFullYear();
  if (
    !Number.isInteger(edit.established) ||
    edit.established < 1800 ||
    edit.established > thisYear
  ) {
    throw new SchoolProfileError(
      `The year the school was established has to be between 1800 and ${thisYear}.`,
    );
  }

  /* Blank address lines are dropped rather than refused: the form offers a
     fixed number of lines and most schools do not fill all of them. */
  const address = edit.contactAddress
    .map((line) => line.trim())
    .filter(Boolean);
  if (address.length === 0) {
    throw new SchoolProfileError("The school needs a postal address.");
  }

  return {
    ...current,
    about: {
      ...current.about,
      body: edit.aboutBody.trim(),
      /* A fact with no label is a blank row in a definition list, so it is
         dropped rather than rendered. */
      facts: edit.aboutFacts
        .map((fact, index) => ({
          id: fact.id?.trim() || `fact-${index + 1}`,
          label: fact.label.trim(),
          value: fact.value.trim(),
        }))
        .filter((fact) => fact.label && fact.value),
      heading: requireProfileText(
        edit.aboutHeading,
        "The About section needs a heading.",
      ),
      lead: edit.aboutLead.trim(),
    },
    academics: {
      heading: requireProfileText(
        edit.academicsHeading,
        "The Academics section needs a heading.",
      ),
      lead: edit.academicsLead.trim(),
    },
    admissions: { ...current.admissions, note: edit.admissionsNote.trim() },
    contact: {
      address,
      email: email.toLowerCase(),
      officeHours: edit.officeHours.trim(),
      telephone: edit.telephone.trim(),
    },
    established: edit.established,
    /* Images are kept from the slide already in place, by id, so editing the
       words does not blank the photograph beside them. */
    heroSlides: edit.heroSlides
      .map((slide, index) => {
        const id = slide.id?.trim() || `hero-${index + 1}`;
        const existing = current.heroSlides.find((item) => item.id === id);
        return {
          body: slide.body.trim(),
          eyebrow: slide.eyebrow.trim(),
          headline: slide.headline.trim(),
          id,
          image:
            existing?.image ??
            current.heroSlides[index]?.image ??
            current.heroSlides[0]?.image ??
            { alt: "", src: "" },
          stat: {
            label: slide.stat.label.trim(),
            value: slide.stat.value.trim(),
          },
        };
      })
      .filter((slide) => slide.headline),
    location: edit.location.trim(),
    name,
    news: edit.news
      .map((item, index) => ({
        category: item.category.trim(),
        date: item.date.trim(),
        href: item.href?.trim() || "/admissions",
        id: item.id?.trim() || `news-${index + 1}`,
        summary: item.summary.trim(),
        title: item.title.trim(),
      }))
      .filter((item) => item.title),
    programmes: edit.programmes
      .map((programme, index) => ({
        ages: programme.ages.trim(),
        id: programme.id?.trim() || `programme-${index + 1}`,
        name: programme.name.trim(),
        points: programme.points.map((point) => point.trim()).filter(Boolean),
        summary: programme.summary.trim(),
        years: programme.years.trim(),
      }))
      .filter((programme) => programme.name),
    strapline: edit.strapline.trim(),
    studentLife: {
      ...current.studentLife,
      heading: requireProfileText(
        edit.studentLifeHeading,
        "The Student life section needs a heading.",
      ),
      highlights: {
        ...current.studentLife.highlights,
        items: edit.studentLifeHighlights
          .map((item) => item.trim())
          .filter(Boolean),
      },
    },
    testimonials: edit.testimonials
      .map((testimonial, index) => ({
        id: testimonial.id?.trim() || `testimonial-${index + 1}`,
        name: testimonial.name.trim(),
        quote: testimonial.quote.trim(),
        role: testimonial.role.trim(),
      }))
      .filter((testimonial) => testimonial.quote && testimonial.name),
  };
}

export function toSchoolProfileEdit(profile: SchoolProfile): SchoolProfileEdit {
  return {
    aboutBody: profile.about.body,
    aboutFacts: profile.about.facts,
    aboutHeading: profile.about.heading,
    aboutLead: profile.about.lead,
    academicsHeading: profile.academics.heading,
    academicsLead: profile.academics.lead,
    admissionsNote: profile.admissions.note,
    contactAddress: profile.contact.address,
    contactEmail: profile.contact.email,
    established: profile.established,
    heroSlides: profile.heroSlides,
    location: profile.location,
    name: profile.name,
    news: profile.news,
    officeHours: profile.contact.officeHours,
    programmes: profile.programmes,
    strapline: profile.strapline,
    studentLifeHeading: profile.studentLife.heading,
    studentLifeHighlights: profile.studentLife.highlights.items,
    /* Filled in by the repository from the tenant row — the profile document
       does not carry it. */
    studentNumberPrefix: "",
    telephone: profile.contact.telephone,
    testimonials: profile.testimonials,
  };
}

/* ==========================================================================
   Where a real school starts

   `greenfieldProfile` used to be the fallback for every school with no stored
   document — so an install that had never been near the demo still published
   Greenfield's address, its BECE results, its mural and two testimonials from
   people who do not work there.

   This is the honest starting point instead: the school's own name, and copy
   that says plainly that it has not been filled in yet. It keeps the demo's
   photographs, because a page with empty frames is worse than one with stock
   ones, and their alt text no longer claims to describe this school's pupils.
   ========================================================================== */
export function defaultSchoolProfile(schoolName: string): SchoolProfile {
  const name = schoolName.trim() || "This school";
  const blankImages = greenfieldProfile;

  return {
    about: {
      body: "Every mark, register and report is recorded against one record per learner, and families can read it the same day rather than waiting for the terminal report.",
      facts: [],
      heading: `About ${name}`,
      image: blankImages.about.image,
      lead: `${name} has not written this section yet. An administrator can fill it in under School details.`,
    },
    academics: {
      heading: "What we teach",
      lead: "",
    },
    admissions: {
      note: "Applying is free, and you can save the form and come back to it.",
      steps: greenfieldProfile.admissions.steps,
    },
    contact: {
      address: [],
      email: "",
      officeHours: "",
      telephone: "",
    },
    established: new Date().getUTCFullYear(),
    heroSlides: [
      {
        body: "",
        eyebrow: "",
        headline: name,
        id: "hero-welcome",
        image: blankImages.heroSlides[0].image,
        stat: { label: "", value: "" },
      },
    ],
    location: "",
    name,
    news: [],
    programmes: [],
    quickLinks: greenfieldProfile.quickLinks,
    strapline: "",
    studentLife: {
      feature: blankImages.studentLife.feature,
      heading: "Beyond the classroom",
      highlights: { heading: "On the timetable", items: [] },
      portrait: blankImages.studentLife.portrait,
      stat: { label: "", value: "" },
      studio: blankImages.studentLife.studio,
    },
    testimonials: [],
  };
}

function list<Item>(value: Item[] | undefined): Item[] {
  return Array.isArray(value) ? value : [];
}

function requireProfileText(value: string, message: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new SchoolProfileError(message);
  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function wholeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : fallback;
}

/* A present but empty list is honoured — a school with no news items has
   chosen to have none, and substituting someone else's would be worse than
   an empty section. Only a missing or non-list value falls back. */
function array<Item>(value: unknown, fallback: Item[]): Item[] {
  return Array.isArray(value) ? (value as Item[]) : fallback;
}

function stringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const lines = value.filter(
    (line): line is string => typeof line === "string" && line.trim().length > 0,
  );
  return lines.length > 0 ? lines : fallback;
}
