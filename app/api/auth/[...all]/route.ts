import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "../../../../server/auth-config";
import { ensurePlatformReady } from "../../../../server/platform-ready";

const handler = toNextJsHandler(auth);

export async function GET(request: Request) {
  await ensurePlatformReady();
  return handler.GET(request);
}

export async function POST(request: Request) {
  await ensurePlatformReady();
  return handler.POST(dedupeOriginHeader(request));
}

/* The OpenLiteSpeed reverse proxy in front of this deployment delivers a
   doubled Origin header on every proxied HTTPS request (e.g.
   "https://learn.stephenarthur.org, https://learn.stephenarthur.org"). Better
   Auth's origin check parses that value with `new URL()`, which throws on the
   comma-joined string, so every cookie-bearing request fails CSRF validation
   and every sign-in appears as "invalid credentials". Collapsing duplicate
   Origin/Referer values here keeps the fix contained to this app instead of
   touching the shared proxy config that also serves the other vhosts on this
   VPS. */
function dedupeOriginHeader(request: Request): Request {
  const headers = new Headers(request.headers);
  for (const name of ["origin", "referer"]) {
    const value = headers.get(name);
    if (value?.includes(",")) {
      headers.set(name, value.split(",")[0]!.trim());
    }
  }
  return new Request(request, { headers });
}
