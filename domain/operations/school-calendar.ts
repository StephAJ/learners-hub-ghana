/* ==========================================================================
   The school's own day

   db/operations-repository.ts pinned the working day to two constants:

     const CURRENT_DATE = "2026-07-24";
     const CURRENT_WEEKDAY = 5;

   Every surface built on the daily operations read them — the teacher's
   register, the learner's and the guardian's school day, and the timetable —
   so "today" was always Friday 24 July 2026. A school opening the product on
   a Tuesday was shown Friday's timetable and asked to take a register for a
   day four months gone.

   The date resolves in Africa/Accra rather than the server's zone, for the
   same reason app/school-time.ts does: a container in UTC rolls over at
   midnight GMT, and a school in Accra should not see tomorrow's register
   because a server somewhere thinks it is already tomorrow.

   Every function takes the instant, so the behaviour is testable without
   waiting for a Tuesday.
   ========================================================================== */

export const SCHOOL_TIME_ZONE = "Africa/Accra";

/** Monday through Friday, in JavaScript's own numbering. */
const SCHOOL_WEEKDAYS = new Set([1, 2, 3, 4, 5]);

/**
 * Today at the school, as YYYY-MM-DD.
 *
 * Built from the formatted parts rather than from toISOString(), which would
 * answer in UTC and put the school a day out for part of every evening in a
 * zone behind GMT.
 */
export function schoolDate(now: Date = new Date()): string {
  const parts = partsInSchoolZone(now);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** The weekday at the school: 0 for Sunday, matching Date.getDay(). */
export function schoolWeekday(now: Date = new Date()): number {
  /* Read back from the date rather than from a weekday format, so the number
     and the date can never disagree about which day it is. */
  const [year, month, day] = schoolDate(now).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function isSchoolDay(now: Date = new Date()): boolean {
  return SCHOOL_WEEKDAYS.has(schoolWeekday(now));
}

/**
 * The most recent school days, oldest first, ending with today.
 *
 * Weekends are skipped rather than counted, so asking for four days on a
 * Monday reaches back to the previous Tuesday. On a Saturday or Sunday the
 * run ends on the Friday just gone — there is no register for a day the
 * school was shut.
 */
export function recentSchoolDays(
  count: number,
  now: Date = new Date(),
): string[] {
  const days: string[] = [];
  const cursor = new Date(`${schoolDate(now)}T00:00:00Z`);
  while (days.length < count) {
    if (SCHOOL_WEEKDAYS.has(cursor.getUTCDay())) {
      days.unshift(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return days;
}

function partsInSchoolZone(now: Date) {
  const formatter = safeFormatter();
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return { day: parts.day, month: parts.month, year: parts.year };
}

/* A Node build compiled with small-icu carries only UTC and throws a
   RangeError for a named zone. Accra sits at GMT+0 all year, so falling back
   is harmless here and keeps a register from taking down the page. */
function safeFormatter(): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  };
  try {
    return new Intl.DateTimeFormat("en-GB", {
      ...options,
      timeZone: SCHOOL_TIME_ZONE,
    });
  } catch {
    return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" });
  }
}
