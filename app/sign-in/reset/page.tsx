import { loadSchoolProfile } from "../../../db/school-profile-repository";
import { SCHOOL_TENANT_ID } from "../../../server/school-tenant";
import { SignInCard } from "../sign-in-card";
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";

/**
 * Choosing a new password, from the link in the email.
 *
 * The token arrives as a query parameter. It is not read here: it is handed
 * to the form, which passes it back to Better Auth, so nothing about it is
 * rendered into the page or logged on the way through.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; token?: string }>;
}) {
  const [{ error, token }, school] = await Promise.all([
    searchParams,
    loadSchoolProfile(SCHOOL_TENANT_ID),
  ]);

  return (
    <SignInCard school={school}>
      <ResetPasswordForm expired={Boolean(error)} token={token ?? ""} />
    </SignInCard>
  );
}
