import { getMediaResponse } from "../../../../db/content-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../server/request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const assetId = new URL(request.url).searchParams.get("assetId");
    if (!assetId) {
      return Response.json(
        { error: "Media asset is required." },
        { status: 400 },
      );
    }
    return getMediaResponse(schoolUser.access, assetId, request);
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

