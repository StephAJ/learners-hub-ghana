import { getSubmissionAttachmentResponse } from "../../../../../db/operations-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../../server/request-auth";

export const dynamic = "force-dynamic";

/**
 * Reads one file from a submission.
 *
 * Deliberately not served through /api/content/media: that route authorises by
 * subject offering, which every learner in the class shares, so handed-in work
 * would be readable by any classmate holding an asset id. The repository
 * resolves the submission's owner first — see getSubmissionAttachmentResponse.
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
    return await getSubmissionAttachmentResponse(
      schoolUser.access,
      attachmentId,
    );
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}
