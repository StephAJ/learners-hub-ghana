import {
  changePersistentTimetableEntry,
  createPersistentAssignment,
  getTeacherOperationsWorkspace,
  releasePersistentRubric,
  savePersistentAttendance,
  submitPersistentAttendance,
  type CreateAssignmentInput,
  type ReleaseRubricInput,
  type SaveAttendanceInput,
} from "../../../../db/operations-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../server/request-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const workspace = await getTeacherOperationsWorkspace(
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
      | ({ action: "create-assignment" } & CreateAssignmentInput)
      | ({ action: "save-attendance" } & SaveAttendanceInput)
      | { action: "submit-attendance" }
      | ({ action: "release-rubric" } & ReleaseRubricInput)
      | {
          action: "change-timetable";
          entryId: string;
          reason: string;
          status: "cancelled" | "substituted";
          substituteTeacherPersonId?: string;
        };

    if (payload.action === "create-assignment") {
      return Response.json({
        workspace: await createPersistentAssignment(
          schoolUser.access,
          payload,
        ),
      });
    }
    if (payload.action === "save-attendance") {
      return Response.json({
        workspace: await savePersistentAttendance(
          schoolUser.access,
          payload,
        ),
      });
    }
    if (payload.action === "submit-attendance") {
      return Response.json({
        workspace: await submitPersistentAttendance(schoolUser.access),
      });
    }
    if (payload.action === "release-rubric") {
      return Response.json({
        workspace: await releasePersistentRubric(
          schoolUser.access,
          payload,
        ),
      });
    }
    if (payload.action === "change-timetable") {
      return Response.json({
        workspace: await changePersistentTimetableEntry(
          schoolUser.access,
          payload,
        ),
      });
    }
    return Response.json(
      { error: "Unknown daily-operations action." },
      { status: 400 },
    );
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}
