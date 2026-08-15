import { loadSchoolProfile } from "../../../db/school-profile-repository";
import { SCHOOL_TENANT_ID } from "../../../server/school-tenant";
import { SignInCard } from "../sign-in-card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

/**
 * Asking for a password reset link.
 *
 * There was no such page. Better Auth was configured with email and password
 * and nothing else, so a teacher or a guardian who forgot theirs had no route
 * back into the product — the only recovery tool anywhere was a CLI script
 * somebody had to run on the server.
 */
export default async function ForgotPasswordPage() {
  const school = await loadSchoolProfile(SCHOOL_TENANT_ID);

  return (
    <SignInCard school={school}>
      <ForgotPasswordForm />
    </SignInCard>
  );
}
