import { Landing } from "./components/public/landing";
import { loadSchoolProfile } from "../db/school-profile-repository";
import { resolveIntakeState } from "../db/intake-repository";
import { SCHOOL_TENANT_ID } from "../server/school-tenant";
import { getAuthenticatedUser, signInPath } from "./auth";

export const dynamic = "force-dynamic";

export default async function PublicHomePage() {
  const [user, school, intake] = await Promise.all([
    getAuthenticatedUser(),
    loadSchoolProfile(SCHOOL_TENANT_ID),
    resolveIntakeState(SCHOOL_TENANT_ID),
  ]);

  return (
    <Landing
      intake={intake}
      school={school}
      signInHref={user ? "/app" : signInPath("/app")}
      signInLabel={user ? "My hub" : "Sign in"}
    />
  );
}
