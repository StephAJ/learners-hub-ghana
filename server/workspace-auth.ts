import { redirect } from "next/navigation";
import { requireChatGPTUser } from "../app/chatgpt-auth";
import {
  resolveAuthenticatedSchoolUser,
  type AuthenticatedSchoolUser,
} from "../db/people-repository";
import type { SchoolRole } from "../domain/identity/types";

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

export async function requireWorkspaceUser(
  workspace: WorkspaceKind,
  returnTo: string,
): Promise<AuthenticatedSchoolUser> {
  const identity = await requireChatGPTUser(returnTo);
  const schoolUser = await resolveAuthenticatedSchoolUser(
    identity,
    workspaceRoles[workspace],
  );

  if (!workspaceRoles[workspace].includes(schoolUser.access.role)) {
    redirect(workspaceHrefForRole(schoolUser.primaryRole));
  }

  return schoolUser;
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
