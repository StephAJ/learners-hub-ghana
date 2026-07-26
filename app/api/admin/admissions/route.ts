import { getChatGPTUser } from "../../../chatgpt-auth";
import { AuthorizationError } from "../../../../domain/identity/authorization";
import {
  resolveAuthenticatedSchoolUser,
} from "../../../../db/people-repository";
import { listApplicantApplications } from "../../../../db/applicant-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return Response.json(
        { error: "Sign in is required to access school records." },
        { status: 401 },
      );
    }

    const schoolUser = await resolveAuthenticatedSchoolUser(user, [
      "school-admin",
      "admissions-officer",
    ]);
    const applications = await listApplicantApplications(schoolUser.access);
    return Response.json({ applications });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load admission applications.",
      },
      { status: 400 },
    );
  }
}
