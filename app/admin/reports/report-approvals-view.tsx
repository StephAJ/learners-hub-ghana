"use client";

import { useEffect, useState } from "react";
import type {
  ReportApprovalItem,
  ReportApprovalQueue,
} from "../../../db/reporting-repository";
import "./report-approvals.css";

/* ==========================================================================
   Report cards waiting on the head

   A teacher submits a markbook and their part is finished. Approving the
   report and releasing it to guardians need report:approve and
   report:release, which only a school or academic administrator holds — and
   until this screen existed there was nowhere to do either. The actions were
   implemented, gated, and unreachable: the markbook that offered them
   redirects an administrator away at the door.

   Two decisions shape it. Approval is per learner rather than per class,
   because a report the head is not happy with is one report, not a year
   group. And release is a separate press from approval, because approving is
   a judgement about the marks and releasing is a decision to tell a family —
   schools do the first days before the second.
   ========================================================================== */

export function ReportApprovalsView() {
  const [queue, setQueue] = useState<ReportApprovalQueue>();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string>();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/admin/reports");
        const payload = (await response.json()) as {
          error?: string;
          queue?: ReportApprovalQueue;
        };
        if (!response.ok || !payload.queue) {
          throw new Error(payload.error ?? "Reports could not be loaded.");
        }
        if (active) setQueue(payload.queue);
      } catch (thrown) {
        if (active) {
          setError(
            thrown instanceof Error
              ? thrown.message
              : "Reports could not be loaded.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  async function post(
    body: Record<string, unknown>,
    busyKey: string,
    describe: (queue: ReportApprovalQueue) => string,
  ) {
    setBusyId(busyKey);
    setError("");
    try {
      const response = await fetch("/api/admin/reports", {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        queue?: ReportApprovalQueue;
      };
      if (!response.ok || !payload.queue) {
        throw new Error(payload.error ?? "That could not be completed.");
      }
      setQueue(payload.queue);
      setNotice(describe(payload.queue));
    } catch (thrown) {
      setError(
        thrown instanceof Error ? thrown.message : "That could not be completed.",
      );
    } finally {
      setBusyId(undefined);
    }
  }

  function act(action: "approve" | "release", report: ReportApprovalItem) {
    return post({ action, reportId: report.id }, report.id, () =>
      action === "approve"
        ? `${report.learnerName}'s report approved.`
        : `${report.learnerName}'s report released to their guardians.`,
    );
  }

  /* Releasing tells families something and cannot be taken back, so the whole
     class is confirmed by name and number before it goes. Approving is an
     internal judgement, so it is not. */
  function actOnClass(
    action: "approve-class" | "release-class",
    className: string,
    count: number,
  ) {
    if (
      action === "release-class" &&
      !window.confirm(
        `Release ${count} ${count === 1 ? "report" : "reports"} in ${className} to guardians? This cannot be undone.`,
      )
    ) {
      return;
    }
    return post({ action, className }, `${action}:${className}`, () =>
      action === "approve-class"
        ? `${count} ${count === 1 ? "report" : "reports"} approved in ${className}.`
        : `${count} ${count === 1 ? "report" : "reports"} in ${className} released to guardians.`,
    );
  }

  if (loading) return <p className="approvals-loading">Loading report cards…</p>;

  if (error && !queue) {
    return (
      <div className="approvals-failure">
        <h2>Report cards are unavailable</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!queue) return null;

  const waiting = queue.awaitingApproval + queue.awaitingRelease;

  return (
    <div className="approvals">
      <header className="approvals-head">
        <div>
          <h2>{queue.periodName}</h2>
          <p>
            {waiting === 0
              ? "Nothing is waiting on you."
              : `${waiting} ${waiting === 1 ? "report" : "reports"} waiting on you — ${queue.awaitingApproval} to approve, ${queue.awaitingRelease} to release.`}
          </p>
        </div>
      </header>

      {notice ? (
        <p className="approvals-notice" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="approvals-error" role="alert">
          {error}
        </p>
      ) : null}

      {/* A term where no teacher has submitted yet is the normal state for
          most of it, and reads as an empty screen unless it says so. */}
      {queue.reports.length === 0 ? (
        <p className="approvals-empty">
          No markbooks have been submitted for {queue.periodName} yet. Reports
          appear here once a teacher submits.
        </p>
      ) : (
        /* Grouped by class, because a class is the unit a head actually works
           in: they are marked together, checked together and sent home
           together. The per-learner buttons stay exactly where they were —
           the class header adds a second way to do the same thing, it does
           not replace the first. */
        groupByClass(queue.reports).map(([className, reports]) => {
          const toApprove = reports.filter(
            (report) => report.status === "submitted",
          ).length;
          const toRelease = reports.filter(
            (report) => report.status === "approved",
          ).length;
          const approveKey = `approve-class:${className}`;
          const releaseKey = `release-class:${className}`;

          return (
            <section className="approvals-class" key={className}>
              <header>
                <div>
                  <h3>{className || "Unassigned class"}</h3>
                  <small>
                    {reports.length}{" "}
                    {reports.length === 1 ? "report" : "reports"}
                    {toApprove > 0 ? ` · ${toApprove} to approve` : ""}
                    {toRelease > 0 ? ` · ${toRelease} to release` : ""}
                  </small>
                </div>
                <div className="approvals-class-actions">
                  {toApprove > 0 ? (
                    <button
                      disabled={busyId === approveKey}
                      onClick={() =>
                        void actOnClass("approve-class", className, toApprove)
                      }
                      type="button"
                    >
                      {busyId === approveKey
                        ? "Approving…"
                        : `Approve all ${toApprove}`}
                    </button>
                  ) : null}
                  {toRelease > 0 ? (
                    <button
                      className="is-release"
                      disabled={busyId === releaseKey}
                      onClick={() =>
                        void actOnClass("release-class", className, toRelease)
                      }
                      type="button"
                    >
                      {busyId === releaseKey
                        ? "Releasing…"
                        : `Release all ${toRelease}`}
                    </button>
                  ) : null}
                </div>
              </header>

              <ul className="approvals-list">
                {reports.map((report) => (
                  <li key={report.id}>
                    <div className="approvals-identity">
                      <strong>{report.learnerName}</strong>
                      <small>
                        {report.subjectCount}{" "}
                        {report.subjectCount === 1 ? "subject" : "subjects"} ·
                        average {report.averagePercent.toFixed(1)}%
                      </small>
                    </div>

                    <span className={`approvals-status is-${report.status}`}>
                      {statusLabel(report.status)}
                    </span>

                    <div className="approvals-action">
                      {report.status === "submitted" ? (
                        <button
                          disabled={busyId === report.id}
                          onClick={() => void act("approve", report)}
                          type="button"
                        >
                          {busyId === report.id ? "Approving…" : "Approve"}
                        </button>
                      ) : null}
                      {report.status === "approved" ? (
                        <button
                          className="is-release"
                          disabled={busyId === report.id}
                          onClick={() => void act("release", report)}
                          type="button"
                        >
                          {busyId === report.id
                            ? "Releasing…"
                            : "Release to guardian"}
                        </button>
                      ) : null}
                      {report.status === "released" ? (
                        <small className="approvals-done">Sent home</small>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

/* Keeps the queue's ordering — awaiting approval first, then awaiting
   release, then sent — within each class, and orders the classes by the one
   that needs attention soonest. */
function groupByClass(
  reports: ReportApprovalItem[],
): Array<[string, ReportApprovalItem[]]> {
  const classes = new Map<string, ReportApprovalItem[]>();
  for (const report of reports) {
    const existing = classes.get(report.className);
    if (existing) existing.push(report);
    else classes.set(report.className, [report]);
  }
  return [...classes];
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    approved: "Approved",
    draft: "Being marked",
    locked: "Locked",
    released: "Released",
    submitted: "Awaiting approval",
  };
  return labels[status] ?? status;
}
