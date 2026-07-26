import type { ReactNode } from "react";
import { requireWorkspaceUser } from "../../server/workspace-auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireWorkspaceUser("admin", "/admin");
  return children;
}
