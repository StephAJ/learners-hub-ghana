"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LearnerSchoolDayWorkspace } from "../../../db/operations-repository";
import "../../school-day.css";

const previewWorkspace: LearnerSchoolDayWorkspace = {
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

export default function LearnerSchoolDayPage() {
  const [workspace, setWorkspace] = useState(previewWorkspace);
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"loading" | "protected" | "preview">(
    "loading",
  );

  useEffect(() => {
    let active = true;
    void load();

    async function load() {
      try {
        const response = await fetch("/api/learn/school-day");
        if (!response.ok) throw new Error("School day unavailable.");
        const payload = (await response.json()) as {
          workspace: LearnerSchoolDayWorkspace;
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

  const nextEntry =
    workspace.timetable.find((entry) => entry.periodId === "period-2") ??
    workspace.timetable[0];

  async function submitAssignment(
    assignmentId: string,
    responseText: string,
  ) {
    if (mode !== "protected") {
      setWorkspace((current) => ({
        ...current,
        assignments: current.assignments.map((assignment) =>
          assignment.id === assignmentId
            ? { ...assignment, status: "submitted" }
            : assignment,
        ),
      }));
      setNotice("Preview response submitted.");
      return;
    }
    const response = await fetch("/api/learn/school-day", {
      body: JSON.stringify({
        action: "submit-assignment",
        assignmentId,
        responseText,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as {
      error?: string;
      workspace?: LearnerSchoolDayWorkspace;
    };
    if (!response.ok || !payload.workspace) {
      setNotice(payload.error ?? "The assignment could not be submitted.");
      return;
    }
    setWorkspace(payload.workspace);
    setNotice("Assignment submitted to your teacher.");
  }

  return (
    <main className="school-day-shell">
      <header className="school-day-header">
        <Link className="school-day-brand" href="/student">
          <span>LH</span>
          <div>
            <strong>Learners Hub</strong>
            <small>Learner school day</small>
          </div>
        </Link>
        <nav aria-label="Learner navigation">
          <Link href="/student">Overview</Link>
          <a className="is-active" href="#today">
            School day
          </a>
          <Link href="/learn/subjects">Subjects</Link>
        </nav>
        <div className="school-day-profile">
          <div>
            <strong>{workspace.learner.name}</strong>
            <small>{workspace.learner.className}</small>
          </div>
          <span>{initials(workspace.learner.name)}</span>
        </div>
      </header>

      <div className="school-day-page" id="today">
        <section className="school-day-welcome">
          <div>
            <p>{formatLongDate(workspace.currentDate)}</p>
            <h1>Your school day</h1>
            <span>
              Your timetable, the work that is due, and your own attendance
              record.
            </span>
          </div>
          <div className="school-day-next">
            <small>Up next</small>
            <strong>{nextEntry?.subjectName ?? "Integrated Science"}</strong>
            <span>
              {periodFor(workspace, nextEntry?.periodId)?.startsAt ?? "09:10"}{" "}
              · {nextEntry?.room ?? "Science Lab"}
            </span>
            <Link href="/learn/subjects/integrated-science">
              Open subject →
            </Link>
          </div>
        </section>

        <section className="school-day-summary">
          <article>
            <span className="summary-icon green">✓</span>
            <div>
              <small>Attendance this week</small>
              <strong>
                {workspace.attendance.summary.percentage.toFixed(1)}%
              </strong>
              <p>
                Today:{" "}
                {workspace.attendance.currentCode
                  ? humanise(workspace.attendance.currentCode)
                  : "register pending"}
              </p>
            </div>
          </article>
          <article>
            <span className="summary-icon gold">◆</span>
            <div>
              <small>Assignments</small>
              <strong>{workspace.assignments.length}</strong>
              <p>
                {
                  workspace.assignments.filter(
                    (item) => item.status === "submitted",
                  ).length
                }{" "}
                submitted
              </p>
            </div>
          </article>
          <article>
            <span className="summary-icon blue">□</span>
            <div>
              <small>Lessons today</small>
              <strong>{workspace.timetable.length}</strong>
              <p>Friday timetable</p>
            </div>
          </article>
        </section>

        {notice ? (
          <button
            className="school-day-notice"
            onClick={() => setNotice("")}
            type="button"
          >
            {notice} <span>×</span>
          </button>
        ) : null}

        <div className="school-day-grid">
          <section className="school-day-panel">
            <div className="school-day-heading">
              <div>
                <p>Friday schedule</p>
                <h2>Today&apos;s timetable</h2>
              </div>
              <span className={`school-day-live ${mode}`}>
                <i />
                {mode === "protected" ? "Live school record" : "Preview"}
              </span>
            </div>
            <div className="learner-timeline">
              {workspace.periods.map((periodItem) => {
                const entry = workspace.timetable.find(
                  (item) => item.periodId === periodItem.id,
                );
                return (
                  <article
                    className={
                      periodItem.kind === "break" ? "is-break" : ""
                    }
                    key={periodItem.id}
                  >
                    <time>{periodItem.startsAt}</time>
                    <span>
                      <i />
                    </span>
                    <div>
                      <strong>
                        {periodItem.kind === "break"
                          ? "Break"
                          : entry?.subjectName ?? "Study period"}
                      </strong>
                      <small>
                        {periodItem.kind === "break"
                          ? `${periodItem.startsAt}–${periodItem.endsAt}`
                          : `${entry?.room ?? "Classroom"} · ${
                              entry?.substituteTeacherName ??
                              entry?.teacherName ??
                              "School team"
                            }`}
                      </small>
                    </div>
                    {entry?.status !== "scheduled" ? (
                      <em>{entry?.status}</em>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="school-day-panel" id="assignments">
            <div className="school-day-heading">
              <div>
                <p>Due work</p>
                <h2>My assignments</h2>
              </div>
              <Link href="/learn/assessments/digestive-system-check">
                Assessments ↗
              </Link>
            </div>
            <div className="learner-assignment-list">
              {workspace.assignments.map((assignment) => (
                <article key={assignment.id}>
                  <header>
                    <span>IS</span>
                    <div>
                      <strong>{assignment.title}</strong>
                      <small>{assignment.subjectName}</small>
                    </div>
                    <em className={assignment.status}>
                      {humanise(assignment.status)}
                    </em>
                  </header>
                  <div>
                    <span>
                      Due {formatDateTime(assignment.dueAt)} · /
                      {assignment.maximumPoints}
                    </span>
                    {assignment.score !== null ? (
                      <strong>
                        {assignment.score}/{assignment.maximumPoints}
                      </strong>
                    ) : null}
                  </div>
                  {assignment.feedback ? (
                    <p>{assignment.feedback}</p>
                  ) : assignment.status === "not-started" ? (
                    <LearnerSubmission
                      assignmentId={assignment.id}
                      submitAssignment={submitAssignment}
                    />
                  ) : (
                    <p>
                      Your teacher will release criterion-level feedback after
                      marking.
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function LearnerSubmission({
  assignmentId,
  submitAssignment,
}: {
  assignmentId: string;
  submitAssignment: (
    assignmentId: string,
    responseText: string,
  ) => Promise<void>;
}) {
  const [responseText, setResponseText] = useState("");
  return (
    <div className="learner-submission">
      <textarea
        onChange={(event) => setResponseText(event.target.value)}
        placeholder="Write your assignment response"
        value={responseText}
      />
      <button
        disabled={!responseText.trim()}
        onClick={() => void submitAssignment(assignmentId, responseText)}
        type="button"
      >
        Submit work
      </button>
    </div>
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

function periodFor(
  workspace: LearnerSchoolDayWorkspace,
  periodId?: string,
) {
  return workspace.periods.find((periodItem) => periodItem.id === periodId);
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

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
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
