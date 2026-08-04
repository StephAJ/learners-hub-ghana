import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "../brand-mark";
import type { SchoolProfile } from "../../../domain/school/public-profile";

/**
 * The frame around every public page that is not the home page.
 *
 * The home page carries a full navigation because it is somewhere to browse;
 * admissions and the applicant account are somewhere to do one thing, so this
 * gives them the same header treatment and the same footer without the menu
 * that would invite people out of the form they came to fill in.
 */
export function PublicShell({
  children,
  /** Shown on the right of the header — a name, a sign-out, whatever fits. */
  headerAside,
  school,
  wide = false,
}: {
  children: ReactNode;
  headerAside?: ReactNode;
  /* Handed in rather than imported. Every public page is already a server
     component that loads it, and a shell that reached for a constant would
     put the wrong school's name above the right school's page. */
  school: SchoolProfile;
  wide?: boolean;
}) {

  return (
    <div className="pub">
      <header className="pub-header">
        <Link className="pub-brand" href="/">
          <BrandMark size={38} />
          <span>
            <strong>{school.name}</strong>
            <small>{school.location}</small>
          </span>
        </Link>
        <div className="pub-header-aside">{headerAside}</div>
      </header>

      <main className={wide ? "pub-main is-wide" : "pub-main"}>{children}</main>

      <footer className="pub-footer">
        <div>
          <strong>{school.name}</strong>
          <span>{school.contact.address.join(", ")}</span>
        </div>
        <div className="pub-footer-links">
          <a href={`tel:${school.contact.telephone.replace(/\s/g, "")}`}>
            {school.contact.telephone}
          </a>
          <a href={`mailto:${school.contact.email}`}>{school.contact.email}</a>
          <Link href="/">School home</Link>
        </div>
      </footer>
    </div>
  );
}
