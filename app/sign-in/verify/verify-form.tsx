"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, Lock } from "lucide-react";
import { authClient } from "../../auth-client";
import "../auth.css";

/* ==========================================================================
   The second factor, at sign-in

   Reached only when the password was right and the account has two-factor on
   — better-auth answers the sign-in with twoFactorRedirect rather than a
   session, and this is where that goes.

   The backup-code route is on the same screen rather than behind a link. The
   person who needs it is standing somewhere without their phone, and making
   them hunt for it is the moment a school gives up on two-factor.
   ========================================================================== */

export function VerifyForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [usingBackup, setUsingBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const result = usingBackup
      ? await authClient.twoFactor.verifyBackupCode({ code: code.trim() })
      : await authClient.twoFactor.verifyTotp({ code: code.trim() });

    if (result.error) {
      setError(
        result.error.message ??
          (usingBackup
            ? "That backup code was not recognised, or has been used already."
            : "That code was not right. Codes change every thirty seconds."),
      );
      setBusy(false);
      return;
    }
    router.push(returnTo);
  }

  return (
    <div className="auth-column">
      <header className="auth-heading">
        <h1>One more step</h1>
        <p>
          {usingBackup
            ? "Type one of the backup codes you saved when you turned two-factor on. Each works once."
            : "Open your authenticator app and type the six-digit code for this school."}
        </p>
      </header>

      <form className="auth-form" onSubmit={submit}>
        {error ? (
          <p className="auth-alert" role="alert">
            {error}
          </p>
        ) : null}

        <label className="auth-field">
          <span className="auth-label">
            {usingBackup ? "Backup code" : "Six-digit code"}
          </span>
          <span className="auth-input">
            <Lock aria-hidden="true" size={17} />
            <input
              autoComplete="one-time-code"
              autoFocus
              inputMode={usingBackup ? "text" : "numeric"}
              onChange={(event) => setCode(event.target.value)}
              required
              value={code}
            />
          </span>
        </label>

        <button className="auth-submit" disabled={busy} type="submit">
          {busy ? "Checking…" : "Sign in"}
          {busy ? null : <ArrowRight aria-hidden="true" size={17} />}
        </button>
      </form>

      <div className="auth-switch">
        <p>{usingBackup ? "Have your phone after all?" : "Lost your phone?"}</p>
        <button
          onClick={() => {
            setUsingBackup((current) => !current);
            setCode("");
            setError("");
          }}
          type="button"
        >
          {usingBackup ? "Use the app instead" : "Use a backup code"}
        </button>
      </div>

      <p className="auth-foot">
        Out of backup codes too? The school office can remove two-factor from
        your account. <Link href="/sign-in">Start again</Link>.
      </p>
    </div>
  );
}
