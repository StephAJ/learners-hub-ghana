"use client";

import { useState } from "react";
import type {
  LibraryResource,
  LibraryShelf,
} from "../../../db/library-repository";
import {
  LIBRARY_CATEGORIES,
  LIBRARY_CATEGORY_LABELS,
} from "../../../domain/library/library";
import { FileTextIcon, UploadIcon } from "../../components/icons";
import "../../learn/library/library.css";
import "./library-manager.css";

/* ==========================================================================
   Putting something on the shelf

   The form is the whole screen rather than a dialog over a list, because
   adding a resource is what a teacher opens this page to do — the catalogue
   underneath is there to show the thing arrived and to take it back off if it
   was the wrong file.

   The file first, then what it is. A teacher who has just found last year's
   paper on their laptop should be able to drop it and answer the questions
   afterwards, rather than filling a form and then hunting for the file.
   ========================================================================== */

export function LibraryManager({
  initial,
  subjects,
}: {
  initial: LibraryShelf;
  subjects: Array<{ id: string; name: string }>;
}) {
  const [shelf, setShelf] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("past-paper");
  const [subjectId, setSubjectId] = useState("");
  const [yearGroup, setYearGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");

  function take(chosen: File | undefined) {
    if (!chosen) return;
    setFile(chosen);
    setProblem("");
    /* The filename is the best first guess at a title, minus the extension —
       a teacher can correct it, and most will not have to. */
    if (!title.trim()) {
      setTitle(chosen.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
    }
  }

  async function add() {
    if (!file) {
      setProblem("Choose the file to add.");
      return;
    }
    setBusy(true);
    setProblem("");
    try {
      const body = new FormData();
      body.append("category", category);
      body.append("description", description);
      body.append("file", file);
      body.append("subjectId", subjectId);
      body.append("title", title);
      body.append("yearGroup", yearGroup);

      const response = await fetch("/api/library", { body, method: "POST" });
      const payload = (await response.json()) as {
        error?: string;
        resource?: LibraryResource;
      };
      if (!response.ok || !payload.resource) {
        setProblem(payload.error ?? "That resource could not be added.");
        return;
      }
      setNotice(`${payload.resource.title} is on the shelf.`);
      setFile(null);
      setTitle("");
      setDescription("");
      setYearGroup("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    const response = await fetch("/api/library");
    const payload = (await response.json()) as { shelf?: LibraryShelf };
    if (payload.shelf) setShelf(payload.shelf);
  }

  async function archive(resourceId: string, title: string) {
    const response = await fetch(
      `/api/library?resourceId=${encodeURIComponent(resourceId)}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setProblem(payload.error ?? "That resource could not be removed.");
      return;
    }
    setNotice(`${title} was taken off the shelf.`);
    await refresh();
  }

  return (
    <div className="library-manager">
      <section className="library-add">
        <h2>Add a resource</h2>

        <label
          className={`library-drop${over ? " is-over" : ""}${
            file ? " is-loaded" : ""
          }`}
          onDragLeave={() => setOver(false)}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setOver(false);
            take(event.dataTransfer.files?.[0]);
          }}
        >
          <input
            accept=".pdf,.doc,.docx,.odt,.txt,.rtf"
            onChange={(event) => take(event.target.files?.[0])}
            type="file"
          />
          <span className="library-drop-icon" aria-hidden="true">
            {file ? <FileTextIcon size={22} /> : <UploadIcon size={22} />}
          </span>
          <span className="library-drop-copy">
            <strong>{file ? file.name : "Choose the file"}</strong>
            <small>
              {file
                ? "Drop another to replace it."
                : "PDF or Word, up to 25 MB. Drag it here or tap to browse."}
            </small>
          </span>
        </label>

        <div className="library-fields">
          <label className="library-field">
            <span>Title</span>
            <input
              onChange={(event) => setTitle(event.target.value)}
              placeholder="BECE Integrated Science 2024"
              value={title}
            />
          </label>

          <label className="library-field">
            <span>What kind of resource</span>
            <select
              onChange={(event) => setCategory(event.target.value)}
              value={category}
            >
              {LIBRARY_CATEGORIES.map((entry) => (
                <option key={entry} value={entry}>
                  {LIBRARY_CATEGORY_LABELS[entry]}
                </option>
              ))}
            </select>
          </label>

          <label className="library-field">
            <span>
              Subject <em>optional</em>
            </span>
            <select
              onChange={(event) => setSubjectId(event.target.value)}
              value={subjectId}
            >
              <option value="">Not one subject</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </label>

          <label className="library-field">
            <span>
              Year group <em>optional</em>
            </span>
            <input
              onChange={(event) => setYearGroup(event.target.value)}
              placeholder="JHS 3"
              value={yearGroup}
            />
          </label>

          <label className="library-field library-field-wide">
            <span>
              Description <em>optional &mdash; what a learner sees on the card</em>
            </span>
            <textarea
              onChange={(event) => setDescription(event.target.value)}
              placeholder="The 2024 paper with its marking scheme."
              rows={3}
              value={description}
            />
          </label>
        </div>

        {problem ? (
          <p className="library-problem" role="alert">
            {problem}
          </p>
        ) : null}
        {notice ? (
          <p className="library-done" role="status">
            {notice}
          </p>
        ) : null}

        <button
          className="library-add-button"
          disabled={busy || !file || !title.trim()}
          onClick={() => void add()}
          type="button"
        >
          {busy ? "Adding…" : "Add to the library"}
        </button>
      </section>

      <section className="library-current">
        <h2>On the shelf</h2>
        {shelf.resources.length === 0 ? (
          <p className="library-current-empty">
            Nothing yet. What you add here is visible to every learner in the
            school.
          </p>
        ) : (
          <ul>
            {shelf.resources.map((resource) => (
              <li key={resource.id}>
                <div>
                  <strong>{resource.title}</strong>
                  <small>
                    {LIBRARY_CATEGORY_LABELS[resource.category]}
                    {resource.subjectName ? ` · ${resource.subjectName}` : ""}
                    {resource.yearGroup ? ` · ${resource.yearGroup}` : ""}
                  </small>
                </div>
                <button
                  onClick={() => void archive(resource.id, resource.title)}
                  type="button"
                >
                  Take off the shelf
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
