import {
  createBankQuestion,
  createPersistentAssessmentDraft,
  listTeacherAssessmentWorkspace,
  markPersistentResponse,
  publishPersistentAssessment,
  releasePersistentResult,
  type CreateBankQuestionInput,
  type CreateAssessmentInput,
} from "../../../../db/assessment-repository";
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
    const workspace = await listTeacherAssessmentWorkspace(
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
      | ({ action: "create-question"; offeringId?: string } & CreateBankQuestionInput)
      | ({ action: "create-assessment"; offeringId?: string } & CreateAssessmentInput)
      | { action: "publish"; assessmentId: string }
      | {
          action: "mark";
          attemptId: string;
          feedback: string;
          marks: number;
          questionVersionId: string;
        }
      | { action: "release"; attemptId: string };

    if (payload.action === "create-question") {
      const question = await createBankQuestion(
        schoolUser.access,
        payload,
        payload.offeringId,
      );
      return Response.json({ question }, { status: 201 });
    }
    if (payload.action === "create-assessment") {
      const assessment = await createPersistentAssessmentDraft(
        schoolUser.access,
        payload,
        payload.offeringId,
      );
      return Response.json({ assessment }, { status: 201 });
    }
    if (payload.action === "publish") {
      const assessment = await publishPersistentAssessment(
        schoolUser.access,
        payload.assessmentId,
      );
      return Response.json({ assessment });
    }
    if (payload.action === "mark") {
      const reviewQueue = await markPersistentResponse(
        schoolUser.access,
        payload.attemptId,
        payload.questionVersionId,
        payload.marks,
        payload.feedback,
      );
      return Response.json({ reviewQueue });
    }
    if (payload.action === "release") {
      const reviewQueue = await releasePersistentResult(
        schoolUser.access,
        payload.attemptId,
      );
      return Response.json({ reviewQueue });
    }
    return Response.json(
      { error: "Unknown assessment action." },
      { status: 400 },
    );
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}
