import type {
  CurriculumStandard,
  LessonAvailability,
  LessonBlock,
} from "../learning/types";
import type { AssessmentPurpose, QuestionOption, QuestionType } from "../assessment/types";

/* ==========================================================================
   Greenfield Academy demo

   One coherent school, written once. Kwame Agyeman is in JHS 2 Gold and takes
   four subjects; each has a named teacher who owns its content, curriculum
   units and standards, and lessons that use every block type the player
   supports. Assessments cover every question type the marker supports.

   This module is deliberately free of database and React imports. The client
   fallbacks project from it today, and the Postgres seed will project from it
   once the learning repositories move off D1 — so the demo cannot drift into
   two different versions of the same school.

   Videos are real, published, embeddable recordings from established
   educational channels, referenced by link rather than re-hosted.
   ========================================================================== */

export const DEMO_TENANT_ID = "tenant-greenfield";
export const DEMO_CLASS_NAME = "JHS 2 Gold";
export const DEMO_CLASS_GROUP_ID = "class-jhs2-gold";
export const DEMO_ACADEMIC_YEAR_ID = "year-2026-27";
export const DEMO_LEARNER_PERSON_ID = "person-kwame";

export type DemoPerson = {
  email: string;
  firstName: string;
  id: string;
  kind: "staff" | "learner" | "guardian";
  lastName: string;
  phone?: string;
  role:
    | "school-admin"
    | "academic-admin"
    | "admissions-officer"
    | "teacher"
    | "class-teacher"
    | "guardian"
    | "learner";
  scopeId?: string;
  scopeType: "tenant" | "subject" | "class" | "learner";
};

export type DemoLesson = {
  availability: LessonAvailability;
  blocks: LessonBlock[];
  estimatedMinutes: number;
  id: string;
  objectives: string[];
  /* Where Kwame has actually got to. Drives both the learner player and the
     guardian's progress view, so the two always agree. */
  progressPercent: number;
  publishedAt?: string;
  releaseHint?: string;
  standardCodes: string[];
  status: "draft" | "published";
  summary: string;
  title: string;
  unitId: string;
  unitTitle: string;
  version: number;
};

export type DemoSubject = {
  code: string;
  lessons: DemoLesson[];
  offeringId: string;
  /* URL segment under /learn/subjects. */
  slug: string;
  standards: CurriculumStandard[];
  subjectName: string;
  teacherPersonId: string;
  units: Array<{ id: string; lessonCount: number; title: string }>;
};

export type DemoQuestion = {
  answerNote: string;
  id: string;
  marks: number;
  options: QuestionOption[];
  position: number;
  prompt: string;
  type: QuestionType;
};

export type DemoAssessment = {
  id: string;
  instructions: string;
  offeringId: string;
  passMarkPercent: number;
  purpose: AssessmentPurpose;
  questions: DemoQuestion[];
  slug: string;
  timeLimitMinutes: number;
  title: string;
};

/* -------------------------------------------------------------------------
   People
   ------------------------------------------------------------------------- */

export const demoPeople: DemoPerson[] = [
  {
    email: "mary.asante@greenfield.edu.gh",
    firstName: "Mary",
    id: "person-mary",
    kind: "staff",
    lastName: "Asante",
    phone: "+233 24 401 2278",
    role: "academic-admin",
    scopeType: "tenant",
  },
  {
    email: "joseph.kumi@greenfield.edu.gh",
    firstName: "Joseph",
    id: "person-joseph",
    kind: "staff",
    lastName: "Kumi",
    phone: "+233 20 785 4301",
    role: "admissions-officer",
    scopeType: "tenant",
  },
  {
    email: "grace.mensah@greenfield.edu.gh",
    firstName: "Grace",
    id: "person-grace",
    kind: "staff",
    lastName: "Mensah",
    phone: "+233 27 330 1842",
    role: "teacher",
    scopeId: "Integrated Science",
    scopeType: "subject",
  },
  {
    email: "kofi.boateng@greenfield.edu.gh",
    firstName: "Kofi",
    id: "person-kofi",
    kind: "staff",
    lastName: "Boateng",
    phone: "+233 24 118 9042",
    role: "teacher",
    scopeId: "Mathematics",
    scopeType: "subject",
  },
  {
    email: "abena.owusu@greenfield.edu.gh",
    firstName: "Abena",
    id: "person-abena",
    kind: "staff",
    lastName: "Owusu",
    phone: "+233 20 553 7716",
    role: "teacher",
    scopeId: "English Language",
    scopeType: "subject",
  },
  {
    email: "emmanuel.ofori@greenfield.edu.gh",
    firstName: "Emmanuel",
    id: "person-emmanuel",
    kind: "staff",
    lastName: "Ofori",
    phone: "+233 55 681 0913",
    /* Emmanuel is the form tutor for JHS 2 Gold and also teaches them Social
       Studies, which is why he holds a class scope rather than a subject one. */
    role: "class-teacher",
    scopeId: DEMO_CLASS_NAME,
    scopeType: "class",
  },
  {
    email: "kwame.agyeman@student.greenfield.edu.gh",
    firstName: "Kwame",
    id: DEMO_LEARNER_PERSON_ID,
    kind: "learner",
    lastName: "Agyeman",
    role: "learner",
    scopeId: DEMO_CLASS_NAME,
    scopeType: "class",
  },
  {
    email: "efua.agyeman@example.com",
    firstName: "Efua",
    id: "person-efua",
    kind: "guardian",
    lastName: "Agyeman",
    phone: "+233 24 665 8031",
    role: "guardian",
    scopeId: "Kwame Agyeman",
    scopeType: "learner",
  },
];

export function demoPersonName(personId: string): string {
  const person = demoPeople.find((item) => item.id === personId);
  return person ? `${person.firstName} ${person.lastName}` : "Greenfield staff";
}

/* -------------------------------------------------------------------------
   Subjects

   Block ids are stable and readable so a failure in the player names the
   lesson it came from.
   ------------------------------------------------------------------------- */

function block(
  id: string,
  position: number,
  type: LessonBlock["type"],
  title: string,
  content: string,
  config?: LessonBlock["config"],
): LessonBlock {
  return { config, content, id, position, ready: true, title, type };
}

const integratedScience: DemoSubject = {
  code: "IS",
  offeringId: "offering-science-jhs2",
  slug: "integrated-science",
  subjectName: "Integrated Science",
  teacherPersonId: "person-grace",
  units: [
    { id: "unit-human-systems", lessonCount: 2, title: "Human body systems" },
    { id: "unit-food-nutrition", lessonCount: 1, title: "Food and nutrition" },
  ],
  standards: [
    {
      code: "JHS2.IS.HBS.1",
      description:
        "Describe the structures and functions of major human body systems.",
      id: "standard-human-systems-1",
      position: 1,
      strand: "Systems",
      subStrand: "Human body systems",
    },
    {
      code: "JHS2.IS.HBS.2",
      description: "Explain how body systems work together to sustain life.",
      id: "standard-human-systems-2",
      position: 2,
      strand: "Systems",
      subStrand: "Human body systems",
    },
    {
      code: "JHS2.IS.NUT.1",
      description:
        "Classify common foods and apply the principles of a balanced diet.",
      id: "standard-nutrition-1",
      position: 3,
      strand: "Diversity of matter",
      subStrand: "Food and nutrition",
    },
  ],
  lessons: [
    {
      availability: "available",
      blocks: [
        block(
          "block-digestion-intro",
          1,
          "text",
          "Your body's food-processing journey",
          "Digestion turns the food you eat into nutrients small enough to pass into the blood, where they support growth, repair, and energy. The journey from a mouthful of banku to absorbed nutrients takes about a day, and every organ along the way has one job to do.",
        ),
        block(
          "block-digestion-video",
          2,
          "video",
          "Watch: a tour of the digestive system",
          "Follow food from the mouth to the small intestine, and see where each enzyme does its work.",
          { videoUrl: "https://www.youtube.com/watch?v=1UvuBYUbFk0" },
        ),
        block(
          "block-digestion-h5p",
          3,
          "interactive",
          "Label the digestive organs",
          "Drag each label onto the correct organ, then check your work.",
          { activityId: "activity-digestion-labels", provider: "h5p" },
        ),
        block(
          "block-digestion-check",
          4,
          "interactive",
          "Check your understanding",
          "Where does most nutrient absorption take place?",
        ),
        block(
          "block-digestion-resource",
          5,
          "resource",
          "Digestive system study sheet",
          "A one-page revision sheet with a labelled diagram, printable for revision at home.",
          { mediaAssetId: "asset-digestion-study-sheet" },
        ),
      ],
      estimatedMinutes: 25,
      id: "lesson-digestive-system",
      objectives: [
        "Identify the main organs of the digestive system.",
        "Explain how food is broken down and absorbed.",
      ],
      progressPercent: 100,
      publishedAt: "2026-07-21T09:00:00Z",
      standardCodes: ["JHS2.IS.HBS.1", "JHS2.IS.HBS.2"],
      status: "published",
      summary:
        "Follow food through the body and discover how nutrients reach your cells.",
      title: "The human digestive system",
      unitId: "unit-human-systems",
      unitTitle: "Human body systems",
      version: 1,
    },
    {
      availability: "available",
      blocks: [
        block(
          "block-respiration-intro",
          1,
          "text",
          "The journey of a breath",
          "Air travels through the nose and windpipe into branching tubes that end in tiny air sacs called alveoli. Spread flat, the alveoli in one pair of lungs would cover most of a classroom floor — that surface area is what makes gas exchange fast enough to keep you alive.",
        ),
        block(
          "block-respiration-video",
          2,
          "video",
          "Watch: the respiratory system",
          "See oxygen cross into the blood and carbon dioxide leave it.",
          { videoUrl: "https://www.youtube.com/watch?v=v_j-LD2YEqg" },
        ),
        block(
          "block-respiration-practice",
          3,
          "practice",
          "Label the breathing pathway",
          "Put the nose, windpipe, bronchi, bronchioles, and alveoli in the order air reaches them, then explain in one sentence why the alveoli are so thin.",
        ),
      ],
      estimatedMinutes: 20,
      id: "lesson-respiratory-system",
      objectives: [
        "Identify the main structures of the respiratory system.",
        "Explain how oxygen reaches body cells.",
      ],
      progressPercent: 40,
      publishedAt: "2026-07-23T11:00:00Z",
      standardCodes: ["JHS2.IS.HBS.2"],
      status: "published",
      summary:
        "Trace oxygen from the air into the blood and connect breathing to energy.",
      title: "How breathing powers the body",
      unitId: "unit-human-systems",
      unitTitle: "Human body systems",
      version: 1,
    },
    {
      /* Locked until the lesson before it is finished, so the demo shows the
         prerequisite release rule doing something visible. */
      availability: "locked",
      blocks: [
        block(
          "block-balanced-diet-intro",
          1,
          "text",
          "What makes a plate balanced?",
          "A balanced meal supplies energy, body-building nutrients, and protective nutrients in the right proportions. Ghanaian staples cover all three — the skill is in the pairing.",
        ),
        block(
          "block-balanced-diet-sort",
          2,
          "interactive",
          "Sort the market basket",
          "Place each food into the nutrient group it mainly supplies.",
          { activityId: "activity-nutrient-sort", provider: "h5p" },
        ),
        block(
          "block-balanced-diet-resource",
          3,
          "resource",
          "Balanced plate planner",
          "Plan three balanced meals from foods available at your local market.",
          { mediaAssetId: "asset-balanced-plate-planner" },
        ),
      ],
      estimatedMinutes: 20,
      id: "lesson-balanced-diet",
      objectives: [
        "Group common Ghanaian foods by the nutrients they mainly supply.",
        "Plan a balanced meal from locally available foods.",
      ],
      progressPercent: 0,
      releaseHint: "Finish “How breathing powers the body” first",
      standardCodes: ["JHS2.IS.NUT.1"],
      status: "published",
      summary: "Use familiar foods to plan a balanced plate.",
      title: "Building a balanced Ghanaian meal",
      unitId: "unit-food-nutrition",
      unitTitle: "Food and nutrition",
      version: 1,
    },
  ],
};

const mathematics: DemoSubject = {
  code: "MA",
  offeringId: "offering-maths-jhs2",
  slug: "mathematics",
  subjectName: "Mathematics",
  teacherPersonId: "person-kofi",
  units: [
    { id: "unit-fractions", lessonCount: 1, title: "Fractions" },
    { id: "unit-ratio", lessonCount: 1, title: "Ratio and proportion" },
  ],
  standards: [
    {
      code: "JHS2.MA.NUM.1",
      description:
        "Add and subtract fractions with like and unlike denominators.",
      id: "standard-fractions-1",
      position: 1,
      strand: "Number",
      subStrand: "Fractions",
    },
    {
      code: "JHS2.MA.NUM.2",
      description: "Use ratio and proportion to solve everyday problems.",
      id: "standard-ratio-1",
      position: 2,
      strand: "Number",
      subStrand: "Ratio and proportion",
    },
  ],
  lessons: [
    {
      availability: "available",
      blocks: [
        block(
          "block-fractions-intro",
          1,
          "text",
          "Why denominators must match",
          "You can only add fractions that describe pieces of the same size. Thirds and quarters are different sizes, so before adding them you rewrite both as pieces of a common size — that is all a common denominator is.",
        ),
        block(
          "block-fractions-video",
          2,
          "video",
          "Watch: adding and subtracting fractions",
          "A step-by-step walkthrough of the common-denominator method.",
          { videoUrl: "https://www.youtube.com/watch?v=5juto2ze8Lg" },
        ),
        block(
          "block-fractions-interactive",
          3,
          "interactive",
          "Build the common denominator",
          "Choose the smallest denominator that both fractions can be rewritten with.",
          { activityId: "activity-fraction-builder", provider: "h5p" },
        ),
        block(
          "block-fractions-practice",
          4,
          "practice",
          "Ten to try",
          "Work through the ten questions, showing the common denominator you used for each.",
        ),
      ],
      estimatedMinutes: 30,
      id: "lesson-adding-fractions",
      objectives: [
        "Find a common denominator for two fractions.",
        "Add and subtract fractions with unlike denominators.",
      ],
      progressPercent: 60,
      publishedAt: "2026-07-20T08:30:00Z",
      standardCodes: ["JHS2.MA.NUM.1"],
      status: "published",
      summary:
        "Rewrite fractions with a common denominator, then add and subtract with confidence.",
      title: "Adding and subtracting fractions",
      unitId: "unit-fractions",
      unitTitle: "Fractions",
      version: 1,
    },
    {
      availability: "available",
      blocks: [
        block(
          "block-ratio-intro",
          1,
          "text",
          "Ratio at the market",
          "A trader mixing gari and beans at 3:2 is describing a relationship, not an amount. Doubling both numbers keeps the mixture tasting the same — that is what makes a ratio useful for scaling a recipe up or down.",
        ),
        block(
          "block-ratio-practice",
          2,
          "practice",
          "Scale the recipe",
          "A waakye recipe for 4 people uses 3 cups of rice to 2 cups of beans. Work out the quantities for 10 people, and explain your method.",
        ),
        block(
          "block-ratio-resource",
          3,
          "resource",
          "Ratio worked examples",
          "Six worked examples using prices, distances, and recipes.",
          { mediaAssetId: "asset-ratio-examples" },
        ),
      ],
      estimatedMinutes: 25,
      id: "lesson-ratio-proportion",
      objectives: [
        "Express a relationship between two quantities as a ratio.",
        "Scale quantities up and down while keeping a ratio constant.",
      ],
      progressPercent: 0,
      publishedAt: "2026-07-27T08:30:00Z",
      standardCodes: ["JHS2.MA.NUM.2"],
      status: "published",
      summary:
        "Use ratio to scale recipes, prices, and distances the way traders do every day.",
      title: "Ratio and proportion at the market",
      unitId: "unit-ratio",
      unitTitle: "Ratio and proportion",
      version: 1,
    },
  ],
};

const englishLanguage: DemoSubject = {
  code: "EN",
  offeringId: "offering-english-jhs2",
  slug: "english-language",
  subjectName: "English Language",
  teacherPersonId: "person-abena",
  units: [
    { id: "unit-writing", lessonCount: 1, title: "Writing for a purpose" },
    { id: "unit-reading", lessonCount: 1, title: "Reading and comprehension" },
  ],
  standards: [
    {
      code: "JHS2.EN.WRI.1",
      description:
        "Write formal texts using an appropriate register and structure.",
      id: "standard-writing-1",
      position: 1,
      strand: "Writing",
      subStrand: "Writing for a purpose",
    },
    {
      code: "JHS2.EN.REA.1",
      description:
        "Identify the main idea and supporting detail in an unfamiliar text.",
      id: "standard-reading-1",
      position: 2,
      strand: "Reading",
      subStrand: "Comprehension",
    },
  ],
  lessons: [
    {
      availability: "available",
      blocks: [
        block(
          "block-letter-intro",
          1,
          "text",
          "Who are you writing to?",
          "A formal letter assumes distance between writer and reader. That distance sets everything else: the greeting, the absence of contractions, the sign-off. Get the reader wrong and the whole register slips.",
        ),
        block(
          "block-letter-video",
          2,
          "video",
          "Watch: how to write a formal letter",
          "The parts of a formal letter, in the order they appear on the page.",
          { videoUrl: "https://www.youtube.com/watch?v=G0EXT89D4Jk" },
        ),
        block(
          "block-letter-practice",
          3,
          "practice",
          "Write to the head teacher",
          "Write a formal letter of no more than 200 words requesting permission for your class to visit the science museum.",
        ),
        block(
          "block-letter-resource",
          4,
          "resource",
          "Formal letter checklist",
          "Check your draft against the eight features of a formal letter before submitting.",
          { mediaAssetId: "asset-letter-checklist" },
        ),
      ],
      estimatedMinutes: 35,
      id: "lesson-formal-letter",
      objectives: [
        "Identify the parts of a formal letter.",
        "Write a formal letter with an appropriate register.",
      ],
      progressPercent: 25,
      publishedAt: "2026-07-24T10:00:00Z",
      standardCodes: ["JHS2.EN.WRI.1"],
      status: "published",
      summary:
        "Learn the structure and register of a formal letter, then write one of your own.",
      title: "Writing a formal letter",
      unitId: "unit-writing",
      unitTitle: "Writing for a purpose",
      version: 1,
    },
    {
      /* Left as a draft so the teacher workspace has unpublished work in it and
         the learner list has a gap the guardian can ask about. */
      availability: "locked",
      blocks: [
        block(
          "block-reading-intro",
          1,
          "text",
          "Finding the main idea",
          "The main idea is rarely the first sentence. It is the claim every other sentence in the paragraph is there to support.",
        ),
      ],
      estimatedMinutes: 25,
      id: "lesson-reading-meaning",
      objectives: ["Identify the main idea of an unfamiliar passage."],
      progressPercent: 0,
      releaseHint: "Ms. Owusu is still preparing this lesson",
      standardCodes: ["JHS2.EN.REA.1"],
      status: "draft",
      summary: "Separate the main idea from the detail that supports it.",
      title: "Reading for meaning",
      unitId: "unit-reading",
      unitTitle: "Reading and comprehension",
      version: 0,
    },
  ],
};

const socialStudies: DemoSubject = {
  code: "SO",
  offeringId: "offering-social-jhs2",
  slug: "social-studies",
  subjectName: "Social Studies",
  teacherPersonId: "person-emmanuel",
  units: [
    {
      id: "unit-governance",
      lessonCount: 1,
      title: "Governance and citizenship",
    },
  ],
  standards: [
    {
      code: "JHS2.SO.GOV.1",
      description:
        "Describe the three arms of government and how they check one another.",
      id: "standard-governance-1",
      position: 1,
      strand: "Governance",
      subStrand: "Citizenship",
    },
  ],
  lessons: [
    {
      availability: "available",
      blocks: [
        block(
          "block-government-intro",
          1,
          "text",
          "Why power is divided",
          "Ghana's 1992 Constitution splits the work of government three ways: Parliament makes law, the Executive carries it out, and the Judiciary interprets it. Each arm can check the others, which is what stops any one of them from acting alone.",
        ),
        block(
          "block-government-video",
          2,
          "video",
          "Watch: the arms of government",
          "What each arm does, and how the separation of powers works in practice.",
          { videoUrl: "https://www.youtube.com/watch?v=484k-JaglZ8" },
        ),
        block(
          "block-government-check",
          3,
          "interactive",
          "Which arm does what?",
          "Which arm of government interprets the law and settles disputes about it?",
        ),
        block(
          "block-government-resource",
          4,
          "resource",
          "The three arms at a glance",
          "A one-page summary with the role, membership, and checks of each arm.",
          { mediaAssetId: "asset-government-summary" },
        ),
      ],
      estimatedMinutes: 30,
      id: "lesson-arms-of-government",
      objectives: [
        "Name the three arms of government and their main roles.",
        "Give one example of how each arm checks another.",
      ],
      progressPercent: 0,
      publishedAt: "2026-07-28T09:15:00Z",
      standardCodes: ["JHS2.SO.GOV.1"],
      status: "published",
      summary:
        "Meet the three arms of government and see how they hold one another in check.",
      title: "The three arms of government",
      unitId: "unit-governance",
      unitTitle: "Governance and citizenship",
      version: 1,
    },
  ],
};

/** Every subject Kwame takes, in timetable order. */
export const demoSubjects: DemoSubject[] = [
  integratedScience,
  mathematics,
  englishLanguage,
  socialStudies,
];

export function demoSubjectBySlug(slug: string): DemoSubject | undefined {
  return demoSubjects.find((subject) => subject.slug === slug);
}

export function demoSubjectByOffering(
  offeringId: string,
): DemoSubject | undefined {
  return demoSubjects.find((subject) => subject.offeringId === offeringId);
}

/** Mean progress across a subject's published lessons, rounded. */
export function demoSubjectProgress(subject: DemoSubject): number {
  const published = subject.lessons.filter(
    (lesson) => lesson.status === "published",
  );
  if (published.length === 0) return 0;
  return Math.round(
    published.reduce((total, lesson) => total + lesson.progressPercent, 0) /
      published.length,
  );
}

/* -------------------------------------------------------------------------
   Assessments

   Between them these cover every question type the marker handles, so the
   demo exercises auto-marking and the teacher review queue rather than only
   the easy multiple-choice path.
   ------------------------------------------------------------------------- */

export const demoAssessments: DemoAssessment[] = [
  {
    id: "assessment-digestion-check",
    instructions:
      "Answer every question. You can flag an item and return to it before submitting.",
    offeringId: "offering-science-jhs2",
    passMarkPercent: 60,
    purpose: "formative",
    slug: "digestive-system-check",
    timeLimitMinutes: 12,
    title: "Digestive system knowledge check",
    questions: [
      {
        answerNote: "Small intestine — villi give it a very large surface area.",
        id: "question-absorption-site",
        marks: 1,
        options: [
          { id: "mouth", label: "Mouth" },
          { id: "stomach", label: "Stomach" },
          { id: "small-intestine", label: "Small intestine" },
          { id: "large-intestine", label: "Large intestine" },
        ],
        position: 1,
        prompt: "Where does most nutrient absorption take place?",
        type: "single-choice",
      },
      {
        answerNote: "True — bile emulsifies fat into smaller droplets.",
        id: "question-bile-true-false",
        marks: 1,
        options: [],
        position: 2,
        prompt: "Bile helps the body digest fats.",
        type: "true-false",
      },
      {
        answerNote: "Saliva, gastric juice and bile are all digestive fluids.",
        id: "question-digestive-fluids",
        marks: 2,
        options: [
          { id: "saliva", label: "Saliva" },
          { id: "gastric-juice", label: "Gastric juice" },
          { id: "bile", label: "Bile" },
          { id: "plasma", label: "Blood plasma" },
        ],
        position: 3,
        prompt: "Select every fluid that plays a part in digestion.",
        type: "multiple-choice",
      },
      {
        answerNote: "Villi.",
        id: "question-villi-name",
        marks: 1,
        options: [],
        position: 4,
        prompt:
          "What name is given to the tiny folds lining the small intestine?",
        type: "short-text",
      },
      {
        answerNote: "About 7 metres in an adult.",
        id: "question-intestine-length",
        marks: 1,
        options: [],
        position: 5,
        prompt:
          "Roughly how many metres long is the small intestine in an adult?",
        type: "numeric",
      },
      {
        answerNote: "Mouth chews, stomach churns, small intestine absorbs.",
        id: "question-organ-action-match",
        marks: 2,
        options: [
          { id: "left:mouth", label: "Mouth" },
          { id: "left:stomach", label: "Stomach" },
          { id: "left:small-intestine", label: "Small intestine" },
          { id: "right:chewing", label: "Chewing" },
          { id: "right:churning", label: "Churning" },
          { id: "right:absorbing", label: "Absorbing nutrients" },
        ],
        position: 6,
        prompt: "Match each digestive organ to its main action.",
        type: "matching",
      },
      {
        answerNote: "Mouth, oesophagus, stomach, small intestine.",
        id: "question-digestion-order",
        marks: 2,
        options: [
          { id: "stomach", label: "Stomach" },
          { id: "mouth", label: "Mouth" },
          { id: "oesophagus", label: "Oesophagus" },
          { id: "small-intestine", label: "Small intestine" },
        ],
        position: 7,
        prompt: "Arrange the organs in the order food travels through them.",
        type: "ordering",
      },
      {
        answerNote:
          "Marked by rubric: surface area from villi, and a thin wall with a good blood supply.",
        id: "question-villi-explanation",
        marks: 3,
        options: [],
        position: 8,
        prompt:
          "Explain two ways the small intestine is adapted for nutrient absorption.",
        type: "essay",
      },
    ],
  },
  {
    id: "assessment-fractions-homework",
    instructions:
      "Show the common denominator you used for each question. Calculators are not needed.",
    offeringId: "offering-maths-jhs2",
    passMarkPercent: 50,
    purpose: "homework",
    slug: "fractions-homework",
    timeLimitMinutes: 20,
    title: "Fractions homework",
    questions: [
      {
        answerNote: "12 — the lowest common multiple of 3 and 4.",
        id: "question-common-denominator",
        marks: 1,
        options: [],
        position: 1,
        prompt:
          "What is the smallest common denominator for one third and one quarter?",
        type: "numeric",
      },
      {
        answerNote: "7/12.",
        id: "question-add-fractions",
        marks: 2,
        options: [
          { id: "five-twelfths", label: "5/12" },
          { id: "seven-twelfths", label: "7/12" },
          { id: "two-sevenths", label: "2/7" },
          { id: "one-half", label: "1/2" },
        ],
        position: 2,
        prompt: "Work out one third plus one quarter.",
        type: "single-choice",
      },
      {
        answerNote:
          "Marked by rubric: thirds and quarters are different-sized pieces.",
        id: "question-why-common",
        marks: 3,
        options: [],
        position: 3,
        prompt:
          "Explain, in your own words, why fractions must share a denominator before they can be added.",
        type: "essay",
      },
    ],
  },
];

export function demoAssessmentBySlug(slug: string): DemoAssessment | undefined {
  return demoAssessments.find((assessment) => assessment.slug === slug);
}

/* -------------------------------------------------------------------------
   Content library

   Documents a teacher has uploaded, and the interactive activities built on
   top of them. Sizes and dates are realistic so the storage figures in the
   content studio add up.
   ------------------------------------------------------------------------- */

export type DemoMediaAsset = {
  contentType: string;
  createdAt: string;
  id: string;
  kind: "image" | "audio" | "video" | "document" | "h5p-package";
  offeringId: string;
  originalFilename: string;
  sizeBytes: number;
  status: "ready" | "awaiting-runtime";
  uploadedByPersonId: string;
};

export const demoMediaAssets: DemoMediaAsset[] = [
  {
    contentType: "application/pdf",
    createdAt: "2026-07-21T08:30:00Z",
    id: "asset-digestion-study-sheet",
    kind: "document",
    offeringId: "offering-science-jhs2",
    originalFilename: "digestive-system-study-sheet.pdf",
    sizeBytes: 430_080,
    status: "ready",
    uploadedByPersonId: "person-grace",
  },
  {
    contentType: "application/pdf",
    createdAt: "2026-07-25T14:05:00Z",
    id: "asset-balanced-plate-planner",
    kind: "document",
    offeringId: "offering-science-jhs2",
    originalFilename: "balanced-plate-planner.pdf",
    sizeBytes: 268_288,
    status: "ready",
    uploadedByPersonId: "person-grace",
  },
  {
    contentType: "application/zip",
    createdAt: "2026-07-21T07:55:00Z",
    id: "asset-digestion-labels-package",
    kind: "h5p-package",
    offeringId: "offering-science-jhs2",
    originalFilename: "label-the-digestive-organs.h5p",
    sizeBytes: 2_170_880,
    status: "ready",
    uploadedByPersonId: "person-grace",
  },
  {
    contentType: "application/zip",
    createdAt: "2026-07-25T14:20:00Z",
    id: "asset-nutrient-sort-package",
    kind: "h5p-package",
    offeringId: "offering-science-jhs2",
    originalFilename: "sort-the-market-basket.h5p",
    sizeBytes: 1_884_160,
    /* Uploaded but not yet imported into the runtime, so the content studio
       has something in the "Prepare activity" state. */
    status: "awaiting-runtime",
    uploadedByPersonId: "person-grace",
  },
  {
    contentType: "application/pdf",
    createdAt: "2026-07-27T09:10:00Z",
    id: "asset-ratio-examples",
    kind: "document",
    offeringId: "offering-maths-jhs2",
    originalFilename: "ratio-worked-examples.pdf",
    sizeBytes: 512_000,
    status: "ready",
    uploadedByPersonId: "person-kofi",
  },
  {
    contentType: "application/zip",
    createdAt: "2026-07-20T08:00:00Z",
    id: "asset-fraction-builder-package",
    kind: "h5p-package",
    offeringId: "offering-maths-jhs2",
    originalFilename: "build-the-common-denominator.h5p",
    sizeBytes: 1_649_664,
    status: "ready",
    uploadedByPersonId: "person-kofi",
  },
  {
    contentType: "application/pdf",
    createdAt: "2026-07-24T09:40:00Z",
    id: "asset-letter-checklist",
    kind: "document",
    offeringId: "offering-english-jhs2",
    originalFilename: "formal-letter-checklist.pdf",
    sizeBytes: 184_320,
    status: "ready",
    uploadedByPersonId: "person-abena",
  },
  {
    contentType: "application/pdf",
    createdAt: "2026-07-28T08:50:00Z",
    id: "asset-government-summary",
    kind: "document",
    offeringId: "offering-social-jhs2",
    originalFilename: "three-arms-of-government.pdf",
    sizeBytes: 356_352,
    status: "ready",
    uploadedByPersonId: "person-emmanuel",
  },
];

export type DemoActivity = {
  contentType: string;
  fallbackText: string;
  id: string;
  offeringId: string;
  packageAssetId?: string;
  status: "draft" | "launchable" | "awaiting-runtime";
  title: string;
};

export const demoActivities: DemoActivity[] = [
  {
    contentType: "Drag and Drop",
    fallbackText:
      "A labelled diagram of the digestive system, with each organ named and its job described in one line.",
    id: "activity-digestion-labels",
    offeringId: "offering-science-jhs2",
    packageAssetId: "asset-digestion-labels-package",
    status: "launchable",
    title: "Label the digestive organs",
  },
  {
    contentType: "Drag and Drop",
    fallbackText:
      "A table listing twelve common market foods against the nutrient group each mainly supplies.",
    id: "activity-nutrient-sort",
    offeringId: "offering-science-jhs2",
    packageAssetId: "asset-nutrient-sort-package",
    status: "awaiting-runtime",
    title: "Sort the market basket",
  },
  {
    contentType: "Interactive Video",
    fallbackText:
      "A worked list of denominator pairs and the lowest common multiple of each.",
    id: "activity-fraction-builder",
    offeringId: "offering-maths-jhs2",
    packageAssetId: "asset-fraction-builder-package",
    status: "launchable",
    title: "Build the common denominator",
  },
  {
    contentType: "Course Presentation",
    fallbackText:
      "A written walkthrough of one paragraph, showing how the main idea is separated from supporting detail.",
    id: "activity-main-idea",
    offeringId: "offering-english-jhs2",
    /* No package and no link yet: a planning draft, so the content studio
       shows what an activity looks like before it is buildable. */
    status: "draft",
    title: "Find the main idea",
  },
];

/* -------------------------------------------------------------------------
   Admissions

   One application already submitted and waiting on a decision, so the review
   queue has real work in it rather than an empty state.
   ------------------------------------------------------------------------- */

export const demoAdmissionApplication = {
  applicantEmail: "yaa.mensimah@example.com",
  applicantFirstName: "Yaa",
  applicantLastName: "Mensimah",
  dateOfBirth: "2013-03-14",
  desiredClass: "JHS 1",
  guardianEmail: "kojo.mensimah@example.com",
  guardianName: "Kojo Mensimah",
  guardianPhone: "+233 24 909 3312",
  id: "application-yaa-mensimah",
  intakeId: "intake-2026-27-jhs1",
  previousSchool: "Achimota Basic School",
  status: "submitted" as const,
  submittedAt: "2026-07-29T10:42:00Z",
  supportNeeds:
    "Wears glasses for reading and would benefit from a seat near the front.",
};
