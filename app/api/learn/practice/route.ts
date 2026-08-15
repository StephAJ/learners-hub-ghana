import {
  buildPracticeSet,
  markPracticeAnswer,
} from "../../../../db/practice-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../server/request-auth";

export const dynamic = "force-dynamic";

/** A set of questions to practise, without their answer keys. */
export async function GET(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const url = new URL(request.url);
    const set = await buildPracticeSet(schoolUser.access, {
      offeringId: url.searchParams.get("offeringId") ?? "",
      seed: Number(url.searchParams.get("seed") ?? 0) || 0,
      topic: url.searchParams.get("topic") ?? undefined,
    });
    return Response.json({ set });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

/* One answer at a time. Feedback the moment an answer is given is the whole
   difference between practice and a test, and it has to come from here because
   the answer key is the one part of a question a learner must not be sent.

   Nothing is written by this route. That is the feature, not an omission —
   see the note at the top of db/practice-repository.ts. */
export async function POST(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const payload = (await request.json()) as {
      offeringId?: unknown;
      questionId?: unknown;
      value?: unknown;
    };
    const mark = await markPracticeAnswer(schoolUser.access, {
      offeringId:
        typeof payload.offeringId === "string" ? payload.offeringId : "",
      questionId:
        typeof payload.questionId === "string" ? payload.questionId : "",
      value: payload.value,
    });
    return Response.json({ mark });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}
