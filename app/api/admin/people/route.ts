import { getChatGPTUser } from "../../../chatgpt-auth";
import {
  inviteDirectoryPerson,
  listDirectoryPeople,
  resolveAuthenticatedSchoolUser,
  type InvitePersonInput,
} from "../../../../db/people-repository";
import { AuthorizationError } from "../../../../domain/identity/authorization";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireRequestUser();
    const schoolUser = await resolveAuthenticatedSchoolUser(user);
    const people = await listDirectoryPeople(schoolUser.access);

    return Response.json({
      actor: {
        email: schoolUser.email,
        name: schoolUser.name,
        role: schoolUser.access.role,
      },
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
    const input = (await request.json()) as InvitePersonInput;
    const person = await inviteDirectoryPerson(schoolUser.access, input);

    return Response.json({ person }, { status: 201 });
  } catch (error) {
    return directoryErrorResponse(error);
  }
}

async function requireRequestUser() {
  const user = await getChatGPTUser();
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
