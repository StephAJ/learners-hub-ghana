import { ApplicantAccount } from "../components/public/applicant-account";
import { requireAuthenticatedUser } from "../auth";
import { SignOutButton } from "../components/sign-out-button";
import { getApplicantApplication } from "../../db/applicant-repository";
import { loadSchoolProfile } from "../../db/school-profile-repository";
import { resolveIntakeState } from "../../db/intake-repository";
import { SCHOOL_TENANT_ID } from "../../server/school-tenant";
import { referencePrefix } from "../../server/mail/admissions-mail";

export const dynamic = "force-dynamic";

export default async function ApplicantHomePage() {
  const user = await requireAuthenticatedUser("/applicant");
  const [application, school, intake, prefix] = await Promise.all([
    getApplicantApplication(user),
    loadSchoolProfile(SCHOOL_TENANT_ID),
    resolveIntakeState(SCHOOL_TENANT_ID),
    referencePrefix(),
  ]);

  return (
    <ApplicantAccount
      application={application}
      displayName={user.displayName}
      email={user.email}
      intake={intake}
      referencePrefix={prefix}
      school={school}
      signOut={<SignOutButton />}
    />
  );
}
