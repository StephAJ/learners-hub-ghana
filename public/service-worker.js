/* ==========================================================================
   Learners Hub offline shell

   The PWA was a manifest and nothing else — no service worker anywhere in the
   project. So on the entry-level Android and unstable connection the product
   is built around, a dropped signal was a dead page: not a cached lesson, not
   a stale timetable, a browser error.

   What this does and does not do matters, because a school system that lies
   about being offline-capable is worse than one that does not try.

   It caches the application shell and static assets, so the app opens and
   renders on a dropped connection. It serves the last-seen copy of a GET page
   when the network fails, with a banner the page itself renders from the
   `x-learners-hub-offline` header.

   It does NOT queue writes. Marks, registers, submissions and messages are
   the school's record, and a queued write that silently replays hours later
   against a changed roster is the failure mode the product scope singles out.
   A write while offline fails, visibly, and is retried by the person.
   ========================================================================== */

/* Bumped from v1: activate deletes every cache not ending in the current
   version, so raising this is what clears what an older worker stored. */
const VERSION = "v2";
const SHELL_CACHE = `learners-hub-shell-${VERSION}`;
const PAGE_CACHE = `learners-hub-pages-${VERSION}`;

/* ==========================================================================
   Never on a development host

   cacheFirst below takes /_next/static/ on the reasoning that a hashed build
   asset never changes under one URL. True of a production build. In
   development Turbopack serves chunks at stable paths and rewrites them on
   every edit, so a v1 worker cached the first version of every chunk and
   served it for the life of the browser profile: a page throwing an error
   fixed several rebuilds ago, against a server serving correct code.

   The registration component now declines to register outside production,
   which stops it happening again but cannot help a browser that already has
   one — that code ships in a chunk the installed worker serves from cache, so
   it never arrives. This file can, because a browser fetches the worker
   script itself on navigation rather than through the worker's own fetch
   handler. So the worker removes itself here, which is the only path that
   reaches an already-affected browser. */
const DEVELOPMENT_HOSTS = ["127.0.0.1", "localhost"];
const onDevelopmentHost = DEVELOPMENT_HOSTS.includes(self.location.hostname);

if (onDevelopmentHost) {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
        await self.registration.unregister();
        /* Reload what is open. The page is still running the code the old
           worker gave it, and having unregistered there is nothing left to
           re-trigger this, so it cannot loop. */
        const windows = await self.clients.matchAll({ type: "window" });
        for (const client of windows) client.navigate(client.url);
      })(),
    );
  });
}

/* The crest and the offline page, so the fallback is never itself a fetch. */
const SHELL = ["/offline", "/learners-hub-logo.png", "/favicon.svg"];

/* Everything below is the real worker, and none of it is wired up on a
   development host — the block above has already removed this registration
   there, and a second install handler racing it would only cache more of what
   it is trying to clear. */
if (!onDevelopmentHost) {

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      /* addAll rejects the whole install if one entry 404s, which would leave
         the worker permanently uninstalled. Each is added on its own. */
      .then((cache) =>
        Promise.all(
          SHELL.map((path) => cache.add(path).catch(() => undefined)),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.endsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* Never cached, and never served stale:

     /api      — a mark, a register or a message read from cache is a lie
                 about the school's record.
     /api/auth — a cached session response is a security question.
     /_next/image and media — large, and already cached by the browser's own
                 HTTP cache with the right headers. */
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  }
});

} /* end: production only */

/**
 * Hashed build assets never change under one URL, so the cached copy is
 * always correct and the network is never worth waiting for.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(SHELL_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

/**
 * A page: the network, then the last copy of it, then the offline page.
 *
 * Network first rather than cache first because a timetable or a lesson list
 * that is a day old and looks current is its own kind of wrong. The cached
 * copy is a fallback, and it is marked as one so the page can say so.
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(PAGE_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return withOfflineHeader(cached);
    const offline = await caches.match("/offline");
    if (offline) return offline;
    return new Response(
      "You are offline, and this page has not been opened on this device before.",
      { headers: { "content-type": "text/plain" }, status: 503 },
    );
  }
}

/** Marks a response as a cached copy, so the page can tell the reader. */
function withOfflineHeader(response) {
  const headers = new Headers(response.headers);
  headers.set("x-learners-hub-offline", "1");
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}
