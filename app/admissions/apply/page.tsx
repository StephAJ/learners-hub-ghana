import Link from "next/link";
import { BrandMark } from "../../components/brand-mark";
import { requireAuthenticatedUser } from "../../auth";
import { getApplicantApplication } from "../../../db/applicant-repository";
import { ApplicationForm } from "./application-form";

export const dynamic = "force-dynamic";

export default async function ApplyForAdmissionPage() {
  const user = await requireAuthenticatedUser("/admissions/apply");
  const application = await getApplicantApplication(user);

  return (
    <div className="application-page">
      <header className="application-header">
        <Link className="public-brand" href="/">
          <BrandMark size={42} />
          <span>
            <strong>Learners Hub</strong>
            <small>Greenfield Academy Admissions</small>
          </span>
        </Link>
        <Link href="/applicant">Applicant workspace</Link>
      </header>
      <main>
        <ApplicationForm
          applicantEmail={user.email}
          initialApplication={application}
        />
      </main>
    </div>
  );
}
