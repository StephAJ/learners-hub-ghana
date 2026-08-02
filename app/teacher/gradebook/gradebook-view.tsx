"use client";

import { useEffect, useState } from "react";
import type {
  GradebookLearner,
  TeacherGradebookWorkspace,
} from "../../../db/reporting-repository";
import "../../admin/academic/academic.css";
import "./gradebook.css";

const previewWorkspace: TeacherGradebookWorkspace = {
  categories: [
    {
      id: "category-science-ca",
      name: "Continuous assessment",
      weightPercent: 40,
    },
    {
      id: "category-science-exam",
      name: "End-of-term examination",
      weightPercent: 60,
    },
  ],
  className: "JHS 2 Gold",
  items: [
    {
      categoryId: "category-science-ca",
      categoryName: "Continuous assessment",
      id: "grade-item-digestion-quiz",
      maximumMarks: 20,
      title: "Digestive system quiz",
    },
    {
      categoryId: "category-science-ca",
      categoryName: "Continuous assessment",
      id: "grade-item-model-project",
      maximumMarks: 30,
      title: "Body systems model",
    },
    {
      categoryId: "category-science-exam",
      categoryName: "End-of-term examination",
      id: "grade-item-term-exam",
      maximumMarks: 50,
      title: "End-of-term examination",
    },
  ],
  learners: [
    learner(
      "person-ama",
      "Ama Serwaa",
      "LH-260112",
      [18, 27, 45],
      90,
      "A",
    ),
    learner(
      "person-kwame",
      "Kwame Agyeman",
      "LH-260138",
      [16, 25, 42],
      83.2,
      "A",
    ),
    learner(
      "person-kojo",
      "Kojo Boateng",
      "LH-260145",
      [12, null, 35],
      null,
      "—",
    ),
  ],
  offeringId: "offering-science-jhs2",
  period: {
    academicYear: "2026 / 2027",
    id: "period-2026-term1",
    name: "Term 1",
    policyVersion: 1,
    submissionStatus: "open",
  },
  reports: [
    report("person-ama", "Ama Serwaa", 87.3),
    report("person-kwame", "Kwame Agyeman", 78.2),
    report("person-kojo", "Kojo Boateng", 69.2),
  ],
  scale: [
    { grade: "A", maximumPercent: 100, minimumPercent: 80, remark: "Excellent" },
    { grade: "B", maximumPercent: 79.9, minimumPercent: 70, remark: "Very good" },
    { grade: "C", maximumPercent: 69.9, minimumPercent: 60, remark: "Good" },
    { grade: "D", maximumPercent: 59.9, minimumPercent: 50, remark: "Credit" },
    { grade: "E", maximumPercent: 49.9, minimumPercent: 40, remark: "Pass" },
    { grade: "F", maximumPercent: 39.9, minimumPercent: 0, remark: "Needs support" },
  ],
  subjectName: "Integrated Science",
};

type GradebookTab = "marks" | "reports" | "policy";

export function GradebookView() {
  const [workspace, setWorkspace] = useState(previewWorkspace);
  const [tab, setTab] = useState<GradebookTab>("marks");
  const [dataMode, setDataMode] = useState<"loading" | "protected" | "preview">(
    "loading",
  );
  const [notice, setNotice] = useState("");
  const [busyAction, setBusyAction] = useState("");

  useEffect(() => {
    let active = true;
    async function loadWorkspace() {
      try {
        const response = await fetch("/api/teacher/gradebook");
        if (!response.ok) throw new Error("Gradebook unavailable.");
        const payload = (await response.json()) as {
          actor: string;
          workspace: TeacherGradebookWorkspace;
        };
        if (!active) return;
        setWorkspace(payload.workspace);
        setDataMode("protected");
      } catch {
        if (active) setDataMode("preview");
      }
    }
    void loadWorkspace();
    return () => {
      active = false;
    };
  }, []);

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
    if (dataMode !== "protected") {
      updatePreview(body);
      setBusyAction("");
      return;
    }
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

  function updatePreview(body: Record<string, unknown>) {
    const action = String(body.action);
    if (action === "save-entry") {
      setWorkspace((current) => ({
        ...current,
        learners: current.learners.map((item) => ({
          ...item,
          cells: item.cells.map((cell) =>
            cell.entryId === body.entryId
              ? {
                  ...cell,
                  status: "recorded",
                  value: Number(body.marks),
                }
              : cell,
          ),
          grade: item.id === "person-kojo" ? "B" : item.grade,
          missingCount:
            item.cells.some((cell) => cell.entryId === body.entryId)
              ? 0
              : item.missingCount,
          remark: item.id === "person-kojo" ? "Very good" : item.remark,
          totalPercent: item.id === "person-kojo" ? 70.6 : item.totalPercent,
        })),
      }));
    } else if (action === "submit-gradebook") {
      setWorkspace((current) => ({
        ...current,
        period: { ...current.period, submissionStatus: "submitted" },
        reports: current.reports.map((item) => ({
          ...item,
          status: "submitted",
        })),
      }));
    } else if (action === "approve-report") {
      setWorkspace((current) => ({
        ...current,
        reports: current.reports.map((item) =>
          item.id === body.reportId
            ? { ...item, status: "approved" }
            : item,
        ),
      }));
    } else if (action === "release-report") {
      setWorkspace((current) => ({
        ...current,
        reports: current.reports.map((item) =>
          item.id === body.reportId
            ? { ...item, status: "released", version: item.version + 1 }
            : item,
        ),
      }));
    }
    setNotice(actionNotice(action, true));
  }

  return (
    <>

      <section className="gradebook-main">

        <div className="gradebook-content">
          <section className="gradebook-hero">
            <div>
              <span className="gradebook-code">IS</span>
              <p>
                {workspace.className} · {workspace.period.name} ·{" "}
                {workspace.period.academicYear}
              </p>
              <h2>Every final grade stays explainable.</h2>
              <p>
                Assessment evidence, authorised adjustments, approval history,
                and issued reports remain connected without overwriting the
                original record.
              </p>
            </div>
            <div className="gradebook-policy-card">
              <span>Current formula</span>
              {workspace.categories.map((category) => (
                <div key={category.id}>
                  <strong>{category.weightPercent}%</strong>
                  <small>{category.name}</small>
                </div>
              ))}
            </div>
          </section>

          {notice ? (
            <button
              className="gradebook-notice"
              onClick={() => setNotice("")}
              type="button"
            >
              {notice} <span>×</span>
            </button>
          ) : null}

          <section className="gradebook-metrics">
            <article>
              <span>Class average</span>
              <strong>{classAverage.toFixed(1)}%</strong>
              <small>Complete learner records</small>
            </article>
            <article>
              <span>Missing marks</span>
              <strong>{missingCount}</strong>
              <small>
                {missingCount === 0 ? "Ready to submit" : "Resolve before submission"}
              </small>
            </article>
            <article>
              <span>Gradebook state</span>
              <strong className="metric-state">
                {workspace.period.submissionStatus}
              </strong>
              <small>Integrated Science</small>
            </article>
            <article>
              <span>Report cards</span>
              <strong>{workspace.reports.length}</strong>
              <small>
                {
                  workspace.reports.filter(
                    (item) => item.status === "released",
                  ).length
                }{" "}
                released
              </small>
            </article>
          </section>

          <div className="gradebook-tabs" role="tablist">
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
            <ReportsPanel
              busy={Boolean(busyAction)}
              runAction={runAction}
              workspace={workspace}
            />
          ) : null}
          {tab === "policy" ? <PolicyPanel workspace={workspace} /> : null}
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
            void runAction({ action: "submit-gradebook" })
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

function ReportsPanel({
  busy,
  runAction,
  workspace,
}: {
  busy: boolean;
  runAction: (body: Record<string, unknown>) => Promise<void>;
  workspace: TeacherGradebookWorkspace;
}) {
  return (
    <section className="gradebook-panel">
      <div className="gradebook-panel-heading">
        <div>
          <p>Approval and release</p>
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
            <footer>
              <span>Report version {reportItem.version}</span>
              {reportItem.status === "submitted" ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    void runAction({
                      action: "approve-report",
                      reportId: reportItem.id,
                    })
                  }
                  type="button"
                >
                  Approve report
                </button>
              ) : null}
              {reportItem.status === "approved" ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    void runAction({
                      action: "release-report",
                      reportId: reportItem.id,
                    })
                  }
                  type="button"
                >
                  Release to guardian
                </button>
              ) : null}
              {reportItem.status === "released" ? (
                <strong className="released-indicator">Released securely</strong>
              ) : null}
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}

function PolicyPanel({
  workspace,
}: {
  workspace: TeacherGradebookWorkspace;
}) {
  return (
    <section className="gradebook-panel">
      <div className="gradebook-panel-heading">
        <div>
          <p>Stored policy</p>
          <h2>How grades are calculated</h2>
        </div>
        <span className="policy-version">
          Version {workspace.period.policyVersion}
        </span>
      </div>
      <div className="policy-layout">
        <article className="category-policy">
          <h3>Category weights</h3>
          {workspace.categories.map((category) => (
            <div key={category.id}>
              <span>
                <strong>{category.name}</strong>
                <small>Included grade items are normalised within category</small>
              </span>
              <b>{category.weightPercent}%</b>
            </div>
          ))}
          <footer>
            <span>Total</span>
            <strong>100%</strong>
          </footer>
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
    </section>
  );
}

function learner(
  id: string,
  name: string,
  studentId: string,
  marks: Array<number | null>,
  totalPercent: number | null,
  grade: string,
): GradebookLearner {
  const itemIds = [
    "grade-item-digestion-quiz",
    "grade-item-model-project",
    "grade-item-term-exam",
  ];
  const maxima = [20, 30, 50];
  return {
    cells: marks.map((mark, index) => ({
      adjusted: false,
      entryId: `grade-entry-${id}-${index + 1}`,
      itemId: itemIds[index],
      maximumMarks: maxima[index],
      status: mark === null ? "missing" : "recorded",
      value: mark,
    })),
    grade,
    id,
    missingCount: marks.filter((mark) => mark === null).length,
    name,
    remark: grade === "A" ? "Excellent" : grade === "—" ? "Incomplete" : "Very good",
    studentId,
    totalPercent,
  };
}

function report(
  learnerId: string,
  learnerName: string,
  averagePercent: number,
): TeacherGradebookWorkspace["reports"][number] {
  return {
    averagePercent,
    id: `report-${learnerId}-term1`,
    learnerName,
    status: "draft",
    updatedAt: "2026-07-23T12:00:00Z",
    version: 0,
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

function actionNotice(action: string, preview = false) {
  const suffix = preview ? " in this preview." : ".";
  if (action === "save-entry") return `Missing mark recorded${suffix}`;
  if (action === "submit-gradebook") return `Gradebook submitted for review${suffix}`;
  if (action === "approve-report") return `Report approved${suffix}`;
  if (action === "release-report") return `Report released to authorised guardians${suffix}`;
  return `Gradebook updated${suffix}`;
}
