import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../auth";
import { safeReturnPath } from "../../server/return-path";
import { greenfieldProfile } from "../../domain/school/public-profile";
import { SignInCard } from "./sign-in-card";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; returnTo?: string }>;
}) {
  const parameters = await searchParams;
  const returnTo = safeReturnPath(parameters.returnTo);
  const user = await getAuthenticatedUser();
  if (user) redirect(returnTo);

  return (
    <SignInCard
      initialMode={parameters.mode === "register" ? "register" : "sign-in"}
      returnTo={returnTo}
      school={greenfieldProfile}
    />
  );
}
