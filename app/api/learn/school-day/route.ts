import {
  getLearnerSchoolDay,
  submitPersistentLearnerAssignment,
} from "../../../../db/operations-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../server/request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const learnerId =
      new URL(request.url).searchParams.get("learnerId") ?? undefined;
    const workspace = await getLearnerSchoolDay(
      schoolUser.access,
      learnerId,
    );
    return Response.json({ actor: schoolUser.name, workspace });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const payload = (await request.json()) as {
      action: "submit-assignment";
      assignmentId: string;
      responseText: string;
    };
    if (payload.action !== "submit-assignment") {
      return Response.json(
        { error: "Unknown learner school-day action." },
        { status: 400 },
      );
    }
    const workspace = await submitPersistentLearnerAssignment(
      schoolUser.access,
      payload,
    );
    return Response.json({ workspace });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}
