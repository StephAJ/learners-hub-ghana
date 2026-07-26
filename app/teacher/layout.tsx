import type { ReactNode } from "react";
import { requireWorkspaceUser } from "../../server/workspace-auth";

export const dynamic = "force-dynamic";

export default async function TeacherLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireWorkspaceUser("teacher", "/teacher");
  return children;
}
