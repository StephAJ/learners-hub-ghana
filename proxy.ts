import { NextResponse, type NextRequest } from "next/server";
import { REQUEST_PATH_HEADER } from "./server/request-path";

/* ==========================================================================
   Telling a server component which page was asked for

   Next gives a layout its params and nothing else: there is no way, inside
   `app/teacher/layout.tsx`, to learn that the request was for
   `/teacher/subjects?offeringId=…`. Every workspace layout therefore guarded
   its section with a hardcoded fallback path, and because a layout renders
   above the page it wraps, that fallback is what reached the sign-in screen.

   The effect was that every deep link into the app, followed while signed
   out, came back to the workspace root. A teacher sent a link to a lesson
   signed in and landed on Today; the subject in the query string went with
   it. Sharing a link only works if following it lands where it pointed.

   So the request path is put on a header the layouts can read. Set rather
   than merged, so a value a client sends for itself cannot survive — though
   safeReturnPath() would refuse anything off-origin regardless.
   ========================================================================== */

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(
    REQUEST_PATH_HEADER,
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.next({ request: { headers } });
}

/* Only the signed-in workspaces. The marketing pages, the sign-in screen and
   the API routes have no layout that needs this, and a proxy that runs on
   every request in the product is a cost paid on every request in the
   product. */
export const config = {
  matcher: [
    "/admin/:path*",
    "/app",
    "/applicant/:path*",
    "/guardian/:path*",
    "/learn/:path*",
    "/student/:path*",
    "/teacher/:path*",
  ],
};
