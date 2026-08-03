import { ApplicantAccount } from "../components/public/applicant-account";
import { requireAuthenticatedUser } from "../auth";
import { SignOutButton } from "../components/sign-out-button";
import { getApplicantApplication } from "../../db/applicant-repository";

export const dynamic = "force-dynamic";

export default async function ApplicantHomePage() {
  const user = await requireAuthenticatedUser("/applicant");
  const application = await getApplicantApplication(user);

  return (
    <ApplicantAccount
      application={application}
      displayName={user.displayName}
      email={user.email}
      signOut={<SignOutButton />}
    />
  );
}
