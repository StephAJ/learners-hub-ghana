import {
  approvePersistentReport,
  listTeacherGradebookWorkspace,
  releasePersistentReport,
  savePersistentGradeEntry,
  submitPersistentGradebook,
  type SaveGradeEntryInput,
} from "../../../../db/reporting-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../server/request-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const workspace = await listTeacherGradebookWorkspace(
      schoolUser.access,
    );
    return Response.json({ actor: schoolUser.name, workspace });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const payload = (await request.json()) as
      | ({ action: "save-entry" } & SaveGradeEntryInput)
      | { action: "submit-gradebook" }
      | { action: "approve-report"; reportId: string }
      | { action: "release-report"; reportId: string };

    if (payload.action === "save-entry") {
      const workspace = await savePersistentGradeEntry(
        schoolUser.access,
        payload,
      );
      return Response.json({ workspace });
    }
    if (payload.action === "submit-gradebook") {
      const workspace = await submitPersistentGradebook(schoolUser.access);
      return Response.json({ workspace });
    }
    if (payload.action === "approve-report") {
      const workspace = await approvePersistentReport(
        schoolUser.access,
        payload.reportId,
      );
      return Response.json({ workspace });
    }
    if (payload.action === "release-report") {
      const workspace = await releasePersistentReport(
        schoolUser.access,
        payload.reportId,
      );
      return Response.json({ workspace });
    }
    return Response.json(
      { error: "Unknown gradebook action." },
      { status: 400 },
    );
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

