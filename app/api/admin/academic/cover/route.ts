import { uploadSubjectCover } from "../../../../../db/academic-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../../server/request-auth";

export const dynamic = "force-dynamic";

/* Multipart rather than JSON, so the repository can read and scan the bytes
   before anything points at them. */
export async function POST(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json(
        { error: "Choose an image for the subject." },
        { status: 400 },
      );
    }
    const subjects = await uploadSubjectCover(schoolUser.access, {
      file,
      subjectId: String(form.get("subjectId") ?? ""),
    });
    return Response.json({ subjects });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}
