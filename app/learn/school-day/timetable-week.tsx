"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "../../components/icons";
import type {
  TimetableEntryView,
  TimetablePeriodView,
} from "../../../db/operations-repository";

/* ==========================================================================
   The week's timetable

   Shows a real day rather than a fixed one. It opens on today, marks the
   period happening right now against the clock, and steps back and forward
   through the teaching week.

   The clock only matters on today: looking at Thursday from Friday should not
   highlight anything, because nothing is happening then.
   ========================================================================== */

const WEEKDAYS = [
  { label: "Monday", short: "Mon", weekday: 1 },
  { label: "Tuesday", short: "Tue", weekday: 2 },
  { label: "Wednesday", short: "Wed", weekday: 3 },
  { label: "Thursday", short: "Thu", weekday: 4 },
  { label: "Friday", short: "Fri", weekday: 5 },
];

/* The clock is external state, so React subscribes to it rather than mirroring
   it in an effect. A minute of granularity is plenty: periods run for an hour,
   and a ticking second hand would re-render sixty times more often for nothing
   anyone can see. */
function subscribeToClock(listener: () => void): () => void {
  const timer = setInterval(listener, 60_000);
  return () => clearInterval(timer);
}

function clockSnapshot(): number {
  /* Rounded to the minute so the snapshot is stable between ticks — an
     unrounded Date.now() would differ on every read and loop forever. */
  return Math.floor(Date.now() / 60_000);
}

/** The server has no clock the client would agree with. */
function clockServerSnapshot(): number {
  return 0;
}

/** Minutes since midnight for an "HH:MM" string. */
function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

/** Monday is 1 and Friday is 5. A weekend falls back to Monday. */
function todayWeekday(now: Date): number {
  const day = now.getDay();
  return day >= 1 && day <= 5 ? day : 1;
}

export function TimetableWeek({
  entries,
  periods,
}: {
  entries: TimetableEntryView[];
  periods: TimetablePeriodView[];
}) {
  const minute = useSyncExternalStore(
    subscribeToClock,
    clockSnapshot,
    clockServerSnapshot,
  );
  const now = minute === 0 ? undefined : new Date(minute * 60_000);

  /* Undefined until the clock resolves on the client, at which point it snaps
     to today. A learner who has chosen a day keeps it. */
  const [chosenWeekday, setChosenWeekday] = useState<number>();
  const weekday = chosenWeekday ?? (now ? todayWeekday(now) : 1);
  const setWeekday = setChosenWeekday;

  const isToday = now ? weekday === todayWeekday(now) : false;
  const minutesNow = now ? now.getHours() * 60 + now.getMinutes() : -1;

  const rows = useMemo(() => {
    const forDay = entries.filter((entry) => entry.weekday === weekday);
    return periods.map((period) => {
      const start = toMinutes(period.startsAt);
      const end = toMinutes(period.endsAt);
      return {
        entry: forDay.find((item) => item.periodId === period.id),
        isNow: isToday && minutesNow >= start && minutesNow < end,
        /* Finished today, so it can recede rather than compete with what is
           happening now. */
        isPast: isToday && minutesNow >= end,
        period,
      };
    });
  }, [entries, isToday, minutesNow, periods, weekday]);

  const dayLabel =
    WEEKDAYS.find((day) => day.weekday === weekday)?.label ?? "Monday";

  return (
    <>
      <div className="timetable-week-head">
        <div className="school-day-heading">
          <div>
            <p>{isToday ? "Today" : dayLabel}</p>
            <h2>{dayLabel}&apos;s timetable</h2>
          </div>
        </div>
        <div className="timetable-week-nav" role="group" aria-label="Choose a day">
          <button
            aria-label="Previous day"
            disabled={weekday <= 1}
            onClick={() => setWeekday(Math.max(1, weekday - 1))}
            type="button"
          >
            <ChevronLeftIcon size={16} />
          </button>
          {WEEKDAYS.map((day) => (
            <button
              aria-current={day.weekday === weekday ? "true" : undefined}
              aria-label={day.label}
              className={day.weekday === weekday ? "is-active" : undefined}
              key={day.weekday}
              onClick={() => setWeekday(day.weekday)}
              type="button"
            >
              {day.short}
            </button>
          ))}
          <button
            aria-label="Next day"
            disabled={weekday >= 5}
            onClick={() => setWeekday(Math.min(5, weekday + 1))}
            type="button"
          >
            <ChevronRightIcon size={16} />
          </button>
        </div>
      </div>

      <div className="learner-timeline">
        {rows.map(({ entry, isNow, isPast, period }) => (
          <article
            className={[
              period.kind === "break" ? "is-break" : "",
              isNow ? "is-now" : "",
              isPast ? "is-past" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={period.id}
          >
            <time dateTime={period.startsAt}>{period.startsAt}</time>
            <span>
              <i />
            </span>
            <div>
              <strong>
                {period.kind === "break"
                  ? "Break"
                  : (entry?.subjectName ?? "Study period")}
              </strong>
              <small>
                {period.kind === "break"
                  ? `${period.startsAt}–${period.endsAt}`
                  : `${entry?.room ?? "Classroom"} · ${
                      entry?.substituteTeacherName ??
                      entry?.teacherName ??
                      "School team"
                    }`}
              </small>
            </div>
            {isNow ? (
              <em className="timetable-now">Now</em>
            ) : entry && entry.status !== "scheduled" ? (
              <em>{entry.status}</em>
            ) : null}
          </article>
        ))}
      </div>
    </>
  );
}
