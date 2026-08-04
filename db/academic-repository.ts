import {
  AuthorizationError,
  canPerform,
} from "../domain/identity/authorization";
import type { AccessContext } from "../domain/identity/types";
import {
  normaliseAcademicYear,
  normaliseClassGroup,
  normaliseSubject,
  type AcademicYear,
  type ClassGroup,
  type ClassOffering,
  type CreateAcademicYearCommand,
  type CreateClassGroupCommand,
  type CreateSubjectCommand,
  type Subject,
} from "../domain/academic/structure";
import type { SubjectRequirement } from "../domain/academic/types";
import { ensurePlatformReady } from "../server/platform-ready";
import { getPostgresPool } from "./postgres";

/* ==========================================================================
   The school's own structure

   Every write here is gated on `academic:manage`, a permission that has been
   defined in domain/identity/authorization.ts since the beginning and that
   nothing has ever called — the academic screen built its classes from a
   hardcoded array, so there was no write to gate.

   Reads are gated on `people:read`, which every staff role holds. A teacher
   needs to see the school's classes to be assigned to one; only an
   administrator changes them.
   ========================================================================== */

export type SchoolTeacher = {
  id: string;
  name: string;
  photoUrl: string | null;
  role: string;
};

export type AcademicStructure = {
  classGroups: ClassGroup[];
  offeringsByClassGroup: Record<string, ClassOffering[]>;
  subjects: Subject[];
  teachers: SchoolTeacher[];
  /* Who teaches each offering. Several people can share one — co-teaching a
     practical, or a subject split between a specialist and a form tutor — so
     this is a list rather than a field on the offering. */
  teachersByOffering: Record<string, string[]>;
  years: AcademicYear[];
};

export async function loadAcademicStructure(
  access: AccessContext,
): Promise<AcademicStructure> {
  requirePermission(access, "people:read");
  await ensurePlatformReady();

  const [years, classGroups, subjects, offerings, teachers, assignments] =
    await Promise.all([
      listAcademicYears(access),
      listClassGroups(access),
      listSubjects(access),
      listOfferings(access),
      listTeachers(access),
      listTeacherAssignments(access),
    ]);

  const offeringsByClassGroup: Record<string, ClassOffering[]> = {};
  for (const offering of offerings) {
    (offeringsByClassGroup[offering.classGroupId] ??= []).push(offering);
  }

  const teachersByOffering: Record<string, string[]> = {};
  for (const assignment of assignments) {
    (teachersByOffering[assignment.offeringId] ??= []).push(
      assignment.teacherPersonId,
    );
  }

  return {
    classGroups,
    offeringsByClassGroup,
    subjects,
    teachers,
    teachersByOffering,
    years,
  };
}

export async function listAcademicYears(
  access: AccessContext,
): Promise<AcademicYear[]> {
  const result = await getPostgresPool().query<{
    ends_on: string;
    id: string;
    name: string;
    starts_on: string;
    status: AcademicYear["status"];
  }>(
    `SELECT id, name, starts_on, ends_on, status
       FROM academic_years
      WHERE tenant_id = $1
      ORDER BY starts_on DESC, name DESC`,
    [access.tenantId],
  );

  return result.rows.map((row) => ({
    endsOn: row.ends_on,
    id: row.id,
    name: row.name,
    startsOn: row.starts_on,
    status: row.status,
    tenantId: access.tenantId,
  }));
}

export async function listClassGroups(
  access: AccessContext,
): Promise<ClassGroup[]> {
  /* The learner count is counted here rather than stored on the class. A
     denormalised count is a number that goes wrong quietly the first time a
     learner is moved, and this is a school of hundreds, not millions.

     Matched on the class *name* as well as its id because that is what a
     learner's membership actually holds — db/content-repository.ts and
     db/messaging-repository.ts both join `class_name = scope_id`, and the
     seeded cast is scoped by "JHS 2 Gold" rather than by any id. Accepting
     both means a class renamed through updateClassGroup keeps its register
     either way. */
  const result = await getPostgresPool().query<{
    academic_year_id: string;
    class_teacher_person_id: string | null;
    id: string;
    learner_count: number;
    level: string;
    name: string;
    room: string;
    status: ClassGroup["status"];
  }>(
    `SELECT
        c.id,
        c.academic_year_id,
        c.name,
        c.level,
        c.room,
        c.class_teacher_person_id,
        c.status,
        COUNT(m.id) FILTER (WHERE m.status = 'active') AS learner_count
       FROM class_groups AS c
       LEFT JOIN tenant_memberships AS m
         ON m.tenant_id = c.tenant_id
        AND m.role = 'learner'
        AND m.scope_type = 'class'
        AND (m.scope_id = c.name OR m.scope_id = c.id)
      WHERE c.tenant_id = $1
      GROUP BY c.id
      ORDER BY c.name`,
    [access.tenantId],
  );

  return result.rows.map((row) => ({
    academicYearId: row.academic_year_id,
    classTeacherPersonId: row.class_teacher_person_id,
    id: row.id,
    learnerCount: Number(row.learner_count),
    level: row.level,
    name: row.name,
    room: row.room,
    status: row.status,
    tenantId: access.tenantId,
  }));
}

export async function listSubjects(access: AccessContext): Promise<Subject[]> {
  const result = await getPostgresPool().query<{
    code: string;
    description: string;
    id: string;
    name: string;
  }>(
    `SELECT id, code, name, description
       FROM subjects
      WHERE tenant_id = $1
      ORDER BY name`,
    [access.tenantId],
  );

  return result.rows.map((row) => ({
    code: row.code,
    description: row.description,
    id: row.id,
    name: row.name,
    tenantId: access.tenantId,
  }));
}

async function listOfferings(access: AccessContext): Promise<ClassOffering[]> {
  const result = await getPostgresPool().query<{
    class_group_id: string;
    code: string;
    id: string;
    name: string;
    requirement: SubjectRequirement;
    status: ClassOffering["status"];
    subject_id: string;
  }>(
    `SELECT
        o.id,
        o.class_group_id,
        o.subject_id,
        o.requirement,
        o.status,
        s.code,
        s.name
       FROM subject_offerings AS o
       JOIN subjects AS s ON s.id = o.subject_id
      WHERE o.tenant_id = $1
      ORDER BY o.requirement, s.name`,
    [access.tenantId],
  );

  return result.rows.map((row) => ({
    classGroupId: row.class_group_id,
    id: row.id,
    requirement: row.requirement,
    status: row.status,
    subjectCode: row.code,
    subjectId: row.subject_id,
    subjectName: row.name,
  }));
}

/* Anyone who could hold a class. Deliberately every teaching and admin role
   rather than only `teacher`: in a small school the head teaches a class, and
   a dropdown that will not let them be named is a dropdown that gets worked
   around by inventing a second staff record. */
async function listTeachers(
  access: AccessContext,
): Promise<SchoolTeacher[]> {
  const result = await getPostgresPool().query<{
    id: string;
    name: string;
    photo_url: string | null;
    role: string;
  }>(
    `SELECT
        p.id,
        p.first_name || ' ' || p.last_name AS name,
        p.photo_url,
        MIN(m.role) AS role
       FROM people AS p
       JOIN tenant_memberships AS m ON m.person_id = p.id
      WHERE m.tenant_id = $1
        AND m.status = 'active'
        AND m.role IN ('teacher', 'class-teacher', 'academic-admin', 'school-admin')
      GROUP BY p.id, p.first_name, p.last_name, p.photo_url
      ORDER BY name`,
    [access.tenantId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    photoUrl: row.photo_url,
    role: row.role,
  }));
}

/* ==========================================================================
   Who teaches what

   `teacher_assignments` is the join between a person and a subject offering.
   Before this, it had exactly one INSERT in the codebase — inside the demo
   seed — so a school that was not the Greenfield demo had none, and every
   teacher surface reads from it. Teachers opened an empty workspace, and the
   fixture fallbacks on those screens made it look populated anyway.

   The table was always a proper many-to-many. Both directions are written
   here because both are real gestures an administrator makes: "who teaches
   JHS 2 Gold maths" when staffing a class, and "what does Kofi teach" when
   someone joins or leaves.
   ========================================================================== */

export type TeacherAssignment = {
  offeringId: string;
  teacherPersonId: string;
};

export async function listTeacherAssignments(
  access: AccessContext,
): Promise<TeacherAssignment[]> {
  const result = await getPostgresPool().query<{
    offering_id: string;
    teacher_person_id: string;
  }>(
    `SELECT a.offering_id, a.teacher_person_id
       FROM teacher_assignments AS a
       JOIN subject_offerings AS o ON o.id = a.offering_id
      WHERE a.tenant_id = $1
        AND a.status = 'active'
        AND o.status = 'active'`,
    [access.tenantId],
  );

  return result.rows.map((row) => ({
    offeringId: row.offering_id,
    teacherPersonId: row.teacher_person_id,
  }));
}

/** Sets the whole list of people who teach one offering. */
export async function setOfferingTeachers(
  access: AccessContext,
  offeringId: string,
  teacherPersonIds: string[],
): Promise<void> {
  requirePermission(access, "academic:manage");
  await ensurePlatformReady();

  const owned = await getPostgresPool().query(
    `SELECT 1 FROM subject_offerings WHERE id = $1 AND tenant_id = $2`,
    [offeringId, access.tenantId],
  );
  if (owned.rowCount === 0) {
    throw new AuthorizationError(
      "That subject offering belongs to another school.",
    );
  }

  const teachers = await verifyTeachers(access, teacherPersonIds);
  await replaceAssignments(access, {
    column: "offering_id",
    matchId: offeringId,
    otherColumn: "teacher_person_id",
    otherIds: teachers,
  });
  await recordAudit(
    access,
    "academic.offering-staffed",
    "subject-offering",
    offeringId,
    { teacherPersonIds: teachers },
  );
}

/** Sets the whole list of offerings one person teaches. */
export async function setTeacherOfferings(
  access: AccessContext,
  teacherPersonId: string,
  offeringIds: string[],
): Promise<void> {
  requirePermission(access, "academic:manage");
  await ensurePlatformReady();
  await requireOwnedPerson(access, teacherPersonId);

  const offerings = await verifyOfferings(access, offeringIds);
  await replaceAssignments(access, {
    column: "teacher_person_id",
    matchId: teacherPersonId,
    otherColumn: "offering_id",
    otherIds: offerings,
  });
  await recordAudit(
    access,
    "academic.teacher-staffed",
    "person",
    teacherPersonId,
    { offeringIds: offerings },
  );
}

/**
 * Replaces one side of the join in a single transaction.
 *
 * Closing and re-opening rather than deleting, for the same reason a class is
 * archived: last term's report card was written by whoever taught the subject
 * then, and "nobody has ever taught this" and "someone taught it until March"
 * are different facts. The unique index means an assignment that comes back
 * reactivates its original row rather than accumulating a second one.
 *
 * One transaction because the intermediate state — everything closed, nothing
 * yet opened — is a subject with no teacher, and `withTeacherAssignments()`
 * in db/learning-repository.ts would hand a teacher an empty workspace for as
 * long as it lasted.
 */
async function replaceAssignments(
  access: AccessContext,
  {
    column,
    matchId,
    otherColumn,
    otherIds,
  }: {
    column: "offering_id" | "teacher_person_id";
    matchId: string;
    otherColumn: "offering_id" | "teacher_person_id";
    otherIds: string[];
  },
): Promise<void> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE teacher_assignments
          SET status = 'closed'
        WHERE tenant_id = $1
          AND ${column} = $2
          AND NOT (${otherColumn} = ANY($3::text[]))`,
      [access.tenantId, matchId, otherIds],
    );
    for (const otherId of otherIds) {
      const values =
        column === "offering_id" ? [matchId, otherId] : [otherId, matchId];
      await client.query(
        `INSERT INTO teacher_assignments
           (id, tenant_id, offering_id, teacher_person_id, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (tenant_id, offering_id, teacher_person_id)
           DO UPDATE SET status = 'active'`,
        [crypto.randomUUID(), access.tenantId, values[0], values[1]],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/* Both of these filter to what this school actually owns rather than throwing
   on the first stranger, so a stale browser tab holding a since-deleted id
   saves the rest of the list instead of failing whole. */
async function verifyTeachers(
  access: AccessContext,
  personIds: string[],
): Promise<string[]> {
  if (personIds.length === 0) return [];
  const result = await getPostgresPool().query<{ id: string }>(
    `SELECT p.id
       FROM people AS p
       JOIN tenant_memberships AS m ON m.person_id = p.id
      WHERE p.tenant_id = $1
        AND p.id = ANY($2::text[])
        AND m.status = 'active'
        AND m.role IN ('teacher', 'class-teacher', 'academic-admin', 'school-admin')`,
    [access.tenantId, personIds],
  );
  return [...new Set(result.rows.map((row) => row.id))];
}

async function verifyOfferings(
  access: AccessContext,
  offeringIds: string[],
): Promise<string[]> {
  if (offeringIds.length === 0) return [];
  const result = await getPostgresPool().query<{ id: string }>(
    `SELECT id FROM subject_offerings
      WHERE tenant_id = $1 AND id = ANY($2::text[]) AND status = 'active'`,
    [access.tenantId, offeringIds],
  );
  return result.rows.map((row) => row.id);
}

export async function createAcademicYear(
  access: AccessContext,
  command: CreateAcademicYearCommand,
): Promise<AcademicYear> {
  requirePermission(access, "academic:manage");
  await ensurePlatformReady();

  const existing = await listAcademicYears(access);
  const year = normaliseAcademicYear(command, existing);
  const id = crypto.randomUUID();

  /* The school's first year is the current one. Any year after that is
     planned until someone deliberately makes it current, because creating
     next year's record in March should not move the school into it. */
  const status = existing.length === 0 ? "current" : "planned";

  await getPostgresPool().query(
    `INSERT INTO academic_years
       (id, tenant_id, name, starts_on, ends_on, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, access.tenantId, year.name, year.startsOn, year.endsOn, status],
  );
  await recordAudit(access, "academic.year-created", "academic-year", id, {
    name: year.name,
  });

  return { ...year, id, status, tenantId: access.tenantId };
}

/**
 * Moves the school into a year.
 *
 * Both statements are in one transaction because the intermediate state —
 * where the outgoing year has been closed and the incoming one has not opened
 * — is a school with no current year, and every screen that asks "which year
 * is it" would get no answer for as long as it lasted.
 */
export async function setCurrentAcademicYear(
  access: AccessContext,
  yearId: string,
): Promise<void> {
  requirePermission(access, "academic:manage");
  await ensurePlatformReady();

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const owned = await client.query(
      `SELECT id FROM academic_years WHERE id = $1 AND tenant_id = $2`,
      [yearId, access.tenantId],
    );
    if (owned.rowCount === 0) {
      throw new AuthorizationError(
        "That academic year belongs to another school.",
      );
    }
    await client.query(
      `UPDATE academic_years
          SET status = 'closed'
        WHERE tenant_id = $1 AND status = 'current' AND id <> $2`,
      [access.tenantId, yearId],
    );
    await client.query(
      `UPDATE academic_years SET status = 'current' WHERE id = $1`,
      [yearId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await recordAudit(access, "academic.year-opened", "academic-year", yearId, {});
}

export async function createClassGroup(
  access: AccessContext,
  command: CreateClassGroupCommand,
): Promise<ClassGroup> {
  requirePermission(access, "academic:manage");
  await ensurePlatformReady();

  const existing = await listClassGroups(access);
  const group = normaliseClassGroup(command, existing);
  await requireOwnedYear(access, group.academicYearId);
  if (group.classTeacherPersonId) {
    await requireOwnedPerson(access, group.classTeacherPersonId);
  }
  const id = crypto.randomUUID();

  await getPostgresPool().query(
    `INSERT INTO class_groups
       (id, tenant_id, academic_year_id, name, level, room,
        class_teacher_person_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
    [
      id,
      access.tenantId,
      group.academicYearId,
      group.name,
      group.level,
      group.room,
      group.classTeacherPersonId,
    ],
  );
  await recordAudit(access, "academic.class-created", "class-group", id, {
    name: group.name,
  });

  return {
    ...group,
    id,
    learnerCount: 0,
    status: "active",
    tenantId: access.tenantId,
  };
}

export async function updateClassGroup(
  access: AccessContext,
  classGroupId: string,
  command: CreateClassGroupCommand,
): Promise<ClassGroup> {
  requirePermission(access, "academic:manage");
  await ensurePlatformReady();

  const existing = await listClassGroups(access);
  const current = existing.find((item) => item.id === classGroupId);
  if (!current) {
    throw new AuthorizationError("That class belongs to another school.");
  }

  const group = normaliseClassGroup(command, existing, classGroupId);
  await requireOwnedYear(access, group.academicYearId);
  if (group.classTeacherPersonId) {
    await requireOwnedPerson(access, group.classTeacherPersonId);
  }

  await getPostgresPool().query(
    `UPDATE class_groups
        SET academic_year_id = $2,
            name = $3,
            level = $4,
            room = $5,
            class_teacher_person_id = $6
      WHERE id = $1`,
    [
      classGroupId,
      group.academicYearId,
      group.name,
      group.level,
      group.room,
      group.classTeacherPersonId,
    ],
  );

  /* The class name is denormalised onto every offering, and a rename that
     does not carry across leaves the markbook and the timetable showing the
     old one. */
  await getPostgresPool().query(
    `UPDATE subject_offerings
        SET class_name = $2
      WHERE tenant_id = $1 AND class_group_id = $3`,
    [access.tenantId, group.name, classGroupId],
  );

  await recordAudit(
    access,
    "academic.class-updated",
    "class-group",
    classGroupId,
    { name: group.name },
  );

  return {
    ...group,
    id: classGroupId,
    learnerCount: current.learnerCount,
    status: current.status,
    tenantId: access.tenantId,
  };
}

/**
 * Archives a class rather than deleting it.
 *
 * A class that has run for a term is attached to lessons, marks, attendance
 * and report cards. Deleting the row would either fail on a foreign key or,
 * worse, succeed and orphan a child's record of a year of school.
 */
export async function archiveClassGroup(
  access: AccessContext,
  classGroupId: string,
): Promise<void> {
  requirePermission(access, "academic:manage");
  await ensurePlatformReady();
  await requireOwnedClassGroup(access, classGroupId);

  await getPostgresPool().query(
    `UPDATE class_groups SET status = 'archived' WHERE id = $1`,
    [classGroupId],
  );
  await getPostgresPool().query(
    `UPDATE subject_offerings
        SET status = 'closed'
      WHERE tenant_id = $1 AND class_group_id = $2`,
    [access.tenantId, classGroupId],
  );
  await recordAudit(
    access,
    "academic.class-archived",
    "class-group",
    classGroupId,
    {},
  );
}

export async function createSubject(
  access: AccessContext,
  command: CreateSubjectCommand,
): Promise<Subject> {
  requirePermission(access, "academic:manage");
  await ensurePlatformReady();

  const existing = await listSubjects(access);
  const subject = normaliseSubject(command, existing);
  const id = crypto.randomUUID();

  await getPostgresPool().query(
    `INSERT INTO subjects (id, tenant_id, code, name, description)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, access.tenantId, subject.code, subject.name, subject.description],
  );
  await recordAudit(access, "academic.subject-created", "subject", id, {
    code: subject.code,
    name: subject.name,
  });

  return { ...subject, id, tenantId: access.tenantId };
}

/**
 * Puts a subject on a class's timetable, or changes whether it is compulsory.
 *
 * One call for both because from the administrator's side it is one decision
 * — "Mathematics is compulsory in JHS 1 Blue" — and splitting it into create
 * and update would make the screen ask which one it is doing.
 */
export async function setClassOffering(
  access: AccessContext,
  input: {
    classGroupId: string;
    requirement: SubjectRequirement;
    subjectId: string;
  },
): Promise<ClassOffering> {
  requirePermission(access, "academic:manage");
  await ensurePlatformReady();

  const classGroup = await requireOwnedClassGroup(access, input.classGroupId);
  const subject = await requireOwnedSubject(access, input.subjectId);

  const result = await getPostgresPool().query<{ id: string }>(
    `INSERT INTO subject_offerings
       (id, tenant_id, subject_id, class_group_id, class_name,
        academic_year_id, requirement, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
     ON CONFLICT (tenant_id, subject_id, class_group_id, academic_year_id)
       DO UPDATE SET requirement = EXCLUDED.requirement,
                     status = 'active',
                     class_name = EXCLUDED.class_name
     RETURNING id`,
    [
      crypto.randomUUID(),
      access.tenantId,
      input.subjectId,
      input.classGroupId,
      classGroup.name,
      classGroup.academicYearId,
      input.requirement,
    ],
  );

  const id = result.rows[0].id;
  await recordAudit(access, "academic.offering-set", "subject-offering", id, {
    classGroupId: input.classGroupId,
    requirement: input.requirement,
    subjectId: input.subjectId,
  });

  return {
    classGroupId: input.classGroupId,
    id,
    requirement: input.requirement,
    status: "active",
    subjectCode: subject.code,
    subjectId: subject.id,
    subjectName: subject.name,
  };
}

/**
 * Takes a subject off a class.
 *
 * Closed rather than deleted, for the same reason a class is archived: marks
 * and lessons hang off the offering, and the learners who took it this term
 * still have to have taken it.
 */
export async function closeClassOffering(
  access: AccessContext,
  offeringId: string,
): Promise<void> {
  requirePermission(access, "academic:manage");
  await ensurePlatformReady();

  const result = await getPostgresPool().query(
    `UPDATE subject_offerings
        SET status = 'closed'
      WHERE id = $1 AND tenant_id = $2`,
    [offeringId, access.tenantId],
  );
  if (result.rowCount === 0) {
    throw new AuthorizationError(
      "That subject offering belongs to another school.",
    );
  }
  await recordAudit(
    access,
    "academic.offering-closed",
    "subject-offering",
    offeringId,
    {},
  );
}

async function requireOwnedYear(
  access: AccessContext,
  yearId: string,
): Promise<void> {
  const result = await getPostgresPool().query(
    `SELECT 1 FROM academic_years WHERE id = $1 AND tenant_id = $2`,
    [yearId, access.tenantId],
  );
  if (result.rowCount === 0) {
    throw new AuthorizationError(
      "That academic year belongs to another school.",
    );
  }
}

async function requireOwnedClassGroup(
  access: AccessContext,
  classGroupId: string,
): Promise<{ academicYearId: string; name: string }> {
  const result = await getPostgresPool().query<{
    academic_year_id: string;
    name: string;
  }>(
    `SELECT name, academic_year_id
       FROM class_groups
      WHERE id = $1 AND tenant_id = $2`,
    [classGroupId, access.tenantId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new AuthorizationError("That class belongs to another school.");
  }
  return { academicYearId: row.academic_year_id, name: row.name };
}

async function requireOwnedSubject(
  access: AccessContext,
  subjectId: string,
): Promise<Subject> {
  const result = await getPostgresPool().query<{
    code: string;
    description: string;
    id: string;
    name: string;
  }>(
    `SELECT id, code, name, description
       FROM subjects
      WHERE id = $1 AND tenant_id = $2`,
    [subjectId, access.tenantId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new AuthorizationError("That subject belongs to another school.");
  }
  return { ...row, tenantId: access.tenantId };
}

async function requireOwnedPerson(
  access: AccessContext,
  personId: string,
): Promise<void> {
  const result = await getPostgresPool().query(
    `SELECT 1 FROM people WHERE id = $1 AND tenant_id = $2`,
    [personId, access.tenantId],
  );
  if (result.rowCount === 0) {
    throw new AuthorizationError("That person belongs to another school.");
  }
}

/* Changing what a school teaches is exactly the kind of decision someone asks
   about a term later. The people repository already writes these for
   invitations; structure changes are no less worth keeping. */
async function recordAudit(
  access: AccessContext,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getPostgresPool().query(
    `INSERT INTO audit_events
       (id, tenant_id, actor_person_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      crypto.randomUUID(),
      access.tenantId,
      access.actorPersonId,
      action,
      entityType,
      entityId,
      JSON.stringify(metadata),
    ],
  );
}

function requirePermission(
  access: AccessContext,
  permission: Parameters<typeof canPerform>[1],
) {
  if (!canPerform(access, permission)) {
    throw new AuthorizationError(
      "Your school role does not allow this action.",
    );
  }
}
