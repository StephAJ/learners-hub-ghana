import {
  attachLearnerSubmissionFile,
  getLearnerSchoolDay,
  removeLearnerSubmissionFile,
  submitPersistentLearnerAssignment,
} from "../../../../db/operations-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../../server/request-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const learnerId =
      new URL(request.url).searchParams.get("learnerId") ?? undefined;
    const workspace = await getLearnerSchoolDay(
      schoolUser.access,
      learnerId,
    );
    return Response.json({ actor: schoolUser.name, workspace });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();

    /* Attaching a file is a multipart post to the same endpoint the rest of
       the school day already uses, so the learner's view refreshes from one
       response either way. */
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const assignmentId = String(form.get("assignmentId") ?? "");
      if (!(file instanceof File)) {
        return Response.json(
          { error: "Choose a file to attach." },
          { status: 400 },
        );
      }
      const workspace = await attachLearnerSubmissionFile(schoolUser.access, {
        assignmentId,
        file,
      });
      return Response.json({ workspace }, { status: 201 });
    }

    const payload = (await request.json()) as {
      action: "submit-assignment" | "remove-attachment";
      assignmentId?: string;
      attachmentId?: string;
      responseText?: string;
    };

    if (payload.action === "remove-attachment") {
      const workspace = await removeLearnerSubmissionFile(
        schoolUser.access,
        String(payload.attachmentId ?? ""),
      );
      return Response.json({ workspace });
    }

    if (payload.action === "submit-assignment") {
      const workspace = await submitPersistentLearnerAssignment(
        schoolUser.access,
        {
          assignmentId: String(payload.assignmentId ?? ""),
          responseText: String(payload.responseText ?? ""),
        },
      );
      return Response.json({ workspace });
    }

    return Response.json(
      { error: "Unknown learner school-day action." },
      { status: 400 },
    );
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}
