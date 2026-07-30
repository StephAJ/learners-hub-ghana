"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  AttendanceRow,
  MarkingSubmission,
  TeacherOperationsWorkspace,
  TimetableEntryView,
} from "../../../db/operations-repository";
import type { AttendanceCode } from "../../../domain/operations/types";
import "../../admin/academic/academic.css";
import "./operations.css";

const navigation = [
  { href: "/teacher", label: "Today", symbol: "⌂" },
  { href: "/teacher/operations", label: "My classes", symbol: "◎" },
  { href: "/teacher/subjects", label: "Lessons", symbol: "▦" },
  { href: "/teacher/content", label: "Content studio", symbol: "◫" },
  { href: "/teacher/assessments", label: "Assessments", symbol: "✓" },
  { href: "/teacher/gradebook", label: "Gradebook", symbol: "↗" },
];

const attendanceRows: AttendanceRow[] = [
  attendance("person-ama", "Ama Serwaa", "LH-260112", "present"),
  attendance("person-kwame", "Kwame Agyeman", "LH-260138", "present"),
  attendance("person-kojo", "Kojo Boateng", "LH-260145", "late"),
];

const previewRubric = [
  {
    description:
      "Labels, functions, and scientific relationships are correct.",
    id: "criterion-science-accuracy",
    maximumPoints: 12,
    name: "Scientific accuracy",
  },
  {
    description:
      "The model and explanation communicate the idea clearly.",
    id: "criterion-science-communication",
    maximumPoints: 8,
    name: "Communication",
  },
];

const previewWorkspace: TeacherOperationsWorkspace = {
  assignments: [
    {
      dueAt: "2026-07-28T16:00:00Z",
      id: "assignment-body-systems",
      maximumPoints: 20,
      needsMarking: 2,
      rubric: previewRubric,
      status: "published",
      submissionCount: 3,
      title: "Body systems model",
    },
  ],
  attendance: {
    date: "2026-07-24",
    rows: attendanceRows,
    sessionId: "attendance-2026-07-24",
    status: "draft",
    summary: summarize(attendanceRows),
  },
  className: "JHS 2 Gold",
  currentDate: "2026-07-24",
  markingQueue: [
    submission(
      "submission-body-kwame",
      "Kwame Agyeman",
      "LH-260138",
      "My model connects the digestive and circulatory systems. Nutrients pass through the small intestine into the blood, which carries them to body cells.",
    ),
    submission(
      "submission-body-ama",
      "Ama Serwaa",
      "LH-260112",
      "I linked the respiratory and circulatory systems and labelled how oxygen travels from the lungs to cells.",
    ),
  ],
  periods: [
    period("period-1", "Period 1", 1, "08:00", "09:00", "lesson"),
    period("period-2", "Period 2", 2, "09:10", "10:10", "lesson"),
    period("period-break", "Break", 3, "10:10", "10:35", "break"),
    period("period-3", "Period 3", 4, "10:35", "11:35", "lesson"),
    period("period-4", "Period 4", 5, "11:45", "12:45", "lesson"),
  ],
  subjectName: "Integrated Science",
  timetable: [
    timetable("timetable-5-1", "period-1", "Social Studies", "Block B · Room 2", "Emmanuel Ofori"),
    timetable("timetable-5-2", "period-2", "Integrated Science", "Science Lab", "Grace Mensah"),
    timetable("timetable-5-3", "period-3", "English Language", "Block A · Room 4", "Mary Asante"),
    timetable("timetable-5-4", "period-4", "Mathematics", "Block A · Room 4", "Emmanuel Ofori"),
  ],
};

type OperationsTab = "today" | "assignments" | "attendance" | "timetable";

export default function TeacherOperationsPage() {
  const [workspace, setWorkspace] = useState(previewWorkspace);
  const [actor, setActor] = useState("Emmanuel Ofori");
  const [tab, setTab] = useState<OperationsTab>("today");
  const [mode, setMode] = useState<"loading" | "protected" | "preview">(
    "loading",
  );
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void load();

    async function load() {
      try {
        const response = await fetch("/api/teacher/operations");
        if (!response.ok) throw new Error("Operations unavailable.");
        const payload = (await response.json()) as {
          actor: string;
          workspace: TeacherOperationsWorkspace;
        };
        if (!active) return;
        setActor(payload.actor);
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

  async function runAction(body: Record<string, unknown>) {
    setBusy(true);
    setNotice("");
    if (mode !== "protected") {
      setWorkspace((current) => updatePreview(current, body));
      setNotice(actionMessage(String(body.action), true));
      setBusy(false);
      return;
    }
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
      setNotice(actionMessage(String(body.action), false));
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

  return (
    <main className="operations-shell">
      <aside className="academic-sidebar operations-sidebar">
        <Link className="academic-brand" href="/teacher">
          <span className="academic-brand-mark">LH</span>
          <span>
            <strong>Learners Hub</strong>
            <small>Daily operations</small>
          </span>
        </Link>
        <nav aria-label="Teacher navigation">
          {navigation.map((item) => (
            <Link
              className={
                item.href === "/teacher/operations" ? "is-active" : ""
              }
              href={item.href}
              key={item.label}
            >
              <span>{item.symbol}</span>
              {item.label}
              {item.label === "School day" &&
              workspace.markingQueue.length > 0 ? (
                <b>{workspace.markingQueue.length}</b>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="operations-side-card">
          <span>Friday register</span>
          <strong>{workspace.attendance.status}</strong>
          <small>
            {workspace.attendance.summary.percentage.toFixed(1)}% recorded
            attendance
          </small>
        </div>
      </aside>

      <section className="operations-main">
        <header className="operations-topbar">
          <div>
            <p>{formatLongDate(workspace.currentDate)}</p>
            <h1>School day</h1>
          </div>
          <div className="operations-account">
            <span className={`operations-dot ${mode}`} />
            <div>
              <strong>{actor}</strong>
              <small>
                {mode === "protected"
                  ? "School records connected"
                  : mode === "loading"
                    ? "Connecting records"
                    : "Preview workspace"}
              </small>
            </div>
            <b>{initials(actor)}</b>
          </div>
        </header>

        <div className="operations-content">
          <section className="operations-hero">
            <div>
              <span className="operations-class-code">J2</span>
              <p>
                {workspace.className} · Class and subject operations
              </p>
              <h2>Registers, marking, and guardian alerts</h2>
              <p>
                Everything recorded here writes to the {workspace.className}{" "}
                class record.
              </p>
            </div>
            <div className="operations-next">
              <span>Next lesson</span>
              <strong>{todayEntries[1]?.subjectName ?? "Integrated Science"}</strong>
              <small>
                {periodFor(workspace, todayEntries[1])?.startsAt ?? "09:10"} ·{" "}
                {todayEntries[1]?.room ?? "Science Lab"}
              </small>
              <i>On schedule</i>
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
    </main>
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
      <p className="learner-response">{item.responseText}</p>
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
          onClick={() => void runAction({ action: "submit-attendance" })}
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

function updatePreview(
  workspace: TeacherOperationsWorkspace,
  body: Record<string, unknown>,
) {
  const action = String(body.action);
  if (action === "save-attendance") {
    const rows = workspace.attendance.rows.map((row) =>
      row.recordId === body.recordId
        ? {
            ...row,
            code: body.code as AttendanceCode,
            note: String(body.note ?? ""),
          }
        : row,
    );
    return {
      ...workspace,
      attendance: {
        ...workspace.attendance,
        rows,
        status:
          workspace.attendance.status === "draft"
            ? "draft" as const
            : "corrected" as const,
        summary: summarize(rows),
      },
    };
  }
  if (action === "submit-attendance") {
    return {
      ...workspace,
      attendance: { ...workspace.attendance, status: "submitted" as const },
    };
  }
  if (action === "release-rubric") {
    return {
      ...workspace,
      markingQueue: workspace.markingQueue.filter(
        (item) => item.id !== body.submissionId,
      ),
    };
  }
  if (action === "change-timetable") {
    return {
      ...workspace,
      timetable: workspace.timetable.map((entry) =>
        entry.id === body.entryId
          ? {
              ...entry,
              changeReason: String(body.reason),
              status: body.status as TimetableEntryView["status"],
            }
          : entry,
      ),
    };
  }
  if (action === "create-assignment") {
    const criteria = body.criteria as Array<{
      description: string;
      maximumPoints: number;
      name: string;
    }>;
    return {
      ...workspace,
      assignments: [
        ...workspace.assignments,
        {
          dueAt: String(body.dueAt),
          id: `preview-${Date.now()}`,
          maximumPoints: criteria.reduce(
            (sum, item) => sum + item.maximumPoints,
            0,
          ),
          needsMarking: 0,
          rubric: criteria.map((item, index) => ({
            ...item,
            id: `preview-criterion-${index}`,
          })),
          status: "published",
          submissionCount: 3,
          title: String(body.title),
        },
      ],
    };
  }
  return workspace;
}

function attendance(
  learnerPersonId: string,
  learnerName: string,
  studentId: string,
  code: AttendanceCode,
): AttendanceRow {
  return {
    code,
    learnerName,
    learnerPersonId,
    note: "",
    recordId: `attendance-2026-07-24:${learnerPersonId}`,
    studentId,
  };
}

function submission(
  id: string,
  learnerName: string,
  studentId: string,
  responseText: string,
): MarkingSubmission {
  return {
    assignmentId: "assignment-body-systems",
    assignmentTitle: "Body systems model",
    criteria: previewRubric,
    id,
    learnerName,
    responseText,
    status: "submitted",
    studentId,
    submittedAt: "2026-07-23T15:14:00Z",
  };
}

function period(
  id: string,
  name: string,
  position: number,
  startsAt: string,
  endsAt: string,
  kind: "lesson" | "break" | "assembly",
) {
  return { endsAt, id, kind, name, position, startsAt };
}

function timetable(
  id: string,
  periodId: string,
  subjectName: string,
  room: string,
  teacherName: string,
): TimetableEntryView {
  return {
    changeReason: null,
    id,
    periodId,
    room,
    status: "scheduled",
    subjectName,
    substituteTeacherName: null,
    teacherName,
    weekday: 5,
  };
}

function summarize(rows: AttendanceRow[]) {
  const excused = rows.filter((row) => row.code === "excused").length;
  const late = rows.filter((row) => row.code === "late").length;
  const absent = rows.filter(
    (row) => row.code === "absent" || row.code === "sick",
  ).length;
  const presentEquivalent = rows.filter((row) =>
    ["present", "late", "school-activity", "remote"].includes(row.code),
  ).length;
  const totalCounted = rows.length - excused;
  return {
    absent,
    excused,
    late,
    percentage:
      totalCounted > 0
        ? Math.round((presentEquivalent / totalCounted) * 1000) / 10
        : 0,
    presentEquivalent,
    totalCounted,
  };
}

function periodFor(
  workspace: TeacherOperationsWorkspace,
  entry?: TimetableEntryView,
) {
  return workspace.periods.find((item) => item.id === entry?.periodId);
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

function actionMessage(action: string, preview: boolean) {
  const prefix = preview ? "Preview updated. " : "";
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
