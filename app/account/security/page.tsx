import { requireAuthenticatedUser } from "../../auth";
import { resolveAuthenticatedSchoolUser } from "../../../db/people-repository";
import { twoFactorExpectedFor } from "../../../server/two-factor-policy";
import { BrandMark } from "../../components/brand-mark";
import { TwoFactorForm } from "./two-factor-form";
import "./security.css";

export const dynamic = "force-dynamic";

/**
 * Account security.
 *
 * Outside the workspace shells on purpose: this is reachable by every role,
 * and putting one copy in each of the four workspaces would be four screens
 * to keep in step. It is also where somebody lands when the school requires a
 * second factor and they have not set one up.
 */
export default async function AccountSecurityPage() {
  const identity = await requireAuthenticatedUser("/account/security");
  /* A person with no school membership — an applicant — still has an account
     worth protecting, so a failure here is "not expected" rather than a
     refusal. */
  const role = await resolveAuthenticatedSchoolUser(identity)
    .then((schoolUser) => schoolUser.access.role)
    .catch(() => null);

  return (
    <main className="security-page">
      <header>
        <BrandMark size={40} />
        <div>
          <p className="eyebrow">Your account</p>
          <h1>Security</h1>
          <p>{identity.email}</p>
        </div>
      </header>

      <TwoFactorForm
        enabled={identity.twoFactorEnabled}
        expected={role ? twoFactorExpectedFor(role) : false}
      />
    </main>
  );
}
