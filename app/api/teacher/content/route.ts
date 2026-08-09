import {
  activateH5pActivity,
  createH5pActivity,
  getTeacherContentWorkspace,
  uploadTeacherMedia,
  type CreateH5pActivityInput,
} from "../../../../db/content-repository";
import type { MediaKind } from "../../../../domain/content/types";
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
    const workspace = await getTeacherContentWorkspace(
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
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const kind = String(form.get("kind") ?? "") as MediaKind;
      const offeringId = String(form.get("offeringId") ?? "");
      if (!(file instanceof File)) {
        return Response.json(
          { error: "Choose a file to upload." },
          { status: 400 },
        );
      }
      const workspace = await uploadTeacherMedia(schoolUser.access, {
        file,
        kind,
        offeringId,
      });
      return Response.json({ workspace }, { status: 201 });
    }

    const payload = (await request.json()) as {
      action?: string;
      activityId?: string;
    } & Partial<CreateH5pActivityInput>;
    if (payload.action === "create-h5p") {
      const workspace = await createH5pActivity(
        schoolUser.access,
        payload as CreateH5pActivityInput,
      );
      return Response.json({ workspace }, { status: 201 });
    }
    if (payload.action === "activate-h5p") {
      const workspace = await activateH5pActivity(
        schoolUser.access,
        String(payload.activityId ?? ""),
      );
      return Response.json({ workspace });
    }
    return Response.json(
      { error: "Unknown content-studio action." },
      { status: 400 },
    );
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}
