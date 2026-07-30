import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../auth";
import { safeReturnPath } from "../../server/return-path";
import { AuthenticationForm } from "./authentication-form";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; returnTo?: string }>;
}) {
  const parameters = await searchParams;
  const returnTo = safeReturnPath(parameters.returnTo);
  const user = await getAuthenticatedUser();
  if (user) redirect(returnTo);

  return (
    <div className="authentication-page">
      <header>
        <Link className="public-brand" href="/">
          <span aria-hidden="true">LH</span>
          <span>
            <strong>Learners Hub</strong>
            <small>Greenfield Academy</small>
          </span>
        </Link>
        <Link href="/">Back to school home</Link>
      </header>
      <main>
        <section>
          <p className="public-kicker">Staff, students, and families</p>
          <h1>Sign in to Learners Hub</h1>
          <p>
            Sign in to your school workspace, or create an account to apply for
            admission.
          </p>
        </section>
        <AuthenticationForm
          initialMode={parameters.mode === "register" ? "register" : "sign-in"}
          returnTo={returnTo}
        />
      </main>
    </div>
  );
}
