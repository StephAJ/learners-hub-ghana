import {
  createPersistentLessonDraft,
  listTeacherLessonWorkspace,
  publishPersistentLesson,
  type CreateDraftInput,
} from "../../../../db/learning-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../server/request-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const workspace = await listTeacherLessonWorkspace(schoolUser.access);
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
      | { action: "publish"; lessonId: string };

    if (payload.action === "publish") {
      const lesson = await publishPersistentLesson(
        schoolUser.access,
        payload.lessonId,
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

