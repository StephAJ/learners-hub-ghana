import { getResponseAttachmentResponse } from "../../../../../db/assessment-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../../server/request-auth";

export const dynamic = "force-dynamic";

/**
 * Reads back one file handed in as an answer.
 *
 * Split from the assessment endpoint because this returns bytes rather than
 * the paper, and because the learner who wrote it and the teacher marking it
 * both need it — the repository decides which of the two is asking.
 */
export async function GET(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const attachmentId = new URL(request.url).searchParams.get("attachmentId");
    if (!attachmentId) {
      return Response.json(
        { error: "Attachment is required." },
        { status: 400 },
      );
    }
    return await getResponseAttachmentResponse(schoolUser.access, attachmentId);
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}
