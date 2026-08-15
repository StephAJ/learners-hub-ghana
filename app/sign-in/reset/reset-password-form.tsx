"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, Lock } from "lucide-react";
import { authClient } from "../../auth-client";
import "../auth.css";

/* ==========================================================================
   Choosing a new password

   Two fields rather than one. A password nobody can see, typed once, on the
   screen somebody reaches because they have already forgotten it once, is a
   lockout waiting to happen — and the reveal control is there for the same
   reason.

   The minimum matches the one Better Auth enforces on the server. A form that
   accepts eight characters and then reports a server error is a form that
   knew and did not say.
   ========================================================================== */

const MINIMUM = 10;

export function ResetPasswordForm({
  expired,
  token,
}: {
  expired: boolean;
  token: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [revealed, setRevealed] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) {
      setError("Those two do not match. Type the same one twice.");
      return;
    }
    setBusy(true);
    setError("");

    const result = await authClient.resetPassword({
      newPassword: password,
      token,
    });

    if (result.error) {
      setError(
        result.error.message ??
          "That link could not be used. Ask for a new one.",
      );
      setBusy(false);
      return;
    }
    router.push("/sign-in?reset=done");
  }

  /* A link that has expired or been used already. Said plainly, with the way
     forward, rather than left as a form that will fail on submit. */
  if (expired || !token) {
    return (
      <div className="auth-column">
        <header className="auth-heading">
          <h1>That link has expired</h1>
          <p>
            A reset link works once and lasts an hour. Ask for a fresh one and
            it will arrive in a moment.
          </p>
        </header>
        <p className="auth-foot">
          <Link href="/sign-in/forgot">Send me a new link</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="auth-column">
      <header className="auth-heading">
        <h1>Choose a new password</h1>
        <p>
          Use at least {MINIMUM} characters. A short phrase you will remember
          beats a short password you will not.
        </p>
      </header>

      <form className="auth-form" onSubmit={submit}>
        {error ? (
          <p className="auth-alert" role="alert">
            {error}
          </p>
        ) : null}

        <label className="auth-field">
          <span className="auth-label">New password</span>
          <span className="auth-input">
            <Lock aria-hidden="true" size={17} />
            <input
              autoComplete="new-password"
              minLength={MINIMUM}
              onChange={(event) => setPassword(event.target.value)}
              required
              type={revealed ? "text" : "password"}
              value={password}
            />
            <button
              aria-label={revealed ? "Hide password" : "Show password"}
              aria-pressed={revealed}
              className="auth-reveal"
              onClick={() => setRevealed((current) => !current)}
              type="button"
            >
              {revealed ? (
                <EyeOff aria-hidden="true" size={17} />
              ) : (
                <Eye aria-hidden="true" size={17} />
              )}
            </button>
          </span>
        </label>

        <label className="auth-field">
          <span className="auth-label">Type it again</span>
          <span className="auth-input">
            <Lock aria-hidden="true" size={17} />
            <input
              autoComplete="new-password"
              minLength={MINIMUM}
              onChange={(event) => setConfirmation(event.target.value)}
              required
              type={revealed ? "text" : "password"}
              value={confirmation}
            />
          </span>
        </label>

        <button className="auth-submit" disabled={busy} type="submit">
          {busy ? "Saving…" : "Save and sign in"}
          {busy ? null : <ArrowRight aria-hidden="true" size={17} />}
        </button>
      </form>
    </div>
  );
}
