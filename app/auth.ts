import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../server/auth-config";
import { ensurePlatformReady } from "../server/platform-ready";
import { safeReturnPath } from "../server/return-path";

export type AuthenticatedUser = {
  displayName: string;
  email: string;
  fullName: string | null;
  id: string;
  /* Whether a second factor is set up on this account. Read from the session
     rather than queried, because the two-factor plugin already puts it on the
     user record and a second lookup per request would buy nothing. */
  twoFactorEnabled: boolean;
};

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  await ensurePlatformReady();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  return {
    displayName: session.user.name || session.user.email,
    email: session.user.email,
    fullName: session.user.name || null,
    id: session.user.id,
    twoFactorEnabled: Boolean(
      (session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled,
    ),
  };
}

export async function requireAuthenticatedUser(
  returnTo: string,
): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();
  if (user) return user;

  redirect(signInPath(returnTo));
}

export function signInPath(returnTo: string): string {
  return `/sign-in?returnTo=${encodeURIComponent(safeReturnPath(returnTo))}`;
}

export function registrationPath(returnTo: string): string {
  return `/sign-in?mode=register&returnTo=${encodeURIComponent(
    safeReturnPath(returnTo),
  )}`;
}
