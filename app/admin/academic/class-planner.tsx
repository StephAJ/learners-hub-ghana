"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  MAX_STREAMS_PER_YEAR_GROUP,
  SCHOOL_STAGES,
  STREAM_NAMINGS,
  planClasses,
  reconcilePlan,
  type ClassPlanCommand,
  type PlannedClass,
  type StageId,
  type StreamNaming,
} from "../../../domain/academic/school-shape";
import { SchoolStructureError } from "../../../domain/academic/structure";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LayersIcon,
  SchoolIcon,
  UsersIcon,
} from "../../components/icons";
import "../../teacher/assessments/composer-shell.css";
import "./class-planner.css";

/* ==========================================================================
   Setting up a school's classes

   A school arriving on the product has between two and seventeen year groups
   and no classes. Adding them one at a time is a four-field form per class,
   and that is the point at which setting the product up stops being worth it.

   Three questions instead, one per screen, because the alternative — a single
   page with a stage picker, seventeen counters and a naming choice on it — is
   the wall this is meant to replace:

     1. Which parts of the school exist.
     2. How many classes each of their year groups runs.
     3. What the split classes are called, over a preview of the result.

   The preview is built by the same planClasses() the server plans with, so
   the list on screen is the list that gets written rather than a second
   implementation of the naming rules that will drift from it.
   ========================================================================== */

const STAGE_HUES: Record<StageId, string> = {
  "pre-school": "rose",
  kindergarten: "amber",
  primary: "lime",
  "junior-high": "teal",
  "senior-high": "blue",
};

type Step = 1 | 2 | 3;

export function ClassPlanner({
  busy,
  existingNames,
  onCancel,
  onCreate,
  yearName,
}: {
  busy: boolean;
  /** Class names already in the year being planned into. */
  existingNames: string[];
  onCancel: () => void;
  onCreate: (plan: Omit<ClassPlanCommand, "academicYearId">) => void;
  yearName: string;
}) {
  const [step, setStep] = useState<Step>(1);
  const [stages, setStages] = useState<StageId[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [naming, setNaming] = useState<StreamNaming>("letters");

  const chosenStages = SCHOOL_STAGES.filter((stage) =>
    stages.includes(stage.id),
  );

  /* The plan is recomputed from the same pure function the repository uses.
     It throws for a plan that is not yet valid — nothing chosen, a count out
     of range — which on this screen is not an error to report but a "Next"
     button that is not ready yet. */
  const preview = useMemo(() => {
    try {
      const planned = planClasses({
        /* Any non-blank value: the real year is attached server-side, and
           planClasses only checks that one was named. */
        academicYearId: "preview",
        streamCounts: counts,
        streamNaming: naming,
      });
      return { ...reconcilePlan(planned, existingNames), planned };
    } catch (error) {
      return {
        create: [] as PlannedClass[],
        planned: [] as PlannedClass[],
        problem:
          error instanceof SchoolStructureError ? error.message : undefined,
        skip: [] as PlannedClass[],
      };
    }
  }, [counts, existingNames, naming]);

  function toggleStage(stage: (typeof SCHOOL_STAGES)[number]) {
    /* Read once, before either setter, so both agree on which direction this
       toggle is going rather than one of them re-deriving it from state the
       other has already queued a change to. */
    const removing = stages.includes(stage.id);

    setStages((current) =>
      removing
        ? current.filter((id) => id !== stage.id)
        : [...current, stage.id],
    );

    /* Selecting a stage opts its year groups in at one class each, which is
       the answer for most of them — the second step is then a matter of
       raising the two or three that are split rather than filling in a
       column of ones. Deselecting clears them again so a stage turned off by
       mistake does not leave its classes in the plan. */
    setCounts((current) => {
      const next = { ...current };
      for (const yearGroup of stage.yearGroups) {
        if (removing) delete next[yearGroup];
        else next[yearGroup] = 1;
      }
      return next;
    });
  }

  function setCount(yearGroup: string, value: number) {
    const clamped = Math.max(0, Math.min(MAX_STREAMS_PER_YEAR_GROUP, value));
    setCounts((current) => ({ ...current, [yearGroup]: clamped }));
  }

  const splitYearGroups = Object.entries(counts).filter(
    ([, count]) => count > 1,
  ).length;

  return (
    <div className="composer-scrim" role="dialog" aria-modal="true">
      <div className="composer composer-wide class-planner">
        <header className="composer-head">
          <div>
            <p className="composer-eyebrow">{yearName}</p>
            <h2>{STEP_TITLES[step]}</h2>
          </div>
          <button
            aria-label="Close"
            className="composer-close"
            onClick={onCancel}
            type="button"
          >
            ✕
          </button>
        </header>

        {/* Three dots rather than "Step 2 of 3" in words: the count is the
            reassurance being offered — that this is short — and it reads
            faster as a shape than as a sentence. */}
        <ol className="planner-steps" aria-label="Progress">
          {([1, 2, 3] as const).map((index) => (
            <li
              aria-current={index === step ? "step" : undefined}
              className={
                index === step ? "is-current" : index < step ? "is-done" : undefined
              }
              key={index}
            >
              <span aria-hidden="true">
                {index < step ? <CheckIcon size={13} /> : index}
              </span>
              {STEP_LABELS[index]}
            </li>
          ))}
        </ol>

        <div className="composer-body">
          {step === 1 && (
            <StagePicker
              chosen={stages}
              onToggle={toggleStage}
            />
          )}

          {step === 2 && (
            <div className="planner-counts">
              <p className="planner-lede">
                One class each unless you say otherwise. Raise the number for a
                year group large enough to be split.
              </p>
              {chosenStages.map((stage) => (
                <section key={stage.id}>
                  <h3>
                    <span
                      className="planner-stage-dot"
                      data-hue={STAGE_HUES[stage.id]}
                      aria-hidden="true"
                    />
                    {stage.label}
                  </h3>
                  <ul>
                    {stage.yearGroups.map((yearGroup) => {
                      const count = counts[yearGroup] ?? 0;
                      return (
                        <li key={yearGroup}>
                          <span className="planner-year-name">{yearGroup}</span>
                          <span className="planner-stepper">
                            <button
                              aria-label={`One fewer ${yearGroup} class`}
                              disabled={count === 0}
                              onClick={() => setCount(yearGroup, count - 1)}
                              type="button"
                            >
                              −
                            </button>
                            <b aria-live="polite">{count}</b>
                            <button
                              aria-label={`One more ${yearGroup} class`}
                              disabled={count >= MAX_STREAMS_PER_YEAR_GROUP}
                              onClick={() => setCount(yearGroup, count + 1)}
                              type="button"
                            >
                              +
                            </button>
                          </span>
                          <small>
                            {count === 0
                              ? "Not taught"
                              : count === 1
                                ? "One class"
                                : `${count} classes`}
                          </small>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="planner-review">
              {/* Only asked when it changes something. A school with no split
                  year group has no streams to name, and offering the choice
                  anyway is a question with no consequence. */}
              {splitYearGroups > 0 ? (
                <fieldset className="planner-naming">
                  <legend>
                    How should split year groups be told apart?
                  </legend>
                  <div>
                    {STREAM_NAMINGS.map((option) => (
                      <label
                        className={naming === option.id ? "is-chosen" : undefined}
                        key={option.id}
                      >
                        <input
                          checked={naming === option.id}
                          name="stream-naming"
                          onChange={() => setNaming(option.id)}
                          type="radio"
                          value={option.id}
                        />
                        <strong>{option.label}</strong>
                        <small>{option.example}</small>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              <div className="planner-preview">
                <p className="planner-lede">
                  {preview.create.length === 0
                    ? "Every class in this plan already exists."
                    : `${preview.create.length} ${
                        preview.create.length === 1 ? "class" : "classes"
                      } will be created in ${yearName}.`}
                  {preview.skip.length > 0 &&
                    ` ${preview.skip.length} already ${
                      preview.skip.length === 1 ? "exists" : "exist"
                    } and will be left alone.`}
                </p>
                <ul>
                  {preview.planned.map((item) => {
                    const exists = preview.skip.includes(item);
                    return (
                      <li
                        className={exists ? "is-existing" : undefined}
                        key={item.name}
                      >
                        {item.name}
                        {exists ? <small>already there</small> : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
        </div>

        <footer className="composer-foot">
          {step === 1 ? (
            <p className="composer-hint">
              You can add a stage later without redoing this.
            </p>
          ) : (
            <button
              className="composer-quiet"
              onClick={() => setStep((step - 1) as Step)}
              type="button"
            >
              <ChevronLeftIcon size={16} />
              Back
            </button>
          )}

          <div className="composer-actions">
            <button className="composer-quiet" onClick={onCancel} type="button">
              Cancel
            </button>
            {step < 3 ? (
              <button
                className="composer-primary"
                disabled={step === 1 ? stages.length === 0 : preview.planned.length === 0}
                onClick={() => setStep((step + 1) as Step)}
                type="button"
              >
                Next
                <ChevronRightIcon size={16} />
              </button>
            ) : (
              <button
                className="composer-primary"
                disabled={busy || preview.create.length === 0}
                onClick={() =>
                  onCreate({ streamCounts: counts, streamNaming: naming })
                }
                type="button"
              >
                {busy
                  ? "Creating…"
                  : `Create ${preview.create.length} ${
                      preview.create.length === 1 ? "class" : "classes"
                    }`}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

const STEP_TITLES: Record<Step, string> = {
  1: "Which parts of the school do you run?",
  2: "How many classes in each year?",
  3: "Check the classes before they are created",
};

const STEP_LABELS: Record<Step, string> = {
  1: "School",
  2: "Classes",
  3: "Review",
};

const STAGE_ICONS: Record<StageId, (props: { size?: number }) => ReactNode> = {
  "pre-school": UsersIcon,
  kindergarten: UsersIcon,
  primary: SchoolIcon,
  "junior-high": LayersIcon,
  "senior-high": LayersIcon,
};

function StagePicker({
  chosen,
  onToggle,
}: {
  chosen: StageId[];
  onToggle: (stage: (typeof SCHOOL_STAGES)[number]) => void;
}) {
  return (
    <div className="planner-stages">
      <p className="planner-lede">
        Pick every stage this school teaches. Most schools run a run of them —
        pre-school through primary, or kindergarten through JHS.
      </p>
      <ul>
        {SCHOOL_STAGES.map((stage) => {
          const Icon = STAGE_ICONS[stage.id];
          const selected = chosen.includes(stage.id);
          return (
            <li key={stage.id}>
              <button
                aria-pressed={selected}
                className={selected ? "is-chosen" : undefined}
                data-hue={STAGE_HUES[stage.id]}
                onClick={() => onToggle(stage)}
                type="button"
              >
                <span className="planner-stage-glyph" aria-hidden="true">
                  <Icon size={20} />
                </span>
                <span className="planner-stage-copy">
                  <strong>{stage.label}</strong>
                  <small>{stage.blurb}</small>
                </span>
                <span className="planner-stage-check" aria-hidden="true">
                  {selected ? <CheckIcon size={16} /> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
