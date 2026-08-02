"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { LearnerSchoolDayWorkspace } from "../../../db/operations-repository";
import { TimetableWeek } from "./timetable-week";
import "../../school-day.css";

const previewWorkspace: LearnerSchoolDayWorkspace = {
  assignments: [
    {
      attachments: [],
      dueAt: "2026-07-28T16:00:00Z",
      feedback: null,
      id: "assignment-body-systems",
      maximumPoints: 20,
      score: null,
      status: "submitted",
      subjectName: "Integrated Science",
      title: "Body systems model",
    },
    /* One of each state. With only a submitted assignment here the preview
       never showed the hand-in controls at all, which is the part of this
       screen a learner spends any time in. */
    {
      attachments: [],
      dueAt: "2026-07-31T16:00:00Z",
      feedback: null,
      id: "assignment-food-groups",
      maximumPoints: 15,
      score: null,
      status: "not-started",
      subjectName: "Integrated Science",
      title: "Food groups field notes",
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

export function SchoolDayView() {
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

  /* Attaching and removing both return the whole school day, so the list of
     files on screen is always the list the server holds rather than an
     optimistic guess that a failed upload would leave behind. */
  async function attachFile(assignmentId: string, file: File) {
    if (mode !== "protected") {
      setNotice("Attachments need a signed-in school session.");
      return;
    }
    const body = new FormData();
    body.append("assignmentId", assignmentId);
    body.append("file", file);
    const response = await fetch("/api/learn/school-day", {
      body,
      method: "POST",
    });
    const payload = (await response.json()) as {
      error?: string;
      workspace?: LearnerSchoolDayWorkspace;
    };
    if (!response.ok || !payload.workspace) {
      setNotice(payload.error ?? "That file could not be attached.");
      return;
    }
    setWorkspace(payload.workspace);
    setNotice(`${file.name} attached.`);
  }

  async function removeAttachment(attachmentId: string) {
    if (mode !== "protected") return;
    const response = await fetch("/api/learn/school-day", {
      body: JSON.stringify({ action: "remove-attachment", attachmentId }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as {
      error?: string;
      workspace?: LearnerSchoolDayWorkspace;
    };
    if (!response.ok || !payload.workspace) {
      setNotice(payload.error ?? "That file could not be removed.");
      return;
    }
    setWorkspace(payload.workspace);
  }

  return (
    <>
      <div className="school-day-page" id="today">
        {/* The date, the page title and its description now live in the
            workspace topbar, so this card carries only what it alone knows:
            which lesson is next. */}
        <section className="school-day-welcome">
          <div>
            <p>Up next</p>
            <h2>{nextEntry?.subjectName ?? "Integrated Science"}</h2>
            <span>
              {periodFor(workspace, nextEntry?.periodId)?.startsAt ?? "09:10"}
              {" · "}
              {nextEntry?.room ?? "Science Lab"}
              {nextEntry?.teacherName ? ` · ${nextEntry.teacherName}` : ""}
            </span>
          </div>
          <Link
            className="school-day-next-action"
            href="/learn/subjects/integrated-science"
          >
            Open subject
          </Link>
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
            <TimetableWeek
              entries={workspace.timetable}
              periods={workspace.periods}
            />
          </section>

          <section className="school-day-panel">
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
                  {/* Handed-in files stay visible after submitting: a learner
                      asked whether their work arrived should be able to see
                      what the teacher received. */}
                  {assignment.attachments.length > 0 ? (
                    <ul className="submission-files">
                      {assignment.attachments.map((file) => (
                        <li key={file.id}>
                          <a
                            download={file.filename}
                            href={`/api/learn/submissions/attachment?attachmentId=${encodeURIComponent(file.id)}`}
                          >
                            {file.filename}
                          </a>
                          <span>{formatFileSize(file.sizeBytes)}</span>
                          {assignment.status === "not-started" ? (
                            <button
                              aria-label={`Remove ${file.filename}`}
                              onClick={() => void removeAttachment(file.id)}
                              type="button"
                            >
                              ×
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {assignment.feedback ? (
                    <p>{assignment.feedback}</p>
                  ) : assignment.status === "not-started" ? (
                    <LearnerSubmission
                      assignmentId={assignment.id}
                      attachFile={attachFile}
                      hasAttachments={assignment.attachments.length > 0}
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
    </>
  );
}

function LearnerSubmission({
  assignmentId,
  attachFile,
  hasAttachments,
  submitAssignment,
}: {
  assignmentId: string;
  attachFile: (assignmentId: string, file: File) => Promise<void>;
  hasAttachments: boolean;
  submitAssignment: (
    assignmentId: string,
    responseText: string,
  ) => Promise<void>;
}) {
  const [responseText, setResponseText] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    await attachFile(assignmentId, file);
    setBusy(false);
    /* Cleared so picking the same file again still fires a change event —
       otherwise a learner who removed a file cannot re-add it. */
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="learner-submission">
      <textarea
        onChange={(event) => setResponseText(event.target.value)}
        placeholder="Write your answer, or attach your work as a file"
        value={responseText}
      />
      <div className="learner-submission-actions">
        <label className="learner-attach">
          <input
            accept=".pdf,.doc,.docx,.odt,.txt,.rtf,.png,.jpg,.jpeg,.webp"
            disabled={busy}
            onChange={(event) => void chooseFile(event.target.files?.[0])}
            ref={fileRef}
            type="file"
          />
          <span>{busy ? "Attaching…" : "Attach a file"}</span>
        </label>
        {/* Either a written answer or an attached file counts as work — the
            server applies the same rule, this only mirrors it. */}
        <button
          disabled={busy || (!responseText.trim() && !hasAttachments)}
          onClick={() => void submitAssignment(assignmentId, responseText)}
          type="button"
        >
          Submit work
        </button>
      </div>
      <small>
        PDF, Word, or a photograph of your written work. Up to 25 MB each.
      </small>
    </div>
  );
}

/** Decimal units, so the page and the phone agree on the size of a file. */
function formatFileSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ["kB", "MB", "GB"];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
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
