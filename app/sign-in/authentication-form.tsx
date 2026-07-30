"use client";

import { FormEvent, useState } from "react";
import { authClient } from "../auth-client";

type Mode = "register" | "sign-in";

export function AuthenticationForm({
  initialMode,
  returnTo,
}: {
  initialMode: Mode;
  returnTo: string;
}) {
  const [mode, setMode] = useState(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();

    const result =
      mode === "register"
        ? await authClient.signUp.email({
            callbackURL: returnTo,
            email,
            name,
            password,
          })
        : await authClient.signIn.email({
            callbackURL: returnTo,
            email,
            password,
          });

    if (result.error) {
      setError(result.error.message ?? "Authentication failed.");
      setBusy(false);
      return;
    }

    window.location.assign(returnTo);
  }

  function switchMode() {
    setMode((current) => (current === "sign-in" ? "register" : "sign-in"));
    setError("");
  }

  return (
    <form className="authentication-form" onSubmit={submit}>
      <header>
        <h2>{mode === "sign-in" ? "Sign in" : "Create applicant account"}</h2>
        <p>
          {mode === "sign-in"
            ? "Use the email and password attached to your account."
            : "Create an account so you can save and return to your application."}
        </p>
      </header>

      {error ? <p className="authentication-error" role="alert">{error}</p> : null}

      {mode === "register" ? (
        <label>
          <span>Full name</span>
          <input autoComplete="name" name="name" required type="text" />
        </label>
      ) : null}
      <label>
        <span>Email address</span>
        <input autoComplete="email" name="email" required type="email" />
      </label>
      <label>
        <span>Password</span>
        <input
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          minLength={10}
          name="password"
          required
          type="password"
        />
        {mode === "register" ? <small>Use at least 10 characters.</small> : null}
      </label>
      <button className="public-primary-action" disabled={busy} type="submit">
        {busy
          ? "Please wait…"
          : mode === "sign-in"
            ? "Sign in"
            : "Create account"}
      </button>
      <button className="authentication-switch" onClick={switchMode} type="button">
        {mode === "sign-in"
          ? "Applying for admission? Create an account"
          : "Already have an account? Sign in"}
      </button>
    </form>
  );
}
