import { Landing } from "./components/public/landing";
import { greenfieldProfile } from "../domain/school/public-profile";
import { getAuthenticatedUser, signInPath } from "./auth";

export const dynamic = "force-dynamic";

export default async function PublicHomePage() {
  const user = await getAuthenticatedUser();

  return (
    <Landing
      school={greenfieldProfile}
      signInHref={user ? "/app" : signInPath("/app")}
      signInLabel={user ? "My workspace" : "Sign in"}
    />
  );
}
