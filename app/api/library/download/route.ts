import { getLibraryDownload } from "../../../../db/library-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../server/request-auth";

export const dynamic = "force-dynamic";

/**
 * The file behind a listing.
 *
 * Its own route rather than the lesson media one: that check requires the
 * asset to belong to an offering the reader can reach, and a library asset
 * belongs to no offering by design, so it would refuse every download.
 */
export async function GET(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const url = new URL(request.url);
    return await getLibraryDownload(
      schoolUser.access,
      url.searchParams.get("resourceId") ?? "",
    );
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}
