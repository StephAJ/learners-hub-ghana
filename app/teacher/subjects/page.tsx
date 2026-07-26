"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  LessonSummary,
  TeacherLessonWorkspace,
} from "../../../db/learning-repository";
import type { TeacherContentWorkspace } from "../../../db/content-repository";
import type { LessonBlockType } from "../../../domain/learning/types";
import "../../admin/academic/academic.css";
import "./teacher-subjects.css";

const navigation = [
  { href: "/teacher", label: "Today", symbol: "⌂" },
  { href: "/teacher/subjects", label: "My subjects", symbol: "▦" },
  { href: "/teacher/content", label: "Content studio", symbol: "◫" },
  { href: "#lessons", label: "Lessons", symbol: "≡" },
  { href: "/teacher/assessments", label: "Assessments", symbol: "✓" },
  { href: "/teacher/gradebook", label: "Markbook", symbol: "↗" },
  { href: "#classes", label: "Class groups", symbol: "◎" },
];

const previewWorkspace: TeacherLessonWorkspace = {
  className: "JHS 2 Gold",
  code: "IS",
  coveragePercent: 50,
  offeringId: "offering-science-jhs2",
  standards: [
    {
      code: "JHS2.IS.HBS.1",
      description:
        "Describe the structures and functions of major human body systems.",
      id: "standard-human-systems-1",
      position: 1,
      strand: "Systems",
      subStrand: "Human body systems",
    },
    {
      code: "JHS2.IS.HBS.2",
      description: "Explain how body systems work together to sustain life.",
      id: "standard-human-systems-2",
      position: 2,
      strand: "Systems",
      subStrand: "Human body systems",
    },
    {
      code: "JHS2.IS.NUT.1",
      description:
        "Classify common foods and apply the principles of a balanced diet.",
      id: "standard-nutrition-1",
      position: 3,
      strand: "Diversity of matter",
      subStrand: "Food and nutrition",
    },
  ],
  subjectName: "Integrated Science",
  units: [
    { id: "unit-human-systems", lessonCount: 1, title: "Human body systems" },
    { id: "unit-food-nutrition", lessonCount: 1, title: "Food and nutrition" },
  ],
  lessons: [
    {
      blockCount: 4,
      id: "lesson-digestive-system",
      objectiveCount: 2,
      releaseMode: "immediate",
      standardCodes: ["JHS2.IS.HBS.1", "JHS2.IS.HBS.2"],
      status: "published",
      title: "The human digestive system",
      unitId: "unit-human-systems",
      unitTitle: "Human body systems",
      updatedAt: "2026-07-21T09:00:00Z",
      version: 1,
    },
    {
      blockCount: 3,
      id: "lesson-respiratory-system",
      objectiveCount: 2,
      prerequisiteTitle: "The human digestive system",
      releaseMode: "prerequisite",
      standardCodes: ["JHS2.IS.HBS.2"],
      status: "published",
      title: "How breathing powers the body",
      unitId: "unit-human-systems",
      unitTitle: "Human body systems",
      updatedAt: "2026-07-23T11:00:00Z",
      version: 1,
    },
    {
      blockCount: 1,
      id: "lesson-balanced-diet",
      objectiveCount: 1,
      releaseMode: "immediate",
      standardCodes: ["JHS2.IS.NUT.1"],
      status: "draft",
      title: "Building a balanced Ghanaian meal",
      unitId: "unit-food-nutrition",
      unitTitle: "Food and nutrition",
      updatedAt: "2026-07-22T14:30:00Z",
      version: 0,
    },
  ],
};

const previewContentWorkspace: TeacherContentWorkspace = {
  activities: [
    {
      contentType: "Interactive Video",
      fallbackText: "Guided interactive with a text alternative.",
      id: "preview-h5p-digestion",
      launchOrigin: "https://documentation.h5p.com",
      launchUrl:
        "https://documentation.h5p.com/content/1291910063569938878/embed",
      offeringId: "offering-science-jhs2",
      provider: "h5p",
      status: "launchable",
      title: "Interactive demonstration",
    },
  ],
  className: "JHS 2 Gold",
  mediaAssets: [
    {
      contentType: "application/pdf",
      createdAt: "2026-07-24T08:30:00Z",
      id: "preview-study-sheet",
      kind: "document",
      offeringId: "offering-science-jhs2",
      originalFilename: "digestive-system-study-sheet.pdf",
      sizeBytes: 430_080,
      status: "ready",
    },
    {
      contentType: "video/mp4",
      createdAt: "2026-07-24T08:10:00Z",
      id: "preview-gas-exchange",
      kind: "video",
      offeringId: "offering-science-jhs2",
      originalFilename: "gas-exchange-low-data.mp4",
      sizeBytes: 5_347_328,
      status: "ready",
    },
  ],
  offeringId: "offering-science-jhs2",
  subjectName: "Integrated Science",
  totalBytes: 5_777_408,
};

export default function TeacherSubjectsPage() {
  const [workspace, setWorkspace] = useState(previewWorkspace);
  const [contentWorkspace, setContentWorkspace] = useState(
    previewContentWorkspace,
  );
  const [selectedLessonId, setSelectedLessonId] = useState(
    previewWorkspace.lessons[0].id,
  );
  const [selectedUnitId, setSelectedUnitId] = useState("all");
  const [actor, setActor] = useState("Grace Mensah");
  const [dataMode, setDataMode] = useState<"loading" | "protected" | "preview">(
    "loading",
  );
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function loadWorkspace() {
      try {
        const response = await fetch("/api/teacher/lessons");
        if (!response.ok) throw new Error("Teacher records unavailable.");
        const payload = (await response.json()) as {
          actor: string;
          workspace: TeacherLessonWorkspace;
        };
        if (!active) return;
        setActor(payload.actor);
        setWorkspace(payload.workspace);
        setSelectedLessonId((current) =>
          payload.workspace.lessons.some((lesson) => lesson.id === current)
            ? current
            : payload.workspace.lessons[0]?.id ?? "",
        );
        setDataMode("protected");
        const contentResponse = await fetch("/api/teacher/content");
        if (contentResponse.ok) {
          const contentPayload = (await contentResponse.json()) as {
            workspace: TeacherContentWorkspace;
          };
          if (active) setContentWorkspace(contentPayload.workspace);
        }
      } catch {
        if (active) setDataMode("preview");
      }
    }
    void loadWorkspace();
    return () => {
      active = false;
    };
  }, []);

  const visibleLessons = useMemo(
    () =>
      selectedUnitId === "all"
        ? workspace.lessons
        : workspace.lessons.filter(
            (lesson) => lesson.unitId === selectedUnitId,
          ),
    [selectedUnitId, workspace.lessons],
  );
  const selectedLesson =
    workspace.lessons.find((lesson) => lesson.id === selectedLessonId) ??
    workspace.lessons[0];
  const publishedCount = workspace.lessons.filter(
    (lesson) => lesson.status === "published",
  ).length;
  const draftCount = workspace.lessons.filter(
    (lesson) => lesson.status === "draft",
  ).length;
  const mappedStandardCount = new Set(
    workspace.lessons.flatMap((lesson) => lesson.standardCodes),
  ).size;

  async function createDraft(input: CreateLessonFormInput) {
    if (dataMode !== "protected") {
      const previewLesson: LessonSummary = {
        blockCount: input.blocks.length,
        id: `preview-${Date.now()}`,
        objectiveCount: input.objectives.length,
        prerequisiteTitle: input.prerequisiteLessonId
          ? workspace.lessons.find(
              (lesson) => lesson.id === input.prerequisiteLessonId,
            )?.title
          : undefined,
        releaseMode: input.prerequisiteLessonId
          ? "prerequisite"
          : input.availableFrom
            ? "scheduled"
            : "immediate",
        standardCodes: workspace.standards
          .filter((standard) => input.standardIds.includes(standard.id))
          .map((standard) => standard.code),
        status: "draft",
        title: input.title,
        unitId: input.unitId,
        unitTitle:
          workspace.units.find((unit) => unit.id === input.unitId)?.title ??
          "Curriculum unit",
        updatedAt: new Date().toISOString(),
        version: 0,
      };
      setWorkspace((current) => ({
        ...current,
        lessons: [previewLesson, ...current.lessons],
      }));
      setSelectedLessonId(previewLesson.id);
      setNotice("Preview draft created. Authenticated drafts are saved permanently.");
      return;
    }

    const response = await fetch("/api/teacher/lessons", {
      body: JSON.stringify({
        action: "create",
        ...input,
        offeringId: workspace.offeringId,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as {
      error?: string;
      lesson?: LessonSummary;
    };
    if (!response.ok || !payload.lesson) {
      setNotice(payload.error ?? "The lesson draft could not be created.");
      return;
    }
    setWorkspace((current) => ({
      ...current,
      lessons: [payload.lesson as LessonSummary, ...current.lessons],
    }));
    setSelectedLessonId(payload.lesson.id);
    setNotice(`${payload.lesson.title} was saved as a private draft.`);
  }

  async function publishSelectedLesson() {
    if (!selectedLesson || selectedLesson.status !== "draft") return;
    if (dataMode !== "protected") {
      setWorkspace((current) => ({
        ...current,
        lessons: current.lessons.map((lesson) =>
          lesson.id === selectedLesson.id
            ? { ...lesson, status: "published", version: 1 }
            : lesson,
        ),
      }));
      setNotice("Preview lesson published locally for this session.");
      return;
    }

    const response = await fetch("/api/teacher/lessons", {
      body: JSON.stringify({
        action: "publish",
        lessonId: selectedLesson.id,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as {
      error?: string;
      lesson?: LessonSummary;
    };
    if (!response.ok || !payload.lesson) {
      setNotice(payload.error ?? "The lesson could not be published.");
      return;
    }
    setWorkspace((current) => ({
      ...current,
      lessons: current.lessons.map((lesson) =>
        lesson.id === payload.lesson?.id
          ? (payload.lesson as LessonSummary)
          : lesson,
      ),
    }));
    setNotice(`${payload.lesson.title} is now available to learners.`);
  }

  async function duplicateSelectedLesson() {
    if (!selectedLesson) return;
    if (dataMode !== "protected") {
      const duplicate: LessonSummary = {
        ...selectedLesson,
        id: `preview-copy-${Date.now()}`,
        releaseMode: "immediate",
        status: "draft",
        title: `${selectedLesson.title} — copy`,
        version: 0,
      };
      setWorkspace((current) => ({
        ...current,
        lessons: [duplicate, ...current.lessons],
      }));
      setSelectedLessonId(duplicate.id);
      setNotice("A reusable private copy was added to the lesson library.");
      return;
    }

    const response = await fetch("/api/teacher/lessons", {
      body: JSON.stringify({
        action: "duplicate",
        lessonId: selectedLesson.id,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as {
      error?: string;
      lesson?: LessonSummary;
    };
    if (!response.ok || !payload.lesson) {
      setNotice(payload.error ?? "The lesson could not be duplicated.");
      return;
    }
    setWorkspace((current) => ({
      ...current,
      lessons: [payload.lesson as LessonSummary, ...current.lessons],
    }));
    setSelectedLessonId(payload.lesson.id);
    setNotice(`${payload.lesson.title} is ready to adapt as a private draft.`);
  }

  return (
    <div className="admin-shell teacher-shell">
      <aside className="admin-sidebar teacher-sidebar" aria-label="Teacher workspace">
        <Link className="brand" href="/teacher" aria-label="Teacher home">
          <span className="brand-mark" aria-hidden="true">LH</span>
          <span><strong>Learners</strong><small>Hub</small></span>
        </Link>
        <div className="teacher-identity">
          <span aria-hidden="true">{initials(actor)}</span>
          <div><strong>{actor}</strong><small>Integrated Science teacher</small></div>
        </div>
        <nav className="desktop-nav">
          <p className="nav-label">Teaching</p>
          {navigation.map((item) => (
            <Link
              className={item.href === "/teacher/subjects" ? "nav-link active" : "nav-link"}
              href={item.href}
              key={item.label}
            >
              <span aria-hidden="true">{item.symbol}</span>{item.label}
            </Link>
          ))}
        </nav>
        <div className="teacher-term-card">
          <p>Term 1 · Week 7</p>
          <strong>{workspace.coveragePercent}% curriculum coverage</strong>
          <span><i style={{ width: `${workspace.coveragePercent}%` }} /></span>
          <small>On track for the term plan</small>
        </div>
        <Link className="admin-profile" href="/teacher">
          <span className="avatar">KA</span>
          <span><strong>Open learner view</strong><small>Preview JHS 2 Gold</small></span>
          <b aria-hidden="true">↗</b>
        </Link>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar teacher-topbar">
          <div className="admin-mobile-brand">
            <span className="brand-mark" aria-hidden="true">LH</span>
            <strong>My subjects</strong>
          </div>
          <nav aria-label="Breadcrumb">
            <Link href="/teacher/subjects">My subjects</Link>
            <span aria-hidden="true">/</span>
            <strong>{workspace.subjectName}</strong>
          </nav>
          <div className="admin-top-actions">
            <span className={`teacher-data-mode mode-${dataMode}`}>
              <i aria-hidden="true" />
              {dataMode === "protected" ? "Saving to school" : dataMode === "loading" ? "Connecting" : "Preview mode"}
            </span>
            <button
              className="learner-preview-link"
              onClick={() =>
                setNotice(
                  "Learner preview will open in a clearly labelled preview session after the draft is saved.",
                )
              }
              type="button"
            >
              Preview lesson
            </button>
            <span className="avatar">{initials(actor)}</span>
          </div>
        </header>

        <div className="admin-content teacher-content">
          <section className="subject-hero">
            <div className="subject-hero-code" aria-hidden="true">{workspace.code}</div>
            <div>
              <p className="eyebrow">Compulsory subject · 2026 / 2027</p>
              <h1>{workspace.subjectName}</h1>
              <p>{workspace.className} · 38 learners · Term 1</p>
            </div>
            <div className="subject-hero-actions">
              <button type="button">Subject settings</button>
              <a href="#new-lesson">+ New lesson</a>
            </div>
          </section>

          <section className="teacher-stats" aria-label="Subject summary">
            <article><span>≡</span><p><small>Total lessons</small><strong>{workspace.lessons.length}</strong></p></article>
            <article><span>✓</span><p><small>Published</small><strong>{publishedCount}</strong></p></article>
            <article><span>✎</span><p><small>Drafts</small><strong>{draftCount}</strong></p></article>
            <article><span>◎</span><p><small>Standards mapped</small><strong>{mappedStandardCount}/{workspace.standards.length}</strong></p></article>
          </section>

          {notice && <p className="teacher-notice" role="status">{notice}</p>}

          <div className="teacher-workspace">
            <aside className="unit-outline" aria-label="Curriculum units">
              <div><p className="eyebrow">Curriculum</p><h2>Term 1 units</h2></div>
              <button
                className={selectedUnitId === "all" ? "active" : ""}
                onClick={() => setSelectedUnitId("all")}
                type="button"
              >
                <span>All</span><strong>{workspace.lessons.length}</strong>
              </button>
              {workspace.units.map((unit, index) => (
                <button
                  className={selectedUnitId === unit.id ? "active" : ""}
                  key={unit.id}
                  onClick={() => setSelectedUnitId(unit.id)}
                  type="button"
                >
                  <i>{index + 1}</i>
                  <span>{unit.title}<small>{unit.lessonCount} lessons</small></span>
                  <strong>›</strong>
                </button>
              ))}
              <button className="add-unit" type="button">+ Add curriculum unit</button>
            </aside>

            <section className="lesson-library" id="lessons" aria-labelledby="lesson-library-title">
              <div className="lesson-library-heading">
                <div><p className="eyebrow">Lesson library</p><h2 id="lesson-library-title">{selectedUnitId === "all" ? "All lessons" : workspace.units.find((unit) => unit.id === selectedUnitId)?.title}</h2></div>
                <span>{visibleLessons.length} lessons</span>
              </div>
              <div className="lesson-list">
                {visibleLessons.map((lesson) => (
                  <button
                    className={lesson.id === selectedLesson?.id ? "selected" : ""}
                    key={lesson.id}
                    onClick={() => setSelectedLessonId(lesson.id)}
                    type="button"
                  >
                    <span className={`lesson-state state-${lesson.status}`}>{lesson.status === "published" ? "✓" : "✎"}</span>
                    <span className="lesson-list-copy">
                      <small>{lesson.unitTitle}</small>
                      <strong>{lesson.title}</strong>
                      <span>{lesson.blockCount} blocks · {lesson.objectiveCount} objectives · {lesson.standardCodes.length} standards</span>
                      <em>{releaseLabel(lesson)}</em>
                    </span>
                    <span className={`lesson-status lesson-${lesson.status}`}>{lesson.status}</span>
                    <b aria-hidden="true">›</b>
                  </button>
                ))}
              </div>

              {selectedLesson && (
                <div className="lesson-selection">
                  <div>
                    <span className={`lesson-state state-${selectedLesson.status}`}>{selectedLesson.status === "published" ? "✓" : "✎"}</span>
                    <p><small>Selected lesson</small><strong>{selectedLesson.title}</strong><span>{selectedLesson.unitTitle}</span></p>
                  </div>
                  <div>
                    <button onClick={duplicateSelectedLesson} type="button">Duplicate</button>
                    {selectedLesson.status === "draft" ? (
                      <button className="publish-button" onClick={publishSelectedLesson} type="button">Publish to class →</button>
                    ) : (
                      <button
                        onClick={() =>
                          setNotice(
                            "Learner preview will open in a clearly labelled preview session.",
                          )
                        }
                        type="button"
                      >
                        Preview lesson
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>

            <LessonDraftForm
              activities={contentWorkspace.activities}
              assets={contentWorkspace.mediaAssets}
              id="new-lesson"
              lessons={workspace.lessons}
              onCreate={createDraft}
              standards={workspace.standards}
              units={workspace.units}
            />
          </div>
        </div>
      </main>

      <nav className="admin-mobile-nav" aria-label="Mobile teacher navigation">
        {navigation.slice(0, 5).map((item) => (
          <Link className={item.href === "/teacher/subjects" ? "active" : ""} href={item.href} key={item.label}>
            <span aria-hidden="true">{item.symbol}</span><small>{item.label}</small>
          </Link>
        ))}
      </nav>
    </div>
  );
}

type CreateLessonFormInput = {
  availableFrom?: string;
  blocks: Array<{
    config?: {
      activityId?: string;
      mediaAssetId?: string;
      provider?: "h5p";
    };
    content: string;
    title: string;
    type: LessonBlockType;
  }>;
  objectives: string[];
  prerequisiteLessonId?: string;
  standardIds: string[];
  summary: string;
  title: string;
  unitId: string;
};

function LessonDraftForm({
  activities,
  assets,
  id,
  lessons,
  onCreate,
  standards,
  units,
}: {
  activities: TeacherContentWorkspace["activities"];
  assets: TeacherContentWorkspace["mediaAssets"];
  id: string;
  lessons: TeacherLessonWorkspace["lessons"];
  onCreate: (input: CreateLessonFormInput) => Promise<void>;
  standards: TeacherLessonWorkspace["standards"];
  units: TeacherLessonWorkspace["units"];
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [objectives, setObjectives] = useState("");
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [standardIds, setStandardIds] = useState<string[]>(
    standards[0] ? [standards[0].id] : [],
  );
  const [releaseMode, setReleaseMode] = useState<
    "immediate" | "scheduled" | "prerequisite"
  >("immediate");
  const [availableFrom, setAvailableFrom] = useState("");
  const [prerequisiteLessonId, setPrerequisiteLessonId] = useState("");
  const [blockType, setBlockType] = useState<LessonBlockType>("text");
  const [blockTitle, setBlockTitle] = useState("");
  const [blockContent, setBlockContent] = useState("");
  const [attachmentId, setAttachmentId] = useState("");
  const [blocks, setBlocks] = useState<
    Array<{
      config?: CreateLessonFormInput["blocks"][number]["config"];
      content: string;
      id: string;
      title: string;
      type: LessonBlockType;
    }>
  >([]);

  function addBlock() {
    if (!blockTitle.trim() || !blockContent.trim()) return;
    setBlocks((current) => [
      ...current,
      {
        config:
          blockType === "interactive" && attachmentId
            ? { activityId: attachmentId, provider: "h5p" }
            : (blockType === "video" || blockType === "resource") &&
                attachmentId
              ? { mediaAssetId: attachmentId }
              : undefined,
        content: blockContent.trim(),
        id: crypto.randomUUID(),
        title: blockTitle.trim(),
        type: blockType,
      },
    ]);
    setBlockTitle("");
    setBlockContent("");
    setAttachmentId("");
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= blocks.length) return;
    setBlocks((current) => {
      const reordered = [...current];
      [reordered[index], reordered[targetIndex]] = [
        reordered[targetIndex],
        reordered[index],
      ];
      return reordered;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocks.length === 0) return;
    await onCreate({
      availableFrom:
        releaseMode === "scheduled" ? availableFrom : undefined,
      blocks: blocks.map(({ config, content, title: blockName, type }) => ({
        config,
        content,
        title: blockName,
        type,
      })),
      objectives: objectives
        .split("\n")
        .map((objective) => objective.trim())
        .filter(Boolean),
      prerequisiteLessonId:
        releaseMode === "prerequisite"
          ? prerequisiteLessonId
          : undefined,
      standardIds,
      summary,
      title,
      unitId,
    });
  }

  return (
    <aside className="lesson-builder" id={id} aria-labelledby="lesson-builder-title">
      <div className="builder-heading"><span aria-hidden="true">+</span><div><p className="eyebrow">Authoring</p><h2 id="lesson-builder-title">New lesson draft</h2></div></div>
      <form onSubmit={submit}>
        <label><span>Curriculum unit</span><select value={unitId} onChange={(event) => setUnitId(event.target.value)}>{units.map((unit) => <option value={unit.id} key={unit.id}>{unit.title}</option>)}</select></label>
        <label><span>Lesson title</span><input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. How breathing works" /></label>
        <label><span>Short summary</span><textarea required value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="What will learners explore?" /></label>
        <label><span>Learning objectives</span><textarea required value={objectives} onChange={(event) => setObjectives(event.target.value)} placeholder={"One objective per line\nExplain how oxygen reaches body cells"} /></label>
        <fieldset className="standards-picker">
          <legend>Curriculum standards</legend>
          {standards.map((standard) => (
            <label key={standard.id}>
              <input
                checked={standardIds.includes(standard.id)}
                onChange={(event) =>
                  setStandardIds((current) =>
                    event.target.checked
                      ? [...current, standard.id]
                      : current.filter((id) => id !== standard.id),
                  )
                }
                type="checkbox"
              />
              <span><strong>{standard.code}</strong>{standard.description}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="release-picker">
          <legend>Release to learners</legend>
          <div>
            {(["immediate", "scheduled", "prerequisite"] as const).map((mode) => (
              <button
                className={releaseMode === mode ? "active" : ""}
                key={mode}
                onClick={() => setReleaseMode(mode)}
                type="button"
              >
                {mode}
              </button>
            ))}
          </div>
          {releaseMode === "scheduled" && (
            <label><span>Available from</span><input required type="datetime-local" value={availableFrom} onChange={(event) => setAvailableFrom(event.target.value)} /></label>
          )}
          {releaseMode === "prerequisite" && (
            <label><span>Unlock after</span><select required value={prerequisiteLessonId} onChange={(event) => setPrerequisiteLessonId(event.target.value)}><option value="">Choose a published lesson</option>{lessons.filter((lesson) => lesson.status === "published").map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select></label>
          )}
        </fieldset>
        <fieldset>
          <legend>Lesson activities</legend>
          <div className="block-type-picker">
            {(["text", "video", "interactive", "practice", "resource"] as LessonBlockType[]).map((type) => (
              <button className={blockType === type ? "active" : ""} key={type} onClick={() => { setBlockType(type); setAttachmentId(""); }} type="button">
                <span aria-hidden="true">{blockSymbol(type)}</span>{type}
              </button>
            ))}
          </div>
        </fieldset>
        <label><span>Block title</span><input required={blocks.length === 0} value={blockTitle} onChange={(event) => setBlockTitle(event.target.value)} placeholder="A clear section heading" /></label>
        <label><span>Block content</span><textarea required={blocks.length === 0} value={blockContent} onChange={(event) => setBlockContent(event.target.value)} placeholder="Write content or describe the activity…" /></label>
        {blockType === "interactive" && (
          <label><span>Interactive activity (optional)</span><select value={attachmentId} onChange={(event) => setAttachmentId(event.target.value)}><option value="">Use native knowledge check</option>{activities.filter((activity) => activity.status === "launchable").map((activity) => <option key={activity.id} value={activity.id}>{activity.title}</option>)}</select></label>
        )}
        {(blockType === "video" || blockType === "resource") && (
          <label><span>Secure media (optional)</span><select value={attachmentId} onChange={(event) => setAttachmentId(event.target.value)}><option value="">Use descriptive placeholder</option>{assets.filter((asset) => asset.kind !== "h5p-package" && asset.status === "ready").map((asset) => <option key={asset.id} value={asset.id}>{asset.originalFilename}</option>)}</select></label>
        )}
        <button className="add-block-button" onClick={addBlock} type="button">+ Add activity</button>
        <ol className="draft-block-list">
          {blocks.map((block, index) => (
            <li key={block.id}>
              <span>{blockSymbol(block.type)}</span>
              <p><strong>{block.title}</strong><small>{block.type} · Activity {index + 1}{block.config?.activityId ? " · Interactive activity attached" : block.config?.mediaAssetId ? " · Secure media attached" : ""}</small></p>
              <div>
                <button aria-label={`Move ${block.title} up`} disabled={index === 0} onClick={() => moveBlock(index, -1)} type="button">↑</button>
                <button aria-label={`Move ${block.title} down`} disabled={index === blocks.length - 1} onClick={() => moveBlock(index, 1)} type="button">↓</button>
                <button aria-label={`Remove ${block.title}`} onClick={() => setBlocks((current) => current.filter((item) => item.id !== block.id))} type="button">×</button>
              </div>
            </li>
          ))}
        </ol>
        <button className="save-draft-button" disabled={blocks.length === 0 || standardIds.length === 0} type="submit">Save {blocks.length}-activity draft <span aria-hidden="true">→</span></button>
      </form>
      <p className="builder-rule"><span aria-hidden="true">i</span>Standards, release rules, and every ordered activity are saved with the private draft.</p>
    </aside>
  );
}

function releaseLabel(lesson: LessonSummary) {
  if (lesson.releaseMode === "prerequisite") {
    return `Unlocks after ${lesson.prerequisiteTitle ?? "the prerequisite lesson"}`;
  }
  if (lesson.releaseMode === "scheduled") return "Scheduled release";
  return "Available when published";
}

function blockSymbol(type: LessonBlockType) {
  const symbols: Record<LessonBlockType, string> = {
    text: "T",
    video: "▶",
    interactive: "✦",
    practice: "?",
    resource: "↓",
  };
  return symbols[type];
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("");
}
