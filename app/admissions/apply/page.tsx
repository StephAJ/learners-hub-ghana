import Link from "next/link";
import { PublicShell } from "../../components/public/public-shell";
import { requireAuthenticatedUser } from "../../auth";
import { getApplicantApplication } from "../../../db/applicant-repository";
import { ApplicationForm } from "./application-form";
import "../admissions.css";

export const dynamic = "force-dynamic";

export default async function ApplyForAdmissionPage() {
  const user = await requireAuthenticatedUser("/admissions/apply");
  const application = await getApplicantApplication(user);

  return (
    <PublicShell
      headerAside={<Link href="/applicant">My application</Link>}
      wide
    >
      <ApplicationForm
        applicantEmail={user.email}
        initialApplication={application}
      />
    </PublicShell>
  );
}
