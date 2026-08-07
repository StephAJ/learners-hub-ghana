import type { Pool } from "pg";
import { DEMO_CLASS_GROUP_ID, demoSubjects } from "../domain/demo/greenfield";
import { greenfieldProfile } from "../domain/school/public-profile";

const GREENFIELD_TENANT_ID = "tenant-greenfield";
const GREENFIELD_YEAR_ID = "year-2026-27";

/* ==========================================================================
   Greenfield's structure, as rows

   These four classes and their subjects used to be a hardcoded array in
   domain/academic/fixtures.ts that the admin screen rendered directly. That
   made the demo look complete while being unable to change anything: adding
   a class meant editing TypeScript.

   Seeding them instead means the demo school looks exactly the same and every
   one of those classes can now be renamed, re-roomed, given a different class
   teacher, or archived — because they are ordinary rows.

   Everything is written by a stable id and upserted, so this runs on every
   boot without duplicating and without overwriting an administrator's later
   edits to the fields they own. Names and rooms are set on insert only; the
   class teacher is refreshed, because it is derived from the seeded cast.
   ========================================================================== */

type SeedClass = {
  classTeacherPersonId: string | null;
  id: string;
  level: string;
  name: string;
  room: string;
  /** Subject codes offered, split by whether a learner may drop them. */
  subjects: { compulsory: string[]; optional: string[] };
};

/* ==========================================================================
   Sharing ids with the demo dataset

   domain/demo/greenfield.ts seeds Mathematics, English Language, Integrated
   Science and Social Studies of its own accord, through the learning
   repository, the first time a learning route is hit — under ids of its own
   (`subject-mathematics`, `offering-maths-jhs2`) rather than the ones this
   file would otherwise invent (`subject-ma`, `class-jhs2-gold-ma`).

   Both seeds guard against inserting a duplicate, so whichever runs second
   quietly does nothing. That is the trap: the demo seed then hangs its
   offerings, teacher assignments and every lesson off the id it *assumed* it
   had just inserted, and on a fresh database — where this file runs first, at
   boot, and claims the code — that id does not exist.

   The whole demo seed is one transaction, so the foreign key it violated took
   the lot down with it, and every screen that chains through
   ensureLearningFoundation() — subjects, content, assessments, the markbook,
   the class workspace — answered "insert or update on table
   subject_offerings violates foreign key constraint".

   Reading the ids off the demo dataset rather than deriving parallel ones
   means the two seeds converge on the same rows whichever runs first, and
   cannot drift again: there is now one place where the id is written down.
   ========================================================================== */
const DEMO_SUBJECT_ID_BY_CODE = new Map(
  demoSubjects.map((subject) => [subject.code, `subject-${subject.slug}`]),
);
const DEMO_OFFERING_ID_BY_CODE = new Map(
  demoSubjects.map((subject) => [subject.code, subject.offeringId]),
);

/** The subject row a code belongs to, demo-owned or this file's own. */
function subjectIdFor(code: string): string {
  return DEMO_SUBJECT_ID_BY_CODE.get(code) ?? `subject-${code.toLowerCase()}`;
}

/** Likewise for the offering, which the demo only owns on its own class. */
function offeringIdFor(classGroupId: string, code: string): string {
  if (classGroupId !== DEMO_CLASS_GROUP_ID) {
    return `${classGroupId}-${code.toLowerCase()}`;
  }
  return (
    DEMO_OFFERING_ID_BY_CODE.get(code) ?? `${classGroupId}-${code.toLowerCase()}`
  );
}

const SEED_SUBJECTS: Array<{ code: string; name: string }> = [
  { code: "MA", name: "Mathematics" },
  { code: "EN", name: "English Language" },
  { code: "IS", name: "Integrated Science" },
  { code: "SO", name: "Social Studies" },
  { code: "CT", name: "Computing" },
  { code: "RM", name: "Religious & Moral Education" },
  { code: "FR", name: "French" },
  { code: "CA", name: "Creative Arts" },
  { code: "EM", name: "Core Mathematics" },
  { code: "EC", name: "Economics" },
  { code: "GH", name: "Government" },
  { code: "GE", name: "Geography" },
  { code: "RL", name: "Religious Studies" },
];

const JHS_COMPULSORY = ["MA", "EN", "IS", "SO", "CT", "RM"];
const JHS_OPTIONAL = ["FR", "CA"];

const SEED_CLASSES: SeedClass[] = [
  {
    /* Emmanuel Ofori holds the class scope for JHS 2 Gold in the demo cast, so
       he is its class teacher here rather than someone invented for the
       purpose — the two lists disagreeing is exactly the drift that put
       teachers in the old fixtures who had no person record at all. */
    classTeacherPersonId: null,
    id: "class-jhs1-blue",
    level: "Junior High",
    name: "JHS 1 Blue",
    room: "Block A · Room 2",
    subjects: { compulsory: JHS_COMPULSORY, optional: JHS_OPTIONAL },
  },
  {
    classTeacherPersonId: "person-emmanuel",
    id: "class-jhs2-gold",
    level: "Junior High",
    name: "JHS 2 Gold",
    room: "Block A · Room 4",
    subjects: { compulsory: JHS_COMPULSORY, optional: JHS_OPTIONAL },
  },
  {
    classTeacherPersonId: null,
    id: "class-jhs3-green",
    level: "Junior High",
    name: "JHS 3 Green",
    room: "Block B · Room 1",
    subjects: { compulsory: JHS_COMPULSORY, optional: JHS_OPTIONAL },
  },
  {
    classTeacherPersonId: null,
    id: "class-shs1-arts",
    level: "Senior High",
    name: "SHS 1 General Arts",
    room: "Arts Block · Room 3",
    subjects: {
      compulsory: ["EM", "EN", "IS", "SO"],
      optional: ["EC", "GH", "GE", "RL"],
    },
  },
];

export async function seedAcademicStructure(database: Pool): Promise<void> {
  await database.query(
    `INSERT INTO academic_years
       (id, tenant_id, name, starts_on, ends_on, status)
     VALUES ($1, $2, '2026 / 2027', '2026-09-08', '2027-07-23', 'current')
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           starts_on = EXCLUDED.starts_on,
           ends_on = EXCLUDED.ends_on`,
    [GREENFIELD_YEAR_ID, GREENFIELD_TENANT_ID],
  );

  /* Keyed on (tenant_id, code), not on the id: a database written before this
     seed existed already holds the demo's four subjects, and conflicting on
     the id would insert a second Mathematics and hit the unique index on the
     code. The school would have ended up with two, one of which owned every
     lesson. RETURNING gives back whichever id won, so the offerings below
     attach to the subject that already exists rather than to a duplicate. */
  const subjectIdByCode = new Map<string, string>();
  for (const subject of SEED_SUBJECTS) {
    const result = await database.query<{ id: string }>(
      `INSERT INTO subjects (id, tenant_id, code, name, description)
       VALUES ($1, $2, $3, $4, '')
       ON CONFLICT (tenant_id, code) DO UPDATE SET code = EXCLUDED.code
       RETURNING id`,
      [
        subjectIdFor(subject.code),
        GREENFIELD_TENANT_ID,
        subject.code,
        subject.name,
      ],
    );
    subjectIdByCode.set(subject.code, result.rows[0].id);
  }

  for (const group of SEED_CLASSES) {
    await database.query(
      /* The name is never overwritten: a school that renames "JHS 1 Blue"
         should not find it renamed back on the next deployment.

         Level and room are filled in only where they are still blank, which
         is exactly the state the additive backfill in db/postgres.ts leaves a
         class in — it can recover a class's id and name from the offerings
         that referenced it, but nothing there knows which room it sits in. An
         administrator who has since cleared a room deliberately would see it
         come back, and that is the trade being made: a blank is much more
         often "never filled in" than "emptied on purpose". */
      `INSERT INTO class_groups
         (id, tenant_id, academic_year_id, name, level, room,
          class_teacher_person_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       ON CONFLICT (id) DO UPDATE
         SET class_teacher_person_id = EXCLUDED.class_teacher_person_id,
             level = CASE WHEN class_groups.level = ''
                          THEN EXCLUDED.level ELSE class_groups.level END,
             room = CASE WHEN class_groups.room = ''
                         THEN EXCLUDED.room ELSE class_groups.room END`,
      [
        group.id,
        GREENFIELD_TENANT_ID,
        GREENFIELD_YEAR_ID,
        group.name,
        group.level,
        group.room,
        group.classTeacherPersonId,
      ],
    );

    const offerings = [
      ...group.subjects.compulsory.map((code) => ({
        code,
        requirement: "compulsory" as const,
      })),
      ...group.subjects.optional.map((code) => ({
        code,
        requirement: "optional" as const,
      })),
    ];

    for (const offering of offerings) {
      const subjectId = subjectIdByCode.get(offering.code);
      if (!subjectId) continue;

      /* The demo's four JHS 2 offerings may already exist under ids like
         `offering-maths-jhs2`, so this cannot conflict on the id — it would
         insert a duplicate of an offering that lessons, marks and the
         timetable are all attached to. Checked on the natural key instead:
         one subject is offered to one class in one year exactly once. */
      await database.query(
        `INSERT INTO subject_offerings
           (id, tenant_id, subject_id, class_group_id, class_name,
            academic_year_id, requirement, status)
         SELECT $1, $2, $3, $4, $5, $6, $7, 'active'
         WHERE NOT EXISTS (
           SELECT 1 FROM subject_offerings
            WHERE tenant_id = $2
              AND subject_id = $3
              AND class_group_id = $4
              AND academic_year_id = $6
         )`,
        [
          offeringIdFor(group.id, offering.code),
          GREENFIELD_TENANT_ID,
          subjectId,
          group.id,
          group.name,
          GREENFIELD_YEAR_ID,
          offering.requirement,
        ],
      );
    }
  }

  /* An intake in the state the old hardcoded constant implied: open, for the
     current year, closing on the date the public site used to have written
     into it. Seeded open so the demo's apply form works on a fresh database;
     an administrator can close it from /admin/admissions, which is the whole
     point of the record existing.

     Its id is "2026-2027" — the literal value of the CURRENT_INTAKE_ID
     constant this record replaces — because every application already taken
     was written with that in `admission_application_records.intake_id`.
     Choosing a tidier id would leave every existing application belonging to
     an intake that does not exist, and the admissions queue counting none of
     them. */
  await database.query(
    `INSERT INTO admission_intakes
       (id, tenant_id, academic_year_id, label, opens_on, closes_on,
        status, capacity)
     VALUES ($1, $2, $3, '2026 / 2027 intake', '2026-04-01', '2026-08-28',
             'open', 120)
     ON CONFLICT (id) DO NOTHING`,
    ["2026-2027", GREENFIELD_TENANT_ID, GREENFIELD_YEAR_ID],
  );

  /* The school's own profile, written once. Not upserted: after the first
     boot this document belongs to the school, and overwriting it on every
     deployment would silently undo every edit made from /admin/school. */
  await database.query(
    `INSERT INTO school_profiles (tenant_id, document)
     VALUES ($1, $2)
     ON CONFLICT (tenant_id) DO NOTHING`,
    [GREENFIELD_TENANT_ID, JSON.stringify(greenfieldProfile)],
  );
}
