"use client";

import { useEffect, useState } from "react";
import type {
  GuardianReport,
  GuardianReportWorkspace,
} from "../../../db/reporting-repository";
import "./guardian-reports.css";

const previewWorkspace: GuardianReportWorkspace = {
  child: {
    className: "JHS 2 Gold",
    id: "person-kwame",
    name: "Kwame Agyeman",
    studentId: "LH-260138",
  },
  linkedChildren: [{ id: "person-kwame", name: "Kwame Agyeman" }],
  reports: [
    {
      approved: true,
      attendance: { present: 56, total: 58 },
      classTeacherComment:
        "Kwame is thoughtful and consistent. He should keep asking questions when a concept is not immediately clear.",
      conduct: "Very good",
      headteacherComment:
        "A commendable term. Keep building confidence through regular practice.",
      id: "report-kwame-term2",
      nextTermBeginsOn: "2026-05-05",
      overallAverage: 74.8,
      periodName: "Term 2 · 2025 / 2026",
      promotionDecision: "Progressing",
      releasedAt: "2026-04-14T08:00:00.000Z",
      subjects: [
        subject("MA", "Mathematics", 74, "B", "Very good", "Good progress in algebra and number work."),
        subject("EN", "English Language", 71, "B", "Very good", "Written expression is becoming clearer."),
        subject("IS", "Integrated Science", 79, "B", "Very good", "Shows strong understanding of body systems."),
        subject("SS", "Social Studies", 66, "C", "Good", "Participates thoughtfully in civic discussions."),
        subject("CT", "Computing", 81, "A", "Excellent", "Works confidently with data and documents."),
        subject("RM", "Religious & Moral Education", 78, "B", "Very good", "Demonstrates respect and sound moral judgement."),
      ],
      version: 1,
    },
  ],
  schoolName: "Greenfield Academy",
};

export function ReportsView() {
  const [workspace, setWorkspace] = useState(previewWorkspace);
  const [mode, setMode] = useState<"loading" | "protected" | "preview">(
    "loading",
  );
  const [selectedReportId, setSelectedReportId] = useState(
    previewWorkspace.reports[0]?.id ?? "",
  );

  useEffect(() => {
    let active = true;
    void load();

    async function load() {
      try {
        const response = await fetch("/api/guardian/reports");
        if (!response.ok) throw new Error("Reports unavailable.");
        const payload = (await response.json()) as {
          actor: string;
          workspace: GuardianReportWorkspace;
        };
        if (!active) return;
        setWorkspace(payload.workspace);
        setSelectedReportId(payload.workspace.reports[0]?.id ?? "");
        setMode("protected");
      } catch {
        if (active) setMode("preview");
      }
    }

    return () => {
      active = false;
    };
  }, []);

  const report =
    workspace.reports.find((item) => item.id === selectedReportId) ??
    workspace.reports[0];

  async function selectChild(learnerId: string) {
    if (mode !== "protected") return;
    setMode("loading");
    try {
      const response = await fetch(
        `/api/guardian/reports?learnerId=${encodeURIComponent(learnerId)}`,
      );
      if (!response.ok) throw new Error("Child report unavailable.");
      const payload = (await response.json()) as {
        actor: string;
        workspace: GuardianReportWorkspace;
      };
      setWorkspace(payload.workspace);
      setSelectedReportId(payload.workspace.reports[0]?.id ?? "");
      setMode("protected");
    } catch {
      setMode("protected");
    }
  }

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
            <span className={`guardian-connection ${mode}`}>
              <i />
              {mode === "protected"
                ? "School records connected"
                : mode === "loading"
                  ? "Connecting records"
                  : "Preview report"}
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

function subject(
  subjectCode: string,
  subjectName: string,
  scorePercent: number,
  grade: string,
  remark: string,
  teacherComment: string,
) {
  return {
    grade,
    remark,
    scorePercent,
    subjectCode,
    subjectName,
    teacherComment,
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}
