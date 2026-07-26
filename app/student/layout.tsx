import type { ReactNode } from "react";
import { requireWorkspaceUser } from "../../server/workspace-auth";

export const dynamic = "force-dynamic";

export default async function StudentLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireWorkspaceUser("student", "/student");
  return children;
}
