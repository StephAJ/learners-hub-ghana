import { getGuardianReportWorkspace } from "../../../../db/reporting-repository";
import { renderReportCardPdf } from "../../../../domain/reporting/report-pdf";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../server/request-auth";

export const dynamic = "force-dynamic";

/* ==========================================================================
   The report card as a file

   "Download" was window.print(), which produces a different document on every
   device and none at all on a phone that cannot print. This produces one
   fixed document, from the same record the screen renders.

   Authorisation is not re-implemented: it loads the workspace through
   getGuardianReportWorkspace(), which already resolves a learner to
   themselves, a guardian to their linked children, and refuses everybody
   else. A second query here would be a second place for that rule to be got
   wrong — and this one hands out a document.
   ========================================================================== */

export async function GET(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const parameters = new URL(request.url).searchParams;
    const learnerId = parameters.get("learnerId") ?? undefined;
    const reportId = parameters.get("reportId") ?? "";

    const workspace = await getGuardianReportWorkspace(
      schoolUser.access,
      learnerId,
    );
    /* Newest released report when none is named, which is what a family
       following a link from an email wants. */
    const report =
      workspace.reports.find((item) => item.id === reportId) ??
      workspace.reports[0];
    if (!report) {
      return Response.json(
        { error: "No released report is available for this learner." },
        { status: 404 },
      );
    }

    const pdf = renderReportCardPdf({
      attendance: report.attendance,
      className: workspace.child.className,
      classTeacherComment: report.classTeacherComment,
      conduct: report.conduct,
      headteacherComment: report.headteacherComment,
      issuedAt: report.releasedAt.slice(0, 10),
      learnerName: workspace.child.name,
      overallAverage: report.overallAverage,
      periodName: report.periodName,
      promotionDecision: report.promotionDecision,
      reportId: report.id,
      schoolName: workspace.schoolName,
      studentNumber: workspace.child.studentId,
      subjects: report.subjects,
      version: report.version,
    });

    const filename = `${workspace.child.name} ${report.periodName} report.pdf`
      .replace(/[^\w .-]/g, "")
      .trim();

    return new Response(pdf as BodyInit, {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="${filename}"`,
        "content-type": "application/pdf",
      },
    });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}
