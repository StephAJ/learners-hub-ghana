import { getGuardianSchoolDay } from "../../../../db/operations-repository";
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
    const workspace = await getGuardianSchoolDay(
      schoolUser.access,
      learnerId,
    );
    return Response.json({ actor: schoolUser.name, workspace });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}
