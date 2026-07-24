import {
  getLearnerActivityLaunch,
  recordInteractiveResult,
} from "../../../../db/content-repository";
import type { InteractiveResultInput } from "../../../../domain/content/types";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../server/request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const url = new URL(request.url);
    const activityId = url.searchParams.get("activityId") ?? "";
    const lessonId = url.searchParams.get("lessonId") ?? "";
    const lessonVersion = Number(url.searchParams.get("lessonVersion"));
    const activity = await getLearnerActivityLaunch(schoolUser.access, {
      activityId,
      lessonId,
      lessonVersion,
    });
    return Response.json({ activity });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const payload = (await request.json()) as InteractiveResultInput;
    const result = await recordInteractiveResult(
      schoolUser.access,
      payload,
    );
    return Response.json({ result }, { status: 201 });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

