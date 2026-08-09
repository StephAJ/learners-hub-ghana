"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { GuardianSchoolDayWorkspace } from "../../../db/operations-repository";
import "../../school-day.css";

/* ==========================================================================
   No preview family day

   A whole school day stood here as a constant — a named child, their
   assignments, an attendance record and four periods of a timetable — and the
   view kept it whenever /api/guardian/school-day failed. A guardian reading
   it had no way to tell it was not their child's.
   ========================================================================== */

export function GuardianSchoolDayView() {
  const [workspace, setWorkspace] = useState<GuardianSchoolDayWorkspace>();
  const [state, setState] = useState<"error" | "loading" | "ready">("loading");
  const [problem, setProblem] = useState("");
  const [childId, setChildId] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadOnce() {
      try {
        const response = await fetch(
          childId
            ? `/api/guardian/school-day?learnerId=${encodeURIComponent(childId)}`
            : "/api/guardian/school-day",
        );
        const payload = (await response.json()) as {
          error?: string;
          workspace?: GuardianSchoolDayWorkspace;
        };
        if (!active) return;
        if (!response.ok || !payload.workspace) {
          throw new Error(payload.error ?? "The school day is unavailable.");
        }
        setWorkspace(payload.workspace);
        setState("ready");
      } catch (thrown) {
        if (!active) return;
        setProblem(
          thrown instanceof Error
            ? thrown.message
            : "The school day could not be reached.",
        );
        setState("error");
      }
    }

    void loadOnce();
    return () => {
      active = false;
    };
  }, [childId, reloadKey]);

  /* Switching child reloads through the same effect rather than a second
     copy of the fetch, which used to swallow its own failures silently. */
  function chooseChild(learnerId: string) {
    if (learnerId === childId) return;
    setState("loading");
    setChildId(learnerId);
  }

  if (state === "loading") {
    return <p className="workspace-loading">Loading the school day…</p>;
  }

  if (state === "error" || !workspace) {
    return (
      <div className="workspace-failure">
        <h2>The school day could not be loaded.</h2>
        <p>{problem}</p>
        <button onClick={() => setReloadKey((key) => key + 1)} type="button">
          Try again
        </button>
      </div>
    );
  }

  return (
    <>

      <div className="school-day-page" id="family-day">
        <section className="guardian-day-welcome">
          <div className="guardian-child-card">
            <span>{initials(workspace.learner.name)}</span>
            <div>
              <small>Viewing</small>
              <strong>{workspace.learner.name}</strong>
              <p>
                {workspace.learner.studentId} ·{" "}
                {workspace.learner.className}
              </p>
            </div>
            {workspace.linkedChildren.length > 1 ? (
              <select
                onChange={(event) => void chooseChild(event.target.value)}
                value={workspace.learner.id}
              >
                {workspace.linkedChildren.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </section>

        <section className="guardian-day-summary">
          <article>
            <span>Attendance record</span>
            <strong>
              {workspace.attendance.summary.percentage.toFixed(1)}%
            </strong>
            <small>
              {workspace.attendance.summary.absent} absence ·{" "}
              {workspace.attendance.summary.late} late
            </small>
          </article>
          <article>
            <span>Today&apos;s register</span>
            <strong className="guardian-summary-text">
              {workspace.attendance.currentCode
                ? humanise(workspace.attendance.currentCode)
                : "Pending"}
            </strong>
            <small>Visible after teacher submission</small>
          </article>
          <article>
            <span>Due assignments</span>
            <strong>{workspace.assignments.length}</strong>
            <small>Across current subjects</small>
          </article>
          <article>
            <span>Family alerts</span>
            <strong>{workspace.alerts.length}</strong>
            <small>Relationship-protected updates</small>
          </article>
        </section>

        <div className="guardian-day-grid">
          <section className="school-day-panel guardian-alert-panel">
            <div className="school-day-heading">
              <div>
                <p>School-issued updates</p>
                <h2>Attendance alerts</h2>
              </div>
              <span className="school-day-live protected">
                <i />
                Protected record
              </span>
            </div>
            {workspace.alerts.length > 0 ? (
              <div className="guardian-alert-list">
                {workspace.alerts.map((alert) => (
                  <article key={alert.id}>
                    <span>!</span>
                    <div>
                      <strong>{alert.title}</strong>
                      <p>{alert.message}</p>
                      <small>
                        Issued {formatDateTime(alert.issuedAt)} ·{" "}
                        {humanise(alert.status)}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="guardian-day-empty">
                <span>✓</span>
                <strong>No new attendance alerts</strong>
                <p>Draft register changes never appear here.</p>
              </div>
            )}
          </section>

          <section className="school-day-panel">
            <div className="school-day-heading">
              <div>
                <p>Progress support</p>
                <h2>Assignments</h2>
              </div>
              <Link href="/guardian/reports">Term report ↗</Link>
            </div>
            <div className="guardian-assignment-list">
              {workspace.assignments.map((assignment) => (
                <article key={assignment.id}>
                  <span>IS</span>
                  <div>
                    <strong>{assignment.title}</strong>
                    <small>
                      {assignment.subjectName} · Due{" "}
                      {formatDateTime(assignment.dueAt)}
                    </small>
                  </div>
                  <em className={assignment.status}>
                    {humanise(assignment.status)}
                  </em>
                </article>
              ))}
            </div>
          </section>
        </div>

        <section className="school-day-panel guardian-timetable">
          <div className="school-day-heading">
            <div>
              <p>Friday schedule</p>
              <h2>Today&apos;s timetable</h2>
            </div>
            <span>{workspace.timetable.length} lessons</span>
          </div>
          <div className="guardian-timetable-row">
            {workspace.timetable.map((entry) => (
              <article key={entry.id}>
                <time>
                  {workspace.periods.find(
                    (periodItem) => periodItem.id === entry.periodId,
                  )?.startsAt ?? ""}
                </time>
                <strong>{entry.subjectName}</strong>
                <small>{entry.room}</small>
                <span>{entry.substituteTeacherName ?? entry.teacherName}</span>
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}


function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function humanise(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}
