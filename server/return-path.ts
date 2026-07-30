const reservedPaths = new Set([
  "/sign-in",
  "/register",
  "/api/auth/sign-in",
  "/api/auth/sign-out",
]);

export function safeReturnPath(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";

  try {
    const url = new URL(value, "https://learners-hub.local");
    if (url.origin !== "https://learners-hub.local") return "/";
    if (reservedPaths.has(url.pathname)) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
