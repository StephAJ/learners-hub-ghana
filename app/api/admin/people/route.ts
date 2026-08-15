import { getAuthenticatedUser } from "../../../auth";
import {
  inviteDirectoryPerson,
  listDirectoryPeople,
  resolveAuthenticatedSchoolUser,
  type InvitePersonInput,
} from "../../../../db/people-repository";
import {
  DirectoryError,
  importDirectoryPeople,
  linkGuardianToLearner,
  listGuardianLinks,
  offboardDirectoryPerson,
  reinstateDirectoryPerson,
  revokeGuardianLink,
  updateDirectoryPerson,
  type UpdatePersonInput,
} from "../../../../db/directory-repository";
import type { ImportRowInput } from "../../../../domain/identity/bulk-import";
import { AuthorizationError } from "../../../../domain/identity/authorization";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireRequestUser();
    const schoolUser = await resolveAuthenticatedSchoolUser(user);
    const [people, guardianLinks] = await Promise.all([
      listDirectoryPeople(schoolUser.access),
      listGuardianLinks(schoolUser.access),
    ]);

    return Response.json({
      actor: {
        email: schoolUser.email,
        name: schoolUser.name,
        role: schoolUser.access.role,
      },
      guardianLinks,
      people,
      school: {
        id: schoolUser.access.tenantId,
        name: schoolUser.schoolName,
      },
    });
  } catch (error) {
    return directoryErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser();
    const schoolUser = await resolveAuthenticatedSchoolUser(user);
    /* The directory was invite-only: one action, and no way to correct a
       person afterwards. Everything else here is a correction of some kind —
       a wrong role, a leaver, a mistyped address, a guardian linked to the
       wrong child. */
    const payload = (await request.json()) as
      | ({ action?: "invite" } & InvitePersonInput)
      | ({ action: "update"; personId: string } & UpdatePersonInput)
      | { action: "offboard"; personId: string; reason: string }
      | { action: "reinstate"; personId: string }
      | { action: "import"; rows: ImportRowInput[] }
      | {
          action: "link-guardian";
          guardianId: string;
          learnerId: string;
          relationship: string;
        }
      | { action: "revoke-guardian"; linkId: string; reason: string };

    if (payload.action === "update") {
      await updateDirectoryPerson(
        schoolUser.access,
        payload.personId,
        payload,
      );
      return Response.json({ ok: true });
    }
    if (payload.action === "offboard") {
      await offboardDirectoryPerson(
        schoolUser.access,
        payload.personId,
        payload.reason,
      );
      return Response.json({ ok: true });
    }
    if (payload.action === "reinstate") {
      await reinstateDirectoryPerson(schoolUser.access, payload.personId);
      return Response.json({ ok: true });
    }
    if (payload.action === "import") {
      /* The outcome is the point: a school is owed a line per row, not a
         count. See importDirectoryPeople(). */
      const outcome = await importDirectoryPeople(
        schoolUser.access,
        payload.rows ?? [],
      );
      return Response.json({ outcome });
    }
    if (payload.action === "link-guardian") {
      await linkGuardianToLearner(schoolUser.access, payload);
      return Response.json({ ok: true });
    }
    if (payload.action === "revoke-guardian") {
      await revokeGuardianLink(
        schoolUser.access,
        payload.linkId,
        payload.reason,
      );
      return Response.json({ ok: true });
    }

    const person = await inviteDirectoryPerson(schoolUser.access, payload);
    return Response.json({ person }, { status: 201 });
  } catch (error) {
    return directoryErrorResponse(error);
  }
}

async function requireRequestUser() {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw new RequestIdentityError();
  }
  return user;
}

function directoryErrorResponse(error: unknown) {
  if (error instanceof RequestIdentityError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof AuthorizationError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  /* Something the administrator typed that the school cannot have. 422, so
     the message is read and corrected rather than treated as a fault. */
  if (error instanceof DirectoryError) {
    return Response.json({ error: error.message }, { status: 422 });
  }
  const message =
    error instanceof Error ? error.message : "Unable to access school records.";
  const status = message.includes("UNIQUE constraint failed") ? 409 : 400;
  return Response.json({ error: message }, { status });
}

class RequestIdentityError extends Error {
  constructor() {
    super("Sign in is required to access school records.");
    this.name = "RequestIdentityError";
  }
}
