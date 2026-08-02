"use client";

import { useState, type ReactNode } from "react";
import { authClient } from "../auth-client";

export function SignOutButton({
  children,
  className,
}: {
  /* The sidebar passes an icon and a label it can hide when collapsed. Callers
     that do not care get the plain wording. */
  children?: ReactNode;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await authClient.signOut({
      fetchOptions: {
        onError() {
          setBusy(false);
        },
        onSuccess() {
          window.location.assign("/");
        },
      },
    });
  }

  return (
    <button
      aria-label={busy ? "Signing out" : "Sign out"}
      className={className}
      disabled={busy}
      onClick={() => void signOut()}
      type="button"
    >
      {children ?? (busy ? "Signing out…" : "Sign out")}
    </button>
  );
}
