"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { AnnouncementWorkspace } from "../../../db/announcement-repository";
import type { AnnouncementScopeType } from "../../../domain/announcements/announcements";
import "./announcements.css";

/* ==========================================================================
   Announcements

   The same panel on the teacher, learner and guardian home. It asks one
   question — what notices am I in the audience for — and the answer is
   decided entirely by the reader's own scopes, so this component never needs
   to know which of the three it is rendering for.

   The composer appears only when the server says the reader may post, and
   offers only the audiences it named. Nothing here decides who may reach
   whom; it renders what canPost came back with.
   ========================================================================== */

async function fetchWorkspace(): Promise<
  { error: string } | { workspace: AnnouncementWorkspace }
> {
  try {
    const response = await fetch("/api/announcements");
    const payload = (await response.json()) as {
      error?: string;
      workspace?: AnnouncementWorkspace;
    };
    if (!response.ok || !payload.workspace) {
      return { error: payload.error ?? "Announcements could not be loaded." };
    }
    return { workspace: payload.workspace };
  } catch {
    return { error: "Announcements could not be reached." };
  }
}

export function AnnouncementsPanel() {
  const [workspace, setWorkspace] = useState<AnnouncementWorkspace | null>(null);
  const [state, setState] = useState<"error" | "loading" | "ready">("loading");
  const [problem, setProblem] = useState("");
  const [composing, setComposing] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    const result = await fetchWorkspace();
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
    return (
      <section className="announcements-panel" aria-label="Announcements">
        <p className="workspace-loading">Loading announcements…</p>
      </section>
    );
  }

  if (state === "error" || !workspace) {
    return (
      <section className="announcements-panel" aria-label="Announcements">
        <div className="workspace-failure">
          <h2>Announcements could not be loaded.</h2>
          <p>{problem}</p>
          <button onClick={() => void load()} type="button">
            Try again
          </button>
        </div>
      </section>
    );
  }

  const canPost = workspace.canPost.length > 0;

  return (
    <section className="announcements-panel" aria-label="Announcements">
      <header className="announcements-heading">
        <div>
          <p className="workspace-eyebrow">Notices</p>
          <h2>Announcements</h2>
        </div>
        {canPost ? (
          <button
            className="announcements-compose-toggle"
            onClick={() => setComposing((open) => !open)}
            type="button"
          >
            {composing ? "Cancel" : "Post a notice"}
          </button>
        ) : null}
      </header>

      {notice ? (
        <button
          className="announcements-notice"
          onClick={() => setNotice("")}
          type="button"
        >
          {notice} <span>×</span>
        </button>
      ) : null}

      {composing && canPost ? (
        <AnnouncementComposer
          onPosted={(updated) => {
            setWorkspace(updated);
            setComposing(false);
            setNotice("Your announcement is showing.");
          }}
          onProblem={setNotice}
          scopes={workspace.canPost}
        />
      ) : null}

      {workspace.announcements.length === 0 ? (
        <div className="workspace-empty">
          <strong>Nothing to read</strong>
          <p>
            Notices from the school, your class and your subjects appear here.
          </p>
        </div>
      ) : (
        <ol className="announcements-list">
          {workspace.announcements.map((announcement) => (
            <li key={announcement.id}>
              <article>
                <header>
                  <span className={`announcement-scope scope-${announcement.scopeType}`}>
                    {announcement.scopeLabel}
                  </span>
                  <h3>{announcement.title}</h3>
                </header>
                <p>{announcement.body}</p>
                <footer>
                  <span>{announcement.authorName}</span>
                  <time dateTime={announcement.publishAt}>
                    {formatWhen(announcement.publishAt)}
                  </time>
                  {announcement.expiresAt ? (
                    <em>Until {formatWhen(announcement.expiresAt)}</em>
                  ) : null}
                </footer>
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function AnnouncementComposer({
  onPosted,
  onProblem,
  scopes,
}: {
  onPosted: (workspace: AnnouncementWorkspace) => void;
  onProblem: (message: string) => void;
  scopes: AnnouncementWorkspace["canPost"];
}) {
  /* Scopes are addressed by index because a whole-school notice has no scope
     id, so the id alone cannot identify the choice. */
  const [selected, setSelected] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const scope = scopes[selected];
    setBusy(true);
    try {
      const response = await fetch("/api/announcements", {
        body: JSON.stringify({
          body,
          /* A date input gives a local calendar day. A notice about Thursday
             should stop showing when Thursday ends, so the expiry is the end
             of the day chosen rather than its first instant. */
          expiresAt: expiresAt
            ? new Date(`${expiresAt}T23:59:59`).toISOString()
            : null,
          scopeId: scope.id,
          scopeType: scope.type as AnnouncementScopeType,
          title,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        workspace?: AnnouncementWorkspace;
      };
      if (!response.ok || !payload.workspace) {
        onProblem(payload.error ?? "The announcement could not be posted.");
        return;
      }
      onPosted(payload.workspace);
    } catch {
      onProblem("The announcement could not be posted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="announcement-composer" onSubmit={submit}>
      <label>
        <span>Who it reaches</span>
        <select
          onChange={(event) => setSelected(Number(event.target.value))}
          value={selected}
        >
          {scopes.map((scope, index) => (
            <option key={`${scope.type}-${scope.id ?? "all"}`} value={index}>
              {scope.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Title</span>
        <input
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Thursday's trip is cancelled"
          required
          value={title}
        />
      </label>
      <label>
        <span>Notice</span>
        <textarea
          maxLength={2000}
          onChange={(event) => setBody(event.target.value)}
          placeholder="What do they need to know?"
          required
          value={body}
        />
      </label>
      <label>
        <span>Stop showing after (optional)</span>
        <input
          onChange={(event) => setExpiresAt(event.target.value)}
          type="date"
          value={expiresAt}
        />
        <small>Leave blank and it stands until you take it down.</small>
      </label>
      <button disabled={busy} type="submit">
        {busy ? "Posting…" : "Post announcement"}
      </button>
    </form>
  );
}

function formatWhen(value: string): string {
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return value;
  return new Intl.DateTimeFormat("en-GH", {
    day: "numeric",
    month: "short",
  }).format(when);
}
