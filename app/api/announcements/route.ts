import {
  createAnnouncement,
  listAnnouncements,
} from "../../../db/announcement-repository";
import type { NewAnnouncement } from "../../../domain/announcements/announcements";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../server/request-auth";

export const dynamic = "force-dynamic";

/* One route for every role. What comes back is decided by the reader's own
   scopes, so a learner, a guardian and a teacher ask the same question and
   get different answers without the client saying who it is. */
export async function GET() {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const workspace = await listAnnouncements(schoolUser.access);
    return Response.json({ actor: schoolUser.name, workspace });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const payload = (await request.json()) as NewAnnouncement;
    const workspace = await createAnnouncement(schoolUser.access, payload);
    return Response.json({ workspace });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}
