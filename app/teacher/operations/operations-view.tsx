"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AttendanceRow,
  MarkingSubmission,
  TeacherOperationsWorkspace,
  TimetableEntryView,
} from "../../../db/operations-repository";
import type { AttendanceCode } from "../../../domain/operations/types";
import "../../admin/academic/academic.css";
import "./operations.css";

/* ==========================================================================
   No preview class

   This screen opened on JHS 2 Gold — a register of three learners, a marking
   queue with one handed-in submission and its rubric, a five-period day — and
   kept all of it whenever /api/teacher/operations failed. Submitting the
   register in that state ran updatePreview(), which moved the rows in local
   state and said "Preview updated. Register submitted."

   An attendance register that reports itself submitted and was never written
   is the worst of these to leave standing: a school's attendance record is
   evidence, and the guardian alerts that follow a submitted register are
   generated from rows that have to exist.
   ========================================================================== */

async function fetchWorkspace(
  offeringId?: string,
): Promise<{ error: string } | { workspace: TeacherOperationsWorkspace }> {
  try {
    const response = await fetch(
      offeringId
        ? `/api/teacher/operations?offeringId=${encodeURIComponent(offeringId)}`
        : "/api/teacher/operations",
    );
    const payload = (await response.json()) as {
      error?: string;
      workspace?: TeacherOperationsWorkspace;
    };
    if (!response.ok || !payload.workspace) {
      return { error: payload.error ?? "Your classes could not be loaded." };
    }
    return { workspace: payload.workspace };
  } catch {
    return { error: "Your classes could not be reached." };
  }
}

type OperationsTab = "today" | "assignments" | "attendance" | "timetable";

export function OperationsView() {
  const [workspace, setWorkspace] = useState<TeacherOperationsWorkspace | null>(
    null,
  );
  const [state, setState] = useState<"error" | "loading" | "ready">("loading");
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (offeringId?: string) => {
    setState("loading");
    const result = await fetchWorkspace(offeringId);
    if ("error" in result) {
      setProblem(result.error);
      setState("error");
      return;
    }
    setWorkspace(result.workspace);
    setState("ready");
  }, []);

  useEffect(() => {
    let active = true;

    async function loadOnce() {
      const result = await fetchWorkspace();
      if (!active) return;
      if ("error" in result) {
        setProblem(result.error);
        setState("error");
        return;
      }
      setWorkspace(result.workspace);
      setState("ready");
    }

    void loadOnce();
    return () => {
      active = false;
    };
  }, []);

  if (state === "loading") {
    return <p className="workspace-loading">Loading your classes…</p>;
  }

  if (state === "error" || !workspace) {
    return (
      <div className="workspace-failure">
        <h2>Your classes could not be loaded.</h2>
        <p>{problem}</p>
        <button onClick={() => void load()} type="button">
          Try again
        </button>
      </div>
    );
  }

  return (
    <LoadedOperations
      busy={busy}
      notice={notice}
      selectOffering={(offeringId) => void load(offeringId)}
      setBusy={setBusy}
      setNotice={setNotice}
      setWorkspace={setWorkspace}
      workspace={workspace}
    />
  );
}

/* Split from the loader so the rest can take a workspace that is present. */
function LoadedOperations({
  busy,
  notice,
  selectOffering,
  setBusy,
  setNotice,
  setWorkspace,
  workspace,
}: {
  busy: boolean;
  notice: string;
  selectOffering: (offeringId: string) => void;
  setBusy: (value: boolean) => void;
  setNotice: (value: string) => void;
  setWorkspace: (value: TeacherOperationsWorkspace) => void;
  workspace: TeacherOperationsWorkspace;
}) {
  const [tab, setTab] = useState<OperationsTab>("today");

  async function runAction(body: Record<string, unknown>) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/teacher/operations", {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        workspace?: TeacherOperationsWorkspace;
      };
      if (!response.ok || !payload.workspace) {
        throw new Error(payload.error ?? "The action could not be completed.");
      }
      setWorkspace(payload.workspace);
      setNotice(actionMessage(String(body.action)));
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The action failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const todayEntries = workspace.timetable.filter(
    (entry) => entry.weekday === 5,
  );
  const nextEntry = todayEntries[1];

  return (
    <>

      <section className="operations-main">

        <div className="operations-content">
          <section className="operations-hero">
            <div>
              <span className="operations-class-code">J2</span>
              {/* Read "JHS 2 Gold · Integrated Science" to everyone, because
                  the screen was gated on that one offering and its register on
                  that one class. Choosing a subject here chooses its class. */}
              {workspace.offerings.length > 1 ? (
                <label className="operations-subject-switch">
                  <span className="sr-only">Class and subject</span>
                  <select
                    onChange={(event) => selectOffering(event.target.value)}
                    value={workspace.offeringId ?? ""}
                  >
                    {workspace.offerings.map((offering) => (
                      <option key={offering.id} value={offering.id}>
                        {offering.className} · {offering.subjectName}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p>
                  {workspace.className} · {workspace.subjectName}
                </p>
              )}
              <h2>Registers, marking, and guardian alerts</h2>
              <p>
                Everything recorded here writes to the {workspace.className}{" "}
                class record.
              </p>
            </div>
            {/* Defaulted to "Integrated Science · 09:10 · Science Lab" when
                the day held no second period — a lesson the teacher does not
                have, at a time they are not teaching. A class with nothing
                left on its timetable says so. */}
            <div className="operations-next">
              <span>Next lesson</span>
              {nextEntry ? (
                <>
                  <strong>{nextEntry.subjectName}</strong>
                  <small>
                    {periodFor(workspace, nextEntry)?.startsAt} ·{" "}
                    {nextEntry.room}
                  </small>
                  <i>On schedule</i>
                </>
              ) : (
                <>
                  <strong>Nothing scheduled</strong>
                  <small>No further periods on today’s timetable</small>
                </>
              )}
            </div>
          </section>

          {notice ? (
            <button
              className="operations-notice"
              onClick={() => setNotice("")}
              type="button"
            >
              {notice} <span>×</span>
            </button>
          ) : null}

          <section className="operations-metrics">
            <article>
              <span>Attendance</span>
              <strong>
                {workspace.attendance.summary.percentage.toFixed(1)}%
              </strong>
              <small>{workspace.attendance.status} register</small>
            </article>
            <article>
              <span>Needs marking</span>
              <strong>{workspace.markingQueue.length}</strong>
              <small>Rubric-ready submissions</small>
            </article>
            <article>
              <span>Open assignments</span>
              <strong>{workspace.assignments.length}</strong>
              <small>Published to learners</small>
            </article>
            <article>
              <span>Today&apos;s periods</span>
              <strong>{todayEntries.length}</strong>
              <small>No timetable clashes</small>
            </article>
          </section>

          <div className="operations-tabs" role="tablist">
            {[
              ["today", "Today"],
              ["assignments", "Assignments & rubrics"],
              ["attendance", "Attendance"],
              ["timetable", "Timetable"],
            ].map(([id, label]) => (
              <button
                aria-selected={tab === id}
                className={tab === id ? "is-active" : ""}
                key={id}
                onClick={() => setTab(id as OperationsTab)}
                role="tab"
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "today" ? (
            <TodayPanel
              setTab={setTab}
              todayEntries={todayEntries}
              workspace={workspace}
            />
          ) : null}
          {tab === "assignments" ? (
            <AssignmentsPanel
              busy={busy}
              runAction={runAction}
              workspace={workspace}
            />
          ) : null}
          {tab === "attendance" ? (
            <AttendancePanel
              busy={busy}
              runAction={runAction}
              workspace={workspace}
            />
          ) : null}
          {tab === "timetable" ? (
            <TimetablePanel
              busy={busy}
              runAction={runAction}
              workspace={workspace}
            />
          ) : null}
        </div>
      </section>
    </>
  );
}

function TodayPanel({
  setTab,
  todayEntries,
  workspace,
}: {
  setTab: (tab: OperationsTab) => void;
  todayEntries: TimetableEntryView[];
  workspace: TeacherOperationsWorkspace;
}) {
  return (
    <div className="today-layout">
      <section className="operations-panel">
        <PanelHeading eyebrow="Timetable" title="Today’s lessons" />
        <div className="today-timeline">
          {todayEntries.map((entry, index) => {
            const period = periodFor(workspace, entry);
            return (
              <article className={index === 1 ? "is-next" : ""} key={entry.id}>
                <time>{period?.startsAt}</time>
                <span>
                  <i />
                </span>
                <div>
                  <strong>{entry.subjectName}</strong>
                  <small>
                    {entry.room} ·{" "}
                    {entry.substituteTeacherName ?? entry.teacherName}
                  </small>
                </div>
                <em>{index === 1 ? "Next" : entry.status}</em>
              </article>
            );
          })}
        </div>
      </section>
      <aside className="operations-action-stack">
        <button onClick={() => setTab("attendance")} type="button">
          <span className="action-symbol green">✓</span>
          <div>
            <small>Register</small>
            <strong>
              {workspace.attendance.status === "draft"
                ? "Submit attendance"
                : "Attendance recorded"}
            </strong>
            <p>
              {workspace.attendance.summary.late} late ·{" "}
              {workspace.attendance.summary.absent} absent
            </p>
          </div>
          <b>→</b>
        </button>
        <button onClick={() => setTab("assignments")} type="button">
          <span className="action-symbol gold">◆</span>
          <div>
            <small>Marking queue</small>
            <strong>{workspace.markingQueue.length} submissions waiting</strong>
            <p>Release criterion-level feedback</p>
          </div>
          <b>→</b>
        </button>
        <div>
          <span className="action-symbol blue">◎</span>
          <div>
            <small>Family updates</small>
            <strong>Guardian-ready information</strong>
            <p>Only released alerts and due work are shared</p>
          </div>
          <b>→</b>
        </div>
      </aside>
    </div>
  );
}

function AssignmentsPanel({
  busy,
  runAction,
  workspace,
}: {
  busy: boolean;
  runAction: (body: Record<string, unknown>) => Promise<void>;
  workspace: TeacherOperationsWorkspace;
}) {
  const [showForm, setShowForm] = useState(false);
  return (
    <div className="assignment-layout">
      <section className="operations-panel">
        <div className="panel-heading-row">
          <PanelHeading
            eyebrow="Published work"
            title="Assignments & rubrics"
          />
          <button
            className="operations-primary"
            onClick={() => setShowForm((current) => !current)}
            type="button"
          >
            {showForm ? "Close form" : "New assignment"}
          </button>
        </div>
        {showForm ? (
          <AssignmentForm busy={busy} runAction={runAction} />
        ) : null}
        {workspace.assignments.length === 0 ? (
          <div className="workspace-empty">
            <strong>No assignments yet</strong>
            <p>
              Published assignments and their rubrics appear here, with what
              learners have handed in.
            </p>
          </div>
        ) : null}
        <div className="assignment-list">
          {workspace.assignments.map((assignmentItem) => (
            <article key={assignmentItem.id}>
              <header>
                <span>IS</span>
                <div>
                  <h3>{assignmentItem.title}</h3>
                  <p>
                    Due {formatDateTime(assignmentItem.dueAt)} ·{" "}
                    {assignmentItem.maximumPoints} points
                  </p>
                </div>
                <em>{assignmentItem.status}</em>
              </header>
              <div className="assignment-progress">
                <span>
                  <i
                    style={{
                      width: `${
                        (assignmentItem.submissionCount / 3) * 100
                      }%`,
                    }}
                  />
                </span>
                <small>
                  {assignmentItem.submissionCount}/3 learner records ·{" "}
                  {assignmentItem.needsMarking} need marking
                </small>
              </div>
              <footer>
                {assignmentItem.rubric.map((criterion) => (
                  <span key={criterion.id}>
                    <strong>{criterion.name}</strong>
                    <small>/{criterion.maximumPoints}</small>
                  </span>
                ))}
              </footer>
            </article>
          ))}
        </div>
      </section>

      <section className="operations-panel marking-panel">
        <PanelHeading
          eyebrow="Criterion-level feedback"
          title="Marking queue"
        />
        {workspace.markingQueue.length > 0 ? (
          <div className="marking-list">
            {workspace.markingQueue.map((item) => (
              <RubricMarker
                busy={busy}
                item={item}
                key={item.id}
                runAction={runAction}
              />
            ))}
          </div>
        ) : (
          <div className="operations-empty">
            <span>✓</span>
            <strong>Marking queue clear</strong>
            <p>Released feedback is now visible to learners.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function AssignmentForm({
  busy,
  runAction,
}: {
  busy: boolean;
  runAction: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [title, setTitle] = useState("Food and nutrition reflection");
  const [brief, setBrief] = useState(
    "Explain one change that would make a daily meal more balanced.",
  );
  const [dueAt, setDueAt] = useState("2026-07-31T16:00");
  return (
    <form
      className="assignment-form"
      onSubmit={(event) => {
        event.preventDefault();
        void runAction({
          action: "create-assignment",
          brief,
          criteria: [
            {
              description: "The explanation uses accurate nutrition ideas.",
              maximumPoints: 6,
              name: "Subject understanding",
            },
            {
              description: "The response is clear and well supported.",
              maximumPoints: 4,
              name: "Communication",
            },
          ],
          dueAt: new Date(dueAt).toISOString(),
          title,
        });
      }}
    >
      <label>
        <span>Assignment title</span>
        <input
          onChange={(event) => setTitle(event.target.value)}
          required
          value={title}
        />
      </label>
      <label className="form-wide">
        <span>Learner brief</span>
        <textarea
          onChange={(event) => setBrief(event.target.value)}
          required
          value={brief}
        />
      </label>
      <label>
        <span>Due date and time</span>
        <input
          onChange={(event) => setDueAt(event.target.value)}
          required
          type="datetime-local"
          value={dueAt}
        />
      </label>
      <div className="assignment-rubric-preview">
        <span>Rubric snapshot</span>
        <strong>Understanding /6 + Communication /4</strong>
        <small>Published criteria become immutable.</small>
      </div>
      <button disabled={busy} type="submit">
        Publish assignment
      </button>
    </form>
  );
}

function RubricMarker({
  busy,
  item,
  runAction,
}: {
  busy: boolean;
  item: MarkingSubmission;
  runAction: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [scores, setScores] = useState<Record<string, string>>(
    Object.fromEntries(item.criteria.map((criterion) => [criterion.id, ""])),
  );
  const [feedback, setFeedback] = useState(
    "Strong connection between the two systems. Add one more label to make the pathway easier to follow.",
  );
  const complete = item.criteria.every(
    (criterion) => scores[criterion.id] !== "",
  );
  return (
    <article>
      <header>
        <span>{initials(item.learnerName)}</span>
        <div>
          <strong>{item.learnerName}</strong>
          <small>
            {item.studentId} · {item.assignmentTitle}
          </small>
        </div>
        <em>{item.status}</em>
      </header>
      {item.responseText ? (
        <p className="learner-response">{item.responseText}</p>
      ) : null}

      {/* Handed-in files open in a new tab so the marker keeps this form, and
          the scores they have already typed into it. */}
      {item.attachments.length > 0 ? (
        <ul className="submission-files">
          {item.attachments.map((file) => (
            <li key={file.id}>
              <a
                href={`/api/learn/submissions/attachment?attachmentId=${encodeURIComponent(file.id)}`}
                rel="noreferrer noopener"
                target="_blank"
              >
                {file.filename}
              </a>
              <span>{formatFileSize(file.sizeBytes)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {!item.responseText && item.attachments.length === 0 ? (
        <p className="learner-response">
          Handed in with no written answer and no attached file.
        </p>
      ) : null}

      <div className="rubric-score-grid">
        {item.criteria.map((criterion) => (
          <label key={criterion.id}>
            <span>{criterion.name}</span>
            <small>{criterion.description}</small>
            <div>
              <input
                max={criterion.maximumPoints}
                min="0"
                onChange={(event) =>
                  setScores((current) => ({
                    ...current,
                    [criterion.id]: event.target.value,
                  }))
                }
                type="number"
                value={scores[criterion.id]}
              />
              <b>/{criterion.maximumPoints}</b>
            </div>
          </label>
        ))}
      </div>
      <label className="feedback-field">
        <span>Feedback to learner</span>
        <textarea
          onChange={(event) => setFeedback(event.target.value)}
          value={feedback}
        />
      </label>
      <footer>
        <span>
          Submitted {formatDateTime(item.submittedAt)}
        </span>
        <button
          disabled={busy || !complete}
          onClick={() =>
            void runAction({
              action: "release-rubric",
              feedback,
              scores: item.criteria.map((criterion) => ({
                criterionId: criterion.id,
                points: Number(scores[criterion.id]),
              })),
              submissionId: item.id,
            })
          }
          type="button"
        >
          Release marks
        </button>
      </footer>
    </article>
  );
}

function AttendancePanel({
  busy,
  runAction,
  workspace,
}: {
  busy: boolean;
  runAction: (body: Record<string, unknown>) => Promise<void>;
  workspace: TeacherOperationsWorkspace;
}) {
  return (
    <section className="operations-panel">
      <div className="panel-heading-row">
        <PanelHeading
          eyebrow={`${formatLongDate(workspace.attendance.date)} · Daily register`}
          title={`${workspace.className} attendance`}
        />
        <span className={`attendance-state ${workspace.attendance.status}`}>
          {workspace.attendance.status}
        </span>
      </div>
      <div className="attendance-summary">
        <span>
          <strong>{workspace.attendance.summary.presentEquivalent}</strong>
          <small>Present-equivalent</small>
        </span>
        <span>
          <strong>{workspace.attendance.summary.late}</strong>
          <small>Late</small>
        </span>
        <span>
          <strong>{workspace.attendance.summary.absent}</strong>
          <small>Absent</small>
        </span>
        <span>
          <strong>{workspace.attendance.summary.excused}</strong>
          <small>Excused</small>
        </span>
      </div>
      {workspace.attendance.rows.length === 0 ? (
        <div className="workspace-empty">
          <strong>No register for today</strong>
          <p>
            A register appears once learners have been placed into this class.
          </p>
        </div>
      ) : null}
      <div className="attendance-table-wrap">
        <table className="attendance-table">
          <thead>
            <tr>
              <th>Learner</th>
              <th>Attendance code</th>
              <th>Teacher note</th>
              <th>Record</th>
            </tr>
          </thead>
          <tbody>
            {workspace.attendance.rows.map((row) => (
              <AttendanceEditor
                busy={busy}
                key={row.recordId}
                row={row}
                runAction={runAction}
                submitted={workspace.attendance.status !== "draft"}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="attendance-submit">
        <div>
          <strong>
            {workspace.attendance.status === "draft"
              ? "Ready to submit the class register"
              : "Register evidence is write-frozen"}
          </strong>
          <small>
            Submitted unexcused absences issue one guardian alert.
          </small>
        </div>
        <button
          disabled={busy || workspace.attendance.status !== "draft"}
          onClick={() => void runAction({
                action: "submit-attendance",
                offeringId: workspace.offeringId,
              })}
          type="button"
        >
          {workspace.attendance.status === "draft"
            ? "Submit register"
            : "Register submitted"}
        </button>
      </div>
    </section>
  );
}

function AttendanceEditor({
  busy,
  row,
  runAction,
  submitted,
}: {
  busy: boolean;
  row: AttendanceRow;
  runAction: (body: Record<string, unknown>) => Promise<void>;
  submitted: boolean;
}) {
  const [code, setCode] = useState<AttendanceCode>(row.code);
  const [note, setNote] = useState(row.note ?? "");
  const [reason, setReason] = useState("");
  return (
    <tr>
      <td>
        <span className="attendance-learner">
          <b>{initials(row.learnerName)}</b>
          <span>
            <strong>{row.learnerName}</strong>
            <small>{row.studentId}</small>
          </span>
        </span>
      </td>
      <td>
        <select
          onChange={(event) =>
            setCode(event.target.value as AttendanceCode)
          }
          value={code}
        >
          {attendanceCodes.map((item) => (
            <option key={item} value={item}>
              {humanise(item)}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          onChange={(event) => setNote(event.target.value)}
          placeholder={submitted ? "Correction note" : "Optional note"}
          value={note}
        />
        {submitted ? (
          <input
            className="correction-reason"
            onChange={(event) => setReason(event.target.value)}
            placeholder="Required correction reason"
            value={reason}
          />
        ) : null}
      </td>
      <td>
        <button
          disabled={busy || (submitted && !reason.trim())}
          onClick={() =>
            void runAction({
              action: "save-attendance",
              code,
              correctionReason: reason,
              note,
              recordId: row.recordId,
            })
          }
          type="button"
        >
          {submitted ? "Correct" : "Save"}
        </button>
      </td>
    </tr>
  );
}

function TimetablePanel({
  busy,
  runAction,
  workspace,
}: {
  busy: boolean;
  runAction: (body: Record<string, unknown>) => Promise<void>;
  workspace: TeacherOperationsWorkspace;
}) {
  return (
    <section className="operations-panel">
      <div className="panel-heading-row">
        <PanelHeading
          eyebrow="Class, teacher, and room checked"
          title="Weekly timetable"
        />
        <span className="clash-free">✓ No active clashes</span>
      </div>
      <div className="timetable-grid-wrap">
        <div className="timetable-grid">
          <div className="timetable-corner">Period</div>
          {weekdays.map((day) => (
            <strong className="timetable-day" key={day}>
              {day}
            </strong>
          ))}
          {workspace.periods.map((periodItem) => (
            <TimetableRow
              busy={busy}
              key={periodItem.id}
              periodItem={periodItem}
              runAction={runAction}
              workspace={workspace}
            />
          ))}
        </div>
      </div>
      <p className="timetable-footnote">
        Cancelling or substituting an active period requires a reason and
        creates an audit event.
      </p>
    </section>
  );
}

function TimetableRow({
  busy,
  periodItem,
  runAction,
  workspace,
}: {
  busy: boolean;
  periodItem: TeacherOperationsWorkspace["periods"][number];
  runAction: (body: Record<string, unknown>) => Promise<void>;
  workspace: TeacherOperationsWorkspace;
}) {
  return (
    <>
      <div
        className={
          periodItem.kind === "break"
            ? "timetable-period is-break"
            : "timetable-period"
        }
      >
        <strong>{periodItem.name}</strong>
        <small>
          {periodItem.startsAt}–{periodItem.endsAt}
        </small>
      </div>
      {weekdays.map((_, dayIndex) => {
        const entry = workspace.timetable.find(
          (item) =>
            item.weekday === dayIndex + 1 &&
            item.periodId === periodItem.id,
        );
        if (periodItem.kind === "break") {
          return (
            <div className="timetable-cell break-cell" key={dayIndex}>
              Break
            </div>
          );
        }
        return entry ? (
          <TimetableCell
            busy={busy}
            entry={entry}
            key={entry.id}
            runAction={runAction}
          />
        ) : (
          <div className="timetable-cell empty-cell" key={dayIndex}>
            —
          </div>
        );
      })}
    </>
  );
}

function TimetableCell({
  busy,
  entry,
  runAction,
}: {
  busy: boolean;
  entry: TimetableEntryView;
  runAction: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div className={`timetable-cell ${entry.status}`}>
      <strong>{entry.subjectName}</strong>
      <small>{entry.room}</small>
      <span>{entry.substituteTeacherName ?? entry.teacherName}</span>
      {entry.status === "cancelled" ? <em>Cancelled</em> : null}
      {editing ? (
        <div className="timetable-change">
          <input
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason"
            value={reason}
          />
          <button
            disabled={busy || !reason.trim()}
            onClick={() =>
              void runAction({
                action: "change-timetable",
                entryId: entry.id,
                reason,
                status: "cancelled",
              })
            }
            type="button"
          >
            Confirm
          </button>
        </div>
      ) : entry.status === "scheduled" ? (
        <button onClick={() => setEditing(true)} type="button">
          Change
        </button>
      ) : null}
    </div>
  );
}

function PanelHeading({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="operations-panel-heading">
      <p>{eyebrow}</p>
      <h2>{title}</h2>
    </div>
  );
}

function periodFor(
  workspace: TeacherOperationsWorkspace,
  entry?: TimetableEntryView,
) {
  return workspace.periods.find((item) => item.id === entry?.periodId);
}

/** Decimal units, so the page and the marker's own file manager agree. */
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

function actionMessage(action: string) {
  const prefix = "";
  const messages: Record<string, string> = {
    "change-timetable": "Timetable change recorded with its reason.",
    "create-assignment": "Assignment and rubric published to the class.",
    "release-rubric": "Criterion scores and feedback released.",
    "save-attendance": "Attendance record saved.",
    "submit-attendance":
      "Register submitted; eligible guardian alerts were issued once.",
  };
  return `${prefix}${messages[action] ?? "School record updated."}`;
}

const attendanceCodes: AttendanceCode[] = [
  "present",
  "absent",
  "late",
  "excused",
  "sick",
  "school-activity",
  "remote",
];

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
