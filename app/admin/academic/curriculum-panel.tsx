"use client";

import { useEffect, useState } from "react";
import type { OfferingStandard } from "../../../db/curriculum-repository";
import type { ClassGroup, ClassOffering } from "../../../domain/academic/structure";

/* ==========================================================================
   The school's curriculum standards

   Standards existed only in the demo seed, so the four demo subjects had them
   and every subject a school created for itself had none — and no screen
   could add any. A teacher's coverage figure read 0 with no way to change it.

   Built around the paste rather than the form. A GES subject is dozens of
   lines, and a school that has to type them one at a time will simply not
   have a curriculum in the product. The single-standard form stays for the
   correction afterwards, which is the other thing that actually happens.
   ========================================================================== */

type OfferingChoice = {
  className: string;
  id: string;
  subjectName: string;
};

export function CurriculumPanel({
  classGroups,
  offeringsByClassGroup,
  subjectNameById,
}: {
  classGroups: ClassGroup[];
  offeringsByClassGroup: Record<string, ClassOffering[]>;
  subjectNameById: Record<string, string>;
}) {
  const choices: OfferingChoice[] = classGroups.flatMap((group) =>
    (offeringsByClassGroup[group.id] ?? []).map((offering) => ({
      className: group.name,
      id: offering.id,
      subjectName: subjectNameById[offering.subjectId] ?? "Subject",
    })),
  );

  const [offeringId, setOfferingId] = useState(choices[0]?.id ?? "");
  const [standards, setStandards] = useState<OfferingStandard[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [composer, setComposer] = useState<"paste" | "single" | null>(null);
  const [editing, setEditing] = useState<OfferingStandard>();

  useEffect(() => {
    if (!offeringId) return;
    let active = true;
    void (async () => {
      /* Inside the async body rather than before it: the spinner belongs to
         the request, and setting state synchronously in an effect is the
         cascading render the lint rule is there to catch. */
      setLoading(true);
      try {
        const response = await fetch(
          `/api/admin/curriculum?offeringId=${encodeURIComponent(offeringId)}`,
        );
        const payload = (await response.json()) as {
          error?: string;
          standards?: OfferingStandard[];
        };
        if (!active) return;
        if (!response.ok) throw new Error(payload.error ?? "Unavailable.");
        setStandards(payload.standards ?? []);
        setError("");
      } catch (thrown) {
        if (active) {
          setError(
            thrown instanceof Error
              ? thrown.message
              : "The curriculum could not be loaded.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [offeringId]);

  async function send(body: Record<string, unknown>, success: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/curriculum", {
        body: JSON.stringify({ offeringId, ...body }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        created?: number;
        error?: string;
        skipped?: string[];
        standards?: OfferingStandard[];
      };
      if (!response.ok || !payload.standards) {
        throw new Error(payload.error ?? "That could not be saved.");
      }
      setStandards(payload.standards);
      setComposer(null);
      setEditing(undefined);
      /* An import says what it did with each row, because "saved" after
         pasting sixty lines does not tell a school whether its curriculum is
         in. */
      setNotice(
        payload.created === undefined
          ? success
          : `${payload.created} added${
              payload.skipped?.length
                ? `, ${payload.skipped.length} already present (${payload.skipped.slice(0, 3).join(", ")}${payload.skipped.length > 3 ? "…" : ""})`
                : ""
            }.`,
      );
      return true;
    } catch (thrown) {
      setError(
        thrown instanceof Error ? thrown.message : "That could not be saved.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  const active = standards.filter((item) => item.status === "active");
  const retired = standards.filter((item) => item.status === "retired");

  if (choices.length === 0) return null;

  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <div>
          <p className="eyebrow">Curriculum</p>
          <h2>Standards this subject covers</h2>
        </div>
        <div className="admin-panel-actions">
          <button
            className="ghost-button"
            onClick={() => setComposer(composer === "paste" ? null : "paste")}
            type="button"
          >
            Paste a curriculum
          </button>
          <button
            className="ghost-button"
            onClick={() => {
              setEditing(undefined);
              setComposer(composer === "single" ? null : "single");
            }}
            type="button"
          >
            Add a standard
          </button>
        </div>
      </div>

      <label className="curriculum-subject">
        <span>Subject</span>
        <select
          onChange={(event) => {
            setOfferingId(event.target.value);
            setComposer(null);
            setNotice("");
          }}
          value={offeringId}
        >
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.subjectName} · {choice.className}
            </option>
          ))}
        </select>
      </label>

      {notice ? (
        <p className="curriculum-notice" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="curriculum-error" role="alert">
          {error}
        </p>
      ) : null}

      {composer === "paste" ? (
        <PasteForm
          busy={busy}
          onCancel={() => setComposer(null)}
          onSubmit={(paste) => send({ paste, type: "import" }, "Curriculum imported.")}
        />
      ) : null}

      {composer === "single" || editing ? (
        <StandardForm
          busy={busy}
          key={editing?.id ?? "new"}
          onCancel={() => {
            setComposer(null);
            setEditing(undefined);
          }}
          onSubmit={(standard) =>
            editing
              ? send(
                  { standard, standardId: editing.id, type: "update" },
                  `${standard.code} updated.`,
                )
              : send({ standard, type: "create" }, `${standard.code} added.`)
          }
          standard={editing}
        />
      ) : null}

      {loading ? (
        <p className="curriculum-empty">Loading the curriculum…</p>
      ) : standards.length === 0 ? (
        <p className="curriculum-empty">
          This subject has no standards yet. Paste them from your curriculum
          spreadsheet — one per line, as code and description, or code, strand,
          sub-strand and description.
        </p>
      ) : (
        <>
          <ol className="curriculum-list">
            {active.map((standard) => (
              <li key={standard.id}>
                <div>
                  <strong>{standard.code}</strong>
                  <p>{standard.description}</p>
                  <small>
                    {[standard.strand, standard.subStrand]
                      .filter(Boolean)
                      .join(" · ") || "No strand recorded"}
                    {" · "}
                    {standard.lessonCount}{" "}
                    {standard.lessonCount === 1 ? "lesson" : "lessons"}
                  </small>
                </div>
                <div className="curriculum-row-actions">
                  <button
                    disabled={busy}
                    onClick={() => {
                      setComposer(null);
                      setEditing(standard);
                    }}
                    type="button"
                  >
                    Edit
                  </button>
                  {/* Retire keeps the record for lessons that cover it;
                      delete is only offered while nothing does. */}
                  {standard.lessonCount === 0 ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        window.confirm(`Remove ${standard.code}?`) &&
                        void send(
                          { standardId: standard.id, type: "delete" },
                          `${standard.code} removed.`,
                        )
                      }
                      type="button"
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void send(
                          {
                            standardId: standard.id,
                            status: "retired",
                            type: "set-status",
                          },
                          `${standard.code} retired.`,
                        )
                      }
                      type="button"
                    >
                      Retire
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {retired.length > 0 ? (
            <details className="curriculum-retired">
              <summary>
                {retired.length} retired{" "}
                {retired.length === 1 ? "standard" : "standards"}
              </summary>
              <ul>
                {retired.map((standard) => (
                  <li key={standard.id}>
                    <span>
                      <strong>{standard.code}</strong> {standard.description}
                    </span>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void send(
                          {
                            standardId: standard.id,
                            status: "active",
                            type: "set-status",
                          },
                          `${standard.code} restored.`,
                        )
                      }
                      type="button"
                    >
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}

function PasteForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (paste: string) => Promise<boolean>;
}) {
  const [paste, setPaste] = useState("");

  return (
    <form
      className="curriculum-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (await onSubmit(paste)) setPaste("");
      }}
    >
      <label>
        <span>Paste from your curriculum spreadsheet</span>
        <textarea
          onChange={(event) => setPaste(event.target.value)}
          placeholder={
            "B7.1.1.1\tSystems\tHuman body systems\tDescribe the digestive system.\nB7.1.1.2\tSystems\tHuman body systems\tExplain how nutrients are absorbed."
          }
          rows={8}
          value={paste}
        />
        <small>
          One standard per line. Copying cells straight out of Excel or Google
          Sheets works. Codes already in this subject are left as they are.
        </small>
      </label>
      <div className="curriculum-form-actions">
        <button className="ghost-button" onClick={onCancel} type="button">
          Cancel
        </button>
        <button disabled={busy || !paste.trim()} type="submit">
          {busy ? "Importing…" : "Import"}
        </button>
      </div>
    </form>
  );
}

function StandardForm({
  busy,
  onCancel,
  onSubmit,
  standard,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (standard: {
    code: string;
    description: string;
    strand: string;
    subStrand: string;
  }) => Promise<boolean>;
  standard?: OfferingStandard;
}) {
  const [code, setCode] = useState(standard?.code ?? "");
  const [strand, setStrand] = useState(standard?.strand ?? "");
  const [subStrand, setSubStrand] = useState(standard?.subStrand ?? "");
  const [description, setDescription] = useState(standard?.description ?? "");

  const locked = Boolean(standard && standard.lessonCount > 0);

  return (
    <form
      className="curriculum-form"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit({ code, description, strand, subStrand });
      }}
    >
      <div className="curriculum-form-grid">
        <label>
          <span>Code</span>
          <input
            disabled={locked}
            onChange={(event) => setCode(event.target.value)}
            placeholder="B7.1.1.1"
            required
            value={code}
          />
          {/* The code is what an inspector asks about and what lessons point
              at, so once a lesson covers it, it stops being editable. */}
          {locked ? (
            <small>
              Mapped by {standard?.lessonCount}{" "}
              {standard?.lessonCount === 1 ? "lesson" : "lessons"}, so the code
              is fixed. Retire it and add a replacement if the curriculum
              changed.
            </small>
          ) : null}
        </label>
        <label>
          <span>Strand</span>
          <input
            onChange={(event) => setStrand(event.target.value)}
            placeholder="Systems"
            value={strand}
          />
        </label>
        <label>
          <span>Sub-strand</span>
          <input
            onChange={(event) => setSubStrand(event.target.value)}
            placeholder="Human body systems"
            value={subStrand}
          />
        </label>
      </div>
      <label>
        <span>What a learner should be able to do</span>
        <textarea
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Describe the structures and functions of the digestive system."
          required
          rows={3}
          value={description}
        />
      </label>
      <div className="curriculum-form-actions">
        <button className="ghost-button" onClick={onCancel} type="button">
          Cancel
        </button>
        <button disabled={busy} type="submit">
          {busy ? "Saving…" : standard ? "Save changes" : "Add standard"}
        </button>
      </div>
    </form>
  );
}
