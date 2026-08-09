"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  TeacherContentWorkspace,
} from "../../../db/content-repository";
import type { MediaKind } from "../../../domain/content/types";
import { useOfferingParam } from "../../components/offering-param";
import "../../admin/academic/academic.css";
import "./content-studio.css";

/* ==========================================================================
   No preview library

   This screen opened on demoContentWorkspace() — the Integrated Science
   library from the shared demo dataset — and kept it whenever
   /api/teacher/content failed. Uploading in that state wrote the file into a
   Map in preview-workspace.ts, added a row, and said the video was "available
   in this preview session"; registering an interactive activity added a row
   that existed nowhere. A teacher could fill a library that did not exist.
   ========================================================================== */

async function fetchWorkspace(
  offeringId?: string,
): Promise<{ error: string } | { workspace: TeacherContentWorkspace }> {
  try {
    /* Omitted on first load, when the server picks the teacher's first
       subject and tells us which that was. */
    const response = await fetch(
      `/api/teacher/content${
        offeringId ? `?offeringId=${encodeURIComponent(offeringId)}` : ""
      }`,
    );
    const payload = (await response.json()) as {
      error?: string;
      workspace?: TeacherContentWorkspace;
    };
    if (!response.ok || !payload.workspace) {
      return {
        error: payload.error ?? "The subject library could not be loaded.",
      };
    }
    return { workspace: payload.workspace };
  } catch {
    return { error: "The subject library could not be reached." };
  }
}

export function ContentStudioView() {
  const [workspace, setWorkspace] = useState<TeacherContentWorkspace | null>(
    null,
  );
  const [state, setState] = useState<"error" | "loading" | "ready">("loading");
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  /* The subject comes from the address bar, so it survives navigating away
     and back and matches whatever the lesson library was showing. Switching
     is a reload rather than a filter: the media and the activities both
     belong to the offering, and neither is on the page. */
  const { offeringId, setOfferingId } = useOfferingParam();
  /* Bumped by Try again, which needs to re-run a load the URL would not
     change on its own. */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadOnce() {
      const result = await fetchWorkspace(offeringId);
      if (!active) return;
      if ("error" in result) {
        setProblem(result.error);
        setState("error");
        return;
      }
      setWorkspace(result.workspace);
      /* A notice about an upload belonged to the subject being left. */
      setNotice("");
      setState("ready");
    }

    void loadOnce();
    return () => {
      active = false;
    };
  }, [offeringId, reloadKey]);

  /* Both put the screen into its loading state from an event handler, where
     the spinner should appear the moment the control is pressed. */
  function selectOffering(next: string) {
    /* Nothing to wait for if it is already the subject on screen — and
       setting the loading state without a URL change would leave the
       spinner up with no effect due to run. */
    if (next === offeringId) return;
    setState("loading");
    setOfferingId(next);
  }

  function retry() {
    setState("loading");
    setReloadKey((current) => current + 1);
  }

  if (state === "loading") {
    return <p className="workspace-loading">Loading the subject library…</p>;
  }

  if (state === "error" || !workspace) {
    return (
      <div className="workspace-failure">
        <h2>The subject library could not be loaded.</h2>
        <p>{problem}</p>
        <button onClick={retry} type="button">
          Try again
        </button>
      </div>
    );
  }

  return (
    <LoadedContentStudio
      busy={busy}
      notice={notice}
      selectOffering={selectOffering}
      setBusy={setBusy}
      setNotice={setNotice}
      setWorkspace={setWorkspace}
      workspace={workspace}
    />
  );
}

/* Split from the loader so every line below can take a library that is
   present, instead of testing for null throughout. */
function LoadedContentStudio({
  busy,
  notice,
  selectOffering,
  setBusy,
  setNotice,
  setWorkspace,
  workspace,
}: {
  busy: boolean;
  notice: string;
  selectOffering: (offeringId: string) => void;
  setBusy: (value: boolean) => void;
  setNotice: (value: string) => void;
  setWorkspace: (value: TeacherContentWorkspace) => void;
  workspace: TeacherContentWorkspace;
}) {
  /* Which composer is open, if either. One at a time: both forms standing
     open at once is what made this screen feel like a form to fill in rather
     than a library to look through. */
  const [composer, setComposer] = useState<"activity" | "media" | null>(null);

  const packageAssets = useMemo(
    () =>
      workspace.mediaAssets.filter(
        (asset) => asset.kind === "h5p-package",
      ),
    [workspace.mediaAssets],
  );

  async function uploadMedia(input: {
    file: File;
    kind: MediaKind;
  }) {
    setBusy(true);
    setNotice("");
    try {
      const form = new FormData();
      form.set("file", input.file);
      form.set("kind", input.kind);
      form.set("offeringId", workspace.offeringId);
      const response = await fetch("/api/teacher/content", {
        body: form,
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        workspace?: TeacherContentWorkspace;
      };
      if (!response.ok || !payload.workspace) {
        throw new Error(payload.error ?? "The upload could not be saved.");
      }
      setWorkspace(payload.workspace);
      setComposer(null);
      setNotice(`${input.file.name} is secured in the subject library.`);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The upload failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createActivity(input: H5pFormInput) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/teacher/content", {
        body: JSON.stringify({
          action: "create-h5p",
          ...input,
          offeringId: workspace.offeringId,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        workspace?: TeacherContentWorkspace;
      };
      if (!response.ok || !payload.workspace) {
        throw new Error(
          payload.error ?? "The H5P activity could not be registered.",
        );
      }
      setWorkspace(payload.workspace);
      setComposer(null);
      setNotice(
        input.launchUrl || input.packageAssetId
          ? `${input.title} is now available to lesson authors.`
          : `${input.title} is ready to continue in the interactive editor.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The H5P activity could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function activateActivity(activityId: string) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/teacher/content", {
        body: JSON.stringify({
          action: "activate-h5p",
          activityId,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        workspace?: TeacherContentWorkspace;
      };
      if (!response.ok || !payload.workspace) {
        throw new Error(
          payload.error ?? "The interactive activity could not be prepared.",
        );
      }
      setWorkspace(payload.workspace);
      setNotice("Interactive activity is ready for learner lessons.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The interactive activity could not be prepared.",
      );
    } finally {
      setBusy(false);
    }
  }

  const launchableCount = workspace.activities.filter(
    (activity) => activity.status === "launchable",
  ).length;

  return (
    <>


        <div className="admin-content content-content">
          {/* What stood here was a 190px gradient panel — "Media and
              interactive learning", "Content studio", a sentence explaining
              that a library lets you reuse files, and three pills — above four
              metric cards, above two open upload forms, above the library
              itself. Six surfaces before the first file. The library is the
              screen; everything else was preamble. */}
          <header className="screen-context">
            <div className="screen-identity">
              {/* The library resolved one offering with ORDER BY s.name
                  LIMIT 1, so a teacher of several subjects could upload to
                  whichever sorted first and reach no other. */}
              {workspace.offerings.length > 1 ? (
                <label className="screen-subject-switch">
                  <span className="sr-only">Subject</span>
                  <select
                    onChange={(event) => selectOffering(event.target.value)}
                    value={workspace.offeringId}
                  >
                    {workspace.offerings.map((offering) => (
                      <option key={offering.id} value={offering.id}>
                        {offering.subjectName} · {offering.className}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <h2>{workspace.subjectName}</h2>
              )}
              <p>{workspace.className}</p>
            </div>
            <Link className="content-lesson-link" href="/teacher/subjects">
              Use in a lesson →
            </Link>
          </header>

          {/* The four cards these replace repeated two numbers the panel
              headings below already carry. A line of facts states them once. */}
          <p className="screen-facts">
            <span>
              <b>{workspace.mediaAssets.length}</b> files
            </span>
            <span>
              <b>{workspace.activities.length}</b> activities
            </span>
            <span>{launchableCount} launchable now</span>
            <span>{formatBytes(workspace.totalBytes)} of 25 MB used</span>
          </p>

          {notice ? <button className="content-notice" onClick={() => setNotice("")} type="button">{notice}<span>×</span></button> : null}

          <div className="content-library-grid">
            <section className="content-panel">
              {/* The upload form used to sit open above the library whether or
                  not anyone wanted it. It opens from here now, in the panel it
                  fills, which is also what makes the + in the empty state below
                  mean something — it was decoration. */}
              <PanelHeading
                count={workspace.mediaAssets.length}
                onAdd={() => setComposer(composer === "media" ? null : "media")}
                open={composer === "media"}
                title="Media library"
              />
              {composer === "media" ? (
                <MediaUploadForm busy={busy} onUpload={uploadMedia} />
              ) : null}
              {workspace.mediaAssets.length ? (
                <div className="media-list">
                  {workspace.mediaAssets.map((asset) => (
                    <MediaRow asset={asset} key={asset.id} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  copy="Add a video, document or image and it becomes available to every lesson in this subject."
                  onAdd={() => setComposer("media")}
                  title="No media uploaded yet"
                />
              )}
            </section>

            <section className="content-panel">
              <PanelHeading
                count={workspace.activities.length}
                onAdd={() =>
                  setComposer(composer === "activity" ? null : "activity")
                }
                open={composer === "activity"}
                title="Interactive activities"
              />
              {composer === "activity" ? (
                <H5pActivityForm
                  busy={busy}
                  onCreate={createActivity}
                  packages={packageAssets}
                />
              ) : null}
              {workspace.activities.length ? (
                <div className="activity-list">
                  {workspace.activities.map((activity) => (
                    <article key={activity.id}>
                      <span>IA</span>
                      <div><small>{activity.contentType}</small><strong>{activity.title}</strong><p>{activity.fallbackText}</p></div>
                      <footer>
                        <em className={`activity-status ${activity.status}`}>{humanise(activity.status)}</em>
                        {activity.launchUrl ? (
                          <a href={activity.launchUrl} rel="noreferrer" target="_blank">Test launch ↗</a>
                        ) : activity.runtimeContentId ? (
                          <span>Ready for lessons</span>
                        ) : activity.status === "draft" ? (
                          <span>Planning draft · editor not connected</span>
                        ) : (
                          <button
                            disabled={busy}
                            onClick={() => void activateActivity(activity.id)}
                            type="button"
                          >
                            Prepare activity →
                          </button>
                        )}
                      </footer>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  copy="Build a quiz, drag-and-drop or interactive video, or import an existing .h5p package."
                  onAdd={() => setComposer("activity")}
                  title="No interactive activities yet"
                />
              )}
            </section>
          </div>
        </div>

    </>
  );
}

/**
 * One row of the media library.
 *
 * A video row can be expanded into a player. Checking an upload used to mean
 * following a download link out of the workspace and trusting that whatever
 * opened is what learners will see; now the teacher watches the same stream
 * the lesson serves, in place.
 */
function MediaRow({
  asset,
}: {
  asset: TeacherContentWorkspace["mediaAssets"][number];
}) {
  const [open, setOpen] = useState(false);
  /* Every asset on this screen is a stored one now, so all of them stream
     through the authenticated media route. */
  const source = `/api/content/media?assetId=${encodeURIComponent(asset.id)}`;
  const playable = asset.kind === "video" || asset.kind === "audio";

  return (
    <article className={open ? "media-row-open" : undefined}>
      <span className={`media-kind kind-${asset.kind}`}>{kindSymbol(asset.kind)}</span>
      <div><strong>{asset.originalFilename}</strong><small>{humanise(asset.kind)} · {formatBytes(asset.sizeBytes)} · {formatDate(asset.createdAt)}</small></div>
      <em className={`asset-status ${asset.status}`}>{humanise(asset.status)}</em>
      {playable && asset.status === "ready" ? (
        <button
          aria-expanded={open}
          className="media-preview-toggle"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          {open ? "Hide" : "Preview"}
        </button>
      ) : (
        <a href={source}>{asset.kind === "h5p-package" ? "Package" : "Open"}</a>
      )}
      {open ? (
        <div className="media-preview">
          {asset.kind === "video" ? (
            <video controls playsInline preload="metadata" src={source}>
              Your browser cannot play this file.
            </video>
          ) : (
            <audio controls preload="metadata" src={source}>
              Your browser cannot play this file.
            </audio>
          )}
        </div>
      ) : null}
    </article>
  );
}

function MediaUploadForm({
  busy,
  onUpload,
}: {
  busy: boolean;
  onUpload: (input: { file: File; kind: MediaKind }) => Promise<void>;
}) {
  const [kind, setKind] = useState<MediaKind>("document");
  const [file, setFile] = useState<File>();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (file) void onUpload({ file, kind });
  }
  return (
    <section className="content-form-card">
      <div className="content-form-heading"><span>↑</span><div><p className="eyebrow">Secure upload</p><h2>Add lesson media</h2></div></div>
      <form onSubmit={submit}>
        <label><span>Content kind</span><select value={kind} onChange={(event) => setKind(event.target.value as MediaKind)}>{(["document", "image", "audio", "video", "h5p-package"] as MediaKind[]).map((item) => <option key={item} value={item}>{humanise(item)}</option>)}</select></label>
        {/* The browser's own file control was sitting inside a bordered box —
            a grey "Choose File" chip and "No file chosen" in the user agent's
            font, next to inputs styled by this sheet. The input is still the
            input; it is visually hidden and the label is the control, so the
            chosen file reads in the same type as everything around it. */}
        <div className="file-picker">
          <span className="file-picker-label">Choose file</span>
          <label className="file-picker-control">
            <input
              accept={acceptFor(kind)}
              onChange={(event) => setFile(event.target.files?.[0])}
              required
              type="file"
            />
            <span className="file-picker-action">Browse…</span>
            <span className="file-picker-name">
              {file ? `${file.name} · ${formatBytes(file.size)}` : "No file chosen"}
            </span>
          </label>
          <small>Validated by file type, extension, and size</small>
        </div>
        <button disabled={busy || !file} type="submit">{busy ? "Securing file…" : "Upload to private library"}<span>→</span></button>
      </form>
      <p><span>i</span>Files use opaque storage keys. Original names are shown only as safe display metadata.</p>
    </section>
  );
}

type H5pFormInput = {
  contentType: string;
  fallbackText: string;
  launchUrl?: string;
  packageAssetId?: string;
  title: string;
};

function H5pActivityForm({
  busy,
  onCreate,
  packages,
}: {
  busy: boolean;
  onCreate: (input: H5pFormInput) => Promise<void>;
  packages: TeacherContentWorkspace["mediaAssets"];
}) {
  const [source, setSource] = useState<"authoring" | "embed" | "package">(
    "authoring",
  );
  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState("Interactive Video");
  const [launchUrl, setLaunchUrl] = useState("");
  const [packageAssetId, setPackageAssetId] = useState("");
  const [fallbackText, setFallbackText] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onCreate({
      contentType,
      fallbackText,
      launchUrl: source === "embed" ? launchUrl : undefined,
      packageAssetId: source === "package" ? packageAssetId : undefined,
      title,
    });
  }
  return (
    <section className="content-form-card">
      <div className="content-form-heading"><span>✦</span><div><p className="eyebrow">Interactive learning</p><h2>Create interactive activity</h2></div></div>
      <form onSubmit={submit}>
        <div className="source-toggle">
          {(["authoring", "embed", "package"] as const).map((item) => (
            <button
              className={source === item ? "active" : ""}
              key={item}
              onClick={() => setSource(item)}
              type="button"
            >
              {item === "authoring"
                ? "Plan activity"
                : item === "embed"
                  ? "Advanced embed"
                  : "Import activity"}
            </button>
          ))}
        </div>
        <div className="h5p-field-row">
          <label><span>Activity title</span><input onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
          <label>
            <span>Activity type</span>
            <select onChange={(event) => setContentType(event.target.value)} value={contentType}>
              <option>Interactive Video</option>
              <option>Drag and Drop</option>
              <option>Course Presentation</option>
              <option>Branching Scenario</option>
              <option>Memory Game</option>
            </select>
          </label>
        </div>
        {source === "embed" ? (
          <label><span>Advanced activity link</span><input onChange={(event) => setLaunchUrl(event.target.value)} placeholder="https://…/content/…/embed" required type="url" value={launchUrl} /></label>
        ) : source === "package" ? (
          <label><span>Imported activity file</span><select onChange={(event) => setPackageAssetId(event.target.value)} required value={packageAssetId}><option value="">Choose an uploaded activity</option>{packages.map((asset) => <option key={asset.id} value={asset.id}>{asset.originalFilename}</option>)}</select></label>
        ) : null}
        <label><span>Accessible fallback</span><textarea onChange={(event) => setFallbackText(event.target.value)} placeholder="Describe the equivalent transcript, reading, or activity." required value={fallbackText} /></label>
        <button disabled={busy} type="submit">
          {source === "authoring"
            ? "Save planning draft"
            : source === "embed"
              ? "Add advanced activity"
              : "Import activity"}
          <span>→</span>
        </button>
      </form>
      <p><span>i</span>Planning drafts record the intended activity. To make an activity playable now, import an existing H5P file or use an advanced activity link.</p>
    </section>
  );
}

/* The eyebrow above each of these — "R2-backed subject files", "Built-in
   interactive learning" — named the storage bucket and the vendor rather than
   anything a teacher needs, so the heading stands on its own now. */
function PanelHeading({
  count,
  onAdd,
  open,
  title,
}: {
  count: number;
  onAdd: () => void;
  open: boolean;
  title: string;
}) {
  return (
    <header className="content-panel-heading">
      <h2>
        {title} <span className="content-panel-count">{count}</span>
      </h2>
      <button
        aria-expanded={open}
        className="content-panel-add"
        onClick={onAdd}
        type="button"
      >
        {open ? "Cancel" : "+ Add"}
      </button>
    </header>
  );
}

/* The + here was a <span>. It looked exactly like a button, sat in the middle
   of an empty panel where the only sensible action is to add something, and
   did nothing at all when clicked — on both panels. It is the button it always
   appeared to be, and it opens the same composer the panel heading does. */
function EmptyState({
  copy,
  onAdd,
  title,
}: {
  copy: string;
  onAdd: () => void;
  title: string;
}) {
  return (
    <div className="content-empty">
      <button className="content-empty-add" onClick={onAdd} type="button">
        <span aria-hidden="true">+</span>
        <span className="sr-only">{title} — add the first one</span>
      </button>
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}

function acceptFor(kind: MediaKind) {
  const accepts: Record<MediaKind, string> = {
    audio: ".mp3,.m4a,.ogg,.wav",
    document: ".pdf,.docx,.pptx,.xlsx,.txt",
    "h5p-package": ".h5p",
    image: ".jpg,.jpeg,.png,.webp,.gif",
    video: ".mp4,.webm,.mov",
  };
  return accepts[kind];
}

function kindSymbol(kind: MediaKind) {
  const symbols: Record<MediaKind, string> = {
    audio: "♫",
    document: "▤",
    "h5p-package": "H5P",
    image: "▧",
    video: "▶",
  };
  return symbols[kind];
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(value));
}

function humanise(value: string) {
  if (value === "h5p-package") return "Interactive package";
  if (value === "awaiting-runtime") return "Preparing";
  return value.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

