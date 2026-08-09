"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  LessonSummary,
  TeacherLessonWorkspace,
} from "../../../db/learning-repository";
import type { TeacherContentWorkspace } from "../../../db/content-repository";
import type {
  LessonBlock,
  LessonBlockType,
} from "../../../domain/learning/types";
import { resolveVideoUrl } from "../../../domain/learning/video";
import { useOfferingParam } from "../../components/offering-param";
import "../../admin/academic/academic.css";
import "./teacher-subjects.css";

/* ==========================================================================
   No preview library

   This screen opened on Grace Mensah's Integrated Science from the shared
   demo dataset and kept it whenever /api/teacher/lessons failed. Authoring in
   that state wrote the draft into preview-workspace.ts, a Map that lives for
   one browser tab, and told the teacher their lesson was "saved in this
   preview session" — a sentence that reads, to someone who has just written a
   lesson, like it was saved.

   Publishing went the same way: the learner player read the same Map, so the
   whole author-publish-open path worked convincingly and persisted nothing.
   ========================================================================== */

const EMPTY_CONTENT: TeacherContentWorkspace = {
  activities: [],
  className: "",
  mediaAssets: [],
  offeringId: "",
  offerings: [],
  subjectName: "",
  totalBytes: 0,
};

/* Omitted on first load, when the server picks the teacher's first subject
   and tells us which that was. */
function offeringQuery(offeringId?: string) {
  return offeringId ? `?offeringId=${encodeURIComponent(offeringId)}` : "";
}

async function fetchWorkspace(
  offeringId?: string,
): Promise<{ error: string } | { workspace: TeacherLessonWorkspace }> {
  try {
    const response = await fetch(
      `/api/teacher/lessons${offeringQuery(offeringId)}`,
    );
    const payload = (await response.json()) as {
      error?: string;
      workspace?: TeacherLessonWorkspace;
    };
    if (!response.ok || !payload.workspace) {
      return {
        error: payload.error ?? "Your lesson library could not be loaded.",
      };
    }
    return { workspace: payload.workspace };
  } catch {
    return { error: "Your lesson library could not be reached." };
  }
}

/* The library is a second request because a subject can be taught without
   one. A teacher whose media library fails to load still gets their lessons;
   the attach control simply has nothing to offer.

   It takes the offering the lessons resolved to rather than being asked
   separately, so the two cannot end up showing different subjects. */
async function fetchContent(
  offeringId: string,
): Promise<TeacherContentWorkspace | undefined> {
  try {
    const response = await fetch(
      `/api/teacher/content${offeringQuery(offeringId)}`,
    );
    if (!response.ok) return undefined;
    const payload = (await response.json()) as {
      workspace?: TeacherContentWorkspace;
    };
    return payload.workspace;
  } catch {
    return undefined;
  }
}

export function TeacherSubjectsView() {
  const [workspace, setWorkspace] = useState<TeacherLessonWorkspace | null>(
    null,
  );
  const [contentWorkspace, setContentWorkspace] =
    useState<TeacherContentWorkspace>(EMPTY_CONTENT);
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("all");
  const [state, setState] = useState<"error" | "loading" | "ready">("loading");
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  /* The draft currently loaded into the builder, if any. Editing is limited to
     drafts: a published lesson is a version learners may already hold progress
     against, so changing it is a new version rather than an edit. */
  const [editingLessonId, setEditingLessonId] = useState<string>();
  /* Bumped by Try again, which needs to re-run a load that the URL alone
     would not change. */
  const [reloadKey, setReloadKey] = useState(0);

  /* The subject comes from the address bar, so it survives navigating away
     and back and follows the teacher to their markbook. Switching is a
     reload rather than a filter because units, standards, media and the
     question bank all belong to the offering — none of it can be derived
     from what is already on the page. */
  const { offeringId, setOfferingId } = useOfferingParam();

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
      setSelectedLessonId((current) =>
        result.workspace.lessons.some((lesson) => lesson.id === current)
          ? current
          : (result.workspace.lessons[0]?.id ?? ""),
      );
      /* Anything half-written belonged to the subject being left. */
      setEditingLessonId(undefined);
      setNotice("");
      setState("ready");

      const content = await fetchContent(result.workspace.offeringId);
      if (active) setContentWorkspace(content ?? EMPTY_CONTENT);
    }

    void loadOnce();
    return () => {
      active = false;
    };
  }, [offeringId, reloadKey]);

  /* Both put the screen into its loading state from an event handler, where
     the spinner should appear the moment the control is pressed. Choosing a
     subject then changes the URL and the effect above does the rest; Try
     again has no URL to change, so it bumps a key the effect also watches. */
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
    return <p className="workspace-loading">Loading your lesson library…</p>;
  }

  if (state === "error" || !workspace) {
    return (
      <div className="workspace-failure">
        <h2>Your lesson library could not be loaded.</h2>
        <p>{problem}</p>
        <button onClick={retry} type="button">
          Try again
        </button>
      </div>
    );
  }

  return (
    <LoadedSubjects
      contentWorkspace={contentWorkspace}
      editingLessonId={editingLessonId}
      notice={notice}
      selectOffering={selectOffering}
      selectedLessonId={selectedLessonId}
      selectedUnitId={selectedUnitId}
      setEditingLessonId={setEditingLessonId}
      setNotice={setNotice}
      setSelectedLessonId={setSelectedLessonId}
      setSelectedUnitId={setSelectedUnitId}
      setWorkspace={(update) =>
        setWorkspace((current) => (current ? update(current) : current))
      }
      workspace={workspace}
    />
  );
}

/* Split from the loader so the rest can take a workspace that is present. */
function LoadedSubjects({
  contentWorkspace,
  editingLessonId,
  notice,
  selectOffering,
  selectedLessonId,
  selectedUnitId,
  setEditingLessonId,
  setNotice,
  setSelectedLessonId,
  setSelectedUnitId,
  setWorkspace,
  workspace,
}: {
  contentWorkspace: TeacherContentWorkspace;
  editingLessonId: string | undefined;
  notice: string;
  selectOffering: (offeringId: string) => void;
  selectedLessonId: string;
  selectedUnitId: string;
  setEditingLessonId: (value: string | undefined) => void;
  setNotice: (value: string) => void;
  setSelectedLessonId: (value: string) => void;
  setSelectedUnitId: (value: string) => void;
  setWorkspace: (
    update: (current: TeacherLessonWorkspace) => TeacherLessonWorkspace,
  ) => void;
  workspace: TeacherLessonWorkspace;
}) {
  /* The builder used to be a 330px column pinned to the right of the lesson
     list, on a screen that already carried a unit outline and a selection bar.
     Writing a lesson is not a sidebar activity — it is the second thing this
     screen is for, so it is the second tab, with the whole width to work in. */
  const [tab, setTab] = useState<"authoring" | "lessons">("lessons");

  /* Opening a draft to edit means going where the editing happens. */
  function editLesson(lessonId: string) {
    setEditingLessonId(lessonId);
    setTab("authoring");
  }

  function writeNewLesson() {
    setEditingLessonId(undefined);
    setTab("authoring");
  }

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
    /* Back to the library, where the lesson that was just saved is. Staying in
       the builder left a teacher looking at an empty form and no evidence
       anything had happened. */
    setTab("lessons");
    setNotice(`${payload.lesson.title} was updated.`);
  }

  async function createDraft(input: CreateLessonFormInput) {
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
    setTab("lessons");
    setNotice(`${payload.lesson.title} was saved as a private draft.`);
  }

  async function publishSelectedLesson() {
    if (!selectedLesson || selectedLesson.status !== "draft") return;
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
          {/* The banner this replaces carried a code tile, "Compulsory subject
              · 2026 / 2027", the subject name and "38 learners" — a number that
              was typed into the markup and belonged to no class in
              particular. */}
          <header className="screen-context">
            <div className="screen-identity">
              {/* The library resolved one offering with ORDER BY s.name
                  LIMIT 1, so a teacher of Integrated Science and Mathematics
                  authored lessons for whichever sorted first and had no route
                  to the other. A teacher of several subjects chooses here. */}
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
              <p>
                {workspace.className} · {workspace.code}
              </p>
            </div>
            <button
              className="subject-write-button"
              onClick={writeNewLesson}
              type="button"
            >
              + Write a lesson
            </button>
          </header>

          <section className="screen-stats" aria-label="Subject summary">
            <article>
              <span aria-hidden="true">≡</span>
              <div><small>Total lessons</small><strong>{workspace.lessons.length}</strong></div>
            </article>
            <article>
              <span aria-hidden="true">✓</span>
              <div><small>Published</small><strong>{publishedCount}</strong></div>
            </article>
            <article>
              <span aria-hidden="true">✎</span>
              <div><small>Drafts</small><strong>{draftCount}</strong></div>
            </article>
            <article>
              <span aria-hidden="true">◎</span>
              <div>
                <small>Standards mapped</small>
                <strong>{mappedStandardCount}/{workspace.standards.length}</strong>
              </div>
            </article>
          </section>

          {notice && <p className="teacher-notice" role="status">{notice}</p>}

          <div className="screen-tabs" role="tablist">
            <button
              aria-selected={tab === "lessons"}
              className={tab === "lessons" ? "is-active" : ""}
              onClick={() => setTab("lessons")}
              role="tab"
              type="button"
            >
              Lessons · {workspace.lessons.length}
            </button>
            <button
              aria-selected={tab === "authoring"}
              className={tab === "authoring" ? "is-active" : ""}
              onClick={() => setTab("authoring")}
              role="tab"
              type="button"
            >
              {editingLessonId ? "Editing a draft" : "Write a lesson"}
            </button>
          </div>

          {tab === "lessons" ? (
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
                <h2 id="lesson-library-title">{selectedUnitId === "all" ? "All lessons" : workspace.units.find((unit) => unit.id === selectedUnitId)?.title}</h2>
                <span>{visibleLessons.length} lessons</span>
              </div>
              {visibleLessons.length === 0 ? (
                <div className="workspace-empty">
                  <strong>
                    {workspace.lessons.length === 0
                      ? "No lessons yet"
                      : "No lessons in this unit"}
                  </strong>
                  <p>
                    {workspace.lessons.length === 0
                      ? "Lessons you write for this subject appear here. Start one with “Write a lesson” above."
                      : "Choose another unit, or write the first lesson for this one."}
                  </p>
                </div>
              ) : null}
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
                    {/* A chevron used to sit here. It reads as "opens
                        something", and this button does not open anything — it
                        selects the lesson, which reveals the actions below the
                        list. Clicking it and having the page appear not to
                        respond is what a misplaced arrow buys you. The
                        selected state is the feedback now. */}
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
                          onClick={() => editLesson(selectedLesson.id)}
                          type="button"
                        >
                          Edit draft
                        </button>
                        <button className="publish-button" onClick={publishSelectedLesson} type="button">Publish to class →</button>
                      </>
                    ) : (
                      /* This set a notice saying a preview "will open in a
                         clearly labelled preview session" — a description of a
                         screen nobody had built. It opens one now. */
                      <Link
                        href={`/teacher/subjects/preview?offeringId=${encodeURIComponent(workspace.offeringId)}`}
                      >
                        Preview lesson
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </section>
            </div>
          ) : (
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
              onCancelEdit={() => {
                setEditingLessonId(undefined);
                setTab("lessons");
              }}
              onCreate={saveDraft}
              questionBank={workspace.questionBank}
              standards={workspace.standards}
              units={workspace.units}
            />
          )}
        </div>

    </>
  );
}

type CreateLessonFormInput = {
  availableFrom?: string;
  blocks: Array<{
    /* Borrowed from the domain type rather than restated. The local copy had
       drifted: it never listed the note fields the text branch has been
       sending since highlights were added, so nothing checked them. */
    config?: LessonBlock["config"];
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
  questionBank,
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
  questionBank: TeacherLessonWorkspace["questionBank"];
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
  const [posterId, setPosterId] = useState("");
  /* The questions a checkpoint asks, in the order chosen. An array rather
     than a set because the order is the teacher's — a checkpoint that walks
     from recall to application is a different lesson from the same questions
     shuffled. */
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  /* A published video a teacher wants to teach around, rather than footage the
     school hosts. domain/learning/video.ts decides whether a link is playable;
     this only holds what was typed. */
  const [videoUrl, setVideoUrl] = useState("");
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
        config: blockConfig({
          attachmentId,
          blockType,
          noteBody,
          noteTitle,
          posterId,
          questionIds,
          videoUrl,
        }),
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
    setVideoUrl("");
    setPosterId("");
    setQuestionIds([]);
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
              <button className={blockType === type ? "active" : ""} key={type} onClick={() => { setBlockType(type); setAttachmentId(""); setPosterId(""); }} type="button">
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
          <>
            <label><span>Interactive activity (optional)</span><select value={attachmentId} onChange={(event) => setAttachmentId(event.target.value)}><option value="">Ask questions from your question bank</option>{activities.filter((activity) => activity.status === "launchable").map((activity) => <option key={activity.id} value={activity.id}>{activity.title}</option>)}</select></label>
            {/* An H5P package brings its own questions, so the bank picker is
                only offered for the native checkpoint. Showing both at once
                invited a block configured two ways, of which the player can
                only honour one. */}
            {!attachmentId && (
              <CheckpointQuestionPicker
                onChange={setQuestionIds}
                questionBank={questionBank}
                selected={questionIds}
              />
            )}
          </>
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
        {blockType === "video" && (
          <label className="video-link-field">
            <span>Or a video link</span>
            <input
              onChange={(event) => setVideoUrl(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              type="url"
              value={videoUrl}
            />
            {/* Checked against the same resolver the player uses, so a link
                that will not play is caught while the teacher is still looking
                at it rather than by a learner on Monday morning. */}
            <small className={videoLinkNote(videoUrl).tone}>
              {videoLinkNote(videoUrl).message}
            </small>
          </label>
        )}
        {blockType === "video" && (
          <label>
            <span>Thumbnail (optional)</span>
            <select
              onChange={(event) => setPosterId(event.target.value)}
              value={posterId}
            >
              <option value="">Use generated artwork</option>
              {assets
                .filter(
                  (asset) => asset.status === "ready" && asset.kind === "image",
                )
                .map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.originalFilename}
                  </option>
                ))}
            </select>
            <small>
              The still learners see before they press play. Leave it on
              generated artwork and each activity gets its own — no lesson shows
              a blank frame for want of a thumbnail.
            </small>
          </label>
        )}
        <button className="add-block-button" onClick={addBlock} type="button">+ Add activity</button>
        <ol className="draft-block-list">
          {blocks.map((block, index) => (
            <li key={block.id}>
              <span>{blockSymbol(block.type)}</span>
              <p><strong>{block.title}</strong><small>{block.type} · Activity {index + 1}{block.config?.activityId ? " · Interactive activity attached" : block.config?.questionIds?.length ? ` · ${block.config.questionIds.length} checkpoint ${block.config.questionIds.length === 1 ? "question" : "questions"}` : block.config?.mediaAssetId ? " · Secure media attached" : ""}</small></p>
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

/**
 * Folds the block builder's attachment fields into the config a block stores.
 *
 * Extracted from the nested conditional it used to be because the video branch
 * now carries two assets rather than one, and expressing "the poster is
 * optional, but only on a video" as another ternary layer was how the
 * interactive branch's provider once went missing.
 */
/**
 * What to tell a teacher about the link they have typed so far.
 *
 * Deliberately not a blocking validation: a half-typed URL is the normal state
 * of this field, and a teacher who pastes something unsupported should be told
 * what *is* supported rather than simply refused.
 */
function videoLinkNote(raw: string): { message: string; tone: string } {
  const value = raw.trim();
  if (!value) {
    return {
      message:
        "A YouTube link, or a direct .mp4 or .webm address. Leave blank to use an uploaded video instead.",
      tone: "",
    };
  }
  const source = resolveVideoUrl(value);
  if (!source) {
    return {
      message:
        "That link cannot be played. YouTube links work, as do direct https addresses ending in .mp4 or .webm.",
      tone: "is-problem",
    };
  }
  if (source.kind === "youtube") {
    return {
      message:
        "YouTube video recognised. It loads only when a learner presses play, so no cookies are set before then.",
      tone: "is-good",
    };
  }
  return { message: "Direct video file recognised.", tone: "is-good" };
}

function blockConfig({
  attachmentId,
  blockType,
  noteBody,
  noteTitle,
  posterId,
  questionIds,
  videoUrl,
}: {
  attachmentId: string;
  blockType: LessonBlockType;
  noteBody: string;
  noteTitle: string;
  posterId: string;
  questionIds: string[];
  videoUrl: string;
}): CreateLessonFormInput["blocks"][number]["config"] {
  if (blockType === "interactive") {
    if (attachmentId) return { activityId: attachmentId, provider: "h5p" };
    return questionIds.length > 0 ? { questionIds } : undefined;
  }

  if (blockType === "video") {
    /* A poster is worth keeping even with no footage yet: the teacher has said
       what the activity should look like, and the block is still a draft. */
    const link = videoUrl.trim();
    if (!attachmentId && !posterId && !link) return undefined;
    return {
      ...(attachmentId ? { mediaAssetId: attachmentId } : {}),
      ...(link ? { videoUrl: link } : {}),
      ...(posterId ? { posterAssetId: posterId } : {}),
    };
  }

  if (blockType === "resource") {
    return attachmentId ? { mediaAssetId: attachmentId } : undefined;
  }

  if (blockType === "text" && noteBody.trim()) {
    return {
      noteBody: noteBody.trim(),
      noteTitle: noteTitle.trim() || undefined,
    };
  }

  return undefined;
}

/**
 * Choosing which questions a checkpoint asks.
 *
 * Ordered rather than a plain multi-select: the sequence is part of the
 * teaching, and a checkpoint that opens with the hardest question is a
 * different lesson from one that builds up to it. Selected questions are
 * listed in their chosen order with the controls to move them; the rest are
 * grouped by topic, which is how a teacher looks for a question they wrote
 * weeks ago.
 */
function CheckpointQuestionPicker({
  onChange,
  questionBank,
  selected,
}: {
  onChange: (questionIds: string[]) => void;
  questionBank: TeacherLessonWorkspace["questionBank"];
  selected: string[];
}) {
  if (questionBank.length === 0) {
    return (
      <p className="checkpoint-picker-empty">
        Your question bank has no approved questions for this subject yet.
        Write them on the Assessments screen and they become available here.
      </p>
    );
  }

  const byId = new Map(questionBank.map((question) => [question.id, question]));
  const chosen = selected
    .map((id) => byId.get(id))
    .filter((question): question is NonNullable<typeof question> =>
      Boolean(question),
    );
  const available = questionBank.filter(
    (question) => !selected.includes(question.id),
  );
  const totalMarks = chosen.reduce((sum, question) => sum + question.marks, 0);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= selected.length) return;
    const reordered = [...selected];
    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];
    onChange(reordered);
  }

  return (
    <div className="checkpoint-picker">
      <div className="checkpoint-picker-head">
        <span>Checkpoint questions</span>
        <small>
          {chosen.length === 0
            ? "None chosen — the block will be empty for learners"
            : `${chosen.length} chosen · ${totalMarks} ${totalMarks === 1 ? "mark" : "marks"}`}
        </small>
      </div>

      {chosen.length > 0 && (
        <ol className="checkpoint-picker-chosen">
          {chosen.map((question, index) => (
            <li key={question.id}>
              <span className="checkpoint-picker-number">{index + 1}</span>
              <div>
                <strong>{question.prompt}</strong>
                <small>
                  {question.topic} · {question.type} · {question.marks}{" "}
                  {question.marks === 1 ? "mark" : "marks"}
                </small>
              </div>
              <div className="checkpoint-picker-controls">
                <button
                  aria-label={`Move "${question.prompt}" earlier`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label={`Move "${question.prompt}" later`}
                  disabled={index === chosen.length - 1}
                  onClick={() => move(index, 1)}
                  type="button"
                >
                  ↓
                </button>
                <button
                  aria-label={`Remove "${question.prompt}"`}
                  onClick={() =>
                    onChange(selected.filter((id) => id !== question.id))
                  }
                  type="button"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {available.length > 0 && (
        <div className="checkpoint-picker-available">
          {available.map((question) => (
            <button
              key={question.id}
              onClick={() => onChange([...selected, question.id])}
              type="button"
            >
              <strong>{question.prompt}</strong>
              <small>
                {question.topic} · {question.marks}{" "}
                {question.marks === 1 ? "mark" : "marks"}
              </small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
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

