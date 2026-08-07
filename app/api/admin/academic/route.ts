import { getAuthenticatedUser } from "../../../auth";
import { resolveAuthenticatedSchoolUser } from "../../../../db/people-repository";
import {
  archiveClassGroup,
  closeClassOffering,
  createAcademicYear,
  createClassGroup,
  createClassGroupsFromPlan,
  createSubject,
  loadAcademicStructure,
  setClassOffering,
  setCurrentAcademicYear,
  setOfferingTeachers,
  setTeacherOfferings,
  updateClassGroup,
} from "../../../../db/academic-repository";
import { AuthorizationError } from "../../../../domain/identity/authorization";
import { SchoolStructureError } from "../../../../domain/academic/structure";

export const dynamic = "force-dynamic";

/* ==========================================================================
   The school's structure, over HTTP

   One route rather than five, with the action named in the body. The screen
   behind it is a single page where adding a class, adding a subject and
   changing whether a subject is compulsory are three controls on one surface,
   and splitting them across five endpoints would buy nothing but five copies
   of the same authentication preamble.

   Every write is refused by db/academic-repository.ts unless the caller holds
   `academic:manage`; nothing here re-implements that check, it just turns the
   refusal into a 403.
   ========================================================================== */

type WriteAction =
  | { class: Parameters<typeof createClassGroup>[1]; type: "create-class" }
  | {
      plan: Parameters<typeof createClassGroupsFromPlan>[1];
      type: "create-classes";
    }
  | { classGroupId: string; type: "archive-class" }
  | {
      class: Parameters<typeof updateClassGroup>[2];
      classGroupId: string;
      type: "update-class";
    }
  | { offeringId: string; type: "close-offering" }
  | {
      classGroupId: string;
      requirement: "compulsory" | "optional";
      subjectId: string;
      type: "set-offering";
    }
  | { offeringId: string; teacherPersonIds: string[]; type: "set-offering-teachers" }
  | { offeringIds: string[]; teacherPersonId: string; type: "set-teacher-offerings" }
  | { subject: Parameters<typeof createSubject>[1]; type: "create-subject" }
  | { type: "create-year"; year: Parameters<typeof createAcademicYear>[1] }
  | { type: "set-current-year"; yearId: string };

export async function GET() {
  try {
    const schoolUser = await requireSchoolUser();
    const structure = await loadAcademicStructure(schoolUser.access);
    return Response.json({
      canManage: schoolUser.access.role !== "teacher",
      structure,
    });
  } catch (error) {
    return academicErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const schoolUser = await requireSchoolUser();
    const action = (await request.json()) as WriteAction;
    const { access } = schoolUser;

    switch (action.type) {
      case "create-year":
        return Response.json(
          { year: await createAcademicYear(access, action.year) },
          { status: 201 },
        );
      case "set-current-year":
        await setCurrentAcademicYear(access, action.yearId);
        return Response.json({ ok: true });
      case "create-class":
        return Response.json(
          { classGroup: await createClassGroup(access, action.class) },
          { status: 201 },
        );
      /* 201 like create-class, even when every name was already taken and
         nothing was written — the caller reads `created` and `skipped` to
         say what happened, and a 200/201 split on that would be a second,
         redundant way of telling them. */
      case "create-classes":
        return Response.json(await createClassGroupsFromPlan(access, action.plan), {
          status: 201,
        });
      case "update-class":
        return Response.json({
          classGroup: await updateClassGroup(
            access,
            action.classGroupId,
            action.class,
          ),
        });
      case "archive-class":
        await archiveClassGroup(access, action.classGroupId);
        return Response.json({ ok: true });
      case "create-subject":
        return Response.json(
          { subject: await createSubject(access, action.subject) },
          { status: 201 },
        );
      case "set-offering":
        return Response.json({
          offering: await setClassOffering(access, {
            classGroupId: action.classGroupId,
            requirement: action.requirement,
            subjectId: action.subjectId,
          }),
        });
      case "close-offering":
        await closeClassOffering(access, action.offeringId);
        return Response.json({ ok: true });
      /* Both directions of the same join. An administrator staffing a class
         works offering by offering; one onboarding a new teacher works the
         other way round, and neither should have to think in the other's
         terms. */
      case "set-offering-teachers":
        await setOfferingTeachers(
          access,
          action.offeringId,
          action.teacherPersonIds,
        );
        return Response.json({ ok: true });
      case "set-teacher-offerings":
        await setTeacherOfferings(
          access,
          action.teacherPersonId,
          action.offeringIds,
        );
        return Response.json({ ok: true });
      default:
        return Response.json(
          { error: "That is not something this screen can do." },
          { status: 400 },
        );
    }
  } catch (error) {
    return academicErrorResponse(error);
  }
}

async function requireSchoolUser() {
  const user = await getAuthenticatedUser();
  if (!user) throw new RequestIdentityError();
  return resolveAuthenticatedSchoolUser(user, ["school-admin", "academic-admin"]);
}

function academicErrorResponse(error: unknown) {
  if (error instanceof RequestIdentityError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof AuthorizationError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  /* A structure error is the administrator being told they have typed
     something the school cannot have — a blank class name, a duplicate
     subject code. 422 rather than 400: the request was understood, and the
     message is meant to be read and acted on. */
  if (error instanceof SchoolStructureError) {
    return Response.json({ error: error.message }, { status: 422 });
  }
  const message =
    error instanceof Error ? error.message : "Unable to change the school's structure.";
  /* The unique indexes on academic_years, class_groups and subjects are the
     backstop behind the domain's duplicate checks — two administrators saving
     the same new class at the same moment get here rather than both
     succeeding. */
  const status = /duplicate key|unique constraint/i.test(message) ? 409 : 400;
  return Response.json({ error: message }, { status });
}

class RequestIdentityError extends Error {
  constructor() {
    super("Sign in is required to access school records.");
    this.name = "RequestIdentityError";
  }
}
