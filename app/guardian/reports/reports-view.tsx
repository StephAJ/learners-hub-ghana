"use client";

import { useEffect, useState } from "react";
import type {
  GuardianReport,
  GuardianReportWorkspace,
} from "../../../db/reporting-repository";
import "./guardian-reports.css";

/* ==========================================================================
   No preview report card

   A complete report card stood here as a constant: Kwame Agyeman of JHS 2
   Gold, six subjects with grades and remarks, attendance of 56 out of 58, a
   conduct grade, both teachers' comments and a promotion decision. The view
   opened on it and kept it whenever /api/guardian/reports failed.

   A report card is the document a family acts on. A guardian shown somebody
   else's, with no way to tell, is the worst version of the preview-mode
   problem the rest of the product has now shed.
   ========================================================================== */

export function ReportsView() {
  const [workspace, setWorkspace] = useState<GuardianReportWorkspace>();
  const [state, setState] = useState<"error" | "loading" | "ready">("loading");
  const [problem, setProblem] = useState("");
  const [selectedReportId, setSelectedReportId] = useState("");
  const [childId, setChildId] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadOnce() {
      try {
        const response = await fetch(
          childId
            ? `/api/guardian/reports?learnerId=${encodeURIComponent(childId)}`
            : "/api/guardian/reports",
        );
        const payload = (await response.json()) as {
          error?: string;
          workspace?: GuardianReportWorkspace;
        };
        if (!active) return;
        if (!response.ok || !payload.workspace) {
          throw new Error(payload.error ?? "Reports are unavailable.");
        }
        setWorkspace(payload.workspace);
        setSelectedReportId(payload.workspace.reports[0]?.id ?? "");
        setState("ready");
      } catch (thrown) {
        if (!active) return;
        setProblem(
          thrown instanceof Error
            ? thrown.message
            : "Reports could not be reached.",
        );
        setState("error");
      }
    }

    void loadOnce();
    return () => {
      active = false;
    };
  }, [childId, reloadKey]);

  /* Switching child changes what is loaded, so it goes through the same
     effect rather than a second copy of the fetch. */
  function selectChild(learnerId: string) {
    if (learnerId === childId) return;
    setState("loading");
    setChildId(learnerId);
  }

  if (state === "loading") {
    return <p className="workspace-loading">Loading your child’s reports…</p>;
  }

  if (state === "error" || !workspace) {
    return (
      <div className="workspace-failure">
        <h2>Reports could not be loaded.</h2>
        <p>{problem}</p>
        <button onClick={() => setReloadKey((key) => key + 1)} type="button">
          Try again
        </button>
      </div>
    );
  }

  const report =
    workspace.reports.find((item) => item.id === selectedReportId) ??
    workspace.reports[0];

  return (
    <>
      <div className="guardian-page">
        <section className="guardian-intro">
          <div>
            <p className="guardian-eyebrow">Academic reports</p>
            <h1>Your child&apos;s progress, clearly explained.</h1>
            <p>
              Only reports approved and released by the school appear here.
              Marks, teacher feedback, attendance, and the issued version stay
              together as one trusted record.
            </p>
          </div>
          <div className="guardian-security">
            <span>✓</span>
            <div>
              <strong>Relationship-protected</strong>
              <small>
                You only see learners linked to your guardian account.
              </small>
            </div>
          </div>
        </section>

        <section className="child-switcher" aria-label="Choose a child">
          <div>
            <span className="child-avatar">{initials(workspace.child.name)}</span>
            <div>
              <small>Viewing reports for</small>
              <strong>{workspace.child.name}</strong>
              <span>
                {workspace.child.studentId} · {workspace.child.className}
              </span>
            </div>
          </div>
          {workspace.linkedChildren.length > 1 ? (
            <label>
              <span>Switch child</span>
              <select
                onChange={(event) => void selectChild(event.target.value)}
                value={workspace.child.id}
              >
                {workspace.linkedChildren.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            /* One child, so nothing to switch between. The badge here read
               "Preview report" in the state that no longer exists; what is
               worth saying is whose reports these are. */
            <span className="guardian-connection protected">
              <i />
              {workspace.child.name}
            </span>
          )}
        </section>

        {report ? (
          <ReportCard
            report={report}
            reportCount={workspace.reports.length}
            schoolName={workspace.schoolName}
            selectedReportId={selectedReportId}
            setSelectedReportId={setSelectedReportId}
            workspace={workspace}
          />
        ) : (
          <section className="guardian-empty">
            <span>◎</span>
            <h2>No released report yet</h2>
            <p>
              The school may still be reviewing this child&apos;s current
              report. It will appear here only after formal release.
            </p>
          </section>
        )}
      </div>
    </>
  );
}

function ReportCard({
  report,
  reportCount,
  schoolName,
  selectedReportId,
  setSelectedReportId,
  workspace,
}: {
  report: GuardianReport;
  reportCount: number;
  schoolName: string;
  selectedReportId: string;
  setSelectedReportId: (id: string) => void;
  workspace: GuardianReportWorkspace;
}) {
  const attendancePercent =
    report.attendance.total > 0
      ? (report.attendance.present / report.attendance.total) * 100
      : 0;

  return (
    <article className="report-card" id="report-card">
      <header className="report-card-header">
        <div className="report-school-mark">GA</div>
        <div>
          <p>{schoolName}</p>
          <h2>End-of-term academic report</h2>
          <span>
            {report.periodName} · {workspace.child.className}
          </span>
        </div>
        <div className="issued-stamp">
          <span>✓</span>
          <strong>Released</strong>
          <small>Version {report.version}</small>
        </div>
      </header>

      <div className="report-toolbar">
        <div>
          <small>Learner</small>
          <strong>{workspace.child.name}</strong>
          <span>{workspace.child.studentId}</span>
        </div>
        <div className="report-actions">
          {reportCount > 1 ? (
            <label>
              <span>Reporting period</span>
              <select
                onChange={(event) => setSelectedReportId(event.target.value)}
                value={selectedReportId}
              >
                {workspace.reports.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.periodName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button onClick={() => window.print()} type="button">
            Print report
          </button>
        </div>
      </div>

      <section className="report-summary" aria-label="Report summary">
        <article>
          <span>Overall average</span>
          <strong>{report.overallAverage.toFixed(1)}%</strong>
          <small>Across {report.subjects.length} subjects</small>
        </article>
        <article>
          <span>Attendance</span>
          <strong>{attendancePercent.toFixed(1)}%</strong>
          <small>
            {report.attendance.present} of {report.attendance.total} days
          </small>
        </article>
        <article>
          <span>Conduct</span>
          <strong className="summary-text">{report.conduct}</strong>
          <small>Class teacher assessment</small>
        </article>
        <article>
          <span>Decision</span>
          <strong className="summary-text">
            {report.promotionDecision}
          </strong>
          <small>Academic progression</small>
        </article>
      </section>

      <section className="subject-results">
        <div className="report-section-heading">
          <div>
            <p>Academic performance</p>
            <h3>Subject results</h3>
          </div>
          <span>Approved school record</span>
        </div>
        <div className="result-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Score</th>
                <th>Grade</th>
                <th>Remark</th>
                <th>Teacher&apos;s note</th>
              </tr>
            </thead>
            <tbody>
              {report.subjects.map((item) => (
                <tr key={item.subjectCode}>
                  <td>
                    <span className="subject-result-name">
                      <b>{item.subjectCode}</b>
                      <strong>{item.subjectName}</strong>
                    </span>
                  </td>
                  <td>
                    <strong>{item.scorePercent.toFixed(1)}%</strong>
                  </td>
                  <td>
                    <span className="guardian-grade">{item.grade}</span>
                  </td>
                  <td>{item.remark}</td>
                  <td>{item.teacherComment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="report-comments">
        <article>
          <span className="comment-icon">CT</span>
          <div>
            <small>Class teacher&apos;s comment</small>
            <p>{report.classTeacherComment}</p>
          </div>
        </article>
        <article>
          <span className="comment-icon head">HT</span>
          <div>
            <small>Headteacher&apos;s comment</small>
            <p>{report.headteacherComment}</p>
          </div>
        </article>
      </section>

      <footer className="report-card-footer">
        <div>
          <span>Next term begins</span>
          <strong>
            {report.nextTermBeginsOn
              ? formatDate(report.nextTermBeginsOn)
              : "To be announced"}
          </strong>
        </div>
        <div>
          <span>Report released</span>
          <strong>{formatDate(report.releasedAt)}</strong>
        </div>
        <p>
          This view contains the school&apos;s issued version {report.version}.
          Any later correction must follow the school&apos;s approval and
          re-release process.
        </p>
      </footer>
    </article>
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}
