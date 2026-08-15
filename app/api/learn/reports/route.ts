import { getGuardianReportWorkspace } from "../../../../db/reporting-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../server/request-auth";

export const dynamic = "force-dynamic";

/* ==========================================================================
   A learner's own reports

   The learner role has held `report:read` since permissions were written, and
   there was no route and no screen behind it. A learner's own record was
   readable by their parent and not by them.

   The repository is the guardian's, deliberately: the same function already
   resolves a learner to themselves and refuses anybody else through
   canAccessLearner(). A second query would be a second place for that rule to
   be got wrong. What differs is only the address, which is worth having so
   nothing in the learning workspace has to call a route named for guardians.
   ========================================================================== */

export async function GET() {
  try {
    const schoolUser = await requireSchoolRequestUser();
    /* No learnerId parameter. A guardian chooses between their children; a
       learner has exactly one record, and accepting an id here would be an
       invitation to try somebody else's. */
    const workspace = await getGuardianReportWorkspace(schoolUser.access);
    return Response.json({ workspace });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}
