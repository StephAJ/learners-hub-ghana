import {
  DIGESTION_ASSESSMENT_ID,
  getLearnerAssessment,
  savePersistentResponse,
  startPersistentAttempt,
  submitPersistentAttempt,
} from "../../../../db/assessment-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../server/request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const assessmentId =
      new URL(request.url).searchParams.get("assessmentId") ??
      DIGESTION_ASSESSMENT_ID;
    const assessment = await getLearnerAssessment(
      schoolUser.access,
      assessmentId,
    );
    return Response.json({ assessment });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const payload = (await request.json()) as
      | { action: "start"; assessmentId?: string }
      | {
          action: "save";
          attemptId: string;
          flagged: boolean;
          questionId: string;
          response: { value: unknown };
        }
      | { action: "submit"; attemptId: string };

    if (payload.action === "start") {
      const assessment = await startPersistentAttempt(
        schoolUser.access,
        payload.assessmentId,
      );
      return Response.json({ assessment }, { status: 201 });
    }
    if (payload.action === "save") {
      const saved = await savePersistentResponse(
        schoolUser.access,
        payload.attemptId,
        payload.questionId,
        payload.response,
        Boolean(payload.flagged),
      );
      return Response.json(saved);
    }
    if (payload.action === "submit") {
      const assessment = await submitPersistentAttempt(
        schoolUser.access,
        payload.attemptId,
      );
      return Response.json({ assessment });
    }
    return Response.json(
      { error: "Unknown attempt action." },
      { status: 400 },
    );
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

