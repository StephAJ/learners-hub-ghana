"use client";

import { useEffect, useState } from "react";
import type {
  GradebookLearner,
  TeacherGradebookWorkspace,
} from "../../../db/reporting-repository";
import { useOfferingParam } from "../../components/offering-param";
import "../../admin/academic/academic.css";
import "./gradebook.css";

/* ==========================================================================
   No preview markbook

   This screen used to open on a hardcoded copy of Grace Mensah's Integrated
   Science — three learners, three grade items, a full grading scale — and it
   kept that copy whenever /api/teacher/gradebook failed, in a mode called
   "preview". Marking a learner in that mode ran updatePreview(), which moved
   the mark in local state, invented a grade for the one learner it knew by
   id, and reported "Missing mark recorded in this preview."

   Nothing was written, and the screen looked exactly like the working one.
   Every teacher-side fault therefore rendered as a working markbook holding
   another school's marks — including, until this week, an authorisation
   refusal for any teacher who does not teach Integrated Science.

   What replaces it is three honest states: loading, the failure with the
   reason the server gave, and the markbook itself.
   ========================================================================== */

async function fetchWorkspace(
  offeringId?: string,
): Promise<{ error: string } | { workspace: TeacherGradebookWorkspace }> {
  try {
    const response = await fetch(
      offeringId
        ? `/api/teacher/gradebook?offeringId=${encodeURIComponent(offeringId)}`
        : "/api/teacher/gradebook",
    );
    const payload = (await response.json()) as {
      error?: string;
      workspace?: TeacherGradebookWorkspace;
    };
    if (!response.ok || !payload.workspace) {
      return { error: payload.error ?? "The markbook could not be loaded." };
    }
    return { workspace: payload.workspace };
  } catch {
    return { error: "The markbook could not be reached." };
  }
}

type GradebookTab = "marks" | "reports" | "policy";

export function GradebookView() {
  const [workspace, setWorkspace] = useState<TeacherGradebookWorkspace | null>(
    null,
  );
  const [tab, setTab] = useState<GradebookTab>("marks");
  const [state, setState] = useState<"error" | "loading" | "ready">("loading");
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  const [busyAction, setBusyAction] = useState("");

  /* The subject comes from the address bar, so a teacher who chose one on
     their lesson library opens the markbook already on it. */
  const { offeringId, setOfferingId } = useOfferingParam();
  /* Bumped by Try again, which needs to re-run a load the URL would not
     change on its own. */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadOnce() {
      const result = await fetchWorkspace(offeringId);
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
  }, [offeringId, reloadKey]);

  /* Both put the screen into its loading state from an event handler, where
     the spinner should appear the moment the control is pressed. */
  function selectOffering(next: string) {
    /* Nothing to wait for if it is already the subject on screen — and
       setting the loading state without a URL change would leave the
       spinner up with no effect due to run. */
    if (next === offeringId) return;
    setState("loading");
    setOfferingId(next);
  }

  function retry() {
    setState("loading");
    setReloadKey((current) => current + 1);
  }

  if (state === "loading") {
    return <p className="workspace-loading">Loading your markbook…</p>;
  }

  if (state === "error" || !workspace) {
    return (
      <div className="workspace-failure">
        <h2>Your markbook could not be loaded.</h2>
        <p>{problem}</p>
        <button onClick={retry} type="button">
          Try again
        </button>
      </div>
    );
  }

  return (
    <LoadedGradebook
      busyAction={busyAction}
      notice={notice}
      setBusyAction={setBusyAction}
      setNotice={setNotice}
      setTab={setTab}
      setWorkspace={setWorkspace}
      tab={tab}
      selectOffering={selectOffering}
      workspace={workspace}
    />
  );
}

/* Split out so everything below can take a workspace that is present, rather
   than testing for null on every line of a 500-line render. */
function LoadedGradebook({
  busyAction,
  notice,
  selectOffering,
  setBusyAction,
  setNotice,
  setTab,
  setWorkspace,
  tab,
  workspace,
}: {
  busyAction: string;
  notice: string;
  selectOffering: (offeringId: string) => void;
  setBusyAction: (value: string) => void;
  setNotice: (value: string) => void;
  setTab: (value: GradebookTab) => void;
  setWorkspace: (value: TeacherGradebookWorkspace) => void;
  tab: GradebookTab;
  workspace: TeacherGradebookWorkspace;
}) {
  const missingCount = workspace.learners.reduce(
    (sum, item) => sum + item.missingCount,
    0,
  );
  const completeScores = workspace.learners
    .map((item) => item.totalPercent)
    .filter((score): score is number => score !== null);
  const classAverage =
    completeScores.length > 0
      ? completeScores.reduce((sum, score) => sum + score, 0) /
        completeScores.length
      : 0;

  async function runAction(body: Record<string, unknown>) {
    setBusyAction(String(body.action));
    const response = await fetch("/api/teacher/gradebook", {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as {
      error?: string;
      workspace?: TeacherGradebookWorkspace;
    };
    if (!response.ok || !payload.workspace) {
      setNotice(payload.error ?? "The gradebook action could not be completed.");
      setBusyAction("");
      return;
    }
    setWorkspace(payload.workspace);
    setNotice(actionNotice(String(body.action)));
    setBusyAction("");
  }

  return (
    <>

      <section className="gradebook-main">

        <div className="gradebook-content">
          {/* The banner this replaces carried a headline — "Every final grade
              stays explainable" — and a paragraph of prose about the product,
              above four metric cards. A teacher opening their markbook on a
              Friday afternoon is not reading a pitch; they want to know which
              subject and term they are in, whether it is still open, and how
              many marks are missing. All of that is here, in two lines. */}
          {/* The subject name was a heading, and the only one a teacher could
              ever reach. It is the switch now: a teacher holding four subjects
              picks between them here. One subject keeps the heading, because a
              select holding a single option is a control that does nothing. */}
          <header className="gradebook-context">
            <div className="gradebook-identity">
              {workspace.offerings.length > 1 ? (
                <label className="gradebook-subject-switch">
                  <span className="sr-only">Subject markbook</span>
                  <select
                    onChange={(event) => selectOffering(event.target.value)}
                    value={workspace.offeringId}
                  >
                    {workspace.offerings.map((offering) => (
                      <option key={offering.id} value={offering.id}>
                        {offering.subjectName} · {offering.className}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <h2>{workspace.subjectName}</h2>
              )}
              <p>
                {workspace.className} · {workspace.period.name} ·{" "}
                {workspace.period.academicYear}
              </p>
            </div>
            <span
              className={`gradebook-state is-${workspace.period.submissionStatus}`}
            >
              {submissionStateLabel(workspace.period.submissionStatus)}
            </span>
          </header>

          <p className="gradebook-facts">
            {completeScores.length > 0 ? (
              <span>
                Class average <b>{classAverage.toFixed(1)}%</b>
              </span>
            ) : (
              <span>No complete records yet</span>
            )}
            {/* Missing marks is the number that decides whether this markbook
                can be submitted at all, so it is the one that changes colour. */}
            <span className={missingCount > 0 ? "is-blocking" : undefined}>
              {missingCount === 0
                ? "No missing marks"
                : `${missingCount} missing ${missingCount === 1 ? "mark" : "marks"}`}
            </span>
            {/* A subject staffed but not yet set up has no categories, and an
                empty span rendered as a stray separator. */}
            {workspace.categories.length > 0 ? (
              <span>
                {workspace.categories
                  .map((category) => `${category.weightPercent}% ${category.name.toLowerCase()}`)
                  .join(" · ")}
              </span>
            ) : (
              <span>No weighting set</span>
            )}
            <span>
              {workspace.reports.filter((item) => item.status === "released").length}{" "}
              of {workspace.reports.length} reports released
            </span>
          </p>

          {notice ? (
            <button
              className="gradebook-notice"
              onClick={() => setNotice("")}
              type="button"
            >
              {notice} <span>×</span>
            </button>
          ) : null}

          {/* The shared control, not a copy of it. The markbook had its own
              tab styles with taller padding and no font size, so it inherited
              body text and stood a step larger than the same switcher on
              Assessments, My subjects and My classes. */}
          <div className="screen-tabs" role="tablist">
            {[
              ["marks", "Subject marks"],
              ["reports", "Report workflow"],
              ["policy", "Grading policy"],
            ].map(([id, label]) => (
              <button
                aria-selected={tab === id}
                className={tab === id ? "is-active" : ""}
                key={id}
                onClick={() => setTab(id as GradebookTab)}
                role="tab"
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "marks" ? (
            <MarksPanel
              busy={Boolean(busyAction)}
              missingCount={missingCount}
              runAction={runAction}
              workspace={workspace}
            />
          ) : null}
          {tab === "reports" ? (
            <ReportsPanel workspace={workspace} />
          ) : null}
          {tab === "policy" ? (
            <PolicyPanel
              busy={Boolean(busyAction)}
              runAction={runAction}
              workspace={workspace}
            />
          ) : null}
        </div>
      </section>
    </>
  );
}

function MarksPanel({
  busy,
  missingCount,
  runAction,
  workspace,
}: {
  busy: boolean;
  missingCount: number;
  runAction: (body: Record<string, unknown>) => Promise<void>;
  workspace: TeacherGradebookWorkspace;
}) {
  return (
    <section className="gradebook-panel">
      <div className="gradebook-panel-heading">
        <div>
          <p>Subject evidence</p>
          <h2>{workspace.subjectName} marks</h2>
        </div>
        <div className="gradebook-state-pill">
          <i />
          {workspace.period.submissionStatus}
        </div>
      </div>
      {workspace.learners.length === 0 ? (
        <div className="workspace-empty">
          <strong>No learners in this class yet</strong>
          <p>
            Marks appear once learners have been placed into{" "}
            {workspace.className}.
          </p>
        </div>
      ) : workspace.items.length === 0 ? (
        /* The state a subject is in the day it is staffed: a real class, and
           nothing yet to mark them on. */
        <div className="workspace-empty">
          <strong>Nothing to mark yet</strong>
          <p>
            {workspace.className} has {workspace.learners.length}{" "}
            {workspace.learners.length === 1 ? "learner" : "learners"}, but{" "}
            {workspace.subjectName} has no assessments or weighting set up for{" "}
            {workspace.period.name}.
          </p>
        </div>
      ) : null}
      <div className="gradebook-table-wrap">
        <table className="marks-table">
          <thead>
            <tr>
              <th>Learner</th>
              {workspace.items.map((item) => (
                <th key={item.id}>
                  <span>{item.title}</span>
                  <small>
                    /{item.maximumMarks} · {item.categoryName}
                  </small>
                </th>
              ))}
              <th>
                <span>Weighted total</span>
                <small>/100</small>
              </th>
              <th>Grade</th>
            </tr>
          </thead>
          <tbody>
            {workspace.learners.map((item) => (
              <tr key={item.id}>
                <td>
                  <span className="gradebook-learner">
                    <b>{initials(item.name)}</b>
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.studentId}</small>
                    </span>
                  </span>
                </td>
                {item.cells.map((cell) => (
                  <td key={cell.entryId}>
                    {cell.status === "missing" ? (
                      <MissingMarkInput
                        busy={busy}
                        cell={cell}
                        runAction={runAction}
                      />
                    ) : (
                      <span
                        className={
                          cell.adjusted
                            ? "mark-value is-adjusted"
                            : "mark-value"
                        }
                      >
                        {cell.value}
                        {cell.adjusted ? <i>adjusted</i> : null}
                      </span>
                    )}
                  </td>
                ))}
                <td>
                  <strong className="weighted-score">
                    {item.totalPercent === null
                      ? "—"
                      : `${item.totalPercent.toFixed(1)}%`}
                  </strong>
                </td>
                <td>
                  <span
                    className={
                      item.grade === "—"
                        ? "grade-badge incomplete"
                        : `grade-badge grade-${item.grade.toLowerCase()}`
                    }
                  >
                    {item.grade}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="gradebook-submit-row">
        <div>
          <strong>
            {missingCount > 0
              ? `${missingCount} mark requires attention`
              : "All required marks are complete"}
          </strong>
          <small>
            Submission snapshots calculated results into the report workflow.
          </small>
        </div>
        <button
          disabled={
            busy ||
            missingCount > 0 ||
            workspace.period.submissionStatus !== "open"
          }
          onClick={() =>
            void runAction({
              action: "submit-gradebook",
              offeringId: workspace.offeringId,
            })
          }
          type="button"
        >
          {workspace.period.submissionStatus === "open"
            ? "Submit gradebook"
            : "Gradebook submitted"}
        </button>
      </div>
    </section>
  );
}

function MissingMarkInput({
  busy,
  cell,
  runAction,
}: {
  busy: boolean;
  cell: GradebookLearner["cells"][number];
  runAction: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  return (
    <span className="missing-mark-input">
      <input
        aria-label={`Missing mark out of ${cell.maximumMarks}`}
        max={cell.maximumMarks}
        min="0"
        onChange={(event) => setValue(event.target.value)}
        placeholder="—"
        type="number"
        value={value}
      />
      <button
        aria-label="Save missing mark"
        disabled={busy || value === ""}
        onClick={() =>
          void runAction({
            action: "save-entry",
            entryId: cell.entryId,
            marks: Number(value),
            status: "recorded",
          })
        }
        type="button"
      >
        ✓
      </button>
    </span>
  );
}

/* Read-only since approving and releasing moved to the head's own screen.
   The panel stays because a teacher does need to know where their marks have
   got to — it just no longer offers them a press they are not allowed. */
function ReportsPanel({
  workspace,
}: {
  workspace: TeacherGradebookWorkspace;
}) {
  return (
    <section className="gradebook-panel">
      <div className="gradebook-panel-heading">
        <div>
          <p>Where these marks are</p>
          <h2>Term report workflow</h2>
        </div>
        <span className="guardian-preview-link">Released reports only</span>
      </div>
      <div className="workflow-guide">
        {["Teacher submits", "Academic review", "Leadership approval", "Guardian release"].map(
          (step, index) => (
            <div key={step}>
              <span>{index + 1}</span>
              <strong>{step}</strong>
            </div>
          ),
        )}
      </div>
      <div className="report-review-list">
        {workspace.reports.map((reportItem) => (
          <article key={reportItem.id}>
            <header>
              <span className="report-avatar">
                {initials(reportItem.learnerName)}
              </span>
              <div>
                <h3>{reportItem.learnerName}</h3>
                <p>
                  {workspace.period.name} · Overall average{" "}
                  {reportItem.averagePercent.toFixed(1)}%
                </p>
              </div>
              <span className={`report-status ${reportItem.status}`}>
                {reportItem.status}
              </span>
            </header>
            <div className="report-completeness">
              <span>
                <i style={{ width: reportItem.status === "draft" ? "72%" : "100%" }} />
              </span>
              <small>
                {reportItem.status === "draft"
                  ? "Waiting for gradebook submission"
                  : "All academic fields complete"}
              </small>
            </div>
            {/* This footer used to carry "Approve report" and "Release to
                guardian", shown on the report's status rather than on what
                the person looking at it may do. Approving needs
                report:approve, which no teaching role holds — so the buttons
                appeared for exactly the people the server would refuse, and a
                teacher pressing Approve got a 403 for their trouble.

                A teacher's part ends at submission. What belongs here is
                where the report has got to and who has it now. */}
            <footer>
              <span>Report version {reportItem.version}</span>
              {reportItem.status === "released" ? (
                <strong className="released-indicator">Released securely</strong>
              ) : (
                <small className="report-next-step">
                  {handoffNote(reportItem.status)}
                </small>
              )}
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ==========================================================================
   Grading policy, as something a school can change

   Categories, their weights and the columns under them were seed rows.
   `seedGradeItem()` bound the demo's Integrated Science offering for every
   column it wrote and was the only thing anywhere that inserted one, so a
   teacher of any other subject opened this screen, read "40% continuous
   assessment · 60% examination", and had no control that would change either
   figure or add a single column to mark against.

   The weights total is the thing to watch: every report card is computed from
   them, and calculateWeightedGrade() refuses a set that does not sum to 100.
   Saying so here means the refusal arrives while somebody is editing rather
   than at the end of term.
   ========================================================================== */
function PolicyPanel({
  busy,
  runAction,
  workspace,
}: {
  busy: boolean;
  runAction: (body: Record<string, unknown>) => Promise<void>;
  workspace: TeacherGradebookWorkspace;
}) {
  const [addingCategory, setAddingCategory] = useState(false);
  const [addingColumnIn, setAddingColumnIn] = useState("");
  const total = categoryWeightTotal(workspace.categories);
  const locked = workspace.period.submissionStatus !== "open";

  return (
    <section className="gradebook-panel">
      <div className="gradebook-panel-heading">
        <div>
          <p>Stored policy</p>
          <h2>How grades are calculated</h2>
        </div>
      </div>

      {locked ? (
        <p className="form-hint">
          {workspace.period.name} has been submitted, so its categories and
          columns are fixed. Changing them now would restate marks a head has
          already seen.
        </p>
      ) : null}

      <div className="policy-layout">
        <article className="category-policy">
          <h3>Category weights</h3>
          {workspace.categories.map((category) => (
            <CategoryRow
              busy={busy}
              category={category}
              key={category.id}
              locked={locked}
              offeringId={workspace.offeringId}
              runAction={runAction}
            />
          ))}
          {workspace.categories.length === 0 ? (
            <p className="form-hint">
              No categories yet. Add at least one — a column has to sit in one,
              and a report card is the weighted total of them.
            </p>
          ) : null}

          {/* Summed, not asserted. This printed 100% whatever the weights
              added up to, so a policy a school had left at 90 still claimed
              to be whole — on the screen a teacher checks it against. */}
          <footer className={total !== 100 ? "is-blocking" : undefined}>
            <span>
              Total
              {total !== 100 && workspace.categories.length > 0 ? (
                <small>
                  Weights have to total 100% before a report can be produced.
                </small>
              ) : null}
            </span>
            <strong>{total}%</strong>
          </footer>

          {locked ? null : addingCategory ? (
            <CategoryForm
              busy={busy}
              onCancel={() => setAddingCategory(false)}
              onSubmit={async (input) => {
                await runAction({
                  action: "add-category",
                  offeringId: workspace.offeringId,
                  ...input,
                });
                setAddingCategory(false);
              }}
            />
          ) : (
            <button
              className="ghost-button"
              onClick={() => setAddingCategory(true)}
              type="button"
            >
              Add a category
            </button>
          )}
        </article>
        <article className="scale-policy">
          <h3>Grade scale</h3>
          <div>
            {workspace.scale.map((band) => (
              <span key={band.grade}>
                <b>{band.grade}</b>
                <strong>
                  {band.minimumPercent}–{band.maximumPercent}
                </strong>
                <small>{band.remark}</small>
              </span>
            ))}
          </div>
          <p>
            This scale is configured for the grading period. It is not a
            platform-wide national constant.
          </p>
        </article>
      </div>

      <article className="column-policy">
        <h3>Columns in this markbook</h3>
        <p className="form-hint">
          A column is one thing marked out of something: a class test, a
          project, the end-of-term paper. Publishing an assessment creates one
          automatically, and releasing a learner&rsquo;s result fills their
          cell.
        </p>

        {workspace.categories.map((category) => {
          const columns = workspace.items.filter(
            (item) => item.categoryId === category.id,
          );
          return (
            <div className="column-group" key={category.id}>
              <h4>
                {category.name} <small>{category.weightPercent}%</small>
              </h4>
              {columns.map((item) => (
                <div className="column-row" key={item.id}>
                  <span>
                    <strong>{item.title}</strong>
                    <small>Out of {item.maximumMarks}</small>
                  </span>
                  {locked ? null : (
                    <button
                      className="ghost-button"
                      disabled={busy}
                      onClick={() =>
                        void runAction({
                          action: "remove-column",
                          itemId: item.id,
                          offeringId: workspace.offeringId,
                        })
                      }
                      type="button"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {columns.length === 0 ? (
                <p className="form-hint">Nothing marked in this category yet.</p>
              ) : null}

              {locked ? null : addingColumnIn === category.id ? (
                <ColumnForm
                  busy={busy}
                  onCancel={() => setAddingColumnIn("")}
                  onSubmit={async (input) => {
                    await runAction({
                      action: "add-column",
                      categoryId: category.id,
                      offeringId: workspace.offeringId,
                      ...input,
                    });
                    setAddingColumnIn("");
                  }}
                />
              ) : (
                <button
                  className="ghost-button"
                  onClick={() => setAddingColumnIn(category.id)}
                  type="button"
                >
                  Add a column
                </button>
              )}
            </div>
          );
        })}
      </article>
    </section>
  );
}

/** One weighting, editable in place. */
function CategoryRow({
  busy,
  category,
  locked,
  offeringId,
  runAction,
}: {
  busy: boolean;
  category: TeacherGradebookWorkspace["categories"][number];
  locked: boolean;
  offeringId: string;
  runAction: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <CategoryForm
        busy={busy}
        initial={{
          kind: "other",
          name: category.name,
          weightPercent: category.weightPercent,
        }}
        onCancel={() => setEditing(false)}
        onSubmit={async (input) => {
          await runAction({
            action: "edit-category",
            categoryId: category.id,
            ...input,
          });
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div>
      <span>
        <strong>{category.name}</strong>
        <small>Included grade items are normalised within category</small>
      </span>
      <b>{category.weightPercent}%</b>
      {locked ? null : (
        <span className="category-actions">
          <button
            className="ghost-button"
            onClick={() => setEditing(true)}
            type="button"
          >
            Edit
          </button>
          <button
            className="ghost-button"
            disabled={busy}
            onClick={() =>
              void runAction({
                action: "remove-category",
                categoryId: category.id,
                offeringId,
              })
            }
            type="button"
          >
            Remove
          </button>
        </span>
      )}
    </div>
  );
}

function CategoryForm({
  busy,
  initial,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  initial?: { kind: string; name: string; weightPercent: number };
  onCancel: () => void;
  onSubmit: (input: {
    kind: string;
    name: string;
    weightPercent: number;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState(initial?.kind ?? "continuous-assessment");
  const [weight, setWeight] = useState(String(initial?.weightPercent ?? ""));

  return (
    <form
      className="policy-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({ kind, name, weightPercent: Number(weight) });
      }}
    >
      <label>
        <span>Name</span>
        <input
          onChange={(event) => setName(event.target.value)}
          placeholder="Continuous assessment"
          required
          value={name}
        />
      </label>
      <label>
        <span>Kind</span>
        <select onChange={(event) => setKind(event.target.value)} value={kind}>
          <option value="continuous-assessment">Continuous assessment</option>
          <option value="examination">Examination</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label>
        <span>Weight</span>
        <input
          max={100}
          min={0}
          onChange={(event) => setWeight(event.target.value)}
          required
          type="number"
          value={weight}
        />
      </label>
      <div className="policy-form-actions">
        <button disabled={busy} type="submit">
          Save
        </button>
        <button className="ghost-button" onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
}

function ColumnForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    maximumMarks: number;
    title: string;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [maximum, setMaximum] = useState("20");

  return (
    <form
      className="policy-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({ maximumMarks: Number(maximum), title });
      }}
    >
      <label>
        <span>Title</span>
        <input
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Class test 1"
          required
          value={title}
        />
      </label>
      <label>
        <span>Out of</span>
        <input
          min={1}
          onChange={(event) => setMaximum(event.target.value)}
          required
          type="number"
          value={maximum}
        />
      </label>
      <div className="policy-form-actions">
        <button disabled={busy} type="submit">
          Add column
        </button>
        <button className="ghost-button" onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
}

/* The raw status is a slug — "open", "submitted", "approved" — and printing
   it as-is was one of the things that made the metric cards read like a
   database dump. */
function submissionStateLabel(status: string) {
  const labels: Record<string, string> = {
    approved: "Approved",
    locked: "Locked",
    open: "Open for marking",
    released: "Released",
    submitted: "Submitted for approval",
  };
  return labels[status] ?? status;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/* The weights as they actually stand. A school part-way through setting its
   policy is the normal state of this screen, and it should show the number it
   has rather than the number it is aiming at. */
function categoryWeightTotal(
  categories: TeacherGradebookWorkspace["categories"],
): number {
  const total = categories.reduce(
    (sum, category) => sum + category.weightPercent,
    0,
  );
  /* Weights are whole numbers in practice; rounded anyway so a policy stored
     as thirds does not print 99.99999999999999%. */
  return Math.round(total * 10) / 10;
}

/** Where a report has got to, said as who is holding it. */
function handoffNote(status: string) {
  if (status === "draft") return "With you — submit the markbook to send it on";
  if (status === "submitted") return "With the head for approval";
  if (status === "approved") return "Approved — the head releases it to guardians";
  return "";
}

function actionNotice(action: string) {
  if (action === "save-entry") return "Missing mark recorded.";
  if (action === "submit-gradebook") {
    return "Gradebook submitted. The head approves and releases the reports.";
  }
  if (action === "add-category") return "Category added.";
  if (action === "edit-category") return "Weighting saved.";
  if (action === "remove-category") return "Category removed.";
  if (action === "add-column") {
    return "Column added, with a blank mark for every learner in the class.";
  }
  if (action === "edit-column") return "Column saved.";
  if (action === "remove-column") {
    return "Column removed from the markbook. The marks in it are kept.";
  }
  return "Gradebook updated.";
}
