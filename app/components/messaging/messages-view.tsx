"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flag, Plus, Send, X } from "lucide-react";
import type {
  MessageRecipient,
  MessageThread,
  MessageThreadDetail,
} from "../../../domain/messaging/types";
import { PersonAvatar } from "../person-avatar";
import "./messages.css";

/* ==========================================================================
   The school inbox

   One component for both sides of the conversation. A learner writing to
   their science teacher and that teacher writing back are the same screen
   with the names swapped, and building it twice would have guaranteed the two
   drifted — the teacher's copy gaining a feature the learner's never got.

   `viewerRole` decides only two things: whose name titles a thread, and which
   side of the transcript a bubble sits on. Everything else — who may be
   written to at all — is decided on the server, in
   domain/messaging/messaging.ts.
   ========================================================================== */

export function MessagesView({
  viewerRole,
}: {
  viewerRole: "guardian" | "learner" | "teacher";
}) {
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [recipients, setRecipients] = useState<MessageRecipient[]>([]);
  const [openThread, setOpenThread] = useState<MessageThreadDetail>();
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const transcriptRef = useRef<HTMLDivElement>(null);

  const loadInbox = useCallback(async () => {
    try {
      const response = await fetch("/api/messages");
      const payload = (await response.json()) as {
        error?: string;
        recipients?: MessageRecipient[];
        threads?: MessageThread[];
      };
      if (!response.ok) throw new Error(payload.error ?? "Messages unavailable.");
      setThreads(payload.threads ?? []);
      setRecipients(payload.recipients ?? []);
    } catch (thrown) {
      setError(
        thrown instanceof Error ? thrown.message : "Messages unavailable.",
      );
    }
  }, []);

  /* The async function lives inside the effect and is guarded by `active`,
     which is the pattern every other loading surface here uses: it keeps the
     effect from setting state on a component that has already gone, and keeps
     the initial load off the synchronous render path. */
  useEffect(() => {
    let active = true;
    async function initialLoad() {
      await loadInbox();
      if (active) setLoading(false);
    }
    void initialLoad();
    return () => {
      active = false;
    };
  }, [loadInbox]);

  /* New messages land at the bottom, so the transcript opens there rather
     than at the top of a conversation that may be weeks old. */
  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [openThread]);

  async function openConversation(threadId: string) {
    setError("");
    try {
      const response = await fetch(
        `/api/messages?threadId=${encodeURIComponent(threadId)}`,
      );
      const payload = (await response.json()) as {
        error?: string;
        thread?: MessageThreadDetail;
      };
      if (!response.ok || !payload.thread) {
        throw new Error(payload.error ?? "This conversation could not be opened.");
      }
      setOpenThread(payload.thread);
      setComposing(false);
      /* Opening marks it read on the server, so the badge here follows. */
      setThreads((current) =>
        current.map((thread) =>
          thread.id === threadId ? { ...thread, unreadCount: 0 } : thread,
        ),
      );
    } catch (thrown) {
      setError(
        thrown instanceof Error
          ? thrown.message
          : "This conversation could not be opened.",
      );
    }
  }

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/messages", {
        body: JSON.stringify(payload),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as {
        error?: string;
        thread?: MessageThreadDetail;
      };
      if (!response.ok || !result.thread) {
        throw new Error(result.error ?? "The message could not be sent.");
      }
      setOpenThread(result.thread);
      setDraft("");
      setComposing(false);
      await loadInbox();
    } catch (thrown) {
      setError(
        thrown instanceof Error ? thrown.message : "The message could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  }

  const unreadTotal = useMemo(
    () => threads.reduce((total, thread) => total + thread.unreadCount, 0),
    [threads],
  );

  return (
    <div className="inbox">
      <aside className="inbox-list">
        <header className="inbox-list-head">
          <div>
            <h2>Conversations</h2>
            {unreadTotal > 0 ? <span>{unreadTotal} unread</span> : null}
          </div>
          <button
            className="inbox-new"
            disabled={recipients.length === 0}
            onClick={() => {
              setComposing(true);
              setOpenThread(undefined);
              setDraft("");
            }}
            type="button"
          >
            <Plus aria-hidden="true" size={15} />
            New
          </button>
        </header>

        {loading ? (
          <p className="inbox-empty">Loading your messages…</p>
        ) : threads.length === 0 ? (
          <p className="inbox-empty">
            No messages yet.{" "}
            {recipients.length === 0
              ? EMPTY_WITHOUT_ANYONE[viewerRole]
              : EMPTY_WITH_SOMEONE[viewerRole]}
          </p>
        ) : (
          <ul>
            {threads.map((thread) => {
              const other = otherSide(thread, viewerRole);
              const { name, photoUrl } = other;
              return (
                <li key={thread.id}>
                  <button
                    aria-current={thread.id === openThread?.id ? "true" : undefined}
                    className={thread.id === openThread?.id ? "is-open" : undefined}
                    onClick={() => void openConversation(thread.id)}
                    type="button"
                  >
                    <PersonAvatar
                      kind={other.kind}
                      name={name}
                      photoUrl={photoUrl}
                      size={38}
                    />
                    <span className="inbox-list-copy">
                      <strong>{name}</strong>
                      {other.about ? <em>About {other.about}</em> : null}
                      <small>{thread.preview || "No messages yet"}</small>
                    </span>
                    <span className="inbox-list-meta">
                      <time dateTime={thread.lastMessageAt}>
                        {formatWhen(thread.lastMessageAt)}
                      </time>
                      {thread.unreadCount > 0 ? (
                        <b aria-label={`${thread.unreadCount} unread`}>
                          {thread.unreadCount}
                        </b>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section className="inbox-panel">
        {error ? (
          <p className="inbox-error" role="alert">
            {error}
          </p>
        ) : null}

        {composing ? (
          <NewConversation
            busy={busy}
            draft={draft}
            onCancel={() => setComposing(false)}
            onDraft={setDraft}
            onSend={(recipientPersonId, offeringId) =>
              post({ action: "start", body: draft, offeringId, recipientPersonId })
            }
            recipients={recipients}
          />
        ) : openThread ? (
          <Conversation
            busy={busy}
            draft={draft}
            onDraft={setDraft}
            onReport={async (reason) => {
              const response = await fetch("/api/messages", {
                body: JSON.stringify({
                  action: "report",
                  reason,
                  threadId: openThread.id,
                }),
                headers: { "content-type": "application/json" },
                method: "POST",
              });
              const result = (await response.json()) as { error?: string };
              if (!response.ok) {
                throw new Error(result.error ?? "The report could not be sent.");
              }
            }}
            onSend={() =>
              post({ action: "send", body: draft, threadId: openThread.id })
            }
            thread={openThread}
            transcriptRef={transcriptRef}
            viewerRole={viewerRole}
          />
        ) : (
          <div className="inbox-placeholder">
            <p>Choose a conversation to read it.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Conversation({
  busy,
  draft,
  onDraft,
  onReport,
  onSend,
  thread,
  transcriptRef,
  viewerRole,
}: {
  busy: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onReport: (reason: string) => Promise<void>;
  onSend: () => void;
  thread: MessageThreadDetail;
  transcriptRef: React.RefObject<HTMLDivElement | null>;
  viewerRole: "guardian" | "learner" | "teacher";
}) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [reportState, setReportState] = useState<"idle" | "sending" | "sent">(
    "idle",
  );
  const [reportError, setReportError] = useState("");
  const other = otherSide(thread, viewerRole);
  const otherName = other.name;
  const otherPhotoUrl = other.photoUrl;

  return (
    <>
      <header className="conversation-head">
        <PersonAvatar
          kind={other.kind}
          name={otherName}
          photoUrl={otherPhotoUrl}
          size={42}
        />
        <div>
          <strong>{otherName}</strong>
          {/* A guardian thread names the child it is about. Without it, a
              teacher holding four conversations with four parents cannot tell
              which is which. */}
          {other.about ? <small>About {other.about}</small> : null}
          {thread.subjectName ? <small>{thread.subjectName}</small> : null}
        </div>
        {reportState === "sent" ? (
          <span className="report-done">Reported to the school</span>
        ) : (
          <button
            className="report-open"
            onClick={() => setReporting((current) => !current)}
            type="button"
          >
            <Flag aria-hidden="true" size={14} />
            Report
          </button>
        )}
      </header>

      {reporting && reportState !== "sent" ? (
        <form
          className="report-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setReportState("sending");
            setReportError("");
            try {
              await onReport(reason);
              setReportState("sent");
              setReporting(false);
            } catch (thrown) {
              setReportState("idle");
              setReportError(
                thrown instanceof Error
                  ? thrown.message
                  : "The report could not be sent.",
              );
            }
          }}
        >
          <p>
            A member of school staff will read this conversation. Nothing is
            deleted, and {otherName} is not told you reported it.
          </p>
          <textarea
            aria-label="Why you are reporting this conversation"
            onChange={(event) => setReason(event.target.value)}
            placeholder="What is wrong? (optional)"
            rows={2}
            value={reason}
          />
          {reportError ? <em role="alert">{reportError}</em> : null}
          <div>
            <button onClick={() => setReporting(false)} type="button">
              Cancel
            </button>
            <button disabled={reportState === "sending"} type="submit">
              {reportState === "sending" ? "Sending…" : "Report conversation"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="conversation-transcript" ref={transcriptRef}>
        {thread.messages.map((message) => (
          <article
            className={`bubble${
              message.senderRole === viewerRole ? " is-mine" : ""
            }`}
            key={message.id}
          >
            <p>{message.body}</p>
            <time dateTime={message.sentAt}>{formatWhen(message.sentAt)}</time>
          </article>
        ))}
      </div>

      <Composer
        busy={busy}
        draft={draft}
        label={`Reply to ${otherName}`}
        onDraft={onDraft}
        onSend={onSend}
      />
    </>
  );
}

function NewConversation({
  busy,
  draft,
  onCancel,
  onDraft,
  onSend,
  recipients,
}: {
  busy: boolean;
  draft: string;
  onCancel: () => void;
  onDraft: (value: string) => void;
  onSend: (recipientPersonId: string, offeringId?: string) => void;
  recipients: MessageRecipient[];
}) {
  const [selected, setSelected] = useState(recipients[0]?.personId ?? "");
  const recipient = recipients.find((item) => item.personId === selected);

  return (
    <>
      <header className="conversation-head">
        <div>
          <strong>New message</strong>
          <small>
            {recipients.length}{" "}
            {recipients.length === 1 ? "person" : "people"} you can write to
          </small>
        </div>
        <button
          aria-label="Cancel"
          className="conversation-close"
          onClick={onCancel}
          type="button"
        >
          <X aria-hidden="true" size={17} />
        </button>
      </header>

      <div className="recipient-picker">
        <ul className="recipient-list">
          {recipients.map((person) => (
            <li key={person.personId}>
              <label
                className={person.personId === selected ? "is-selected" : undefined}
              >
                <input
                  checked={person.personId === selected}
                  name="recipient"
                  onChange={() => setSelected(person.personId)}
                  type="radio"
                />
                <PersonAvatar
                  name={person.name}
                  photoUrl={person.photoUrl}
                  size={36}
                />
                <span>
                  <strong>{person.name}</strong>
                  <small>{person.context}</small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <Composer
        busy={busy}
        draft={draft}
        label={recipient ? `Message ${recipient.name}` : "Message"}
        onDraft={onDraft}
        onSend={() => recipient && onSend(recipient.personId, recipient.offeringId)}
      />
    </>
  );
}

function Composer({
  busy,
  draft,
  label,
  onDraft,
  onSend,
}: {
  busy: boolean;
  draft: string;
  label: string;
  onDraft: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <form
      className="conversation-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.trim() && !busy) onSend();
      }}
    >
      <textarea
        aria-label={label}
        onChange={(event) => onDraft(event.target.value)}
        onKeyDown={(event) => {
          /* Enter sends, Shift+Enter breaks the line. A school message is
             usually one or two sentences, and reaching for a button after
             every one of them is the wrong default. */
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (draft.trim() && !busy) onSend();
          }
        }}
        placeholder={label}
        rows={2}
        value={draft}
      />
      <button disabled={busy || !draft.trim()} type="submit">
        <Send aria-hidden="true" size={16} />
        <span>{busy ? "Sending…" : "Send"}</span>
      </button>
    </form>
  );
}

/** Today shows a time, this week a day, anything older a date. */
function formatWhen(value: string): string {
  const parsed = new Date(value.includes("T") ? value : `${value}Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  const now = new Date();
  const sameDay = parsed.toDateString() === now.toDateString();
  if (sameDay) {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(parsed);
  }
  const daysAgo = (now.getTime() - parsed.getTime()) / 86_400_000;
  if (daysAgo < 7) {
    return new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(parsed);
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(parsed);
}

/* ==========================================================================
   Who the conversation is with

   Three roles now, so "the other side" stopped being a two-way conditional.
   A guardian thread also names the child it is about, which a teacher needs
   in the list — four conversations with four parents are otherwise four names
   with no way to tell which child each is for.
   ========================================================================== */

const EMPTY_WITHOUT_ANYONE: Record<"guardian" | "learner" | "teacher", string> = {
  guardian:
    "You will be able to write to your child's teachers once their subjects are set up.",
  learner:
    "You will be able to write to your teachers once your subjects are set up.",
  teacher:
    "You will be able to write to learners and their guardians once you are assigned to a class.",
};

const EMPTY_WITH_SOMEONE: Record<"guardian" | "learner" | "teacher", string> = {
  guardian: "Ask your child's teacher anything you need to.",
  learner: "Ask a teacher about anything you are stuck on.",
  teacher: "Start a conversation with a learner or a guardian.",
};

function otherSide(
  thread: MessageThread,
  viewerRole: "guardian" | "learner" | "teacher",
): {
  about: string;
  kind: "guardian" | "learner" | "staff";
  name: string;
  photoUrl?: string | null;
} {
  /* Both family-side roles are looking at the teacher. */
  if (viewerRole !== "teacher") {
    return {
      about: "",
      kind: "staff",
      name: thread.teacherName,
      photoUrl: thread.teacherPhotoUrl,
    };
  }
  if (thread.guardianPersonId) {
    return {
      about: thread.learnerName,
      kind: "guardian",
      name: thread.guardianName ?? "Guardian",
      photoUrl: null,
    };
  }
  return {
    about: "",
    kind: "learner",
    name: thread.learnerName,
    photoUrl: thread.learnerPhotoUrl,
  };
}
