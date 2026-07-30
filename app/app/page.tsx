import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "../auth";
import { resolveAuthenticatedSchoolUser } from "../../db/people-repository";
import { AuthorizationError } from "../../domain/identity/authorization";
import { workspaceHrefForRole } from "../../server/workspace-auth";

export const dynamic = "force-dynamic";

export default async function WorkspaceResolverPage() {
  const identity = await requireAuthenticatedUser("/app");
  try {
    const schoolUser = await resolveAuthenticatedSchoolUser(identity);
    redirect(workspaceHrefForRole(schoolUser.primaryRole));
  } catch (error) {
    if (error instanceof AuthorizationError) redirect("/applicant");
    throw error;
  }
}
