"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ClassGroup,
  ClassOffering,
} from "../../../domain/academic/structure";
import type {
  SchoolTimetable,
  TimetablePeriod,
} from "../../../db/timetable-repository";
import "../academic/academic.css";
import "./timetable.css";

/* ==========================================================================
   Building a week

   The grid is periods down and weekdays across, which is how a Ghanaian
   school's timetable is printed and how a head of department reads one. Each
   cell is a select holding the subjects that class is actually offered — the
   subject name and the teacher are read off the offering rather than typed,
   because a timetable naming a teacher who does not teach that class is how a
   register ends up with the wrong person's name on it.

   One class at a time. A whole-school grid is six classes by eight periods by
   five days, which is a spreadsheet rather than a screen, and a school builds
   a timetable one class at a time anyway.
   ========================================================================== */

const WEEKDAYS: Array<[number, string]> = [
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
];

type Structure = {
  classGroups: ClassGroup[];
  offeringsByClassGroup: Record<string, ClassOffering[]>;
};

export function TimetableView() {
  const [timetable, setTimetable] = useState<SchoolTimetable>({
    entries: [],
    periods: [],
  });
  const [structure, setStructure] = useState<Structure>({
    classGroups: [],
    offeringsByClassGroup: {},
  });
  const [classGroupId, setClassGroupId] = useState("");
  const [state, setState] = useState<"error" | "loading" | "ready">("loading");
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [addingPeriod, setAddingPeriod] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    /* The load has to be inside the effect rather than a call out to a
       useCallback: setState directly in an effect body cascades renders, and
       the `active` flag is what stops a slow response landing on an unmounted
       screen. Matches how every other view here loads. */
    async function loadOnce() {
      try {
        const response = await fetch("/api/admin/timetable");
        const payload = (await response.json()) as {
          error?: string;
          structure?: Structure;
          timetable?: SchoolTimetable;
        };
        if (!active) return;
        if (!response.ok || !payload.timetable || !payload.structure) {
          throw new Error(payload.error ?? "The timetable could not be loaded.");
        }
        setTimetable(payload.timetable);
        setStructure(payload.structure);
        setState("ready");
      } catch (error) {
        if (!active) return;
        setProblem(
          error instanceof Error ? error.message : "Something went wrong.",
        );
        setState("error");
      }
    }

    void loadOnce();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const activeClasses = useMemo(
    () => structure.classGroups.filter((group) => group.status === "active"),
    [structure.classGroups],
  );
  const activeClassId = classGroupId || activeClasses[0]?.id || "";
  const offerings = (
    structure.offeringsByClassGroup[activeClassId] ?? []
  ).filter((offering) => offering.status === "active");

  async function send(body: unknown, success: string) {
    setBusy(true);
    setNotice("");
    setProblem("");
    try {
      const response = await fetch("/api/admin/timetable", {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        timetable?: SchoolTimetable;
      };
      if (!response.ok || !payload.timetable) {
        throw new Error(payload.error ?? "That change could not be saved.");
      }
      setTimetable(payload.timetable);
      setNotice(success);
      return true;
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : "Something went wrong.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return <p className="academic-loading">Loading the timetable…</p>;
  }

  if (state === "error") {
    return (
      <div className="academic-empty">
        <h2>The timetable could not be loaded.</h2>
        <p>{problem}</p>
        <button onClick={() => setReloadKey((key) => key + 1)} type="button">
          Try again
        </button>
      </div>
    );
  }

  /* A slot's current subject, so each select shows what is already there. */
  function entryFor(periodId: string, weekday: number) {
    return timetable.entries.find(
      (entry) =>
        entry.periodId === periodId &&
        entry.weekday === weekday &&
        entry.classGroupId === activeClassId,
    );
  }

  return (
    <div className="admin-content">
      <section className="admin-welcome">
        <div>
          <p className="eyebrow">Academic structure</p>
          <h1>Timetable</h1>
          <p>
            The periods your school runs, and what happens in each of them.
            Learners and guardians read this on their school day.
          </p>
        </div>
      </section>

      {notice && (
        <p className="academic-notice" role="status">
          {notice}
        </p>
      )}
      {problem && (
        <p className="academic-problem" role="alert">
          {problem}
        </p>
      )}

      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <p className="eyebrow">Bell times</p>
            <h2>Periods</h2>
          </div>
          <button
            className="ghost-button"
            disabled={busy}
            onClick={() => setAddingPeriod(!addingPeriod)}
            type="button"
          >
            {addingPeriod ? "Cancel" : "Add a period"}
          </button>
        </div>

        {timetable.periods.length === 0 ? (
          <p className="form-hint">
            No periods yet. Add the school&rsquo;s bell times first — a lesson
            is timetabled into one, so nothing else can be set until they
            exist.
          </p>
        ) : (
          <ul className="period-list">
            {timetable.periods.map((period) => (
              <li key={period.id}>
                <span>
                  <strong>{period.name}</strong>
                  <small>
                    {period.startsAt} – {period.endsAt}
                  </small>
                </span>
                <span className="period-kind">{period.kind}</span>
                <button
                  className="ghost-button"
                  disabled={busy}
                  onClick={() =>
                    void send(
                      { action: "remove-period", periodId: period.id },
                      `${period.name} was removed.`,
                    )
                  }
                  type="button"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {addingPeriod ? (
          <PeriodForm
            busy={busy}
            onSubmit={async (input) => {
              const saved = await send(
                { action: "add-period", ...input },
                `${input.name} was added.`,
              );
              if (saved) setAddingPeriod(false);
            }}
          />
        ) : null}
      </section>

      {activeClasses.length === 0 ? (
        <div className="academic-empty">
          <h2>Add a class first.</h2>
          <p>
            A timetable is a class&rsquo;s week, so there has to be a class to
            build one for.
          </p>
        </div>
      ) : timetable.periods.length === 0 ? null : (
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <p className="eyebrow">The week</p>
              <h2>Lessons</h2>
            </div>
            <label className="year-picker">
              <small>Class</small>
              <select
                onChange={(event) => setClassGroupId(event.target.value)}
                value={activeClassId}
              >
                {activeClasses.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {offerings.length === 0 ? (
            <p className="form-hint">
              This class has no subjects yet. Put them on the class on the
              Academics screen, then come back.
            </p>
          ) : (
            <div className="timetable-scroll">
              <table className="timetable-grid">
                <thead>
                  <tr>
                    <th scope="col">Period</th>
                    {WEEKDAYS.map(([weekday, label]) => (
                      <th key={weekday} scope="col">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timetable.periods.map((period) => (
                    <tr key={period.id}>
                      <th scope="row">
                        <strong>{period.name}</strong>
                        <small>
                          {period.startsAt} – {period.endsAt}
                        </small>
                      </th>
                      {WEEKDAYS.map(([weekday]) => {
                        const entry = entryFor(period.id, weekday);
                        return (
                          <td key={weekday}>
                            <label>
                              <span className="visually-hidden">
                                {period.name}, {weekday}
                              </span>
                              <select
                                disabled={busy}
                                onChange={(event) =>
                                  void send(
                                    {
                                      action: "set-entry",
                                      classGroupId: activeClassId,
                                      offeringId: event.target.value,
                                      periodId: period.id,
                                      room: entry?.room ?? "",
                                      weekday,
                                    },
                                    event.target.value
                                      ? "Timetable updated."
                                      : "Slot cleared.",
                                  )
                                }
                                value={entry?.offeringId ?? ""}
                              >
                                <option value="">—</option>
                                {offerings.map((offering) => (
                                  <option key={offering.id} value={offering.id}>
                                    {offering.subjectName}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="form-hint">
            The teacher comes from the subject, not from this screen. A teacher
            already timetabled with another class in the same period is
            refused, which is the clash a timetable exists to catch.
          </p>
        </section>
      )}
    </div>
  );
}

function PeriodForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (input: {
    endsAt: string;
    kind: TimetablePeriod["kind"];
    name: string;
    startsAt: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("08:00");
  const [endsAt, setEndsAt] = useState("08:40");
  const [kind, setKind] = useState<TimetablePeriod["kind"]>("lesson");

  return (
    <form
      className="inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({ endsAt, kind, name, startsAt });
      }}
    >
      <div className="inline-form-fields">
        <label>
          <span>Name</span>
          <input
            onChange={(event) => setName(event.target.value)}
            placeholder="Period 1"
            required
            value={name}
          />
        </label>
        <label>
          <span>Starts</span>
          <input
            onChange={(event) => setStartsAt(event.target.value)}
            required
            type="time"
            value={startsAt}
          />
        </label>
        <label>
          <span>Ends</span>
          <input
            onChange={(event) => setEndsAt(event.target.value)}
            required
            type="time"
            value={endsAt}
          />
        </label>
        <label>
          <span>Kind</span>
          <select
            onChange={(event) =>
              setKind(event.target.value as TimetablePeriod["kind"])
            }
            value={kind}
          >
            <option value="lesson">Lesson</option>
            <option value="break">Break</option>
            <option value="assembly">Assembly</option>
          </select>
        </label>
      </div>
      <div className="form-actions">
        <button disabled={busy} type="submit">
          Add period
        </button>
      </div>
    </form>
  );
}
