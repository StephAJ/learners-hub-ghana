import { listAuditEvents } from "../../../../db/audit-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../server/request-auth";

export const dynamic = "force-dynamic";

/* ==========================================================================
   The audit trail, over HTTP

   Read-only, deliberately. An audit event is written by whichever repository
   made the change it records; nothing outside those write paths should be
   able to add one, and no route anywhere should be able to remove one.
   ========================================================================== */

export async function GET(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const parameters = new URL(request.url).searchParams;
    const events = await listAuditEvents(schoolUser.access, {
      area: parameters.get("area") ?? undefined,
      search: parameters.get("search") ?? undefined,
    });
    return Response.json({ events });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}
