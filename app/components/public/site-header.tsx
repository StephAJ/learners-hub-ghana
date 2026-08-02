"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { BrandMark } from "../brand-mark";

type NavItem = { href: string; label: string };

/**
 * The public site header.
 *
 * Client-side for two reasons only: the panel on narrow screens, and the
 * condensed state once the page has scrolled past the hero. Everything else
 * is a plain link, so the header works before the bundle arrives.
 */
export function SiteHeader({
  navigation,
  schoolName,
  signInHref,
  signInLabel,
  strapline,
}: {
  navigation: NavItem[];
  schoolName: string;
  signInHref: string;
  signInLabel: string;
  strapline: string;
}) {
  const [open, setOpen] = useState(false);
  const [condensed, setCondensed] = useState(false);

  useEffect(() => {
    function onScroll() {
      setCondensed(window.scrollY > 24);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* An open panel that scrolls the page behind it reads as a broken overlay,
     and on iOS it is genuinely hard to get back from. */
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className={`site-header${condensed ? " is-condensed" : ""}`}>
      <Link className="site-brand" href="/" onClick={() => setOpen(false)}>
        <BrandMark size={40} />
        <span>
          <strong>{schoolName}</strong>
          <small>{strapline}</small>
        </span>
      </Link>

      <nav aria-label="Primary" className="site-nav">
        {navigation.map((item) => (
          <a href={item.href} key={item.href}>
            {item.label}
          </a>
        ))}
      </nav>

      <div className="site-header-actions">
        <Link className="site-header-signin" href={signInHref}>
          {signInLabel}
        </Link>
        <Link className="site-button site-button-solid" href="/admissions">
          Apply
        </Link>
        <button
          aria-controls="site-mobile-panel"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="site-menu-toggle"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          {open ? (
            <X aria-hidden="true" size={20} />
          ) : (
            <Menu aria-hidden="true" size={20} />
          )}
        </button>
      </div>

      {open ? (
        <div className="site-mobile-panel" id="site-mobile-panel">
          <nav aria-label="Primary, mobile">
            {navigation.map((item) => (
              <a href={item.href} key={item.href} onClick={() => setOpen(false)}>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="site-mobile-panel-actions">
            <Link
              className="site-button site-button-solid"
              href="/admissions"
              onClick={() => setOpen(false)}
            >
              Apply for admission
            </Link>
            <Link
              className="site-button site-button-quiet"
              href={signInHref}
              onClick={() => setOpen(false)}
            >
              {signInLabel}
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
