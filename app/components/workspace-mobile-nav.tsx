"use client";

import Link from "next/link";
import type { SidebarNavItem } from "./workspace-sidebar";
import { useOfferingParam } from "./offering-param";
import { withOffering } from "./offering-links";

/* The phone's bottom bar. A client component only so the chosen subject can
   follow a teacher through it the same way it follows them through the
   sidebar — see offering-param.ts. */
export function WorkspaceMobileNav({
  activeHref,
  items,
}: {
  activeHref: string;
  items: SidebarNavItem[];
}) {
  const { offeringId } = useOfferingParam();

  return (
    <nav className="workspace-mobile-nav" aria-label="Mobile hub navigation">
      {items.slice(0, 5).map((item) => (
        <Link
          aria-current={item.href === activeHref ? "page" : undefined}
          className={item.href === activeHref ? "is-active" : undefined}
          href={withOffering(item.href, offeringId)}
          key={item.href}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
