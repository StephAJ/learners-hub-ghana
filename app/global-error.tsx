"use client";

import { useEffect } from "react";
import "./globals.css";
import "./error-page.css";

/* ==========================================================================
   Root error boundary

   Catches what app/error.tsx cannot: a failure in the root layout itself.
   This boundary replaces the layout, so it has to render its own <html> and
   <body> — which is also why it imports globals.css directly rather than
   relying on the layout to have done it.

   No workspace link here. If the root layout could not render, there is no
   reason to believe another route will either, so the only offer is a retry.
   ========================================================================== */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root error", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="error-page">
          <div className="error-card">
            <p className="error-eyebrow">Learners Hub</p>
            <h1>The app could not start.</h1>
            <p className="error-body">
              Something failed before any page could be drawn. This is being
              logged on the server; trying again is worth one attempt before
              reporting the reference below.
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
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
