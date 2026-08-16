import { getSchoolMedia } from "../../../../db/school-media";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../server/request-auth";

export const dynamic = "force-dynamic";

/**
 * A school-wide image, served inline.
 *
 * Distinct from the lesson media route, which requires the asset to belong to
 * an offering the reader can reach. A subject cover belongs to the subject
 * rather than to any one class's offering, so that check would refuse every
 * request — and the cover is on a card every learner in the school sees
 * anyway.
 */
export async function GET(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const url = new URL(request.url);
    return await getSchoolMedia(
      schoolUser.access,
      url.searchParams.get("assetId") ?? "",
    );
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}
