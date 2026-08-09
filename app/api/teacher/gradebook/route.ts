import {
  listTeacherGradebookWorkspace,
  savePersistentGradeEntry,
  submitPersistentGradebook,
  type SaveGradeEntryInput,
} from "../../../../db/reporting-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../server/request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    /* Which of the teacher's subjects to open. Absent on first load, when the
       repository picks their first. */
    const offeringId =
      new URL(request.url).searchParams.get("offeringId") ?? undefined;
    const workspace = await listTeacherGradebookWorkspace(
      schoolUser.access,
      offeringId,
    );
    return Response.json({ actor: schoolUser.name, workspace });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    /* Every action carries the offering it was taken in, so the workspace
       that comes back is the markbook the teacher is looking at rather than
       whichever of their subjects sorts first. save-entry is the exception:
       the grade entry itself names its offering.

       Approving and releasing a report are not here: they need report:approve
       and report:release, which no teaching role holds. They live on
       /api/admin/reports, beside the screen the head can actually open. */
    const payload = (await request.json()) as
      | ({ action: "save-entry" } & SaveGradeEntryInput)
      | { action: "submit-gradebook"; offeringId?: string };

    if (payload.action === "save-entry") {
      const workspace = await savePersistentGradeEntry(
        schoolUser.access,
        payload,
      );
      return Response.json({ workspace });
    }
    if (payload.action === "submit-gradebook") {
      const workspace = await submitPersistentGradebook(
        schoolUser.access,
        payload.offeringId,
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

