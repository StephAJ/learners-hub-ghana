import { redirect } from "next/navigation";
import { requireChatGPTUser } from "../chatgpt-auth";
import { resolveAuthenticatedSchoolUser } from "../../db/people-repository";
import { workspaceHrefForRole } from "../../server/workspace-auth";

export const dynamic = "force-dynamic";

export default async function WorkspaceResolverPage() {
  const identity = await requireChatGPTUser("/app");
  const schoolUser = await resolveAuthenticatedSchoolUser(identity);
  redirect(workspaceHrefForRole(schoolUser.primaryRole));
}
