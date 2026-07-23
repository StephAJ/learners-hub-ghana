import {
  getLearnerSubject,
  saveLessonProgress,
  SCIENCE_OFFERING_ID,
} from "../../../../db/learning-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../server/request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const offeringId =
      new URL(request.url).searchParams.get("offeringId") ??
      SCIENCE_OFFERING_ID;
    const subject = await getLearnerSubject(schoolUser.access, offeringId);
    return Response.json({ subject });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const payload = (await request.json()) as {
      lessonId?: string;
      lessonVersion?: number;
      percent?: number;
    };
    if (
      !payload.lessonId ||
      !Number.isInteger(payload.lessonVersion) ||
      typeof payload.percent !== "number"
    ) {
      return Response.json(
        { error: "Lesson, version, and progress percentage are required." },
        { status: 400 },
      );
    }
    const progress = await saveLessonProgress(
      schoolUser.access,
      payload.lessonId,
      payload.lessonVersion as number,
      payload.percent,
    );
    return Response.json({ progress });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

