/* The header proxy.ts uses to hand the requested path to server components.
   Named here so the proxy and the readers cannot drift apart. */
export const REQUEST_PATH_HEADER = "x-learners-hub-path";

/**
 * The page to return to after signing in.
 *
 * proxy.ts sets the header on every workspace request, overwriting anything a
 * client sent, so in practice the header is the answer. The fallback covers
 * the one case where it is absent: a route the proxy's matcher does not
 * cover, which would otherwise send someone back to the site root.
 *
 * Anything that does not look like a path is discarded rather than trusted.
 * safeReturnPath() is the second gate and refuses off-origin values outright;
 * this is the first.
 */
export function resolveRequestPath(
  header: string | null | undefined,
  fallback: string,
): string {
  if (!header?.startsWith("/") || header.startsWith("//")) return fallback;
  return header;
}
