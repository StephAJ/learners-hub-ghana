import {
  attachAssessmentResponseFile,
  DIGESTION_ASSESSMENT_ID,
  getLearnerAssessment,
  removeAssessmentResponseFile,
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

    /* A file answer is a multipart post to this same endpoint, so the paper
       comes back in one response either way and the learner's view never has
       to reconcile two sources. */
    if (
      (request.headers.get("content-type") ?? "").includes(
        "multipart/form-data",
      )
    ) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return Response.json(
          { error: "Choose a file to attach." },
          { status: 400 },
        );
      }
      const assessment = await attachAssessmentResponseFile(schoolUser.access, {
        attemptId: String(form.get("attemptId") ?? ""),
        file,
        questionId: String(form.get("questionId") ?? ""),
      });
      return Response.json({ assessment }, { status: 201 });
    }

    const payload = (await request.json()) as
      | { action: "start"; assessmentId?: string }
      | { action: "remove-attachment"; attachmentId: string; attemptId: string }
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
    if (payload.action === "remove-attachment") {
      const assessment = await removeAssessmentResponseFile(
        schoolUser.access,
        {
          attachmentId: payload.attachmentId,
          attemptId: payload.attemptId,
        },
      );
      return Response.json({ assessment });
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

