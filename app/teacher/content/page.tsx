"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  TeacherContentWorkspace,
} from "../../../db/content-repository";
import type { MediaKind } from "../../../domain/content/types";
import { demoContentWorkspace } from "../../demo-data";
import { demoSubjectBySlug } from "../../../domain/demo/greenfield";
import { previewMediaUrl, rememberPreviewMedia } from "../../preview-workspace";
import "../../admin/academic/academic.css";
import "./content-studio.css";

const navigation = [
  { href: "/teacher", label: "Today", symbol: "⌂" },
  { href: "/teacher/subjects", label: "Lessons", symbol: "▦" },
  { href: "/teacher/content", label: "Content studio", symbol: "◫" },
  { href: "/teacher/assessments", label: "Assessments", symbol: "✓" },
  { href: "/teacher/gradebook", label: "Gradebook", symbol: "↗" },
];

/* The same subject and the same library the lesson author attaches from. */
const previewWorkspace: TeacherContentWorkspace = demoContentWorkspace(
  demoSubjectBySlug("integrated-science")!,
);

export default function TeacherContentPage() {
  const [workspace, setWorkspace] = useState(previewWorkspace);
  const [actor, setActor] = useState("Grace Mensah");
  const [mode, setMode] = useState<"loading" | "protected" | "preview">(
    "loading",
  );
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void load();

    async function load() {
      try {
        const response = await fetch("/api/teacher/content");
        if (!response.ok) throw new Error("Content records unavailable.");
        const payload = (await response.json()) as {
          actor: string;
          workspace: TeacherContentWorkspace;
        };
        if (!active) return;
        setActor(payload.actor);
        setWorkspace(payload.workspace);
        setMode("protected");
      } catch {
        if (active) setMode("preview");
      }
    }
    return () => {
      active = false;
    };
  }, []);

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
    if (mode !== "protected") {
      const asset = {
        contentType: input.file.type,
        createdAt: new Date().toISOString(),
        id: `preview-${Date.now()}`,
        kind: input.kind,
        offeringId: workspace.offeringId,
        originalFilename: input.file.name,
        sizeBytes: input.file.size,
        status:
          input.kind === "h5p-package"
            ? ("awaiting-runtime" as const)
            : ("ready" as const),
      };
      /* Hold the actual file for this tab. Without it a preview upload is just
         a row in a list: the teacher cannot check their video, and a lesson
         that attaches it has nothing to play. */
      rememberPreviewMedia(asset.id, input.file);
      setWorkspace((current) => ({
        ...current,
        mediaAssets: [asset, ...current.mediaAssets],
        totalBytes: current.totalBytes + input.file.size,
      }));
      setNotice(
        `${input.file.name} is available in this preview session. Sign in against a school database to store it permanently.`,
      );
      setBusy(false);
      return;
    }
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
    if (mode !== "protected") {
      setWorkspace((current) => ({
        ...current,
        activities: [
          {
            contentType: input.contentType,
            fallbackText: input.fallbackText,
            id: `preview-activity-${Date.now()}`,
            launchOrigin: input.launchUrl
              ? new URL(input.launchUrl).origin
              : undefined,
            launchUrl: input.launchUrl || undefined,
            offeringId: current.offeringId,
            packageAssetId: input.packageAssetId || undefined,
            provider: "h5p",
            status: input.launchUrl
              ? "launchable"
              : input.packageAssetId
                ? "awaiting-runtime"
                : "draft",
            title: input.title,
          },
          ...current.activities,
        ],
      }));
      setNotice("Interactive activity draft created.");
      setBusy(false);
      return;
    }
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
    if (mode !== "protected") {
      setWorkspace((current) => ({
        ...current,
        activities: current.activities.map((activity) =>
          activity.id === activityId
            ? {
                ...activity,
                runtimeContentId: `preview-${activity.id}`,
                runtimeImportedAt: new Date().toISOString(),
                status: "launchable" as const,
              }
            : activity,
        ),
      }));
      setNotice(
        "Imported activity prepared for lesson authors.",
      );
      setBusy(false);
      return;
    }
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
    <div className="admin-shell content-shell">
      <aside className="admin-sidebar content-sidebar">
        <Link className="brand" href="/teacher">
          <span className="brand-mark">LH</span>
          <span><strong>Learners</strong><small>Hub</small></span>
        </Link>
        <div className="content-identity">
          <span>{initials(actor)}</span>
          <div><strong>{actor}</strong><small>Subject content author</small></div>
        </div>
        <nav className="desktop-nav">
          <p className="nav-label">Teaching</p>
          {navigation.map((item) => (
            <Link className={item.href === "/teacher/content" ? "nav-link active" : "nav-link"} href={item.href} key={item.label}>
              <span>{item.symbol}</span>{item.label}
            </Link>
          ))}
        </nav>
        <div className="content-security-card">
          <span>Private school storage</span>
          <strong>Tenant + subject protected</strong>
          <small>Files are streamed through authenticated Learners Hub routes.</small>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar content-topbar">
          <div className="admin-mobile-brand"><span className="brand-mark">LH</span><strong>Content studio</strong></div>
          <nav aria-label="Breadcrumb"><Link href="/teacher/subjects">My subjects</Link><span>/</span><strong>Content studio</strong></nav>
          <div className="admin-top-actions">
            <span className={`content-mode ${mode}`}><i />{mode === "protected" ? "Private storage connected" : mode === "loading" ? "Connecting storage" : "Preview library"}</span>
            <span className="avatar">{initials(actor)}</span>
          </div>
        </header>

        <div className="admin-content content-content">
          <section className="content-hero">
            <div>
              <p className="eyebrow">Media and interactive learning</p>
              <h1>Content studio</h1>
              <p>Create one secure library for {workspace.subjectName}, then reuse its files and interactive activities across lessons.</p>
              <div><span>{workspace.className}</span><span>25 MB upload limit</span><span>Mobile-ready contracts</span></div>
            </div>
            <Link href="/teacher/subjects">Use content in a lesson →</Link>
          </section>

          <section className="content-metrics">
            <article><span>◫</span><p><small>Private assets</small><strong>{workspace.mediaAssets.length}</strong></p></article>
            <article><span>✦</span><p><small>Interactive activities</small><strong>{workspace.activities.length}</strong></p></article>
            <article><span>▶</span><p><small>Launchable now</small><strong>{launchableCount}</strong></p></article>
            <article><span>↓</span><p><small>Storage used</small><strong>{formatBytes(workspace.totalBytes)}</strong></p></article>
          </section>

          {notice ? <button className="content-notice" onClick={() => setNotice("")} type="button">{notice}<span>×</span></button> : null}

          <div className="content-authoring-grid">
            <MediaUploadForm busy={busy} onUpload={uploadMedia} />
            <H5pActivityForm
              busy={busy}
              onCreate={createActivity}
              packages={packageAssets}
            />
          </div>

          <div className="content-library-grid">
            <section className="content-panel">
              <PanelHeading eyebrow="R2-backed subject files" title="Media library" count={workspace.mediaAssets.length} />
              {workspace.mediaAssets.length ? (
                <div className="media-list">
                  {workspace.mediaAssets.map((asset) => (
                    <MediaRow asset={asset} key={asset.id} />
                  ))}
                </div>
              ) : <EmptyState title="No media uploaded yet" copy="Add a low-data lesson file or import an existing interactive activity above." />}
            </section>

            <section className="content-panel">
              <PanelHeading eyebrow="Built-in interactive learning" title="Interactive activities" count={workspace.activities.length} />
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
              ) : <EmptyState title="No interactive activities yet" copy="Create the first activity for this subject above." />}
            </section>
          </div>
        </div>
      </main>

      <nav className="admin-mobile-nav" aria-label="Mobile teacher navigation">
        {navigation.slice(0, 5).map((item) => (
          <Link className={item.href === "/teacher/content" ? "active" : ""} href={item.href} key={item.label}><span>{item.symbol}</span><small>{item.label}</small></Link>
        ))}
      </nav>
    </div>
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
  /* Preview uploads live in the tab, everything else streams through the
     authenticated media route. */
  const source =
    previewMediaUrl(asset.id) ??
    `/api/content/media?assetId=${encodeURIComponent(asset.id)}`;
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
        <label className="file-picker"><span>Choose file</span><input accept={acceptFor(kind)} onChange={(event) => setFile(event.target.files?.[0])} required type="file" /><small>{file ? `${file.name} · ${formatBytes(file.size)}` : "Validated by file type, extension, and size"}</small></label>
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

function PanelHeading({ count, eyebrow, title }: { count: number; eyebrow: string; title: string }) {
  return <header className="content-panel-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><span>{count}</span></header>;
}

function EmptyState({ copy, title }: { copy: string; title: string }) {
  return <div className="content-empty"><span>+</span><strong>{title}</strong><p>{copy}</p></div>;
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

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
