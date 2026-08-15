import Link from "next/link";
import { PublicShell } from "../../components/public/public-shell";
import { requireAuthenticatedUser } from "../../auth";
import { getApplicantApplication } from "../../../db/applicant-repository";
import { loadSchoolProfile } from "../../../db/school-profile-repository";
import { resolveIntakeState } from "../../../db/intake-repository";
import { SCHOOL_TENANT_ID } from "../../../server/school-tenant";
import { ApplicationForm } from "./application-form";
import "../admissions.css";

export const dynamic = "force-dynamic";

export default async function ApplyForAdmissionPage() {
  const user = await requireAuthenticatedUser("/admissions/apply");
  const [application, school, intake] = await Promise.all([
    getApplicantApplication(user),
    loadSchoolProfile(SCHOOL_TENANT_ID),
    resolveIntakeState(SCHOOL_TENANT_ID),
  ]);

  /* The form itself is refused server-side when the intake is shut, rather
     than left to fail on save. Someone who bookmarked this page in July
     should read why they cannot apply, not fill in five steps and be told at
     the end. An application already submitted stays readable from the
     applicant account either way. */
  if (!intake.isOpen) {
    return (
      <PublicShell
        headerAside={<Link href="/applicant">My application</Link>}
        school={school}
      >
        <div className="adm-closed">
          <p className="adm-kicker">{intake.intake?.label ?? "Admissions"}</p>
          <h1>Applications are closed.</h1>
          <p>{intake.closedReason}</p>
          <p>
            <Link className="apply-button apply-button-solid" href="/applicant">
              Back to my account
            </Link>
          </p>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell
      headerAside={<Link href="/applicant">My application</Link>}
      school={school}
      wide
    >
      <ApplicationForm
        applicantEmail={user.email}
        initialApplication={application}
        schoolName={school.name}
      />
    </PublicShell>
  );
}
