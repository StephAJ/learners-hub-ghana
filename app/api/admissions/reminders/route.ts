import { timingSafeEqual } from "node:crypto";
import {
  listAbandonedDrafts,
  markDraftReminderSent,
} from "../../../../db/applicant-repository";
import { sendDraftReminder } from "../../../../server/mail/admissions-mail";

export const dynamic = "force-dynamic";

/* How long a draft has to sit untouched before it counts as abandoned. Long
   enough that a family who started on Saturday and meant to finish on Sunday
   is not chased, short enough to still be useful before the intake closes. */
const DEFAULT_QUIET_DAYS = 5;

/**
 * Emails guardians whose application draft has gone quiet.
 *
 * Triggered by cron rather than by a user, so it authenticates with a shared
 * secret instead of a session:
 *
 *   0 9 * * *  curl -fsS -X POST https://<host>/api/admissions/reminders \
 *                -H "authorization: Bearer $ADMISSIONS_REMINDER_SECRET"
 *
 * Safe to run more often than needed — a draft is only ever reminded once,
 * enforced in the query by last_reminder_at rather than by the schedule.
 *
 * With no secret configured the endpoint refuses outright. An unauthenticated
 * route that emails people on demand is a spam cannon, so the safe default is
 * off rather than open.
 */
export async function POST(request: Request) {
  const secret = process.env.ADMISSIONS_REMINDER_SECRET?.trim();
  if (!secret) {
    return Response.json(
      { error: "Reminders are not configured." },
      { status: 503 },
    );
  }
  if (!isAuthorised(request, secret)) {
    return Response.json({ error: "Not authorised." }, { status: 401 });
  }

  const quietDays = readQuietDays(request);

  try {
    const drafts = await listAbandonedDrafts(quietDays);
    const reminded: string[] = [];

    /* One at a time. This runs unattended against a shared mail server, and a
       burst of parallel sends is what gets a school's domain rate-limited. */
    for (const draft of drafts) {
      const sent = await sendDraftReminder(draft);
      if (sent) reminded.push(draft.id);
    }

    /* Only what actually went out is marked, so a mail outage means the job
       tries again tomorrow rather than silently burning the one reminder. */
    await markDraftReminderSent(reminded);

    return Response.json({
      candidates: drafts.length,
      quietDays,
      reminded: reminded.length,
    });
  } catch (error) {
    console.error("[admissions] reminder run failed", error);
    return Response.json(
      { error: "The reminder run failed." },
      { status: 500 },
    );
  }
}

function isAuthorised(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : header;
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  /* Compared in constant time, and length-checked first because
     timingSafeEqual throws on a length mismatch. */
  return a.length === b.length && timingSafeEqual(a, b);
}

function readQuietDays(request: Request): number {
  const raw = new URL(request.url).searchParams.get("quietDays");
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_QUIET_DAYS;
  /* Clamped so a typo in the cron line cannot email every draft ever started. */
  return Math.min(90, Math.max(1, parsed));
}
