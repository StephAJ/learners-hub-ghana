import type { ReactNode } from "react";
import { requireWorkspaceUser } from "../../server/workspace-auth";

export const dynamic = "force-dynamic";

export default async function GuardianLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireWorkspaceUser("guardian", "/guardian");
  return children;
}
