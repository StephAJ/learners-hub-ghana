"use client";

import { useEffect, useState } from "react";
/* From the domain rather than the repository: importing the constant from
   db/audit-repository.ts pulls its server dependency chain — and nodemailer
   with it — into this client bundle. */
import { AUDIT_AREAS, type AuditEvent } from "../../../domain/identity/audit";
import "../academic/academic.css";
import "./audit.css";

/* ==========================================================================
   Reading the trail

   A list rather than a table. Each line is a sentence — who did what to what,
   and when — because an audit entry is read one at a time by somebody
   answering a specific question, not scanned across columns.

   The action names are slugs the repositories write (`report.released`,
   `guardian.revoked`). They are turned into words here rather than at the
   write, so the stored record stays stable and machine-readable while the
   screen stays legible.
   ========================================================================== */

const ACTION_WORDS: Record<string, string> = {
  "admissions.enrolled": "created a student record from an application",
  "admissions.status_changed": "moved an application on",
  "assessment.published": "published an assessment",
  "attempt.released": "released an attempt result",
  "attendance.submitted": "submitted a register",
  "content.h5p_activated": "activated an interactive activity",
  "content.h5p_registered": "uploaded an interactive activity",
  "gradebook.category_created": "added a markbook category",
  "gradebook.category_removed": "removed a markbook category",
  "gradebook.category_updated": "changed a markbook weighting",
  "gradebook.item_created": "added a markbook column",
  "gradebook.item_excluded": "removed a markbook column",
  "gradebook.item_updated": "changed a markbook column",
  "gradebook.period_created": "created a term",
  "gradebook.period_status_changed": "opened or closed a term",
  "gradebook.result_recorded": "recorded a released result in the markbook",
  "gradebook.submitted": "submitted a markbook for approval",
  "guardian.linked": "linked a guardian to a child",
  "guardian.revoked": "removed a guardian's access to a child",
  "people.imported": "imported a list of people",
  "people.invited": "invited somebody",
  "people.offboarded": "removed somebody's access",
  "people.reinstated": "restored somebody's access",
  "people.updated": "corrected somebody's details",
  "report.approved": "approved a report",
  "report.correction_opened": "opened a released report for correction",
  "report.released": "released a report to a family",
  "school.profile-updated": "changed the school's details",
  "timetable.entry_cleared": "cleared a timetable slot",
  "timetable.entry_set": "timetabled a lesson",
  "timetable.period_created": "added a period",
  "timetable.period_removed": "removed a period",
};

export function AuditView() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [state, setState] = useState<"error" | "loading" | "ready">("loading");
  const [problem, setProblem] = useState("");
  const [area, setArea] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState({ area: "", search: "" });

  useEffect(() => {
    let active = true;

    async function loadOnce() {
      try {
        const parameters = new URLSearchParams();
        if (query.area) parameters.set("area", query.area);
        if (query.search) parameters.set("search", query.search);
        const response = await fetch(`/api/admin/audit?${parameters}`);
        const payload = (await response.json()) as {
          error?: string;
          events?: AuditEvent[];
        };
        if (!active) return;
        if (!response.ok || !payload.events) {
          throw new Error(payload.error ?? "The activity log is unavailable.");
        }
        setEvents(payload.events);
        setState("ready");
      } catch (error) {
        if (!active) return;
        setProblem(
          error instanceof Error ? error.message : "Something went wrong.",
        );
        setState("error");
      }
    }

    void loadOnce();
    return () => {
      active = false;
    };
  }, [query]);

  if (state === "error") {
    return (
      <div className="academic-empty">
        <h2>The activity log could not be loaded.</h2>
        <p>{problem}</p>
      </div>
    );
  }

  return (
    <div className="admin-content">
      <section className="admin-welcome">
        <div>
          <p className="eyebrow">School records</p>
          <h1>Activity log</h1>
          <p>
            Every change the school makes to a record is written here as it
            happens. Nothing on this screen can alter it.
          </p>
        </div>
      </section>

      <form
        className="audit-controls"
        onSubmit={(event) => {
          event.preventDefault();
          setState("loading");
          setQuery({ area, search });
        }}
      >
        <label>
          <span>Search</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="A name, or part of an action"
            value={search}
          />
        </label>
        <label>
          <span>Area</span>
          <select
            onChange={(event) => setArea(event.target.value)}
            value={area}
          >
            <option value="">Everything</option>
            {AUDIT_AREAS.map((option) => (
              <option key={option} value={option}>
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Search</button>
      </form>

      {state === "loading" ? (
        <p className="academic-loading">Reading the log…</p>
      ) : events.length === 0 ? (
        <div className="academic-empty">
          <h2>Nothing matches.</h2>
          <p>
            Either the school has not done this yet, or the search is narrower
            than it needs to be.
          </p>
        </div>
      ) : (
        <ol className="audit-list">
          {events.map((event) => (
            <li key={event.id}>
              <div className="audit-line">
                <strong>{event.actorName}</strong>{" "}
                {ACTION_WORDS[event.action] ?? event.action}
              </div>
              <div className="audit-meta">
                <time dateTime={event.at}>{formatWhen(event.at)}</time>
                <code>{event.action}</code>
              </div>
              {describe(event.metadata) ? (
                <p className="audit-detail">{describe(event.metadata)}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * The event's own detail, as a readable line.
 *
 * The metadata shape varies by action, so this reads whatever is there rather
 * than switching on the action — a new event kind gets a sensible line for
 * free, and an unrecognised key is still shown rather than dropped.
 */
function describe(metadata: Record<string, unknown>): string {
  return Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== "" && value !== undefined)
    .map(([key, value]) => `${humanise(key)}: ${format(value)}`)
    .join(" · ");
}

function humanise(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function format(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  return JSON.stringify(value);
}

function formatWhen(value: string): string {
  const parsed = new Date(value.includes("T") ? value : `${value}Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}
