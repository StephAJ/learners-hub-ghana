import {
  approveClassReports,
  approvePersistentReport,
  listReportApprovalQueue,
  releaseClassReports,
  releasePersistentReport,
} from "../../../../db/reporting-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../server/request-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const queue = await listReportApprovalQueue(schoolUser.access);
    return Response.json({ queue });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

/* Approving and releasing live here rather than on the teacher markbook
   route, which is where they used to sit. Both need report:approve or
   report:release, and neither permission belongs to a teaching role — so the
   actions were only ever reachable by someone guaranteed to be refused. */
export async function POST(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const payload = (await request.json()) as {
      action?: unknown;
      className?: unknown;
      reportId?: unknown;
    };
    const reportId =
      typeof payload.reportId === "string" ? payload.reportId : "";
    const className =
      typeof payload.className === "string" ? payload.className : "";

    if (payload.action === "approve") {
      const queue = await approvePersistentReport(schoolUser.access, reportId);
      return Response.json({ queue });
    }
    if (payload.action === "release") {
      const queue = await releasePersistentReport(schoolUser.access, reportId);
      return Response.json({ queue });
    }
    /* The same two actions over a whole class. Separate action names rather
       than an optional field, so a request cannot half-say which it meant. */
    if (payload.action === "approve-class") {
      const queue = await approveClassReports(schoolUser.access, className);
      return Response.json({ queue });
    }
    if (payload.action === "release-class") {
      const queue = await releaseClassReports(schoolUser.access, className);
      return Response.json({ queue });
    }
    return Response.json(
      { error: "Unknown report action." },
      { status: 400 },
    );
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}
