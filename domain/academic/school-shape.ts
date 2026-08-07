import { SchoolStructureError } from "./structure";

/* ==========================================================================
   The shape of a school, and the classes that follow from it

   Creating a class at a time is fine for the school that has one class to
   add. It is not fine for a school arriving on the product: a nursery through
   JHS 3 school has fourteen year groups before any of them is split, and
   fourteen trips through a four-field form is the kind of setup people give
   up in the middle of.

   Almost all of that typing is derivable. A school teaches a run of stages,
   each stage has a known set of year groups, and the only thing the school
   itself has to say is how many classes each year group needs. So that is
   what is asked for, and the names are generated.

   Two things this deliberately gets right, because getting them wrong is how
   a structure like this ends up unusable:

   1. A stream is not a year group. "JHS 1 Blue" and "JHS 1 A" are both JHS 1,
      and every screen that groups by year — a subject's pitch, a report, an
      intake — has to keep seeing one JHS 1. The generated names are therefore
      always "<year group>" or "<year group> <stream>", which is the form
      demoYearGroup() already parses back, and the stage goes in `level`
      rather than being smuggled into the name.

   2. Splitting is per year group, not per school. A school may run one JHS 1,
      three JHS 2s and two JHS 3s, because splitting is a response to how many
      children turned up that year and nothing else. There is no school-wide
      "number of streams" here, and adding one later would be a mistake.
   ========================================================================== */

export type StageId =
  | "pre-school"
  | "kindergarten"
  | "primary"
  | "junior-high"
  | "senior-high";

export type SchoolStage = {
  /** One line under the stage's name in the picker. */
  blurb: string;
  id: StageId;
  label: string;
  /** Written to class_groups.level for every class in the stage. */
  level: string;
  /** In teaching order. These become class names verbatim. */
  yearGroups: string[];
};

/* The Ghana Education Service ladder, which is the one this product's schools
   teach. The year-group labels are the ones that appear on a report card, not
   internal codes — they are what the class ends up called.

   A school that names its primary years differently ("Primary 4", "Class 4")
   renames the classes afterwards; that is a rename of six rows, against a
   naming step every school would otherwise have to answer. */
export const SCHOOL_STAGES: readonly SchoolStage[] = [
  {
    blurb: "Creche and nursery, before kindergarten.",
    id: "pre-school",
    label: "Pre-school",
    level: "Pre-school",
    yearGroups: ["Creche", "Nursery 1", "Nursery 2"],
  },
  {
    blurb: "The two kindergarten years.",
    id: "kindergarten",
    label: "Kindergarten",
    level: "Kindergarten",
    yearGroups: ["KG 1", "KG 2"],
  },
  {
    blurb: "Basic 1 to Basic 6.",
    id: "primary",
    label: "Primary",
    level: "Primary",
    yearGroups: ["Basic 1", "Basic 2", "Basic 3", "Basic 4", "Basic 5", "Basic 6"],
  },
  {
    blurb: "JHS 1 to JHS 3, ending at BECE.",
    id: "junior-high",
    label: "Junior High",
    level: "Junior High",
    yearGroups: ["JHS 1", "JHS 2", "JHS 3"],
  },
  {
    blurb: "SHS 1 to SHS 3, ending at WASSCE.",
    id: "senior-high",
    label: "Senior High",
    level: "Senior High",
    yearGroups: ["SHS 1", "SHS 2", "SHS 3"],
  },
];

/** How the classes of a split year group are told apart. */
export type StreamNaming = "letters" | "colours" | "numbers";

export const STREAM_NAMINGS: ReadonlyArray<{
  /** The first three streams, to show what the choice looks like. */
  example: string;
  id: StreamNaming;
  label: string;
}> = [
  { example: "A · B · C", id: "letters", label: "Letters" },
  { example: "Blue · Gold · Green", id: "colours", label: "Colours" },
  { example: "1 · 2 · 3", id: "numbers", label: "Numbers" },
];

/* Twelve is the cap on a single year group, and it is what limits the colour
   list too. It is far past what any school splits a year into, and it exists
   so a mistyped "30" produces an error rather than thirty class rows. */
export const MAX_STREAMS_PER_YEAR_GROUP = 12;

const COLOUR_STREAMS = [
  "Blue",
  "Gold",
  "Green",
  "White",
  "Red",
  "Silver",
  "Purple",
  "Amber",
  "Coral",
  "Indigo",
  "Jade",
  "Rose",
];

const LETTER_STREAMS = "ABCDEFGHIJKL".split("");

export type ClassPlanCommand = {
  academicYearId: string;
  /**
   * How many classes each year group runs, keyed by the year group's label.
   *
   * A year group the school does not teach is left out or set to zero, which
   * is what lets a Pre-school-to-Primary school skip Basic 5 and Basic 6 it
   * has not opened yet without having to describe itself as something else.
   */
  streamCounts: Readonly<Record<string, number>>;
  streamNaming: StreamNaming;
};

export type PlannedClass = {
  /** class_groups.level — the stage, shared by every class in it. */
  level: string;
  name: string;
  /** The year group this class belongs to, before any stream suffix. */
  yearGroup: string;
};

/** Every year group the catalogue knows, with the stage it sits in. */
export function allYearGroups(): PlannedYearGroup[] {
  return SCHOOL_STAGES.flatMap((stage) =>
    stage.yearGroups.map((yearGroup) => ({
      level: stage.level,
      stageId: stage.id,
      yearGroup,
    })),
  );
}

export type PlannedYearGroup = {
  level: string;
  stageId: StageId;
  yearGroup: string;
};

export function stageById(id: StageId): SchoolStage {
  const stage = SCHOOL_STAGES.find((item) => item.id === id);
  if (!stage) throw new SchoolStructureError(`Unknown stage: ${id}.`);
  return stage;
}

/**
 * The classes a plan describes, in the order a school would list them.
 *
 * Pure, and separate from anything that writes: the wizard shows a learner
 * exactly this list before it creates anything, and showing a preview built
 * by different code from the one that saves is how a preview starts lying.
 */
export function planClasses(command: ClassPlanCommand): PlannedClass[] {
  requireText(
    command.academicYearId,
    "Classes have to be created into an academic year.",
  );

  const known = new Map(
    allYearGroups().map((entry) => [entry.yearGroup, entry.level]),
  );

  for (const yearGroup of Object.keys(command.streamCounts)) {
    if (!known.has(yearGroup)) {
      throw new SchoolStructureError(
        `${yearGroup} is not a year group this school ladder has.`,
      );
    }
  }

  const planned: PlannedClass[] = [];

  /* Iterated over the catalogue rather than over the command's keys, so the
     classes come out in teaching order however the form happened to build
     its object. */
  for (const entry of allYearGroups()) {
    const count = command.streamCounts[entry.yearGroup] ?? 0;
    if (count === 0) continue;

    if (!Number.isInteger(count) || count < 0) {
      throw new SchoolStructureError(
        `The number of ${entry.yearGroup} classes has to be a whole number.`,
      );
    }
    if (count > MAX_STREAMS_PER_YEAR_GROUP) {
      throw new SchoolStructureError(
        `A year group can be split into at most ${MAX_STREAMS_PER_YEAR_GROUP} classes. ${entry.yearGroup} was given ${count}.`,
      );
    }

    /* One class is not a stream. Naming it "JHS 1 A" when there is no JHS 1 B
       tells a parent their child is in a set, which is a different thing from
       being in the only class there is. */
    if (count === 1) {
      planned.push({
        level: entry.level,
        name: entry.yearGroup,
        yearGroup: entry.yearGroup,
      });
      continue;
    }

    for (let index = 0; index < count; index += 1) {
      planned.push({
        level: entry.level,
        name: `${entry.yearGroup} ${streamLabel(command.streamNaming, index)}`,
        yearGroup: entry.yearGroup,
      });
    }
  }

  if (planned.length === 0) {
    throw new SchoolStructureError(
      "Choose at least one year group before creating classes.",
    );
  }

  return planned;
}

/**
 * The plan split into what would be created and what is already there.
 *
 * Existing classes are matched by name within the year, which is the same key
 * normaliseClassGroup() refuses duplicates on, so a school running this a
 * second time after opening one more JHS 2 gets the one new class rather than
 * an error about the six that already exist.
 */
export function reconcilePlan(
  planned: readonly PlannedClass[],
  existingNames: readonly string[],
): { create: PlannedClass[]; skip: PlannedClass[] } {
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  const create: PlannedClass[] = [];
  const skip: PlannedClass[] = [];

  for (const item of planned) {
    if (taken.has(item.name.toLowerCase())) skip.push(item);
    else create.push(item);
  }

  return { create, skip };
}

function streamLabel(naming: StreamNaming, index: number): string {
  if (naming === "colours") return COLOUR_STREAMS[index];
  if (naming === "numbers") return String(index + 1);
  return LETTER_STREAMS[index];
}

function requireText(value: string | undefined, message: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new SchoolStructureError(message);
  return trimmed;
}
