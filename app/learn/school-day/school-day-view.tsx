"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { LearnerSchoolDayWorkspace } from "../../../db/operations-repository";
import { UploadIcon } from "../../components/icons";
import { TimetableWeek } from "./timetable-week";
import "../../school-day.css";

/* ==========================================================================
   No preview school day

   This screen opened on a fixture — Kwame Agyeman's Friday, a two-assignment
   list, a 66.7% attendance record and four periods of somebody else's
   timetable — and kept it whenever /api/learn/school-day failed.

   Handing work in while in that state ran a branch that moved the assignment
   to "submitted" in local state and reported "Preview response submitted."
   Nothing was written. A learner who had done their work, attached it and
   read a confirmation had submitted nothing at all, and the screen looked
   exactly like the one that works.

   The teacher screens had this removed for the same reason. What replaces it
   is three honest states: loading, the failure with the reason the server
   gave, and the school day itself.
   ========================================================================== */

export function SchoolDayView() {
  const [workspace, setWorkspace] = useState<LearnerSchoolDayWorkspace>();
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const [state, setState] = useState<"error" | "loading" | "ready">("loading");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadOnce() {
      try {
        const response = await fetch("/api/learn/school-day");
        const payload = (await response.json()) as {
          error?: string;
          workspace?: LearnerSchoolDayWorkspace;
        };
        if (!active) return;
        if (!response.ok || !payload.workspace) {
          throw new Error(payload.error ?? "Your school day is unavailable.");
        }
        setWorkspace(payload.workspace);
        setState("ready");
      } catch (thrown) {
        if (!active) return;
        setProblem(
          thrown instanceof Error
            ? thrown.message
            : "Your school day could not be reached.",
        );
        setState("error");
      }
    }

    void loadOnce();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  async function submitAssignment(
    assignmentId: string,
    responseText: string,
  ) {
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

  if (state === "loading") {
    return <p className="workspace-loading">Loading your school day…</p>;
  }

  if (state === "error" || !workspace) {
    return (
      <div className="workspace-failure">
        <h2>Your school day could not be loaded.</h2>
        <p>{problem}</p>
        <button onClick={() => setReloadKey((key) => key + 1)} type="button">
          Try again
        </button>
      </div>
    );
  }

  /* The next lesson on the timetable. Nothing is defaulted: a day with no
     more lessons on it says so rather than naming Integrated Science at
     09:10 in the Science Lab, which is what the fixture used to supply. */
  const nextEntry =
    workspace.timetable.find((entry) => entry.periodId === "period-2") ??
    workspace.timetable[0];

  return (
    <>
      <div className="school-day-page" id="today">
        {/* The date, the page title and its description now live in the
            workspace topbar, so this card carries only what it alone knows:
            which lesson is next. */}
        <section className="school-day-welcome">
          <div>
            <p>Up next</p>
            <h2>{nextEntry?.subjectName ?? "Nothing more today"}</h2>
            <span>
              {nextEntry
                ? [
                    periodFor(workspace, nextEntry.periodId)?.startsAt,
                    nextEntry.room,
                    nextEntry.teacherName,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Your timetable has no further lessons scheduled."}
            </span>
          </div>
          {/* Linked at the subject index rather than a subject: a timetable
              entry carries the subject's name, not its offering, so there is
              no id here to open. It used to point at the demo subject. */}
          <Link className="school-day-next-action" href="/learn/subjects">
            My subjects
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
              {/* Named after the section, so it goes to the section. It
                  pointed at one demo paper by slug — a link that opened
                  somebody else's assessment, and that 404s now the runner
                  only opens papers that exist. */}
              <Link href="/learn/assessments">Assessments ↗</Link>
            </div>
            <div className="learner-assignment-list">
              {workspace.assignments.map((assignment) => (
                <article key={assignment.id}>
                  <header>
                    {/* Read "IS" on every card, whatever the subject was. */}
                    <span>{subjectBadge(assignment.subjectName)}</span>
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
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
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

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setOver(false);
    void chooseFile(event.dataTransfer.files?.[0]);
  }

  return (
    <div className="learner-submission">
      {/* The label is the drop zone and the button at once, so the whole area
          is one target. The input itself stays in the DOM — it is the file
          picker, and no amount of styling replaces it — but out of sight,
          because the browser's own control cannot be made to look like
          anything and reads as a stray artefact next to real work.

          The written-answer box that used to sit above this is gone. An
          assignment is the model, the diagram, the four pages of working; a
          text box invited a sentence in place of the thing, typed on a phone
          by a child who had already done the task. */}
      <label
        className={`learner-drop${over ? " is-over" : ""}${
          busy ? " is-busy" : ""
        }`}
        onDragLeave={() => setOver(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDrop={onDrop}
      >
        <input
          accept=".pdf,.doc,.docx,.odt,.txt,.rtf,.png,.jpg,.jpeg,.webp"
          disabled={busy}
          onChange={(event) => void chooseFile(event.target.files?.[0])}
          ref={fileRef}
          type="file"
        />
        <span className="learner-drop-icon" aria-hidden="true">
          <UploadIcon size={22} />
        </span>
        <span className="learner-drop-copy">
          <strong>
            {busy
              ? "Attaching…"
              : hasAttachments
                ? "Add another file"
                : "Attach your work"}
          </strong>
          <small>
            Take a photograph of it, or choose a PDF or Word file. Up to 25 MB.
          </small>
        </span>
      </label>

      <div className="learner-submission-actions">
        {/* A file is the submission now, so the button follows that rule
            rather than a second one of its own. */}
        <button disabled={busy || !hasAttachments} onClick={() => void submitAssignment(assignmentId, "")} type="button">
          Hand in
        </button>
        {!hasAttachments ? (
          <small>Attach your work first.</small>
        ) : null}
      </div>
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


function periodFor(
  workspace: LearnerSchoolDayWorkspace,
  periodId?: string,
) {
  return workspace.periods.find((periodItem) => periodItem.id === periodId);
}

/* A short badge for the card. Derived from the name because an assignment
   carries its subject's name and not its code; the name is spelled out
   beside it, so this only has to be a recognisable stand-in. */
function subjectBadge(subjectName: string): string {
  const words = subjectName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "—";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
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
