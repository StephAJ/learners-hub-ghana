"use client";

import { useCallback, useState } from "react";
import type {
  LibraryResource,
  LibraryShelf,
} from "../../../db/library-repository";
import {
  LIBRARY_CATEGORY_LABELS,
  type LibraryCategory,
} from "../../../domain/library/library";
import { DownloadIcon, FileTextIcon } from "../../components/icons";
import "./library.css";

/* ==========================================================================
   Browsing the shelf

   Listings rather than a file tree. A learner comes here for a thing they can
   name — last year's paper, the atlas, this term's worksheets — so the screen
   is a search box, a row of shelves, and cards that say what each one is.

   Filtering happens on the server: a school's library grows without bound and
   the learners reading it are on metered connections, so sending four hundred
   listings and hiding most of them in the browser is the wrong trade twice.
   ========================================================================== */

export function LibraryView({ initial }: { initial: LibraryShelf }) {
  const [shelf, setShelf] = useState(initial);
  const [category, setCategory] = useState<LibraryCategory | "">("");
  const [subjectId, setSubjectId] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(
    async (next: {
      category: LibraryCategory | "";
      search: string;
      subjectId: string;
    }) => {
      setBusy(true);
      try {
        const parameters = new URLSearchParams();
        if (next.category) parameters.set("category", next.category);
        if (next.subjectId) parameters.set("subjectId", next.subjectId);
        if (next.search.trim()) parameters.set("search", next.search.trim());
        const response = await fetch(`/api/library?${parameters}`);
        const payload = (await response.json()) as {
          error?: string;
          shelf?: LibraryShelf;
        };
        if (!response.ok || !payload.shelf) {
          setNotice(payload.error ?? "The library could not be loaded.");
          return;
        }
        setShelf(payload.shelf);
        setNotice("");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  function choose(next: LibraryCategory | "") {
    setCategory(next);
    void load({ category: next, search, subjectId });
  }

  function chooseSubject(next: string) {
    setSubjectId(next);
    void load({ category, search, subjectId: next });
  }

  return (
    <div className="library">
      <form
        className="library-search"
        onSubmit={(event) => {
          event.preventDefault();
          void load({ category, search, subjectId });
        }}
      >
        <label>
          <span>Search the library</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="A title, a year, or what it is about"
            value={search}
          />
        </label>
        <button disabled={busy} type="submit">
          {busy ? "Looking…" : "Search"}
        </button>
      </form>

      {/* Only shelves with something on them, so a learner is never offered a
          filter that empties the page. */}
      {shelf.categories.length > 0 ? (
        <div className="library-shelves">
          <button
            className={category === "" ? "is-on" : ""}
            onClick={() => choose("")}
            type="button"
          >
            Everything
          </button>
          {shelf.categories.map((entry) => (
            <button
              className={category === entry ? "is-on" : ""}
              key={entry}
              onClick={() => choose(entry)}
              type="button"
            >
              {LIBRARY_CATEGORY_LABELS[entry]}
            </button>
          ))}
        </div>
      ) : null}

      {shelf.subjects.length > 0 ? (
        <label className="library-subject">
          <span>Subject</span>
          <select
            onChange={(event) => chooseSubject(event.target.value)}
            value={subjectId}
          >
            <option value="">Every subject</option>
            {shelf.subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {notice ? (
        <p className="library-notice" role="alert">
          {notice}
        </p>
      ) : null}

      {shelf.resources.length === 0 ? (
        <div className="library-empty">
          <h2>
            {search || category || subjectId
              ? "Nothing matches that"
              : "The library is empty so far"}
          </h2>
          <p>
            {search || category || subjectId
              ? "Try a different word, or clear the filters to see everything."
              : "Your school adds past papers, textbooks and worksheets here as the term goes on."}
          </p>
        </div>
      ) : (
        <ul className="library-list">
          {shelf.resources.map((resource) => (
            <LibraryCard key={resource.id} resource={resource} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LibraryCard({ resource }: { resource: LibraryResource }) {
  return (
    <li className="library-card">
      <span className="library-card-glyph" aria-hidden="true">
        <FileTextIcon size={20} />
      </span>

      <div className="library-card-body">
        <h3>{resource.title}</h3>
        {resource.description ? <p>{resource.description}</p> : null}

        <div className="library-card-facts">
          <span className="library-tag">
            {LIBRARY_CATEGORY_LABELS[resource.category]}
          </span>
          {resource.subjectName ? <span>{resource.subjectName}</span> : null}
          {resource.yearGroup ? <span>{resource.yearGroup}</span> : null}
          <span>{formatSize(resource.sizeBytes)}</span>
        </div>
      </div>

      {/* A plain link rather than a fetch: the browser's own download is what
          a learner on a poor connection can resume, and it works with
          whatever they have set as their downloads folder. */}
      <a
        className="library-download"
        download={resource.filename}
        href={`/api/library/download?resourceId=${encodeURIComponent(resource.id)}`}
      >
        <DownloadIcon size={16} />
        Download
      </a>
    </li>
  );
}

/** Decimal units, so the page and the phone agree on the size of a file. */
function formatSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ["kB", "MB", "GB"];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
