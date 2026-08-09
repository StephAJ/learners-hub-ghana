import { getAuthenticatedUser } from "../../../auth";
import { AuthorizationError } from "../../../../domain/identity/authorization";
import {
  resolveAuthenticatedSchoolUser,
} from "../../../../db/people-repository";
import {
  enrolApplicant,
  listApplicantApplications,
  updateApplicantApplicationStatus,
  type ManagedAdmissionStatus,
} from "../../../../db/applicant-repository";
import { listClassGroups } from "../../../../db/academic-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
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
    /* The classes come back with the applications rather than from a second
       endpoint: enrolling an accepted applicant needs one, and the screen
       should not have to make a second round trip to offer the choice. */
    const [applications, classGroups] = await Promise.all([
      listApplicantApplications(schoolUser.access),
      listClassGroups(schoolUser.access).catch(() => []),
    ]);
    return Response.json({ applications, classGroups });
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

export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser();
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
    const input = (await request.json()) as {
      applicationId?: string;
      status?: ManagedAdmissionStatus;
    };
    if (!input.applicationId || !input.status) {
      return Response.json(
        { error: "Application and status are required." },
        { status: 422 },
      );
    }

    const application = await updateApplicantApplicationStatus(
      schoolUser.access,
      input.applicationId,
      input.status,
    );
    return Response.json({ application });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update the admission application.",
      },
      { status: 400 },
    );
  }
}

/**
 * Turns an accepted application into a learner.
 *
 * Separate from PATCH because it is not a status change: it creates a person,
 * a class membership, a guardian link and a student number, and it needs the
 * class to put them in. PATCH moving an application to "enrolled" changed a
 * word and created nobody — the button offering it has always been labelled
 * "Create student record".
 */
export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
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
    const input = (await request.json()) as {
      applicationId?: string;
      classGroupId?: string;
    };
    if (!input.applicationId || !input.classGroupId) {
      return Response.json(
        { error: "Application and class are required." },
        { status: 422 },
      );
    }

    const result = await enrolApplicant(schoolUser.access, input.applicationId, {
      classGroupId: input.classGroupId,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    const message =
      error instanceof Error
        ? error.message
        : "Unable to enrol this applicant.";
    return Response.json(
      { error: message },
      { status: /duplicate key|unique constraint/i.test(message) ? 409 : 422 },
    );
  }
}
