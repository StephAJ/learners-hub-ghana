import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "../app/auth";
import {
  resolveAuthenticatedSchoolUser,
  type AuthenticatedSchoolUser,
} from "../db/people-repository";
import type { SchoolRole } from "../domain/identity/types";
import { REQUEST_PATH_HEADER, resolveRequestPath } from "./request-path";
import { twoFactorStanding } from "./two-factor-policy";

export type WorkspaceKind =
  | "admin"
  | "teacher"
  | "student"
  | "guardian";

const workspaceRoles: Record<WorkspaceKind, SchoolRole[]> = {
  admin: ["school-admin", "academic-admin", "admissions-officer"],
  guardian: ["guardian"],
  student: ["learner"],
  teacher: ["teacher", "class-teacher"],
};

const roleWorkspace: Record<SchoolRole, string> = {
  "academic-admin": "/admin",
  "admissions-officer": "/admin",
  "class-teacher": "/teacher",
  guardian: "/guardian",
  learner: "/student",
  "school-admin": "/admin",
  teacher: "/teacher",
};

/**
 * @param fallbackReturnTo Where to come back to after signing in, when the
 * page actually asked for is not known. It usually is — proxy.ts puts it on a
 * header — so this is the section root, used if the proxy did not run.
 */
export async function requireWorkspaceUser(
  workspace: WorkspaceKind,
  fallbackReturnTo: string,
): Promise<AuthenticatedSchoolUser & { twoFactorAsked: boolean }> {
  const identity = await requireAuthenticatedUser(
    await requestedPath(fallbackReturnTo),
  );
  const schoolUser = await resolveAuthenticatedSchoolUser(
    identity,
    workspaceRoles[workspace],
  );

  if (!workspaceRoles[workspace].includes(schoolUser.access.role)) {
    redirect(workspaceHrefForRole(schoolUser.primaryRole));
  }

  /* The school's own requirement, applied where the roles are known. Off
     unless TWO_FACTOR_ENFORCED is set, because enforcing it on a deployment
     whose administrators have not enrolled locks a school out of itself and
     there is no support desk behind this product. */
  const standing = twoFactorStanding({
    enabled: identity.twoFactorEnabled,
    role: schoolUser.access.role,
  });
  if (standing.state === "required") {
    redirect("/account/security");
  }

  return { ...schoolUser, twoFactorAsked: standing.state === "asked" };
}

/**
 * The page the browser actually asked for, so signing in returns to it.
 *
 * A layout cannot learn this on its own, and because a layout renders above
 * the page it wraps, its guard is the one that reaches the sign-in screen
 * first — which is why every deep link used to come back to the workspace
 * root with its query string gone.
 *
 * safeReturnPath() sanitises whatever comes back, so a missing or malformed
 * header costs the section root rather than an open redirect.
 */
async function requestedPath(fallback: string): Promise<string> {
  return resolveRequestPath((await headers()).get(REQUEST_PATH_HEADER), fallback);
}

export function workspaceHrefForRole(role: SchoolRole): string {
  return roleWorkspace[role];
}

export function workspaceLabelForRole(role: SchoolRole): string {
  if (
    role === "school-admin" ||
    role === "academic-admin" ||
    role === "admissions-officer"
  ) {
    return "Administration";
  }
  if (role === "teacher" || role === "class-teacher") {
    return "Teaching";
  }
  if (role === "learner") return "Learning";
  return "Guardian";
}
