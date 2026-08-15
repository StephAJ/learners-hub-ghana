"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import gsap from "gsap";
import { authClient } from "../auth-client";

type Mode = "register" | "sign-in";

export function AuthenticationForm({
  initialMode,
  passwordReset,
  returnTo,
}: {
  initialMode: Mode;
  /* Set when somebody has just been through the reset flow, so the screen
     they land on says it worked rather than looking like an ordinary visit. */
  passwordReset?: boolean;
  returnTo: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState(false);

  const columnRef = useRef<HTMLDivElement>(null);

  /* Entrance. Runs once on mount rather than on every mode switch, so
     toggling between sign-in and register does not replay the whole panel. */
  useEffect(() => {
    const root = columnRef.current;
    if (!root) return;

    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(
        root.querySelectorAll("[data-auth-line]"),
        { autoAlpha: 0, y: 16 },
        {
          autoAlpha: 1,
          duration: 0.55,
          ease: "power3.out",
          stagger: 0.06,
          y: 0,
        },
      );
    });
    return () => media.revert();
  }, []);

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

    /* An account with a second factor does not sign in here — better-auth
       answers with twoFactorRedirect and the code is asked for on its own
       screen. Without this the form reports success and nothing happens. */
    if (
      !result.error &&
      (result.data as { twoFactorRedirect?: boolean } | undefined)
        ?.twoFactorRedirect
    ) {
      setBusy(false);
      router.push(
        `/sign-in/verify?returnTo=${encodeURIComponent(returnTo)}`,
      );
      return;
    }

    if (result.error) {
      setError(result.error.message ?? "Authentication failed.");
      setBusy(false);
      /* A shake is the fastest way to say "look again at what you typed"
         without moving focus away from the field they are already in. */
      const root = columnRef.current;
      if (root && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.fromTo(
          root.querySelector(".auth-alert"),
          { x: -6 },
          { clearProps: "x", duration: 0.4, ease: "elastic.out(1, 0.4)", x: 0 },
        );
      }
      return;
    }

    window.location.assign(returnTo);
  }

  function switchMode() {
    setMode((current) => (current === "sign-in" ? "register" : "sign-in"));
    setError("");
    setRevealed(false);
  }

  const registering = mode === "register";

  return (
    <div className="auth-column" ref={columnRef}>
      <header className="auth-heading" data-auth-line>
        <h1>{registering ? "Create your account" : "Welcome back"}</h1>
        <p>
          {registering
            ? "One account for the whole family. Save your application and come back to it whenever you like."
            : "Sign in to your school hub. Students, teachers, families and staff all start here."}
        </p>
      </header>

      <form className="auth-form" noValidate={false} onSubmit={submit}>
        {passwordReset && !error ? (
          <p className="auth-done" role="status">
            Your password has been changed. Sign in with the new one.
          </p>
        ) : null}
        {error ? (
          <p className="auth-alert" role="alert">
            {error}
          </p>
        ) : null}

        {registering ? (
          <label className="auth-field" data-auth-line>
            <span className="auth-label">Full name</span>
            <span className="auth-input">
              <User aria-hidden="true" size={17} />
              <input
                autoComplete="name"
                name="name"
                placeholder="Ama Boateng"
                required
                type="text"
              />
            </span>
          </label>
        ) : null}

        <label className="auth-field" data-auth-line>
          <span className="auth-label">Email address</span>
          <span className="auth-input">
            <Mail aria-hidden="true" size={17} />
            <input
              autoComplete="email"
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
          </span>
        </label>

        <label className="auth-field" data-auth-line>
          <span className="auth-label">Password</span>
          <span className="auth-input">
            <Lock aria-hidden="true" size={17} />
            <input
              autoComplete={registering ? "new-password" : "current-password"}
              minLength={registering ? 10 : undefined}
              name="password"
              placeholder={registering ? "At least 10 characters" : "Your password"}
              required
              type={revealed ? "text" : "password"}
            />
            {/* aria-pressed rather than a label swap: the control is the same
                control either way, and its state is what changed. */}
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
          {registering ? (
            <small className="auth-hint">
              Use at least 10 characters. A short phrase you will remember beats
              a short password you will not.
            </small>
          ) : null}
        </label>

        <button className="auth-submit" data-auth-line disabled={busy} type="submit">
          {busy ? "Please wait…" : registering ? "Create account" : "Sign in"}
          {busy ? null : <ArrowRight aria-hidden="true" size={17} />}
        </button>

        {/* There was no way back into an account at all. A teacher or a
            guardian who forgot their password had one recovery route: a CLI
            script somebody had to run on the server. */}
        {registering ? null : (
          <p className="auth-forgot" data-auth-line>
            <Link href="/sign-in/forgot">Forgotten your password?</Link>
          </p>
        )}
      </form>

      <div className="auth-switch" data-auth-line>
        <p>
          {registering ? "Already have an account?" : "Applying for admission?"}
        </p>
        <button onClick={switchMode} type="button">
          {registering ? "Sign in instead" : "Create an applicant account"}
        </button>
      </div>

      <p className="auth-foot" data-auth-line>
        Trouble signing in? Ask the school office to check your email address, or{" "}
        <Link href="/">go back to the school home page</Link>.
      </p>
    </div>
  );
}
