import { getAuthenticatedUser } from "../../../auth";
import { resolveAuthenticatedSchoolUser } from "../../../../db/people-repository";
import {
  loadSchoolProfileForEditing,
  loadSchoolSettings,
  saveSchoolProfile,
} from "../../../../db/school-profile-repository";
import {
  SchoolProfileError,
  toSchoolProfileEdit,
  type SchoolProfileEdit,
} from "../../../../domain/school/public-profile";
import { AuthorizationError } from "../../../../domain/identity/authorization";

export const dynamic = "force-dynamic";

/* ==========================================================================
   The school's own details

   What the public site says about a school used to be a TypeScript constant.
   This is the write path that replaces editing it.
   ========================================================================== */

export async function GET() {
  try {
    const schoolUser = await requireSchoolUser();
    /* The prefix lives on the tenant row rather than in the public profile
       document, so it is filled in over the top of the edit shape. */
    const [profile, settings] = await Promise.all([
      loadSchoolProfileForEditing(schoolUser.access),
      loadSchoolSettings(schoolUser.access),
    ]);
    return Response.json({
      profile: { ...toSchoolProfileEdit(profile), ...settings },
    });
  } catch (error) {
    return schoolErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const schoolUser = await requireSchoolUser();
    const edit = (await request.json()) as SchoolProfileEdit;
    const profile = await saveSchoolProfile(schoolUser.access, edit);
    const settings = await loadSchoolSettings(schoolUser.access);
    return Response.json({
      profile: { ...toSchoolProfileEdit(profile), ...settings },
    });
  } catch (error) {
    return schoolErrorResponse(error);
  }
}

async function requireSchoolUser() {
  const user = await getAuthenticatedUser();
  if (!user) throw new RequestIdentityError();
  return resolveAuthenticatedSchoolUser(user, ["school-admin"]);
}

function schoolErrorResponse(error: unknown) {
  if (error instanceof RequestIdentityError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof AuthorizationError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof SchoolProfileError) {
    return Response.json({ error: error.message }, { status: 422 });
  }
  return Response.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "Unable to save the school's details.",
    },
    { status: 400 },
  );
}

class RequestIdentityError extends Error {
  constructor() {
    super("Sign in is required to access school records.");
    this.name = "RequestIdentityError";
  }
}
