// The school sits in Accra, so the working day is resolved in Africa/Accra
// rather than the server's own zone. Greetings and date labels are rendered per
// request, which keeps them honest — the workspace pages previously shipped a
// hardcoded "Good afternoon" and a fixed "Sunday, 26 July".
const SCHOOL_TIME_ZONE = "Africa/Accra";

// A Node build compiled with small-icu only carries UTC, and asking for a named
// zone there throws a RangeError. Falling back to UTC is harmless for Accra,
// which sits at GMT+0 year round, and keeps a greeting from taking down a page.
function formatInSchoolZone(options: Intl.DateTimeFormatOptions): string {
  const date = new Date();
  try {
    return new Intl.DateTimeFormat("en-GB", {
      ...options,
      timeZone: SCHOOL_TIME_ZONE,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      ...options,
      timeZone: "UTC",
    }).format(date);
  }
}

export function schoolGreeting(name?: string): string {
  const hour = Number(
    formatInSchoolZone({ hour: "numeric", hour12: false }),
  );

  const greeting =
    !Number.isFinite(hour) || hour < 12
      ? "Good morning"
      : hour < 17
        ? "Good afternoon"
        : "Good evening";

  return name ? `${greeting}, ${name}.` : `${greeting}.`;
}

export function schoolDateLabel(): string {
  return formatInSchoolZone({
    day: "numeric",
    month: "long",
    weekday: "long",
  });
}

export function firstName(name: string): string {
  return name.split(" ")[0] || name;
}
