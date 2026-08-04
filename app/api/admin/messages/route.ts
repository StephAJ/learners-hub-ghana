import {
  listReportedThreads,
  reviewMessageReport,
} from "../../../../db/messaging-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../server/request-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const reports = await listReportedThreads(schoolUser.access);
    return Response.json({ reports });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const payload = (await request.json()) as { note: string; reportId: string };
    const reports = await reviewMessageReport(
      schoolUser.access,
      payload.reportId,
      payload.note,
    );
    return Response.json({ reports });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}
