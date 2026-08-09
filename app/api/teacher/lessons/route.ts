import {
  createPersistentLessonDraft,
  duplicatePersistentLesson,
  listTeacherLessonWorkspace,
  publishPersistentLesson,
  updatePersistentLessonDraft,
  type CreateDraftInput,
} from "../../../../db/learning-repository";
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
    const workspace = await listTeacherLessonWorkspace(
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
    const payload = (await request.json()) as
      | ({ action: "create" } & CreateDraftInput)
      | ({ action: "update"; lessonId: string } & CreateDraftInput)
      | { action: "duplicate"; lessonId: string }
      | { action: "publish"; lessonId: string };

    if (payload.action === "duplicate") {
      const lesson = await duplicatePersistentLesson(
        schoolUser.access,
        payload.lessonId,
      );
      return Response.json({ lesson }, { status: 201 });
    }

    if (payload.action === "publish") {
      const lesson = await publishPersistentLesson(
        schoolUser.access,
        payload.lessonId,
      );
      return Response.json({ lesson });
    }

    if (payload.action === "update") {
      const lesson = await updatePersistentLessonDraft(
        schoolUser.access,
        payload.lessonId,
        payload,
      );
      return Response.json({ lesson });
    }

    if (payload.action === "create") {
      const lesson = await createPersistentLessonDraft(
        schoolUser.access,
        payload,
      );
      return Response.json({ lesson }, { status: 201 });
    }

    return Response.json({ error: "Unknown lesson action." }, { status: 400 });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}
