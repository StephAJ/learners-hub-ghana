"use client";

import Link from "next/link";
import { useEffect } from "react";
import "./error-page.css";

/* ==========================================================================
   Route error boundary

   Without this file a thrown server error renders the framework's bare "This
   page couldn't load", which tells whoever is looking at it nothing at all —
   not which page, not what failed, not whether it is worth retrying. A school
   administrator hitting that on /admin/admissions has no way to describe the
   problem to anyone who could fix it.

   The message itself is deliberately not printed. Next.js already redacts
   server error text in production, and the digest is what actually correlates
   a report to a line in the container log.
   ========================================================================== */

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error", error);
  }, [error]);

  return (
    <div className="error-page">
      <div className="error-card">
        <p className="error-eyebrow">Something went wrong</p>
        <h1>This page could not be loaded.</h1>
        <p className="error-body">
          The problem is on our side, not yours. Trying again often works; if it
          does not, the reference below tells the school&rsquo;s technical
          contact exactly which failure to look for.
        </p>

        {error.digest ? (
          <p className="error-digest">
            Reference <code>{error.digest}</code>
          </p>
        ) : null}

        <div className="error-actions">
          <button className="error-button" onClick={reset} type="button">
            Try again
          </button>
          <Link className="error-button error-button-quiet" href="/app">
            Back to my hub
          </Link>
        </div>
      </div>
    </div>
  );
}
