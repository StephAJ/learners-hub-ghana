"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  LessonSummary,
  TeacherLessonWorkspace,
} from "../../../db/learning-repository";
import type { LessonBlockType } from "../../../domain/learning/types";
import "../../admin/academic/academic.css";
import "./teacher-subjects.css";

const navigation = [
  { href: "#today", label: "My day", symbol: "⌂" },
  { href: "/teacher/subjects", label: "My subjects", symbol: "▦" },
  { href: "#lessons", label: "Lessons", symbol: "≡" },
  { href: "/teacher/assessments", label: "Assessments", symbol: "✓" },
  { href: "/teacher/gradebook", label: "Markbook", symbol: "↗" },
  { href: "#classes", label: "Class groups", symbol: "◎" },
  { href: "/admin/academic", label: "School admin", symbol: "⚙" },
];

const previewWorkspace: TeacherLessonWorkspace = {
  className: "JHS 2 Gold",
  code: "IS",
  coveragePercent: 50,
  offeringId: "offering-science-jhs2",
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
      status: "published",
      title: "The human digestive system",
      unitId: "unit-human-systems",
      unitTitle: "Human body systems",
      updatedAt: "2026-07-21T09:00:00Z",
      version: 1,
    },
    {
      blockCount: 1,
      id: "lesson-balanced-diet",
      objectiveCount: 1,
      status: "draft",
      title: "Building a balanced Ghanaian meal",
      unitId: "unit-food-nutrition",
      unitTitle: "Food and nutrition",
      updatedAt: "2026-07-22T14:30:00Z",
      version: 0,
    },
  ],
};

export default function TeacherSubjectsPage() {
  const [workspace, setWorkspace] = useState(previewWorkspace);
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

  async function createDraft(input: CreateLessonFormInput) {
    if (dataMode !== "protected") {
      const previewLesson: LessonSummary = {
        blockCount: 1,
        id: `preview-${Date.now()}`,
        objectiveCount: 1,
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

  return (
    <div className="admin-shell teacher-shell">
      <aside className="admin-sidebar teacher-sidebar" aria-label="Teacher workspace">
        <Link className="brand" href="/" aria-label="Learners Hub home">
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
        <Link className="admin-profile" href="/">
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
            <Link className="learner-preview-link" href="/learn/subjects/integrated-science">Learner preview →</Link>
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
            <article><span>↗</span><p><small>Class completion</small><strong>82%</strong></p></article>
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
                      <span>{lesson.blockCount} blocks · {lesson.objectiveCount} objectives · Version {lesson.version}</span>
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
                    <button type="button">Edit lesson</button>
                    {selectedLesson.status === "draft" ? (
                      <button className="publish-button" onClick={publishSelectedLesson} type="button">Publish to class →</button>
                    ) : (
                      <Link href="/learn/subjects/integrated-science">Open learner view →</Link>
                    )}
                  </div>
                </div>
              )}
            </section>

            <LessonDraftForm
              id="new-lesson"
              onCreate={createDraft}
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
  blockContent: string;
  blockTitle: string;
  blockType: LessonBlockType;
  objective: string;
  summary: string;
  title: string;
  unitId: string;
};

function LessonDraftForm({
  id,
  onCreate,
  units,
}: {
  id: string;
  onCreate: (input: CreateLessonFormInput) => Promise<void>;
  units: TeacherLessonWorkspace["units"];
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [objective, setObjective] = useState("");
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [blockType, setBlockType] = useState<LessonBlockType>("text");
  const [blockTitle, setBlockTitle] = useState("");
  const [blockContent, setBlockContent] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreate({
      blockContent,
      blockTitle,
      blockType,
      objective,
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
        <label><span>Learning objective</span><input required value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Learners will be able to…" /></label>
        <fieldset>
          <legend>First content block</legend>
          <div className="block-type-picker">
            {(["text", "video", "interactive", "practice", "resource"] as LessonBlockType[]).map((type) => (
              <button className={blockType === type ? "active" : ""} key={type} onClick={() => setBlockType(type)} type="button">
                <span aria-hidden="true">{blockSymbol(type)}</span>{type}
              </button>
            ))}
          </div>
        </fieldset>
        <label><span>Block title</span><input required value={blockTitle} onChange={(event) => setBlockTitle(event.target.value)} placeholder="A clear section heading" /></label>
        <label><span>Block content</span><textarea required value={blockContent} onChange={(event) => setBlockContent(event.target.value)} placeholder="Write content or describe the activity…" /></label>
        <button className="save-draft-button" type="submit">Save private draft <span aria-hidden="true">→</span></button>
      </form>
      <p className="builder-rule"><span aria-hidden="true">i</span>Only assigned teachers and academic administrators can publish to this class.</p>
    </aside>
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

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("");
}
