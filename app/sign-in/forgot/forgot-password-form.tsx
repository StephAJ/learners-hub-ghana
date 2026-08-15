"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { authClient } from "../../auth-client";
import "../auth.css";

/* ==========================================================================
   Asking for a way back in

   The screen says the same thing whether or not the address belongs to
   anybody. That is deliberate and it is the whole security property of this
   page: a form that says "no such account" is a form that will tell anybody
   who asks which of a school's parents have accounts, one address at a time.

   It also says the same thing when the mail could not be sent, because
   sendPasswordResetMail() never throws — a school whose SMTP password has
   expired should have somebody ring the office, not read a stack trace.
   ========================================================================== */

export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: "/sign-in/reset",
    });
    setBusy(false);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="auth-column">
        <header className="auth-heading">
          <h1>Check your email</h1>
          <p>
            If <strong>{email.trim()}</strong> belongs to an account here, a
            link to choose a new password is on its way. It works once and
            expires in an hour.
          </p>
        </header>
        <p className="auth-foot">
          Nothing arrived? Check the spam folder, then ask the school office to
          confirm which address they have for you.{" "}
          <Link href="/sign-in">Back to sign in</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="auth-column">
      <header className="auth-heading">
        <h1>Reset your password</h1>
        <p>
          Type the address the school has for you and we will send a link to
          choose a new password.
        </p>
      </header>

      <form className="auth-form" onSubmit={submit}>
        <label className="auth-field">
          <span className="auth-label">Email address</span>
          <span className="auth-input">
            <Mail aria-hidden="true" size={17} />
            <input
              autoComplete="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
          </span>
        </label>

        <button className="auth-submit" disabled={busy} type="submit">
          {busy ? "Sending…" : "Send the link"}
          {busy ? null : <ArrowRight aria-hidden="true" size={17} />}
        </button>
      </form>

      <p className="auth-foot">
        Remembered it? <Link href="/sign-in">Sign in instead</Link>.
      </p>
    </div>
  );
}
