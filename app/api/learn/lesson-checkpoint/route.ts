import {
  getLessonCheckpoint,
  markLessonCheckpoint,
  type CheckpointResponseInput,
} from "../../../../db/lesson-checkpoint-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../server/request-auth";

export const dynamic = "force-dynamic";

/** The questions in a lesson checkpoint, without their answer keys. */
export async function GET(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const url = new URL(request.url);
    const checkpoint = await getLessonCheckpoint(schoolUser.access, {
      blockId: url.searchParams.get("blockId") ?? "",
      lessonId: url.searchParams.get("lessonId") ?? "",
      lessonVersion: Number(url.searchParams.get("lessonVersion")),
    });
    return Response.json({ checkpoint });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

/* Marking is a POST rather than something the player works out for itself,
   because the answer key is the one part of a question a learner must not be
   sent. The response carries only what is safe once an answer is committed:
   the marks, and the author's explanation. */
export async function POST(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const payload = (await request.json()) as {
      blockId?: unknown;
      lessonId?: unknown;
      lessonVersion?: unknown;
      responses?: unknown;
    };
    const result = await markLessonCheckpoint(schoolUser.access, {
      blockId: typeof payload.blockId === "string" ? payload.blockId : "",
      lessonId: typeof payload.lessonId === "string" ? payload.lessonId : "",
      lessonVersion: Number(payload.lessonVersion),
      responses: parseResponses(payload.responses),
    });
    return Response.json({ result });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

function parseResponses(value: unknown): CheckpointResponseInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { questionId, value: answer } = entry as Record<string, unknown>;
    if (typeof questionId !== "string" || !questionId) return [];
    return [{ questionId, value: answer }];
  });
}
