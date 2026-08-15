import {
  createTimetablePeriod,
  loadSchoolTimetable,
  removeTimetablePeriod,
  setTimetableEntry,
  type CreatePeriodInput,
  type SetEntryInput,
} from "../../../../db/timetable-repository";
import { loadAcademicStructure } from "../../../../db/academic-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../server/request-auth";

export const dynamic = "force-dynamic";

/* ==========================================================================
   The school's week

   timetable_periods and timetable_entries were written by the operations seed
   and by nothing else, so the timetable every learner and guardian read was
   the demo school's four periods — in every school. This is the write path
   that was missing.

   The class structure comes back with it because the two are useless apart:
   putting a subject in a slot means choosing from the subjects that class is
   actually offered.
   ========================================================================== */

export async function GET(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const classGroupId =
      new URL(request.url).searchParams.get("classGroupId") ?? undefined;
    const [timetable, structure] = await Promise.all([
      loadSchoolTimetable(schoolUser.access, classGroupId),
      loadAcademicStructure(schoolUser.access),
    ]);
    return Response.json({ structure, timetable });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const payload = (await request.json()) as
      | ({ action: "add-period" } & CreatePeriodInput)
      | { action: "remove-period"; periodId: string }
      | ({ action: "set-entry" } & SetEntryInput);

    if (payload.action === "add-period") {
      await createTimetablePeriod(schoolUser.access, payload);
    } else if (payload.action === "remove-period") {
      await removeTimetablePeriod(schoolUser.access, payload.periodId);
    } else if (payload.action === "set-entry") {
      await setTimetableEntry(schoolUser.access, payload);
    } else {
      return Response.json(
        { error: "Unknown timetable action." },
        { status: 400 },
      );
    }

    return Response.json({
      timetable: await loadSchoolTimetable(schoolUser.access),
    });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}
