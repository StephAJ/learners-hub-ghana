"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Loader2,
  Send,
} from "lucide-react";
import { admissionsConsentStatement } from "../../../domain/admissions/consent";
import {
  APPLICATION_STEPS,
  applicationCompletion,
  emptyApplicationDraft,
  validateApplication,
  validateApplicationStep,
  type ApplicationDraft,
  type ApplicationField,
  type ApplicationIssue,
  type ApplicationStepId,
} from "../../../domain/admissions/application-form";
import type { ApplicantApplication } from "../../../db/applicant-repository";

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "failed"; message: string };

const CLASS_OPTIONS = [
  "KG 1",
  "KG 2",
  "Primary 1",
  "Primary 2",
  "Primary 3",
  "Primary 4",
  "Primary 5",
  "Primary 6",
  "JHS 1",
  "JHS 2",
  "JHS 3",
];

const TERM_OPTIONS = [
  "Term 1 — September 2026",
  "Term 2 — January 2027",
  "Term 3 — April 2027",
];

const GENDER_OPTIONS = ["Female", "Male", "Prefer not to say"];

const RELATIONSHIP_OPTIONS = [
  "Mother",
  "Father",
  "Grandparent",
  "Aunt or uncle",
  "Legal guardian",
  "Other",
];

export function ApplicationForm({
  applicantEmail,
  initialApplication,
  schoolName,
}: {
  applicantEmail: string;
  initialApplication: ApplicantApplication | null;
  /* Named rather than assumed. The declaration used to read "Greenfield
     Academy" whichever school was taking the application. */
  schoolName: string;
}) {
  const [draft, setDraft] = useState<ApplicationDraft>(() =>
    initialApplication
      ? toDraftFields(initialApplication)
      : emptyApplicationDraft(),
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState(initialApplication?.status ?? "draft");
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [declared, setDeclared] = useState(false);
  /* Issues stay hidden until the guardian tries to leave a step. Marking a
     field red before they have reached it is nagging, not helping. */
  const [checkedSteps, setCheckedSteps] = useState<Set<ApplicationStepId>>(
    new Set(),
  );

  const step = APPLICATION_STEPS[stepIndex];
  const isSubmitted = status !== "draft";
  const completion = applicationCompletion(draft);
  const allIssues = validateApplication(draft);
  const stepIssues = validateApplicationStep(step.id, draft);
  const showIssues = checkedSteps.has(step.id);

  const update = useCallback((field: ApplicationField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  }, []);

  const save = useCallback(
    async (silent: boolean): Promise<boolean> => {
      if (!silent) setSaveState({ kind: "saving" });
      try {
        const response = await fetch("/api/admissions/application", {
          body: JSON.stringify({ ...draft, action: "save" }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "The draft could not be saved.");
        }
        setSaveState({ at: Date.now(), kind: "saved" });
        return true;
      } catch (error) {
        setSaveState({
          kind: "failed",
          message:
            error instanceof Error
              ? error.message
              : "The draft could not be saved.",
        });
        return false;
      }
    },
    [draft],
  );

  /* Autosave once the guardian pauses. Navigation between steps stays instant
     and local — a form that waits on the network to turn a page is a form
     people abandon on a slow connection — and this quietly catches up behind
     them. */
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (isSubmitted) return;
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      return;
    }
    const timer = window.setTimeout(() => void save(true), 1600);
    return () => window.clearTimeout(timer);
  }, [draft, isSubmitted, save]);

  function goTo(index: number) {
    setStepIndex(Math.min(APPLICATION_STEPS.length - 1, Math.max(0, index)));
    window.scrollTo({ behavior: "smooth", top: 0 });
  }

  function next() {
    setCheckedSteps((current) => new Set(current).add(step.id));
    if (stepIssues.length > 0) return;
    goTo(stepIndex + 1);
  }

  async function submit() {
    setCheckedSteps(new Set(APPLICATION_STEPS.map((item) => item.id)));
    if (allIssues.length > 0 || !declared) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const response = await fetch("/api/admissions/application", {
        body: JSON.stringify({ ...draft, action: "submit" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        application?: ApplicantApplication;
        error?: string;
      };
      if (!response.ok || !payload.application) {
        throw new Error(payload.error ?? "The application could not be sent.");
      }
      setStatus(payload.application.status);
      window.scrollTo({ behavior: "smooth", top: 0 });
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "The application could not be sent.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (isSubmitted) {
    return <SubmittedPanel email={applicantEmail} status={status} />;
  }

  return (
    <div className="apply">
      <StepRail
        checked={checkedSteps}
        completion={completion}
        current={stepIndex}
        draft={draft}
        onSelect={goTo}
      />

      <div className="apply-panel">
        <header className="apply-panel-head">
          <p className="apply-eyebrow">
            Step {stepIndex + 1} of {APPLICATION_STEPS.length}
          </p>
          <h1>{step.title}</h1>
          <p>{step.description}</p>
        </header>

        {showIssues && stepIssues.length > 0 ? (
          <div className="apply-issues" role="alert">
            <CircleAlert aria-hidden="true" size={17} />
            <div>
              <strong>
                {stepIssues.length === 1
                  ? "One thing needs your attention"
                  : `${stepIssues.length} things need your attention`}
              </strong>
              <ul>
                {stepIssues.map((issue) => (
                  <li key={issue.field}>{issue.message}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {step.id === "learner" ? (
          <LearnerStep draft={draft} issues={showIssues ? stepIssues : []} update={update} />
        ) : null}
        {step.id === "schooling" ? (
          <SchoolingStep draft={draft} issues={showIssues ? stepIssues : []} update={update} />
        ) : null}
        {step.id === "guardian" ? (
          <GuardianStep draft={draft} issues={showIssues ? stepIssues : []} update={update} />
        ) : null}
        {step.id === "wellbeing" ? (
          <WellbeingStep draft={draft} issues={showIssues ? stepIssues : []} update={update} />
        ) : null}
        {step.id === "review" ? (
          <ReviewStep
            declared={declared}
            draft={draft}
            email={applicantEmail}
            issues={allIssues}
            onDeclare={setDeclared}
            schoolName={schoolName}
            onEdit={(target) =>
              goTo(APPLICATION_STEPS.findIndex((item) => item.id === target))
            }
            submitError={submitError}
          />
        ) : null}

        <footer className="apply-actions">
          <div className="apply-actions-left">
            {stepIndex > 0 ? (
              <button
                className="apply-button apply-button-quiet"
                onClick={() => goTo(stepIndex - 1)}
                type="button"
              >
                <ArrowLeft aria-hidden="true" size={16} />
                Back
              </button>
            ) : (
              <Link className="apply-button apply-button-quiet" href="/admissions">
                <ArrowLeft aria-hidden="true" size={16} />
                Admissions
              </Link>
            )}
            <SaveIndicator onRetry={() => void save(false)} state={saveState} />
          </div>

          <div className="apply-actions-right">
            <button
              className="apply-button apply-button-ghost"
              disabled={saveState.kind === "saving"}
              onClick={() => void save(false)}
              type="button"
            >
              Save and finish later
            </button>
            {step.id === "review" ? (
              <button
                className="apply-button apply-button-solid"
                disabled={submitting || !declared || allIssues.length > 0}
                onClick={() => void submit()}
                type="button"
              >
                {submitting ? (
                  <Loader2 aria-hidden="true" className="apply-spin" size={16} />
                ) : (
                  <Send aria-hidden="true" size={16} />
                )}
                {submitting ? "Sending…" : "Submit application"}
              </button>
            ) : (
              <button
                className="apply-button apply-button-solid"
                onClick={next}
                type="button"
              >
                Continue
                <ArrowRight aria-hidden="true" size={16} />
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

/* -- Step rail ------------------------------------------------------------ */

function StepRail({
  checked,
  completion,
  current,
  draft,
  onSelect,
}: {
  checked: Set<ApplicationStepId>;
  completion: number;
  current: number;
  draft: ApplicationDraft;
  onSelect: (index: number) => void;
}) {
  return (
    <aside className="apply-rail" aria-label="Application progress">
      <div className="apply-progress">
        <div className="apply-progress-head">
          <span>Required fields</span>
          <strong>{completion}%</strong>
        </div>
        <span className="apply-progress-track" aria-hidden="true">
          <i style={{ width: `${completion}%` }} />
        </span>
      </div>

      <ol className="apply-steps">
        {APPLICATION_STEPS.map((step, index) => {
          const issues = validateApplicationStep(step.id, draft);
          const isDone = issues.length === 0 && index < current;
          const hasProblem = checked.has(step.id) && issues.length > 0;
          return (
            <li key={step.id}>
              <button
                aria-current={index === current ? "step" : undefined}
                className={[
                  "apply-step",
                  index === current ? "is-current" : "",
                  isDone ? "is-done" : "",
                  hasProblem ? "has-problem" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onSelect(index)}
                type="button"
              >
                <span className="apply-step-mark" aria-hidden="true">
                  {hasProblem ? (
                    <CircleAlert size={14} />
                  ) : isDone ? (
                    <Check size={14} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="apply-step-copy">
                  <strong>{step.title}</strong>
                  <small>{step.description}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

function SaveIndicator({
  onRetry,
  state,
}: {
  onRetry: () => void;
  state: SaveState;
}) {
  if (state.kind === "idle") return null;
  if (state.kind === "saving") {
    return (
      <span className="apply-save is-busy">
        <Loader2 aria-hidden="true" className="apply-spin" size={14} />
        Saving…
      </span>
    );
  }
  if (state.kind === "saved") {
    return (
      <span className="apply-save is-saved" role="status">
        <Check aria-hidden="true" size={14} />
        Draft saved
      </span>
    );
  }
  return (
    <span className="apply-save is-failed" role="status">
      <CircleAlert aria-hidden="true" size={14} />
      {state.message}
      <button onClick={onRetry} type="button">
        Try again
      </button>
    </span>
  );
}

/* -- Steps ---------------------------------------------------------------- */

type StepProps = {
  draft: ApplicationDraft;
  issues: ApplicationIssue[];
  update: (field: ApplicationField, value: string) => void;
};

function LearnerStep({ draft, issues, update }: StepProps) {
  return (
    <div className="apply-grid">
      <Field field="applicantFirstName" issues={issues} label="First name" required {...{ draft, update }} />
      <Field field="applicantMiddleName" issues={issues} label="Middle name" {...{ draft, update }} />
      <Field field="applicantLastName" issues={issues} label="Last name" required {...{ draft, update }} />
      <Field
        field="dateOfBirth"
        issues={issues}
        label="Date of birth"
        required
        type="date"
        {...{ draft, update }}
      />
      <SelectField
        field="gender"
        issues={issues}
        label="Gender"
        options={GENDER_OPTIONS}
        required
        {...{ draft, update }}
      />
      <Field field="nationality" issues={issues} label="Nationality" placeholder="Ghanaian" {...{ draft, update }} />
      <Field field="placeOfBirth" issues={issues} label="Place of birth" placeholder="Accra" {...{ draft, update }} />
      <TextareaField
        field="homeAddress"
        hint="Where the learner lives, including the town or district."
        issues={issues}
        label="Home address"
        required
        wide
        {...{ draft, update }}
      />
    </div>
  );
}

function SchoolingStep({ draft, issues, update }: StepProps) {
  return (
    <div className="apply-grid">
      <SelectField
        field="desiredClass"
        issues={issues}
        label="Class applying for"
        options={CLASS_OPTIONS}
        required
        {...{ draft, update }}
      />
      <SelectField
        field="entryTerm"
        issues={issues}
        label="Term they would start"
        options={TERM_OPTIONS}
        required
        {...{ draft, update }}
      />
      <Field
        field="previousSchool"
        hint="Leave blank if this is their first school."
        issues={issues}
        label="Previous school"
        {...{ draft, update }}
      />
      <Field
        field="previousSchoolLocation"
        issues={issues}
        label="Town or district of that school"
        {...{ draft, update }}
      />
      <Field
        field="lastClassCompleted"
        issues={issues}
        label="Last class completed"
        placeholder="Primary 6"
        {...{ draft, update }}
      />
      <TextareaField
        field="reasonForLeaving"
        hint="A relocation, a change of stage, or anything else you would like us to know."
        issues={issues}
        label="Reason for leaving"
        wide
        {...{ draft, update }}
      />
    </div>
  );
}

function GuardianStep({ draft, issues, update }: StepProps) {
  return (
    <>
      <div className="apply-grid">
        <Field field="guardianName" issues={issues} label="Full name" required {...{ draft, update }} />
        <SelectField
          field="guardianRelationship"
          issues={issues}
          label="Relationship to the learner"
          options={RELATIONSHIP_OPTIONS}
          required
          {...{ draft, update }}
        />
        <Field
          field="guardianEmail"
          hint="Every update about this application goes here."
          issues={issues}
          label="Email address"
          required
          type="email"
          {...{ draft, update }}
        />
        <Field
          field="guardianPhone"
          issues={issues}
          label="Phone number"
          placeholder="+233 20 000 0000"
          required
          type="tel"
          {...{ draft, update }}
        />
        <Field field="guardianOccupation" issues={issues} label="Occupation" {...{ draft, update }} />
        <TextareaField
          field="guardianAddress"
          hint="Only if it differs from the learner's."
          issues={issues}
          label="Postal address"
          wide
          {...{ draft, update }}
        />
      </div>

      <fieldset className="apply-subsection">
        <legend>Second parent or guardian</legend>
        <p>Optional, but useful when the first contact cannot be reached.</p>
        <div className="apply-grid">
          <Field field="secondGuardianName" issues={issues} label="Full name" {...{ draft, update }} />
          <Field
            field="secondGuardianPhone"
            issues={issues}
            label="Phone number"
            type="tel"
            {...{ draft, update }}
          />
        </div>
      </fieldset>
    </>
  );
}

function WellbeingStep({ draft, issues, update }: StepProps) {
  return (
    <>
      <fieldset className="apply-subsection">
        <legend>Emergency contact</legend>
        <p>
          Someone we can reach if a parent or guardian cannot be, so it needs to
          be a different number.
        </p>
        <div className="apply-grid">
          <Field field="emergencyName" issues={issues} label="Full name" required {...{ draft, update }} />
          <Field
            field="emergencyRelationship"
            issues={issues}
            label="Relationship to the learner"
            {...{ draft, update }}
          />
          <Field
            field="emergencyPhone"
            issues={issues}
            label="Phone number"
            required
            type="tel"
            {...{ draft, update }}
          />
        </div>
      </fieldset>

      <fieldset className="apply-subsection">
        <legend>Health</legend>
        <p>
          Read only by the school nurse and the learner&apos;s class teacher.
          Leave anything that does not apply blank.
        </p>
        <div className="apply-grid">
          <TextareaField
            field="allergies"
            issues={issues}
            label="Allergies"
            placeholder="Foods, medicines, insect stings…"
            wide
            {...{ draft, update }}
          />
          <TextareaField
            field="medicalConditions"
            issues={issues}
            label="Medical conditions"
            placeholder="Asthma, sickle cell, epilepsy…"
            wide
            {...{ draft, update }}
          />
          <TextareaField
            field="medications"
            issues={issues}
            label="Regular medication"
            hint="Including anything kept at school."
            wide
            {...{ draft, update }}
          />
        </div>
      </fieldset>

      <fieldset className="apply-subsection">
        <legend>Learning support</legend>
        <p>
          Anything that helps a teacher understand how this learner learns best.
        </p>
        <TextareaField
          field="supportNeeds"
          issues={issues}
          label="Support needs or context"
          placeholder="Reading support, a diagnosis, a recent bereavement — whatever you would want their teacher to know in week one."
          wide
          {...{ draft, update }}
        />
      </fieldset>
    </>
  );
}

/* -- Review --------------------------------------------------------------- */

function ReviewStep({
  declared,
  draft,
  email,
  issues,
  onDeclare,
  onEdit,
  schoolName,
  submitError,
}: {
  declared: boolean;
  draft: ApplicationDraft;
  email: string;
  issues: ApplicationIssue[];
  onDeclare: (value: boolean) => void;
  onEdit: (step: ApplicationStepId) => void;
  schoolName: string;
  submitError: string;
}) {
  const sections: Array<{
    rows: Array<[string, string]>;
    step: ApplicationStepId;
    title: string;
  }> = [
    {
      rows: [
        [
          "Name",
          [draft.applicantFirstName, draft.applicantMiddleName, draft.applicantLastName]
            .filter(Boolean)
            .join(" "),
        ],
        ["Date of birth", draft.dateOfBirth],
        ["Gender", draft.gender],
        ["Nationality", draft.nationality],
        ["Place of birth", draft.placeOfBirth],
        ["Home address", draft.homeAddress],
      ],
      step: "learner",
      title: "Learner",
    },
    {
      rows: [
        ["Class applying for", draft.desiredClass],
        ["Starting", draft.entryTerm],
        ["Previous school", draft.previousSchool],
        ["Town or district", draft.previousSchoolLocation],
        ["Last class completed", draft.lastClassCompleted],
        ["Reason for leaving", draft.reasonForLeaving],
      ],
      step: "schooling",
      title: "Schooling",
    },
    {
      rows: [
        ["Name", draft.guardianName],
        ["Relationship", draft.guardianRelationship],
        ["Email", draft.guardianEmail],
        ["Phone", draft.guardianPhone],
        ["Occupation", draft.guardianOccupation],
        ["Postal address", draft.guardianAddress],
        ["Second contact", draft.secondGuardianName],
        ["Second phone", draft.secondGuardianPhone],
      ],
      step: "guardian",
      title: "Parent or guardian",
    },
    {
      rows: [
        ["Emergency contact", draft.emergencyName],
        ["Relationship", draft.emergencyRelationship],
        ["Emergency phone", draft.emergencyPhone],
        ["Allergies", draft.allergies],
        ["Medical conditions", draft.medicalConditions],
        ["Regular medication", draft.medications],
        ["Support needs", draft.supportNeeds],
      ],
      step: "wellbeing",
      title: "Health and support",
    },
  ];

  return (
    <div className="apply-review">
      {issues.length > 0 ? (
        <div className="apply-issues" role="alert">
          <CircleAlert aria-hidden="true" size={17} />
          <div>
            <strong>Not quite ready to send</strong>
            <ul>
              {issues.map((issue) => (
                <li key={issue.field}>{issue.message}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="apply-review-lead">
          Everything below is what the school will receive. Check it, then agree
          to the declaration and send it.
        </p>
      )}

      {sections.map((section) => (
        <section className="apply-review-section" key={section.step}>
          <header>
            <h2>{section.title}</h2>
            <button onClick={() => onEdit(section.step)} type="button">
              Edit
            </button>
          </header>
          <dl>
            {section.rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className={value.trim() ? undefined : "is-blank"}>
                  {value.trim() || "Not given"}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <label className="apply-declaration">
        <input
          checked={declared}
          onChange={(event) => onDeclare(event.target.checked)}
          type="checkbox"
        />
        {/* The sentence itself comes from the domain, versioned, so what is
            shown here and what is stored against the application are the same
            words. It used to name Greenfield Academy in the markup. */}
        <span>
          <strong>I confirm this is accurate</strong>
          {admissionsConsentStatement(schoolName)} We will email a copy to{" "}
          <strong>{email}</strong>.
        </span>
      </label>

      {submitError ? (
        <p className="apply-submit-error" role="alert">
          {submitError}
        </p>
      ) : null}
    </div>
  );
}

function SubmittedPanel({
  email,
  status,
}: {
  email: string;
  status: ApplicantApplication["status"];
}) {
  return (
    <div className="apply-done">
      <span className="apply-done-mark" aria-hidden="true">
        <Check size={26} />
      </span>
      <h1>Your application is with the school</h1>
      <p>
        We have emailed a confirmation to <strong>{email}</strong>. Nothing
        further is needed from you today — the admissions office reads every
        application in the order it arrives.
      </p>
      <p className="apply-done-status">
        Current status: <strong>{humaniseStatus(status)}</strong>
      </p>
      <div className="apply-done-actions">
        <Link className="apply-button apply-button-solid" href="/applicant">
          Go to my applicant account
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
        <Link className="apply-button apply-button-ghost" href="/">
          Back to the school home page
        </Link>
      </div>
    </div>
  );
}

/* -- Fields --------------------------------------------------------------- */

type FieldProps = StepProps & {
  field: ApplicationField;
  hint?: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  wide?: boolean;
};

function issueFor(issues: ApplicationIssue[], field: ApplicationField) {
  return issues.find((issue) => issue.field === field);
}

function Field({
  draft,
  field,
  hint,
  issues,
  label,
  placeholder,
  required,
  type = "text",
  update,
}: FieldProps & { type?: "date" | "email" | "tel" | "text" }) {
  const issue = issueFor(issues, field);
  return (
    <label className={`apply-field${issue ? " has-issue" : ""}`}>
      <span className="apply-label">
        {label}
        {required ? <i aria-hidden="true">*</i> : null}
      </span>
      <input
        aria-invalid={issue ? true : undefined}
        onChange={(event) => update(field, event.target.value)}
        placeholder={placeholder}
        type={type}
        value={draft[field]}
      />
      {issue ? (
        <small className="apply-field-issue">{issue.message}</small>
      ) : hint ? (
        <small>{hint}</small>
      ) : null}
    </label>
  );
}

function SelectField({
  draft,
  field,
  hint,
  issues,
  label,
  options,
  required,
  update,
}: FieldProps & { options: string[] }) {
  const issue = issueFor(issues, field);
  return (
    <label className={`apply-field${issue ? " has-issue" : ""}`}>
      <span className="apply-label">
        {label}
        {required ? <i aria-hidden="true">*</i> : null}
      </span>
      <select
        aria-invalid={issue ? true : undefined}
        onChange={(event) => update(field, event.target.value)}
        value={draft[field]}
      >
        <option value="">Please choose</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {issue ? (
        <small className="apply-field-issue">{issue.message}</small>
      ) : hint ? (
        <small>{hint}</small>
      ) : null}
    </label>
  );
}

function TextareaField({
  draft,
  field,
  hint,
  issues,
  label,
  placeholder,
  required,
  update,
  wide,
}: FieldProps) {
  const issue = issueFor(issues, field);
  return (
    <label
      className={`apply-field${wide ? " is-wide" : ""}${issue ? " has-issue" : ""}`}
    >
      <span className="apply-label">
        {label}
        {required ? <i aria-hidden="true">*</i> : null}
      </span>
      <textarea
        aria-invalid={issue ? true : undefined}
        onChange={(event) => update(field, event.target.value)}
        placeholder={placeholder}
        value={draft[field]}
      />
      {issue ? (
        <small className="apply-field-issue">{issue.message}</small>
      ) : hint ? (
        <small>{hint}</small>
      ) : null}
    </label>
  );
}

function toDraftFields(application: ApplicantApplication): ApplicationDraft {
  const draft = emptyApplicationDraft();
  for (const key of Object.keys(draft) as ApplicationField[]) {
    draft[key] = application[key] ?? "";
  }
  return draft;
}

function humaniseStatus(status: ApplicantApplication["status"]): string {
  return status
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
