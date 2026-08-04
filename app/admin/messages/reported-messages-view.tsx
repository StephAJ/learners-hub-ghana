"use client";

import { useEffect, useState } from "react";
import type { ReportedThread } from "../../../domain/messaging/types";
import "./reported-messages.css";

/* ==========================================================================
   Reported conversations

   The only place in the product where someone reads messages they are not a
   party to, so the screen is built to make that visible rather than
   comfortable: the whole transcript, who raised it, what they said, and a
   note the reviewer has to write to close it.

   There is no delete. A learner being spoken to badly needs the messages to
   still exist when this screen is opened, and so does a teacher who is being
   accused. Closing a report records a decision; it does not remove evidence.
   ========================================================================== */

export function ReportedMessagesView() {
  const [reports, setReports] = useState<ReportedThread[]>([]);
  const [openId, setOpenId] = useState<string>();
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/admin/messages");
        const payload = (await response.json()) as {
          error?: string;
          reports?: ReportedThread[];
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Reports could not be loaded.");
        }
        if (active) setReports(payload.reports ?? []);
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

  async function review(reportId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/messages", {
        body: JSON.stringify({ note, reportId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        reports?: ReportedThread[];
      };
      if (!response.ok || !payload.reports) {
        throw new Error(payload.error ?? "The report could not be closed.");
      }
      setReports(payload.reports);
      setNote("");
      setOpenId(undefined);
    } catch (thrown) {
      setError(
        thrown instanceof Error ? thrown.message : "The report could not be closed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const open = reports.filter((report) => report.status === "open");

  if (loading) return <p className="reports-empty">Loading reports…</p>;

  return (
    <div className="reports">
      {error ? (
        <p className="reports-error" role="alert">
          {error}
        </p>
      ) : null}

      <p className="reports-summary">
        {open.length === 0
          ? "No conversations are waiting to be reviewed."
          : `${open.length} ${open.length === 1 ? "conversation is" : "conversations are"} waiting to be reviewed.`}
      </p>

      {reports.length === 0 ? (
        <p className="reports-empty">
          When a learner or a teacher reports a conversation, it appears here
          with the full transcript.
        </p>
      ) : null}

      <ul className="reports-list">
        {reports.map((report) => (
          <li
            className={report.status === "open" ? "is-open" : "is-reviewed"}
            key={report.id}
          >
            <header>
              <div>
                <p className="reports-who">
                  {report.learnerName} and {report.teacherName}
                </p>
                <p className="reports-meta">
                  Reported by {report.reportedByName} ({report.reportedByRole}) ·{" "}
                  {formatDate(report.reportedAt)}
                </p>
              </div>
              <span className={`reports-state state-${report.status}`}>
                {report.status === "open" ? "Needs review" : "Reviewed"}
              </span>
            </header>

            {report.reason ? (
              <blockquote className="reports-reason">{report.reason}</blockquote>
            ) : (
              <p className="reports-reason reports-reason-empty">
                No reason was given.
              </p>
            )}

            <details
              onToggle={(event) =>
                setOpenId(event.currentTarget.open ? report.id : undefined)
              }
              open={openId === report.id}
            >
              <summary>
                Read the conversation ({report.messages.length}{" "}
                {report.messages.length === 1 ? "message" : "messages"})
              </summary>
              <div className="reports-transcript">
                {report.messages.map((message) => (
                  <article key={message.id}>
                    <p className="reports-transcript-who">
                      {message.senderRole === "learner"
                        ? report.learnerName
                        : report.teacherName}
                      <time dateTime={message.sentAt}>
                        {formatDate(message.sentAt)}
                      </time>
                    </p>
                    <p>{message.body}</p>
                  </article>
                ))}
              </div>
            </details>

            {report.status === "open" ? (
              <form
                className="reports-review"
                onSubmit={(event) => {
                  event.preventDefault();
                  void review(report.id);
                }}
              >
                <label>
                  <span>What did you do about it?</span>
                  <input
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Spoke to both, no further action."
                    value={openId === report.id ? note : ""}
                    onFocus={() => setOpenId(report.id)}
                  />
                </label>
                <button disabled={busy} type="submit">
                  {busy ? "Saving…" : "Close report"}
                </button>
              </form>
            ) : (
              <p className="reports-outcome">
                Closed by {report.reviewedByName} ·{" "}
                {report.reviewedAt ? formatDate(report.reviewedAt) : ""}
                {report.reviewNote ? ` — ${report.reviewNote}` : ""}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDate(value: string): string {
  const parsed = new Date(value.includes("T") ? value : `${value}Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(parsed);
}
