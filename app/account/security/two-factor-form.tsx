"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { authClient } from "../../auth-client";
import "./security.css";

/* ==========================================================================
   Turning on a second factor

   The non-functional requirements make this mandatory for administrators, and
   there was no plugin, no screen and no policy — a password was the whole of
   the protection on an account that can read every child's record in the
   school.

   Three steps, and the third is the one that gets skipped in most
   implementations: the backup codes are shown once, and the screen refuses to
   finish until the person says they have kept them. A head who loses their
   phone in week three of term and has no codes has lost the school its
   administrator, and there is no support desk behind this product.
   ========================================================================== */

type Stage = "codes" | "confirm" | "done" | "start";

export function TwoFactorForm({
  enabled,
  expected,
}: {
  enabled: boolean;
  expected: boolean;
}) {
  const [stage, setStage] = useState<Stage>(enabled ? "done" : "start");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [totpUri, setTotpUri] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [kept, setKept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (result.error) {
      setError(
        result.error.message ??
          "That password was not accepted. Try it again.",
      );
      return;
    }
    setTotpUri(result.data?.totpURI ?? "");
    setBackupCodes(result.data?.backupCodes ?? []);
    setStage("codes");
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (result.error) {
      setError(
        result.error.message ??
          "That code was not right. Check your app and try the current one.",
      );
      return;
    }
    setStage("done");
  }

  async function turnOff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "That password was not accepted.");
      return;
    }
    setStage("start");
    setPassword("");
  }

  if (stage === "done") {
    return (
      <section className="security-panel">
        <p className="security-state is-on">Two-factor is on</p>
        <p>
          Signing in on a new device will ask for a code from your
          authenticator app as well as your password.
        </p>

        <form className="security-form" onSubmit={turnOff}>
          <h2>Turn it off</h2>
          <p className="form-hint">
            {expected
              ? "Your role is one the school expects to protect with a second factor. Turning it off will be noticed."
              : "You can turn it back on at any time."}
          </p>
          {error ? (
            <p className="security-alert" role="alert">
              {error}
            </p>
          ) : null}
          <label>
            <span>Your password</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button disabled={busy} type="submit">
            {busy ? "Working…" : "Turn off two-factor"}
          </button>
        </form>
      </section>
    );
  }

  if (stage === "codes") {
    return (
      <section className="security-panel">
        <h2>Scan this with your authenticator app</h2>
        <p>
          Google Authenticator, Authy, or whichever your phone already has.
          Paste the key below if the app cannot scan.
        </p>
        <p className="security-key">{secretFrom(totpUri)}</p>

        <h2>Keep these backup codes</h2>
        <p>
          Each one signs you in once if you lose your phone. This is the only
          time they are shown.
        </p>
        <ul className="security-codes">
          {backupCodes.map((backup) => (
            <li key={backup}>{backup}</li>
          ))}
        </ul>

        <label className="security-kept">
          <input
            checked={kept}
            onChange={(event) => setKept(event.target.checked)}
            type="checkbox"
          />
          <span>
            I have written these down or saved them somewhere that is not this
            phone.
          </span>
        </label>

        <button
          disabled={!kept}
          onClick={() => setStage("confirm")}
          type="button"
        >
          Continue
        </button>
      </section>
    );
  }

  if (stage === "confirm") {
    return (
      <section className="security-panel">
        <form className="security-form" onSubmit={confirm}>
          <h2>Enter the code from your app</h2>
          <p className="form-hint">
            Six digits. This proves the app is set up before two-factor is
            switched on, so a wrong scan cannot lock you out.
          </p>
          {error ? (
            <p className="security-alert" role="alert">
              {error}
            </p>
          ) : null}
          <label>
            <span>Code</span>
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setCode(event.target.value)}
              required
              value={code}
            />
          </label>
          <button disabled={busy} type="submit">
            {busy ? "Checking…" : "Turn on two-factor"}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="security-panel">
      {expected ? (
        <p className="security-state is-asked">
          Your role is one the school protects with a second factor
        </p>
      ) : null}
      <form className="security-form" onSubmit={begin}>
        <h2>Turn on two-factor</h2>
        <p className="form-hint">
          You will need an authenticator app on your phone. It works with no
          signal and costs nothing.
        </p>
        {error ? (
          <p className="security-alert" role="alert">
            {error}
          </p>
        ) : null}
        <label>
          <span>Your password</span>
          <input
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        <button disabled={busy} type="submit">
          {busy ? "Working…" : "Begin"}
        </button>
      </form>
      <p className="form-hint">
        <Link href="/app">Back to your workspace</Link>
      </p>
    </section>
  );
}

/**
 * The shared secret out of the otpauth:// URI.
 *
 * Shown as text rather than only as a QR code: this product is built for
 * entry-level Android on a poor connection, and a person setting 2FA up on
 * the same phone they are reading this on cannot scan their own screen.
 */
function secretFrom(uri: string): string {
  try {
    return new URL(uri).searchParams.get("secret") ?? uri;
  } catch {
    return uri;
  }
}
