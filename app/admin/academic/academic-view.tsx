"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type {
  AcademicYear,
  ClassGroup,
  ClassOffering,
  Subject,
} from "../../../domain/academic/structure";
import type { SchoolTeacher } from "../../../db/academic-repository";
import type { GradingPeriod } from "../../../db/grading-period-repository";
import type { SubjectRequirement } from "../../../domain/academic/types";
import {
  BooksIcon,
  ClipboardCheckIcon,
  LayersIcon,
  UsersIcon,
} from "../../components/icons";
import { ClassPlanner } from "./class-planner";
import { CurriculumPanel } from "./curriculum-panel";
import "./academic.css";

/* ==========================================================================
   Academic structure

   This screen used to render `domain/academic/fixtures.ts` — four classes and
   their subjects, hardcoded — and its one working control, "Place a learner",
   called setState and nothing else. An administrator could look at the shape
   of their school and change none of it.

   Everything below reads /api/admin/academic and writes back to it. There is
   no fixture fallback: a school with no classes sees an empty state that says
   so and offers the button that fixes it, which is the truth, rather than
   four classes belonging to a school in the demo data.
   ========================================================================== */

type Structure = {
  classGroups: ClassGroup[];
  offeringsByClassGroup: Record<string, ClassOffering[]>;
  subjects: Subject[];
  teachers: SchoolTeacher[];
  teachersByOffering: Record<string, string[]>;
  years: AcademicYear[];
};

const EMPTY: Structure = {
  classGroups: [],
  offeringsByClassGroup: {},
  subjects: [],
  teachers: [],
  teachersByOffering: {},
  years: [],
};

/* Outside the component so the mount effect can call it without the function
   itself being a dependency, and so nothing in it touches state — the effect
   decides what to do with the answer. */
async function fetchStructure(): Promise<{
  periods: GradingPeriod[];
  structure: Structure;
} | null> {
  try {
    const response = await fetch("/api/admin/academic");
    const payload = (await response.json()) as {
      error?: string;
      periods?: GradingPeriod[];
      structure?: Structure;
    };
    if (!response.ok || !payload.structure) return null;
    return { periods: payload.periods ?? [], structure: payload.structure };
  } catch {
    return null;
  }
}

export function AcademicView() {
  const [structure, setStructure] = useState<Structure>(EMPTY);
  /* Terms. Every markbook query used to bind one seeded period id, so a
     school that reached the end of Term 1 had nowhere to put Term 2's marks
     and no screen anywhere that could make one. */
  const [periods, setPeriods] = useState<GradingPeriod[]>([]);
  const [state, setState] = useState<"error" | "loading" | "ready">("loading");
  const [selectedYearId, setSelectedYearId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<"class" | "plan" | "year" | null>(null);
  /* Only one offering row is ever in its picker, so this is an id rather than
     a flag per row — opening a second closes the first, which is what stops
     the column turning into a wall of checkboxes. */
  const [staffingId, setStaffingId] = useState("");

  const load = useCallback(async () => {
    const loaded = await fetchStructure();
    if (!loaded) {
      setProblem("The school’s structure could not be loaded.");
      setState("error");
      return false;
    }
    setStructure(loaded.structure);
    setPeriods(loaded.periods);
    setState("ready");
    return true;
  }, []);

  useEffect(() => {
    let active = true;

    async function loadOnce() {
      const loaded = await fetchStructure();
      if (!active) return;
      if (loaded) {
        setStructure(loaded.structure);
        setPeriods(loaded.periods);
        setState("ready");
      } else {
        setProblem("The school’s structure could not be loaded.");
        setState("error");
      }
    }

    void loadOnce();
    return () => {
      active = false;
    };
  }, []);

  /* The year shown defaults to the one the school is actually in, but is a
     selection rather than a fact — an administrator sets next year up in
     March without moving the school into it. */
  const currentYear =
    structure.years.find((year) => year.status === "current") ??
    structure.years[0];
  const activeYearId = selectedYearId || currentYear?.id || "";
  const activeYear = structure.years.find((year) => year.id === activeYearId);

  const classesThisYear = useMemo(
    () =>
      structure.classGroups.filter(
        (group) =>
          group.academicYearId === activeYearId && group.status === "active",
      ),
    [activeYearId, structure.classGroups],
  );

  const selectedClass =
    classesThisYear.find((group) => group.id === selectedClassId) ??
    classesThisYear[0];
  const offerings = selectedClass
    ? (structure.offeringsByClassGroup[selectedClass.id] ?? []).filter(
        (offering) => offering.status === "active",
      )
    : [];
  const compulsory = offerings.filter(
    (item) => item.requirement === "compulsory",
  );
  const optional = offerings.filter((item) => item.requirement === "optional");

  const placedLearners = classesThisYear.reduce(
    (total, group) => total + group.learnerCount,
    0,
  );
  const offeringCount = classesThisYear.reduce(
    (total, group) =>
      total +
      (structure.offeringsByClassGroup[group.id] ?? []).filter(
        (offering) => offering.status === "active",
      ).length,
    0,
  );
  const withTeacher = classesThisYear.filter(
    (group) => group.classTeacherPersonId,
  ).length;

  async function send(body: unknown, success: string) {
    setBusy(true);
    setNotice("");
    setProblem("");
    try {
      const response = await fetch("/api/admin/academic", {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "That change could not be saved.");
      }
      await load();
      setNotice(success);
      return true;
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : "Something went wrong.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  /* Multipart, so it cannot go through send() — the cover is a file rather
     than a field, and it is scanned before anything points at it. */
  async function uploadCover(subjectId: string, file: File) {
    setBusy(true);
    setNotice("");
    setProblem("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("subjectId", subjectId);
      const response = await fetch("/api/admin/academic/cover", {
        body,
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "That cover could not be saved.");
      }
      await load();
      setNotice("The subject cover was updated.");
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return <p className="academic-loading">Loading the school’s structure…</p>;
  }

  if (state === "error") {
    return (
      <div className="academic-empty">
        <h2>The school’s structure could not be loaded.</h2>
        <p>{problem}</p>
        <button onClick={() => void load()} type="button">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="admin-content">
      <section className="admin-welcome">
        <div>
          <p className="eyebrow">School year foundation</p>
          <h1>Academic structure</h1>
          <p>
            Manage academic years, classes, subjects and what each class is
            taught.
          </p>
        </div>

        <div className="year-controls">
          <label className="year-picker">
            <small>Academic year</small>
            <select
              onChange={(event) => {
                setSelectedYearId(event.target.value);
                setSelectedClassId("");
              }}
              value={activeYearId}
            >
              {structure.years.length === 0 && (
                <option value="">No years yet</option>
              )}
              {structure.years.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                  {year.status === "current" ? " · current" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="year-buttons">
            {activeYear && activeYear.status !== "current" && (
              <button
                disabled={busy}
                onClick={() =>
                  void send(
                    { type: "set-current-year", yearId: activeYear.id },
                    `The school is now in ${activeYear.name}.`,
                  )
                }
                type="button"
              >
                Make current
              </button>
            )}
            <button
              className="ghost-button"
              disabled={busy}
              onClick={() => setPanel(panel === "year" ? null : "year")}
              type="button"
            >
              Add a year
            </button>
          </div>
        </div>
      </section>

      {panel === "year" && (
        <AddYearForm
          busy={busy}
          onCancel={() => setPanel(null)}
          onSubmit={async (year) => {
            const saved = await send(
              { type: "create-year", year },
              `${year.name} was added.`,
            );
            if (saved) setPanel(null);
          }}
        />
      )}

      {notice && (
        <p className="academic-notice" role="status">
          {notice}
        </p>
      )}
      {problem && (
        <p className="academic-problem" role="alert">
          {problem}
        </p>
      )}

      {activeYear ? (
        <TermsPanel
          busy={busy}
          onCreate={async (period) => {
            await send(
              { period, type: "create-period" },
              `${period.name} was added.`,
            );
          }}
          onSetStatus={async (periodId, status, name) => {
            await send(
              { periodId, status, type: "set-period-status" },
              status === "open"
                ? `${name} is now the open term. Marks go here.`
                : `${name} is ${status}.`,
            );
          }}
          periods={periods.filter(
            (period) => period.academicYearId === activeYear.id,
          )}
          yearId={activeYear.id}
          yearName={activeYear.name}
        />
      ) : null}

      {structure.years.length === 0 ? (
        <div className="academic-empty">
          <h2>Start with an academic year.</h2>
          <p>
            Classes, subjects and admissions intakes all belong to a year, so it
            is the first thing to set up.
          </p>
          <button onClick={() => setPanel("year")} type="button">
            Add an academic year
          </button>
        </div>
      ) : (
        <>
          <section className="admin-stats" aria-label="Academic setup summary">
            <article>
              <span className="admin-stat-icon" data-hue="teal" aria-hidden="true"><LayersIcon size={20} /></span>
              <div>
                <small>Classes</small>
                <strong>{classesThisYear.length}</strong>
              </div>
              <em>{activeYear?.name ?? "This year"}</em>
            </article>
            <article>
              <span className="admin-stat-icon" data-hue="blue" aria-hidden="true"><UsersIcon size={20} /></span>
              <div>
                <small>Placed learners</small>
                <strong>{placedLearners}</strong>
              </div>
              <em>across every class</em>
            </article>
            <article>
              <span className="admin-stat-icon" data-hue="amber" aria-hidden="true"><BooksIcon size={20} /></span>
              <div>
                <small>Subject offerings</small>
                <strong>{offeringCount}</strong>
              </div>
              <em>{structure.subjects.length} subjects defined</em>
            </article>
            <article>
              <span className="admin-stat-icon" data-hue="violet" aria-hidden="true"><ClipboardCheckIcon size={20} /></span>
              <div>
                <small>Classes with a teacher</small>
                <strong>
                  {withTeacher} / {classesThisYear.length}
                </strong>
              </div>
              <em>
                {classesThisYear.length > 0 &&
                withTeacher === classesThisYear.length
                  ? "every class is covered"
                  : `${classesThisYear.length - withTeacher} still to assign`}
              </em>
            </article>
          </section>

          <div className="academic-workspace">
            <div className="academic-primary">
              <section className="admin-panel class-policy-panel">
                <div className="admin-panel-heading">
                  <div>
                    <p className="eyebrow">Class subject policy</p>
                    <h2>Classes and required subjects</h2>
                  </div>
                  <div className="admin-panel-actions">
                    <button
                      className="ghost-button"
                      onClick={() => setPanel(panel === "class" ? null : "class")}
                      type="button"
                    >
                      Add a class
                    </button>
                    {/* The bulk path, beside the single-class one rather than
                        replacing it: a school opening one more JHS 2 in
                        January wants the form, and a school arriving with
                        fourteen year groups wants the planner. */}
                    <button
                      className="ghost-button"
                      onClick={() => setPanel("plan")}
                      type="button"
                    >
                      Set up classes
                    </button>
                  </div>
                </div>

                {panel === "class" && (
                  <AddClassForm
                    busy={busy}
                    onCancel={() => setPanel(null)}
                    onSubmit={async (group) => {
                      const saved = await send(
                        {
                          class: { ...group, academicYearId: activeYearId },
                          type: "create-class",
                        },
                        `${group.name} was added.`,
                      );
                      if (saved) setPanel(null);
                    }}
                    teachers={structure.teachers}
                  />
                )}

                {panel === "plan" && (
                  <ClassPlanner
                    busy={busy}
                    existingNames={classesThisYear.map((group) => group.name)}
                    onCancel={() => setPanel(null)}
                    onCreate={async (plan) => {
                      const saved = await send(
                        {
                          plan: { ...plan, academicYearId: activeYearId },
                          type: "create-classes",
                        },
                        `The classes for ${activeYear?.name ?? "this year"} were created.`,
                      );
                      if (saved) setPanel(null);
                    }}
                    yearName={activeYear?.name ?? "this year"}
                  />
                )}

                {classesThisYear.length === 0 ? (
                  <div className="panel-empty">
                    <p>
                      <strong>
                        No classes in {activeYear?.name} yet.
                      </strong>
                      Say which parts of the school you run and the classes are
                      created for you.
                    </p>
                    <button onClick={() => setPanel("plan")} type="button">
                      Set up classes
                    </button>
                  </div>
                ) : (
                  <>
                    <div
                      className="class-tabs"
                      role="tablist"
                      aria-label="Classes"
                    >
                      {classesThisYear.map((group) => (
                        <button
                          aria-selected={selectedClass?.id === group.id}
                          className={
                            selectedClass?.id === group.id ? "selected" : ""
                          }
                          key={group.id}
                          onClick={() => setSelectedClassId(group.id)}
                          role="tab"
                          type="button"
                        >
                          <span>{group.name}</span>
                          <small>
                            {group.learnerCount === 1
                              ? "1 learner"
                              : `${group.learnerCount} learners`}
                          </small>
                        </button>
                      ))}
                    </div>

                    {selectedClass && (
                      /* Keyed on the class so switching tab remounts the
                         detail with that class's own values. Resetting the
                         fields in an effect instead would render one class's
                         name over another class's detail for a frame. */
                      <ClassDetail
                        busy={busy}
                        classGroup={selectedClass}
                        key={selectedClass.id}
                        compulsory={compulsory}
                        onArchive={() =>
                          void send(
                            {
                              classGroupId: selectedClass.id,
                              type: "archive-class",
                            },
                            `${selectedClass.name} was archived. Its lessons and marks are kept.`,
                          )
                        }
                        onCloseOffering={(offeringId, subjectName) =>
                          void send(
                            { offeringId, type: "close-offering" },
                            `${subjectName} was removed from ${selectedClass.name}.`,
                          )
                        }
                        onSave={(group) =>
                          void send(
                            {
                              class: group,
                              classGroupId: selectedClass.id,
                              type: "update-class",
                            },
                            `${group.name} was updated.`,
                          )
                        }
                        onSetOffering={(subjectId, requirement, subjectName) =>
                          void send(
                            {
                              classGroupId: selectedClass.id,
                              requirement,
                              subjectId,
                              type: "set-offering",
                            },
                            `${subjectName} is now ${requirement} in ${selectedClass.name}.`,
                          )
                        }
                        onSetTeachers={(offering, teacherPersonIds) =>
                          void send(
                            {
                              offeringId: offering.id,
                              teacherPersonIds,
                              type: "set-offering-teachers",
                            },
                            teacherPersonIds.length === 0
                              ? `${offering.subjectName} has no teacher assigned.`
                              : `${offering.subjectName} is now taught by ${teacherPersonIds.length === 1 ? "one teacher" : `${teacherPersonIds.length} teachers`}.`,
                          ).then(() => setStaffingId(""))
                        }
                        onStaff={setStaffingId}
                        optional={optional}
                        staffingId={staffingId}
                        subjects={structure.subjects}
                        teachers={structure.teachers}
                        teachersByOffering={structure.teachersByOffering}
                        years={structure.years}
                      />
                    )}
                  </>
                )}

                <div className="policy-rule">
                  <span aria-hidden="true">i</span>
                  <p>
                    <strong>Class-first access rule:</strong> learners cannot
                    remove compulsory subjects. Moving class closes future
                    access while keeping all lesson, assessment and grade
                    history.
                  </p>
                </div>
              </section>

              <TeachingLoad
                classGroups={classesThisYear}
                offeringsByClassGroup={structure.offeringsByClassGroup}
                teachers={structure.teachers}
                teachersByOffering={structure.teachersByOffering}
              />

              {/* Standards belong beside classes and subjects: they are the
                  third thing a school sets up before anyone teaches, and the
                  only one that had no screen at all. */}
              <CurriculumPanel
                classGroups={classesThisYear}
                offeringsByClassGroup={structure.offeringsByClassGroup}
                subjectNameById={Object.fromEntries(
                  structure.subjects.map((subject) => [
                    subject.id,
                    subject.name,
                  ]),
                )}
              />
            </div>

            <aside className="subject-library" aria-labelledby="subjects-title">
              <div className="library-heading">
                <span aria-hidden="true">+</span>
                <div>
                  <p className="eyebrow">Subject library</p>
                  <h2 id="subjects-title">Subjects this school teaches</h2>
                </div>
              </div>
              <p className="library-intro">
                A subject is defined once for the whole school, then offered to
                the classes that take it.
              </p>

              <AddSubjectForm
                busy={busy}
                onSubmit={async (subject) =>
                  send(
                    { subject, type: "create-subject" },
                    `${subject.name} was added to the subject library.`,
                  )
                }
              />

              {structure.subjects.length === 0 ? (
                <p className="library-empty">
                  No subjects yet. The first one can be added above.
                </p>
              ) : (
                <ul className="subject-list">
                  {structure.subjects.map((subject) => (
                    <SubjectRow
                      busy={busy}
                      key={subject.id}
                      onSave={async (description) =>
                        send(
                          {
                            description,
                            subjectId: subject.id,
                            type: "update-subject",
                          },
                          `${subject.name} was updated.`,
                        )
                      }
                      onUploadCover={uploadCover}
                      subject={subject}
                    />
                  ))}
                </ul>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function ClassDetail({
  busy,
  classGroup,
  compulsory,
  onArchive,
  onCloseOffering,
  onSave,
  onSetOffering,
  onSetTeachers,
  onStaff,
  optional,
  staffingId,
  subjects,
  teachers,
  teachersByOffering,
  years,
}: {
  busy: boolean;
  classGroup: ClassGroup;
  compulsory: ClassOffering[];
  onArchive: () => void;
  onCloseOffering: (offeringId: string, subjectName: string) => void;
  onSave: (group: {
    academicYearId: string;
    classTeacherPersonId: string | null;
    level: string;
    name: string;
    room: string;
  }) => void;
  onSetOffering: (
    subjectId: string,
    requirement: SubjectRequirement,
    subjectName: string,
  ) => void;
  onSetTeachers: (offering: ClassOffering, teacherPersonIds: string[]) => void;
  onStaff: (offeringId: string) => void;
  optional: ClassOffering[];
  staffingId: string;
  subjects: Subject[];
  teachers: SchoolTeacher[];
  teachersByOffering: Record<string, string[]>;
  years: AcademicYear[];
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(classGroup.name);
  const [level, setLevel] = useState(classGroup.level);
  const [room, setRoom] = useState(classGroup.room);
  const [teacherId, setTeacherId] = useState(
    classGroup.classTeacherPersonId ?? "",
  );
  const [subjectId, setSubjectId] = useState("");
  const [requirement, setRequirement] =
    useState<SubjectRequirement>("compulsory");

  const teacherName =
    teachers.find((person) => person.id === classGroup.classTeacherPersonId)
      ?.name ?? null;
  const taken = new Set(
    [...compulsory, ...optional].map((item) => item.subjectId),
  );
  const available = subjects.filter((subject) => !taken.has(subject.id));

  return (
    <>
      <div className="class-summary">
        <div className="class-monogram" aria-hidden="true">
          {classGroup.name
            .split(" ")
            .slice(0, 2)
            .map((part) => part[0])
            .join("")}
        </div>
        <div>
          <p>{classGroup.level || "Level not set"}</p>
          <h3>{classGroup.name}</h3>
          <span>{classGroup.room || "Room not set"}</span>
        </div>
        <div className="teacher-assignment">
          <small>Class teacher</small>
          <strong className={teacherName ? undefined : "unassigned"}>
            {teacherName ?? "Not assigned"}
          </strong>
        </div>
        <button
          className="ghost-button"
          onClick={() => setEditing((current) => !current)}
          type="button"
        >
          {editing ? "Cancel" : "Edit class"}
        </button>
      </div>

      {editing && (
        <form
          className="class-edit-form"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            onSave({
              academicYearId: classGroup.academicYearId,
              classTeacherPersonId: teacherId || null,
              level,
              name,
              room,
            });
            setEditing(false);
          }}
        >
          <div className="inline-form-fields">
            <label>
              <span>Class name</span>
              <input
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </label>
            <label>
              <span>Level</span>
              <input
                onChange={(event) => setLevel(event.target.value)}
                placeholder="Junior High"
                value={level}
              />
            </label>
            <label>
              <span>Room</span>
              <input
                onChange={(event) => setRoom(event.target.value)}
                placeholder="Block A · Room 2"
                value={room}
              />
            </label>
            <label>
              <span>Class teacher</span>
              <select
                onChange={(event) => setTeacherId(event.target.value)}
                value={teacherId}
              >
                <option value="">Not assigned</option>
                {teachers.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-actions">
            <button disabled={busy} type="submit">
              Save changes
            </button>
            <button
              className="danger-button"
              disabled={busy}
              onClick={onArchive}
              type="button"
            >
              Archive this class
            </button>
          </div>
          <p className="form-hint">
            Archiving keeps every lesson, mark and report this class has
            produced. It only stops it being taught.
            {years.length > 1 && (
              <>
                {" "}
                This class belongs to{" "}
                {years.find((year) => year.id === classGroup.academicYearId)
                  ?.name ?? "an earlier year"}
                .
              </>
            )}
          </p>
        </form>
      )}

      <div className="subject-policy-grid">
        <OfferingColumn
          blurb="Automatically added for every learner in this class."
          busy={busy}
          editingId={staffingId}
          offerings={compulsory}
          onEdit={onStaff}
          onRemove={onCloseOffering}
          onSetTeachers={onSetTeachers}
          teachers={teachers}
          teachersByOffering={teachersByOffering}
          title="Compulsory subjects"
          tone="required"
        />
        <OfferingColumn
          blurb="Available through an approved learner selection."
          busy={busy}
          editingId={staffingId}
          offerings={optional}
          onEdit={onStaff}
          onRemove={onCloseOffering}
          onSetTeachers={onSetTeachers}
          teachers={teachers}
          teachersByOffering={teachersByOffering}
          title="Optional subjects"
          tone="optional"
        />
      </div>

      <form
        className="add-offering-form"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const subject = subjects.find((item) => item.id === subjectId);
          if (!subject) return;
          onSetOffering(subject.id, requirement, subject.name);
          setSubjectId("");
        }}
      >
        <label>
          <span>Add a subject to {classGroup.name}</span>
          <select
            onChange={(event) => setSubjectId(event.target.value)}
            value={subjectId}
          >
            <option value="">Choose a subject</option>
            {available.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.code} · {subject.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Requirement</span>
          <select
            onChange={(event) =>
              setRequirement(event.target.value as SubjectRequirement)
            }
            value={requirement}
          >
            <option value="compulsory">Compulsory</option>
            <option value="optional">Optional</option>
          </select>
        </label>
        <button disabled={busy || !subjectId} type="submit">
          Add subject
        </button>
        {available.length === 0 && subjects.length > 0 && (
          <p className="form-hint">
            Every subject in the library is already offered to this class.
          </p>
        )}
      </form>
    </>
  );
}

/**
 * The same assignments read the other way round.
 *
 * The class panel above answers "who teaches this subject". This answers "what
 * does this teacher hold", which is the question asked when someone joins,
 * leaves, or is quietly carrying nine periods more than everyone else.
 *
 * Read-only on purpose. Editing here would mean a second way to write the same
 * join, and two write paths to one table is how they drift — the row in the
 * class panel is where an assignment changes. What this is for is noticing.
 */
function TeachingLoad({
  classGroups,
  offeringsByClassGroup,
  teachers,
  teachersByOffering,
}: {
  classGroups: ClassGroup[];
  offeringsByClassGroup: Record<string, ClassOffering[]>;
  teachers: SchoolTeacher[];
  teachersByOffering: Record<string, string[]>;
}) {
  /* Only this year's classes, so a teacher is not credited with subjects from
     a year the school has closed. */
  const held = new Map<string, Array<{ className: string; subject: string }>>();
  for (const group of classGroups) {
    for (const offering of offeringsByClassGroup[group.id] ?? []) {
      if (offering.status !== "active") continue;
      for (const personId of teachersByOffering[offering.id] ?? []) {
        const list = held.get(personId) ?? [];
        list.push({ className: group.name, subject: offering.subjectName });
        held.set(personId, list);
      }
    }
  }

  const unstaffed = classGroups.flatMap((group) =>
    (offeringsByClassGroup[group.id] ?? []).filter(
      (offering) =>
        offering.status === "active" &&
        (teachersByOffering[offering.id] ?? []).length === 0,
    ),
  );

  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <div>
          <p className="eyebrow">Staffing</p>
          <h2>Who is teaching what</h2>
        </div>
        {unstaffed.length > 0 && (
          <span className="unstaffed-count">
            {unstaffed.length} without a teacher
          </span>
        )}
      </div>

      {teachers.length === 0 ? (
        <div className="panel-empty">
          <p>
            <strong>No teaching staff yet.</strong>
            Invite a teacher from <Link href="/admin/people?invite=1">People</Link>,
            then assign them a subject above.
          </p>
        </div>
      ) : (
        <ul className="teaching-load">
          {teachers.map((person) => {
            const load = held.get(person.id) ?? [];
            return (
              <li key={person.id}>
                <div>
                  <strong>{person.name}</strong>
                  <small>{humaniseRole(person.role)}</small>
                </div>
                {load.length === 0 ? (
                  <span className="load-none">No subjects assigned</span>
                ) : (
                  <span className="load-subjects">
                    {load.map((item, index) => (
                      <b key={`${item.className}-${item.subject}-${index}`}>
                        {item.subject}
                        <i>{item.className}</i>
                      </b>
                    ))}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ==========================================================================
   A subject on a class, and who teaches it

   These were name chips. They are rows now because a subject offering with
   nobody teaching it is the single most useful thing this screen can tell an
   administrator staffing a term, and a chip has nowhere to say it.

   The teacher list edits in place — pressing the names turns that one row
   into a picker and leaves every other row where it was, so the list does not
   reflow under the cursor.
   ========================================================================== */
function OfferingColumn({
  blurb,
  busy,
  editingId,
  offerings,
  onEdit,
  onRemove,
  onSetTeachers,
  teachers,
  teachersByOffering,
  title,
  tone,
}: {
  blurb: string;
  busy: boolean;
  editingId: string;
  offerings: ClassOffering[];
  onEdit: (offeringId: string) => void;
  onRemove: (offeringId: string, subjectName: string) => void;
  onSetTeachers: (offering: ClassOffering, teacherPersonIds: string[]) => void;
  teachers: SchoolTeacher[];
  teachersByOffering: Record<string, string[]>;
  title: string;
  tone: "optional" | "required";
}) {
  return (
    <div>
      <div className="policy-heading">
        <span className={`policy-icon ${tone}`}>
          {tone === "required" ? "✓" : "+"}
        </span>
        <div>
          <h3>{title}</h3>
          <p>{blurb}</p>
        </div>
        <strong>{offerings.length}</strong>
      </div>
      <div className="offering-rows">
        {offerings.map((offering) => {
          const assigned = teachersByOffering[offering.id] ?? [];
          const named = assigned
            .map((id) => teachers.find((person) => person.id === id)?.name)
            .filter(Boolean) as string[];

          return (
            <div className="offering-row" key={offering.id}>
              <b className="offering-code">{offering.subjectCode}</b>
              <span className="offering-name">{offering.subjectName}</span>

              {editingId === offering.id ? (
                <TeacherPicker
                  assigned={assigned}
                  busy={busy}
                  onCancel={() => onEdit("")}
                  onSave={(ids) => onSetTeachers(offering, ids)}
                  teachers={teachers}
                />
              ) : (
                <button
                  className={
                    named.length > 0
                      ? "offering-teachers"
                      : "offering-teachers is-empty"
                  }
                  disabled={busy}
                  onClick={() => onEdit(offering.id)}
                  type="button"
                >
                  {named.length > 0 ? named.join(", ") : "Assign a teacher"}
                </button>
              )}

              <button
                aria-label={`Remove ${offering.subjectName} from this class`}
                className="offering-remove"
                disabled={busy}
                onClick={() => onRemove(offering.id, offering.subjectName)}
                type="button"
              >
                ×
              </button>
            </div>
          );
        })}
        {offerings.length === 0 && (
          <p className="policy-empty">None set for this class.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Who teaches one subject.
 *
 * A list rather than a single choice, because co-teaching is ordinary — a
 * practical split between a specialist and a form tutor, or a subject handed
 * over mid-year with both names on it for a term.
 *
 * Held as local state and committed on Save so an administrator can tick
 * three people without three round trips, and can change their mind without
 * having written anything.
 */
function TeacherPicker({
  assigned,
  busy,
  onCancel,
  onSave,
  teachers,
}: {
  assigned: string[];
  busy: boolean;
  onCancel: () => void;
  onSave: (teacherPersonIds: string[]) => void;
  teachers: SchoolTeacher[];
}) {
  const [chosen, setChosen] = useState<string[]>(assigned);

  function toggle(id: string) {
    setChosen((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  return (
    <div className="teacher-picker">
      {teachers.length === 0 ? (
        <p className="form-hint">
          No staff yet. Invite a teacher from{" "}
          <Link href="/admin/people?invite=1">People</Link> first.
        </p>
      ) : (
        <>
          <div className="teacher-options">
            {teachers.map((person) => (
              <label key={person.id}>
                <input
                  checked={chosen.includes(person.id)}
                  onChange={() => toggle(person.id)}
                  type="checkbox"
                />
                <span>
                  <strong>{person.name}</strong>
                  <small>{humaniseRole(person.role)}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="teacher-picker-actions">
            <button disabled={busy} onClick={() => onSave(chosen)} type="button">
              Save
            </button>
            <button
              className="ghost-button"
              disabled={busy}
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function humaniseRole(role: string) {
  return role
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function AddYearForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (year: {
    endsOn: string;
    name: string;
    startsOn: string;
  }) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");

  return (
    <form
      className="admin-panel inline-form"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void onSubmit({ endsOn, name, startsOn });
      }}
    >
      <h2>Add an academic year</h2>
      <div className="inline-form-fields">
        <label>
          <span>Name</span>
          <input
            onChange={(event) => setName(event.target.value)}
            placeholder="2027 / 2028"
            required
            value={name}
          />
        </label>
        <label>
          <span>First day</span>
          <input
            onChange={(event) => setStartsOn(event.target.value)}
            required
            type="date"
            value={startsOn}
          />
        </label>
        <label>
          <span>Last day</span>
          <input
            onChange={(event) => setEndsOn(event.target.value)}
            required
            type="date"
            value={endsOn}
          />
        </label>
      </div>
      <div className="form-actions">
        <button disabled={busy} type="submit">
          Add year
        </button>
        <button className="ghost-button" onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
      <p className="form-hint">
        A new year is planned, not current — the school stays in the year it is
        in until you make the change deliberately.
      </p>
    </form>
  );
}

function AddClassForm({
  busy,
  onCancel,
  onSubmit,
  teachers,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (group: {
    classTeacherPersonId: string | null;
    level: string;
    name: string;
    room: string;
  }) => void | Promise<void>;
  teachers: Array<{ id: string; name: string }>;
}) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState("");
  const [room, setRoom] = useState("");
  const [teacherId, setTeacherId] = useState("");

  return (
    <form
      className="inline-form"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void onSubmit({
          classTeacherPersonId: teacherId || null,
          level,
          name,
          room,
        });
      }}
    >
      <div className="inline-form-fields">
        <label>
          <span>Class name</span>
          <input
            onChange={(event) => setName(event.target.value)}
            placeholder="JHS 1 Blue"
            required
            value={name}
          />
        </label>
        <label>
          <span>Level</span>
          <input
            onChange={(event) => setLevel(event.target.value)}
            placeholder="Junior High"
            value={level}
          />
        </label>
        <label>
          <span>Room</span>
          <input
            onChange={(event) => setRoom(event.target.value)}
            placeholder="Block A · Room 2"
            value={room}
          />
        </label>
        <label>
          <span>Class teacher</span>
          <select
            onChange={(event) => setTeacherId(event.target.value)}
            value={teacherId}
          >
            <option value="">Assign later</option>
            {teachers.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-actions">
        <button disabled={busy} type="submit">
          Add class
        </button>
        <button className="ghost-button" onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
}

function AddSubjectForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (subject: {
    code: string;
    name: string;
  }) => Promise<boolean>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  return (
    <form
      className="add-subject-form"
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        /* Cleared only on success, so a rejected code — a duplicate, or one
           too short — is still in the field to be corrected rather than
           retyped from nothing. */
        if (await onSubmit({ code, name })) {
          setCode("");
          setName("");
        }
      }}
    >
      <label>
        <span>Code</span>
        <input
          maxLength={6}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="MA"
          required
          value={code}
        />
      </label>
      <label>
        <span>Subject name</span>
        <input
          onChange={(event) => setName(event.target.value)}
          placeholder="Mathematics"
          required
          value={name}
        />
      </label>
      <button disabled={busy} type="submit">
        Add
      </button>
    </form>
  );
}

/* ==========================================================================
   Terms

   A grading period is what a mark belongs to. Every markbook query used to
   bind `period-2026-term1` — a row only the demo seed writes — so a real
   school's markbook read a term that did not exist, and a school reaching the
   end of Term 1 had nowhere to put Term 2's marks.

   One term is open at a time. That is the whole of the model a teacher needs
   to hold: marks go into the open one, and closing it is what a school does
   when the reports for it have gone out.
   ========================================================================== */
function TermsPanel({
  busy,
  onCreate,
  onSetStatus,
  periods,
  yearId,
  yearName,
}: {
  busy: boolean;
  onCreate: (period: {
    academicYearId: string;
    endsOn: string;
    name: string;
    startsOn: string;
  }) => Promise<void>;
  onSetStatus: (
    periodId: string,
    status: "open" | "closed" | "locked",
    name: string,
  ) => Promise<void>;
  periods: GradingPeriod[];
  yearId: string;
  yearName: string;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");

  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <div>
          <p className="eyebrow">{yearName}</p>
          <h2>Terms</h2>
        </div>
        <button
          className="ghost-button"
          disabled={busy}
          onClick={() => setAdding(!adding)}
          type="button"
        >
          {adding ? "Cancel" : "Add a term"}
        </button>
      </div>

      {periods.length === 0 ? (
        <p className="form-hint">
          No terms yet. The first markbook opened creates one covering the whole
          year; adding them here lets a school mark term by term instead.
        </p>
      ) : (
        <ul className="term-list">
          {periods.map((period) => (
            <li key={period.id}>
              <span>
                <strong>{period.name}</strong>
                <small>
                  {period.startsOn} to {period.endsOn}
                </small>
              </span>
              <span className={`term-state is-${period.status}`}>
                {period.status === "open"
                  ? "Open for marking"
                  : period.status === "closed"
                    ? "Closed"
                    : "Locked"}
              </span>
              <span className="term-actions">
                {period.status !== "open" ? (
                  <button
                    className="ghost-button"
                    disabled={busy}
                    onClick={() =>
                      void onSetStatus(period.id, "open", period.name)
                    }
                    type="button"
                  >
                    Open
                  </button>
                ) : (
                  <button
                    className="ghost-button"
                    disabled={busy}
                    onClick={() =>
                      void onSetStatus(period.id, "closed", period.name)
                    }
                    type="button"
                  >
                    Close
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form
          className="inline-form"
          onSubmit={async (event) => {
            event.preventDefault();
            await onCreate({
              academicYearId: yearId,
              endsOn,
              name,
              startsOn,
            });
            setAdding(false);
            setName("");
            setStartsOn("");
            setEndsOn("");
          }}
        >
          <div className="inline-form-fields">
            <label>
              <span>Name</span>
              <input
                onChange={(event) => setName(event.target.value)}
                placeholder="Term 2"
                required
                value={name}
              />
            </label>
            <label>
              <span>Starts</span>
              <input
                onChange={(event) => setStartsOn(event.target.value)}
                required
                type="date"
                value={startsOn}
              />
            </label>
            <label>
              <span>Ends</span>
              <input
                onChange={(event) => setEndsOn(event.target.value)}
                required
                type="date"
                value={endsOn}
              />
            </label>
          </div>
          <div className="form-actions">
            <button disabled={busy} type="submit">
              Add term
            </button>
          </div>
          <p className="form-hint">
            A new term starts with the grading scale the school last used, so
            changing the bands later cannot restate grades already issued.
          </p>
        </form>
      ) : null}
    </section>
  );
}

/* ==========================================================================
   A subject's own information

   The description column has existed since the table was written and was read
   by nothing — a school could describe a subject and no learner ever saw it.
   The cover is new: every subject card fell back to generated artwork because
   there was nowhere to put a photograph.

   Collapsed by default. The list is mostly scanned to check a subject exists,
   and opening every row into a form would bury that under editors nobody
   asked for.
   ========================================================================== */
function SubjectRow({
  busy,
  onSave,
  onUploadCover,
  subject,
}: {
  busy: boolean;
  onSave: (description: string) => Promise<boolean>;
  onUploadCover: (subjectId: string, file: File) => Promise<void>;
  subject: Subject;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState(subject.description);

  return (
    <li className="subject-row">
      <button
        aria-expanded={open}
        className="subject-row-head"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {subject.coverMediaAssetId ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            alt=""
            className="subject-row-cover"
            src={`/api/school/media?assetId=${encodeURIComponent(subject.coverMediaAssetId)}`}
          />
        ) : (
          <span className="subject-row-cover is-empty" aria-hidden="true" />
        )}
        <span className="subject-row-name">
          <b>{subject.code}</b>
          <span>{subject.name}</span>
        </span>
        <span className="subject-row-state">
          {subject.description ? "Described" : "No description"}
        </span>
      </button>

      {open ? (
        <div className="subject-row-editor">
          <label className="composer-field">
            <span>
              Description <em>what a learner sees on the subject card</em>
            </span>
            <textarea
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this subject covers this year, in a sentence or two."
              rows={3}
              value={description}
            />
          </label>

          <label className="subject-cover-picker">
            <input
              accept=".png,.jpg,.jpeg,.webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onUploadCover(subject.id, file);
              }}
              type="file"
            />
            <span>
              {subject.coverMediaAssetId ? "Replace the cover" : "Add a cover photograph"}
            </span>
          </label>

          <button
            className="academic-primary"
            disabled={busy}
            onClick={() => void onSave(description)}
            type="button"
          >
            Save description
          </button>
        </div>
      ) : null}
    </li>
  );
}
