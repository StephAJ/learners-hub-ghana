import { loadSchoolProfile } from "../../../db/school-profile-repository";
import { safeReturnPath } from "../../../server/return-path";
import { SCHOOL_TENANT_ID } from "../../../server/school-tenant";
import { SignInCard } from "../sign-in-card";
import { VerifyForm } from "./verify-form";

export const dynamic = "force-dynamic";

/**
 * The second factor, at sign-in.
 *
 * Reached only when the password was right and the account has two-factor on.
 * No session exists yet at this point — better-auth answers the sign-in with
 * a redirect rather than a session — so nothing here may ask who the person
 * is; the pending factor is held in a cookie the verify call reads.
 */
export default async function VerifyTwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const [{ returnTo }, school] = await Promise.all([
    searchParams,
    loadSchoolProfile(SCHOOL_TENANT_ID),
  ]);

  return (
    <SignInCard school={school}>
      <VerifyForm returnTo={safeReturnPath(returnTo)} />
    </SignInCard>
  );
}
