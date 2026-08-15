import {
  listTeacherGradebookWorkspace,
  savePersistentGradeEntry,
  submitPersistentGradebook,
  type SaveGradeEntryInput,
} from "../../../../db/reporting-repository";
import {
  createGradeCategory,
  createGradeItem,
  deleteGradeCategory,
  excludeGradeItem,
  updateGradeCategory,
  updateGradeItem,
  type GradeCategoryInput,
  type GradeItemInput,
} from "../../../../db/gradebook-structure-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../server/request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    /* Which of the teacher's subjects to open. Absent on first load, when the
       repository picks their first. */
    const offeringId =
      new URL(request.url).searchParams.get("offeringId") ?? undefined;
    const workspace = await listTeacherGradebookWorkspace(
      schoolUser.access,
      offeringId,
    );
    return Response.json({ actor: schoolUser.name, workspace });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    /* Every action carries the offering it was taken in, so the workspace
       that comes back is the markbook the teacher is looking at rather than
       whichever of their subjects sorts first. save-entry is the exception:
       the grade entry itself names its offering.

       Approving and releasing a report are not here: they need report:approve
       and report:release, which no teaching role holds. They live on
       /api/admin/reports, beside the screen the head can actually open. */
    const payload = (await request.json()) as
      | ({ action: "save-entry" } & SaveGradeEntryInput)
      | { action: "submit-gradebook"; offeringId?: string }
      /* Categories and columns used to exist only as seed rows, so a teacher
         of any subject but the demo's Integrated Science opened a markbook
         with nothing to type into and no way to add anything. */
      | ({ action: "add-category"; offeringId: string } & GradeCategoryInput)
      | ({ action: "edit-category"; categoryId: string } & GradeCategoryInput)
      | { action: "remove-category"; categoryId: string; offeringId: string }
      | ({ action: "add-column"; offeringId: string } & GradeItemInput)
      | ({ action: "edit-column"; itemId: string; offeringId: string } & Omit<
          GradeItemInput,
          "assessmentId"
        >)
      | { action: "remove-column"; itemId: string; offeringId: string };

    if (payload.action === "save-entry") {
      const workspace = await savePersistentGradeEntry(
        schoolUser.access,
        payload,
      );
      return Response.json({ workspace });
    }
    if (payload.action === "submit-gradebook") {
      const workspace = await submitPersistentGradebook(
        schoolUser.access,
        payload.offeringId,
      );
      return Response.json({ workspace });
    }

    /* Each of these returns the markbook it changed, so the screen never has
       to guess what the write did to the rest of the table. */
    if (payload.action === "add-category") {
      await createGradeCategory(schoolUser.access, payload.offeringId, payload);
      return json(schoolUser.access, payload.offeringId);
    }
    if (payload.action === "edit-category") {
      await updateGradeCategory(
        schoolUser.access,
        payload.categoryId,
        payload,
      );
      return json(schoolUser.access);
    }
    if (payload.action === "remove-category") {
      await deleteGradeCategory(schoolUser.access, payload.categoryId);
      return json(schoolUser.access, payload.offeringId);
    }
    if (payload.action === "add-column") {
      await createGradeItem(schoolUser.access, payload.offeringId, payload);
      return json(schoolUser.access, payload.offeringId);
    }
    if (payload.action === "edit-column") {
      await updateGradeItem(schoolUser.access, payload.itemId, payload);
      return json(schoolUser.access, payload.offeringId);
    }
    if (payload.action === "remove-column") {
      await excludeGradeItem(schoolUser.access, payload.itemId);
      return json(schoolUser.access, payload.offeringId);
    }
    return Response.json(
      { error: "Unknown gradebook action." },
      { status: 400 },
    );
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}


/** The markbook after a change, so the screen re-renders from the record. */
async function json(
  access: Parameters<typeof listTeacherGradebookWorkspace>[0],
  offeringId?: string,
) {
  return Response.json({
    workspace: await listTeacherGradebookWorkspace(access, offeringId),
  });
}
