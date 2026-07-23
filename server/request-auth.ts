import { getChatGPTUser } from "../app/chatgpt-auth";
import {
  resolveAuthenticatedSchoolUser,
  type AuthenticatedSchoolUser,
} from "../db/people-repository";
import { AuthorizationError } from "../domain/identity/authorization";
import { LessonPolicyError } from "../domain/learning/lessons";
import { AssessmentPolicyError } from "../domain/assessment/assessment";
import { ReportingPolicyError } from "../domain/reporting/gradebook";

export async function requireSchoolRequestUser(): Promise<AuthenticatedSchoolUser> {
  const user = await getChatGPTUser();
  if (!user) {
    throw new RequestIdentityError();
  }
  return resolveAuthenticatedSchoolUser(user);
}

export function schoolApiErrorResponse(error: unknown) {
  if (error instanceof RequestIdentityError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof AuthorizationError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof LessonPolicyError) {
    return Response.json({ error: error.message }, { status: 422 });
  }
  if (error instanceof AssessmentPolicyError) {
    return Response.json({ error: error.message }, { status: 422 });
  }
  if (error instanceof ReportingPolicyError) {
    return Response.json({ error: error.message }, { status: 422 });
  }
  const message =
    error instanceof Error ? error.message : "Unable to complete the request.";
  const status = message.includes("UNIQUE constraint failed") ? 409 : 400;
  return Response.json({ error: message }, { status });
}

class RequestIdentityError extends Error {
  constructor() {
    super("Sign in is required to access school records.");
    this.name = "RequestIdentityError";
  }
}
