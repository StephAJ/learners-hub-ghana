"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  LessonSummary,
  TeacherLessonWorkspace,
} from "../../../db/learning-repository";
import type { TeacherContentWorkspace } from "../../../db/content-repository";
import type { LessonBlockType } from "../../../domain/learning/types";
import { demoContentWorkspace, demoTeacherLessonWorkspace } from "../../demo-data";
import { demoSubjectBySlug } from "../../../domain/demo/greenfield";
import {
  publishPreviewLesson,
  rememberPreviewDraft,
} from "../../preview-workspace";
import "../../admin/academic/academic.css";
import "./teacher-subjects.css";

/* Grace Mensah's Integrated Science, straight from the shared demo dataset,
   so the lesson library a teacher sees is exactly what the learner opens. */
const demoSubject = demoSubjectBySlug("integrated-science")!;
const previewWorkspace: TeacherLessonWorkspace =
  demoTeacherLessonWorkspace(demoSubject);
const previewContentWorkspace: TeacherContentWorkspace =
  demoContentWorkspace(demoSubject);

export function TeacherSubjectsView() {
  const [workspace, setWorkspace] = useState(previewWorkspace);
  const [contentWorkspace, setContentWorkspace] = useState(
    previewContentWorkspace,
  );
  const [selectedLessonId, setSelectedLessonId] = useState(
    previewWorkspace.lessons[0].id,
  );
  const [selectedUnitId, setSelectedUnitId] = useState("all");
  const [dataMode, setDataMode] = useState<"loading" | "protected" | "preview">(
    "loading",
  );
  const [notice, setNotice] = useState("");
  /* The draft currently loaded into the builder, if any. Editing is limited to
     drafts: a published lesson is a version learners may already hold progress
     against, so changing it is a new version rather than an edit. */
  const [editingLessonId, setEditingLessonId] = useState<string>();

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

  async function saveDraft(input: CreateLessonFormInput) {
    if (editingLessonId) {
      await updateDraft(editingLessonId, input);
      return;
    }
    await createDraft(input);
  }

  async function updateDraft(
    lessonId: string,
    input: CreateLessonFormInput,
  ) {
    if (dataMode !== "protected") {
      setWorkspace((current) => ({
        ...current,
        lessons: current.lessons.map((lesson) =>
          lesson.id === lessonId
            ? {
                ...lesson,
                blockCount: input.blocks.length,
                objectiveCount: input.objectives.length,
                title: input.title,
                unitId: input.unitId,
                unitTitle:
                  current.units.find((unit) => unit.id === input.unitId)
                    ?.title ?? lesson.unitTitle,
                updatedAt: new Date().toISOString(),
              }
            : lesson,
        ),
      }));
      setEditingLessonId(undefined);
      setNotice("Draft updated in this preview session.");
      return;
    }

    const response = await fetch("/api/teacher/lessons", {
      body: JSON.stringify({
        action: "update",
        lessonId,
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
      setNotice(payload.error ?? "The lesson could not be updated.");
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
    setEditingLessonId(undefined);
    setNotice(`${payload.lesson.title} was updated.`);
  }

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
      /* Keep the draft's actual contents, not just its summary, so publishing
         it hands the learner player a real lesson. */
      rememberPreviewDraft(workspace.offeringId, {
        availability: "available",
        blocks: input.blocks.map((block, index) => ({
          config: block.config,
          content: block.content,
          id: `${previewLesson.id}-block-${index + 1}`,
          position: index + 1,
          ready: true,
          title: block.title,
          type: block.type,
        })),
        estimatedMinutes: Math.max(5, input.blocks.length * 5),
        id: previewLesson.id,
        objectives: input.objectives,
        progressPercent: 0,
        standardCodes: previewLesson.standardCodes,
        summary: input.summary,
        title: input.title,
        unitTitle: previewLesson.unitTitle,
        version: 0,
      });
      setWorkspace((current) => ({
        ...current,
        lessons: [previewLesson, ...current.lessons],
      }));
      setSelectedLessonId(previewLesson.id);
      setNotice(
        "Draft saved in this preview session. Publish it to open it in the learner view.",
      );
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
      const released = publishPreviewLesson(selectedLesson.id);
      setWorkspace((current) => ({
        ...current,
        lessons: current.lessons.map((lesson) =>
          lesson.id === selectedLesson.id
            ? { ...lesson, status: "published", version: 1 }
            : lesson,
        ),
      }));
      setNotice(
        released
          ? `${selectedLesson.title} is now open in the learner view for this preview session.`
          : "This lesson was authored before the page reloaded, so its activities are no longer in memory. Recreate the draft to publish it.",
      );
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
    <>


        <div className="admin-content teacher-content">
          <section className="subject-hero">
            <div className="subject-hero-code" aria-hidden="true">{workspace.code}</div>
            <div>
              <p className="eyebrow">Compulsory subject · 2026 / 2027</p>
              <h1>{workspace.subjectName}</h1>
              <p>{workspace.className} · 38 learners · Term 1</p>
            </div>
            <div className="subject-hero-actions">
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
                      <>
                        <button
                          onClick={() => {
                            setEditingLessonId(selectedLesson.id);
                            document
                              .getElementById("new-lesson")
                              ?.scrollIntoView({ behavior: "smooth" });
                          }}
                          type="button"
                        >
                          Edit draft
                        </button>
                        <button className="publish-button" onClick={publishSelectedLesson} type="button">Publish to class →</button>
                      </>
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
              editingLesson={
                editingLessonId
                  ? workspace.lessons.find(
                      (lesson) => lesson.id === editingLessonId,
                    )
                  : undefined
              }
              onCancelEdit={() => setEditingLessonId(undefined)}
              onCreate={saveDraft}
              standards={workspace.standards}
              units={workspace.units}
            />
          </div>
        </div>

    </>
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
  editingLesson,
  id,
  lessons,
  onCancelEdit,
  onCreate,
  standards,
  units,
}: {
  activities: TeacherContentWorkspace["activities"];
  assets: TeacherContentWorkspace["mediaAssets"];
  /* Set when the builder is editing an existing draft rather than starting a
     new one. The summary carries no blocks, so what can be pre-filled is the
     lesson's shape; its activities are rebuilt. */
  editingLesson?: TeacherLessonWorkspace["lessons"][number];
  id: string;
  lessons: TeacherLessonWorkspace["lessons"];
  onCancelEdit: () => void;
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
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [blocks, setBlocks] = useState<
    Array<{
      config?: CreateLessonFormInput["blocks"][number]["config"];
      content: string;
      id: string;
      title: string;
      type: LessonBlockType;
    }>
  >([]);

  /* Loading a draft replaces whatever was in the form, and switching drafts
     reloads rather than merging the two. Comparing the prop to state during
     render is React's documented way to adjust state when a prop changes — an
     effect would render the previous draft's contents once first. */
  const [loadedLessonId, setLoadedLessonId] = useState<string>();
  if (editingLesson?.id !== loadedLessonId) {
    setLoadedLessonId(editingLesson?.id);
    setTitle(editingLesson?.title ?? "");
    setSummary("");
    setObjectives("");
    setUnitId(editingLesson?.unitId ?? units[0]?.id ?? "");
    setStandardIds(
      editingLesson
        ? standards
            .filter((standard) =>
              editingLesson.standardCodes.includes(standard.code),
            )
            .map((standard) => standard.id)
        : standards[0]
          ? [standards[0].id]
          : [],
    );
    setReleaseMode(editingLesson?.releaseMode ?? "immediate");
    setBlocks([]);
  }

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
              : blockType === "text" && noteBody.trim()
                ? {
                    noteBody: noteBody.trim(),
                    noteTitle: noteTitle.trim() || undefined,
                  }
                : undefined,
        content: blockContent.trim(),
        id: crypto.randomUUID(),
        title: blockTitle.trim(),
        type: blockType,
      },
    ]);
    setBlockTitle("");
    setBlockContent("");
    setNoteTitle("");
    setNoteBody("");
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
      <div className="builder-heading">
        <span aria-hidden="true">{editingLesson ? "✎" : "+"}</span>
        <div>
          <p className="eyebrow">Authoring</p>
          <h2 id="lesson-builder-title">
            {editingLesson ? "Edit draft" : "New lesson draft"}
          </h2>
          {editingLesson ? (
            <small>
              Rebuild the activities below — editing replaces them.
            </small>
          ) : null}
        </div>
        {editingLesson ? (
          <button className="builder-cancel" onClick={onCancelEdit} type="button">
            Cancel
          </button>
        ) : null}
      </div>
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
        {blockType === "text" && (
          <>
            <label><span>Highlight title (optional)</span><input onChange={(event) => setNoteTitle(event.target.value)} placeholder="e.g. Science in daily life" value={noteTitle} /></label>
            <label><span>Highlight note (optional)</span><textarea onChange={(event) => setNoteBody(event.target.value)} placeholder="A short aside that sits beside the reading — a real-world connection, a warning, a memory aid." value={noteBody} /><small>Leave blank and no panel is shown.</small></label>
          </>
        )}
        {blockType === "interactive" && (
          <label><span>Interactive activity (optional)</span><select value={attachmentId} onChange={(event) => setAttachmentId(event.target.value)}><option value="">Use native knowledge check</option>{activities.filter((activity) => activity.status === "launchable").map((activity) => <option key={activity.id} value={activity.id}>{activity.title}</option>)}</select></label>
        )}
        {(blockType === "video" || blockType === "resource") && (
          <label>
            <span>{blockType === "video" ? "Video to play" : "File to download"}</span>
            <select value={attachmentId} onChange={(event) => setAttachmentId(event.target.value)}>
              <option value="">
                {blockType === "video"
                  ? "No video yet — learners see a placeholder"
                  : "No file yet — learners see a placeholder"}
              </option>
              {/* A video block offers videos and a resource block offers
                  documents. Offering every asset for both was how lessons
                  ended up with a PDF attached to a play button. */}
              {assets
                .filter(
                  (asset) =>
                    asset.status === "ready" &&
                    (blockType === "video"
                      ? asset.kind === "video" || asset.kind === "audio"
                      : asset.kind !== "h5p-package" && asset.kind !== "video"),
                )
                .map((asset) => (
                  <option key={asset.id} value={asset.id}>{asset.originalFilename}</option>
                ))}
            </select>
            <small>
              Uploaded in the <Link href="/teacher/content">content studio</Link>.
            </small>
          </label>
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
        <button className="save-draft-button" disabled={blocks.length === 0 || standardIds.length === 0} type="submit">
          {editingLesson ? "Update" : "Save"} {blocks.length}-activity draft
          <span aria-hidden="true">→</span>
        </button>
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

