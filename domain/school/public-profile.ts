/* ==========================================================================
   The school's public profile

   Everything the marketing site shows about a school lives here rather than
   being written into the page, because none of it is ours to write: a school
   supplies its own photographs, its own results, and its own news. The page
   renders whatever profile it is handed.

   `greenfieldProfile` is the seeded demo tenant. Swapping it for a record
   loaded per host is the only change the public site needs to serve a second
   school.
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

export type SchoolProfile = {
  admissions: {
    closesOn: string;
    intakeLabel: string;
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
  testimonials: Testimonial[];
};

export const greenfieldProfile: SchoolProfile = {
  admissions: {
    closesOn: "2026-08-28",
    intakeLabel: "2026 / 2027 intake",
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
        alt: "Greenfield pupils raising their hands to answer a question in class",
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
        alt: "A Greenfield pupil answering a question with her hand raised at her desk",
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
        alt: "A Greenfield pupil drawing in the creative arts studio",
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
        alt: "A Greenfield pupil on the school steps holding her workbook",
        src: "/341463.jpg",
      },
      label: "Who we are",
    },
    {
      blurb: "Kindergarten through JHS 3, and how each stage is taught.",
      href: "#academics",
      id: "quick-academics",
      image: {
        alt: "A Greenfield pupil carrying her folder across the school courtyard",
        src: "/341343.jpg",
      },
      label: "Academics",
    },
    {
      blurb: "Clubs, sport, the arts, and the mural on the assembly wall.",
      href: "#student-life",
      id: "quick-student-life",
      image: {
        alt: "A Greenfield pupil painting in the creative arts studio",
        src: "/227646.jpg",
      },
      label: "Student life",
    },
  ],
  strapline: "Basic education in Osu, Accra, since 2004",
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
