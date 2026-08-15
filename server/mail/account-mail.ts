import { loadSchoolProfile } from "../../db/school-profile-repository";
import { SCHOOL_TENANT_ID } from "../school-tenant";
import {
  passwordResetEmail,
  verifyEmailAddressEmail,
  type SchoolContext,
} from "./templates";
import { sendMail } from "./transport";

/* ==========================================================================
   Mail about an account rather than about a child

   There was no password reset in the product. Better Auth was configured with
   email and password and nothing else, so a teacher or a guardian who forgot
   theirs had no route back in — and the only recovery tool anywhere was a CLI
   script somebody had to run on the server, which is not a thing a school
   secretary can do on a Tuesday morning.

   Addressed from the school rather than from us, for the same reason
   admissions mail is: the person receiving it has a relationship with their
   child's school, not with a platform.
   ========================================================================== */

/** How long a reset link stays usable. Also what the email promises. */
export const RESET_TOKEN_MINUTES = 60;

async function schoolContext(): Promise<SchoolContext> {
  const school = await loadSchoolProfile(SCHOOL_TENANT_ID);
  return {
    origin:
      process.env.BETTER_AUTH_URL?.trim() ||
      process.env.LEARNERS_HUB_ORIGIN?.trim() ||
      "http://localhost:3000",
    schoolEmail: school.contact.email,
    schoolName: school.name,
    schoolPhone: school.contact.telephone,
  };
}

/**
 * Sends the link that lets somebody choose a new password.
 *
 * Never throws. A mail outage must not turn a reset request into a stack
 * trace on the sign-in screen — the person is already having a bad time — so
 * the failure is logged and the screen says the same thing either way, which
 * is also what stops this becoming a way to find out which addresses exist.
 */
export async function sendPasswordResetMail(input: {
  email: string;
  name: string;
  url: string;
}): Promise<void> {
  try {
    const school = await schoolContext();
    const message = passwordResetEmail({
      name: input.name,
      school,
      url: input.url,
      validForMinutes: RESET_TOKEN_MINUTES,
    });
    await sendMail({ ...message, to: input.email });
  } catch (error) {
    console.error("[mail] password reset could not be sent", error);
  }
}

export async function sendVerificationMail(input: {
  email: string;
  name: string;
  url: string;
}): Promise<void> {
  try {
    const school = await schoolContext();
    const message = verifyEmailAddressEmail({
      name: input.name,
      school,
      url: input.url,
    });
    await sendMail({ ...message, to: input.email });
  } catch (error) {
    console.error("[mail] verification could not be sent", error);
  }
}
