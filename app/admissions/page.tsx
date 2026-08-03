import { AdmissionsInfo } from "../components/public/admissions-info";
import { getAuthenticatedUser } from "../auth";

export const dynamic = "force-dynamic";

export default async function PublicAdmissionsPage() {
  const user = await getAuthenticatedUser();
  return <AdmissionsInfo signedIn={Boolean(user)} />;
}
