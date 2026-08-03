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

const DOUBLED_HEADERS = ["origin", "referer"];

/* The OpenLiteSpeed reverse proxy in front of this deployment delivers a
   doubled Origin header on every proxied HTTPS request (e.g.
   "https://learn.stephenarthur.org, https://learn.stephenarthur.org"). Better
   Auth's origin check parses that value with `new URL()`, which throws on the
   comma-joined string, so every cookie-bearing request fails CSRF validation
   and every sign-in appears as "invalid credentials". Collapsing duplicate
   Origin/Referer values here keeps the fix contained to this app instead of
   touching the shared proxy config that also serves the other vhosts on this
   VPS.

   Two things this has to get right, both learned by it getting them wrong:

   The request is only rebuilt when a header actually needs it. Every POST to
   this route used to be rebuilt, including the overwhelming majority that
   arrive with a single clean Origin — anywhere there is no OpenLiteSpeed in
   front, that is all of them.

   And it is rebuilt from the URL rather than by passing the original request
   as the first argument to the constructor. `new Request(request, { … })`
   reads internal state off the source, and Next's request is not a plain
   Request — under Next 16 that throws "Cannot read private member #state from
   an object whose class did not declare it", which surfaced as a 500 on
   *every* sign-in attempt. */
function dedupeOriginHeader(request: Request): Request {
  const doubled = DOUBLED_HEADERS.filter((name) =>
    request.headers.get(name)?.includes(","),
  );
  if (doubled.length === 0) return request;

  const headers = new Headers(request.headers);
  for (const name of doubled) {
    const value = headers.get(name);
    if (value) headers.set(name, value.split(",")[0]!.trim());
  }

  return new Request(request.url, {
    body: request.body,
    /* Required whenever a body is a stream, and Next hands us one. */
    duplex: "half",
    headers,
    method: request.method,
    redirect: request.redirect,
    signal: request.signal,
  } as RequestInit & { duplex: "half" });
}
