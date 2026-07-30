"use client";

import { useState } from "react";
import { authClient } from "../auth-client";

export function SignOutButton({ className }: { className?: string }) {
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
      className={className}
      disabled={busy}
      onClick={() => void signOut()}
      type="button"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
