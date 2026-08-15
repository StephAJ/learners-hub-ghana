import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import { getPostgresPool } from "../db/postgres";
import {
  RESET_TOKEN_MINUTES,
  sendPasswordResetMail,
  sendVerificationMail,
} from "./mail/account-mail";

const configuredOrigin =
  process.env.BETTER_AUTH_URL ?? process.env.LEARNERS_HUB_ORIGIN;

/* ==========================================================================
   Which origins may sign somebody in

   In production this is exactly the one origin the deployment is configured
   with, and nothing else — a trusted-origin list is a CSRF control, and
   widening it is how a sign-in form on somebody else's domain starts working.

   In development it also accepts any localhost port. The reason is a failure
   worth naming: BETTER_AUTH_URL pins a port, `next dev` moves to another when
   that one is taken, and the only symptom is "invalid origin" on the sign-in
   form — which reads like broken credentials rather than a mismatched config
   line, and sends you looking in the wrong place entirely.

   Guarded on NODE_ENV rather than on a flag of our own, because a production
   build is the thing that must never take this branch and NODE_ENV is what
   Next sets for it.
   ========================================================================== */
function trustedOrigins(): string[] {
  const configured = configuredOrigin ? [configuredOrigin] : [];
  if (process.env.NODE_ENV === "production") {
    return configured.length > 0 ? configured : ["http://localhost:3000"];
  }
  /* Wildcards, which better-auth matches against the request's origin — so
     any port on either loopback name, rather than a list of ports somebody
     has to keep adding to. */
  return [
    ...new Set([
      ...configured,
      "http://localhost:*",
      "http://127.0.0.1:*",
    ]),
  ];
}

/* ==========================================================================
   Signing in

   This was email and password and nothing else — no reset, no verification.
   A teacher or a guardian who forgot their password had no route back into
   the product at all, and the only recovery tool in the project was
   scripts/admin-password.ts, which somebody has to run on the server.

   Both flows send through the school's own mailbox. On a box with no SMTP
   configured, sendMail() logs the message rather than throwing, so a
   deployment without mail still boots and still signs people in — it just
   cannot reset them, which is the honest behaviour rather than a crash.
   ========================================================================== */

export const auth = betterAuth({
  appName: "Learners Hub",
  baseURL: configuredOrigin,
  database: getPostgresPool(),
  emailAndPassword: {
    autoSignIn: true,
    enabled: true,
    maxPasswordLength: 128,
    minPasswordLength: 10,
    resetPasswordTokenExpiresIn: RESET_TOKEN_MINUTES * 60,
    /* Awaited rather than fired and forgotten: this runtime may freeze the
       instance the moment the response is returned, which would cut a
       background send off mid-flight. Matches how admissions mail is sent. */
    sendResetPassword: async ({ url, user }) => {
      await sendPasswordResetMail({
        email: user.email,
        name: user.name ?? "",
        url,
      });
    },
  },
  emailVerification: {
    autoSignInAfterVerification: true,
    /* Not required to sign in. A school hands accounts to families who may
       never open the mail, and locking a parent out of their child's reports
       over an unclicked link would be the wrong trade — the address is
       confirmed because it is worth confirming, not as a gate. */
    sendOnSignUp: true,
    sendVerificationEmail: async ({ url, user }) => {
      await sendVerificationMail({
        email: user.email,
        name: user.name ?? "",
        url,
      });
    },
  },
  /* ==========================================================================
     Two-factor authentication

     The non-functional requirements make MFA mandatory for platform and school
     administrators before rollout, and there was no plugin here at all — a
     password was the whole of the protection on an account that can read every
     child's record in the school.

     Available to everybody rather than forced on administrators by this
     config: enforcement belongs where the school's roles are known, which is
     the application rather than the auth library, and a teacher or a guardian
     who wants it should not be refused. See requireTwoFactorForAdmins() in
     server/two-factor-policy.ts for the part that does the insisting.

     TOTP with backup codes. An authenticator app works on a phone with no
     signal and costs a school nothing, which SMS does neither of.
     ========================================================================== */
  plugins: [
    twoFactor({
      issuer: process.env.SCHOOL_NAME?.trim() || "Learners Hub",
      /* Ten codes, because losing a phone in the middle of a term is the
         ordinary case rather than the exceptional one. */
      backupCodeOptions: { amount: 10, length: 10 },
      /* The code has to be checked before 2FA is switched on. Skipping it
         locks somebody out of their own school with a QR they never scanned
         correctly. */
      skipVerificationOnEnable: false,
    }),
  ],
  rateLimit: {
    enabled: true,
    max: 100,
    window: 60,
  },
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: trustedOrigins(),
  advanced: {
    cookiePrefix: "learners-hub",
    trustedProxyHeaders: true,
  },
});
