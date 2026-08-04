import { AdmissionsInfo } from "../components/public/admissions-info";
import { loadSchoolProfile } from "../../db/school-profile-repository";
import { resolveIntakeState } from "../../db/intake-repository";
import { SCHOOL_TENANT_ID } from "../../server/school-tenant";
import { getAuthenticatedUser } from "../auth";

export const dynamic = "force-dynamic";

export default async function PublicAdmissionsPage() {
  const [user, school, intake] = await Promise.all([
    getAuthenticatedUser(),
    loadSchoolProfile(SCHOOL_TENANT_ID),
    resolveIntakeState(SCHOOL_TENANT_ID),
  ]);

  return (
    <AdmissionsInfo
      intake={intake}
      school={school}
      signedIn={Boolean(user)}
    />
  );
}
