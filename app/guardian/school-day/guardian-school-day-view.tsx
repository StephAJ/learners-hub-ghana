"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { GuardianSchoolDayWorkspace } from "../../../db/operations-repository";
import "../../school-day.css";

const previewWorkspace: GuardianSchoolDayWorkspace = {
  alerts: [
    {
      id: "alert-kwame-absence-2026-07-22",
      issuedAt: "2026-07-22T08:22:00Z",
      message:
        "Kwame was marked absent from JHS 2 Gold on 22 July. Please contact the school if this record needs clarification.",
      status: "issued",
      title: "Kwame was marked absent",
    },
  ],
  assignments: [
    {
      dueAt: "2026-07-28T16:00:00Z",
      feedback: null,
      id: "assignment-body-systems",
      maximumPoints: 20,
      score: null,
      status: "submitted",
      subjectName: "Integrated Science",
      title: "Body systems model",
    },
  ],
  attendance: {
    currentCode: null,
    summary: {
      absent: 1,
      excused: 0,
      late: 0,
      percentage: 66.7,
      presentEquivalent: 2,
      totalCounted: 3,
    },
  },
  currentDate: "2026-07-24",
  learner: {
    className: "JHS 2 Gold",
    id: "person-kwame",
    name: "Kwame Agyeman",
    studentId: "LH-260138",
  },
  linkedChildren: [{ id: "person-kwame", name: "Kwame Agyeman" }],
  periods: [
    period("period-1", "Period 1", 1, "08:00", "09:00"),
    period("period-2", "Period 2", 2, "09:10", "10:10"),
    period("period-break", "Break", 3, "10:10", "10:35", "break"),
    period("period-3", "Period 3", 4, "10:35", "11:35"),
    period("period-4", "Period 4", 5, "11:45", "12:45"),
  ],
  timetable: [
    timetable("timetable-5-1", "period-1", "Social Studies", "Block B · Room 2", "Emmanuel Ofori"),
    timetable("timetable-5-2", "period-2", "Integrated Science", "Science Lab", "Grace Mensah"),
    timetable("timetable-5-3", "period-3", "English Language", "Block A · Room 4", "Mary Asante"),
    timetable("timetable-5-4", "period-4", "Mathematics", "Block A · Room 4", "Emmanuel Ofori"),
  ],
};

export function GuardianSchoolDayView() {
  const [workspace, setWorkspace] = useState(previewWorkspace);
  const [mode, setMode] = useState<"loading" | "protected" | "preview">(
    "loading",
  );

  useEffect(() => {
    let active = true;
    void load();

    async function load() {
      try {
        const response = await fetch("/api/guardian/school-day");
        if (!response.ok) throw new Error("Family updates unavailable.");
        const payload = (await response.json()) as {
          actor: string;
          workspace: GuardianSchoolDayWorkspace;
        };
        if (!active) return;
        setWorkspace(payload.workspace);
        setMode("protected");
      } catch {
        if (active) setMode("preview");
      }
    }

    return () => {
      active = false;
    };
  }, []);

  async function chooseChild(learnerId: string) {
    if (mode !== "protected") return;
    const response = await fetch(
      `/api/guardian/school-day?learnerId=${encodeURIComponent(learnerId)}`,
    );
    if (!response.ok) return;
    const payload = (await response.json()) as {
      workspace: GuardianSchoolDayWorkspace;
    };
    setWorkspace(payload.workspace);
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
              <span className={`school-day-live ${mode}`}>
                <i />
                {mode === "protected" ? "Protected record" : "Preview"}
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

function period(
  id: string,
  name: string,
  position: number,
  startsAt: string,
  endsAt: string,
  kind: "lesson" | "break" | "assembly" = "lesson",
) {
  return { endsAt, id, kind, name, position, startsAt };
}

function timetable(
  id: string,
  periodId: string,
  subjectName: string,
  room: string,
  teacherName: string,
) {
  return {
    changeReason: null,
    id,
    periodId,
    room,
    status: "scheduled" as const,
    subjectName,
    substituteTeacherName: null,
    teacherName,
    weekday: 5,
  };
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
