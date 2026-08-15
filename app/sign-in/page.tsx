import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../auth";
import { safeReturnPath } from "../../server/return-path";
import { loadSchoolProfile } from "../../db/school-profile-repository";
import { SCHOOL_TENANT_ID } from "../../server/school-tenant";
import { SignInCard } from "./sign-in-card";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; reset?: string; returnTo?: string }>;
}) {
  const parameters = await searchParams;
  const returnTo = safeReturnPath(parameters.returnTo);
  const user = await getAuthenticatedUser();
  if (user) redirect(returnTo);

  const school = await loadSchoolProfile(SCHOOL_TENANT_ID);

  return (
    <SignInCard
      initialMode={parameters.mode === "register" ? "register" : "sign-in"}
      passwordReset={parameters.reset === "done"}
      returnTo={returnTo}
      school={school}
    />
  );
}
