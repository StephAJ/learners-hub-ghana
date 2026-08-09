"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AcademicYear,
  AdmissionIntake,
} from "../../../domain/academic/structure";
import type { ApplicantApplication } from "../../../db/applicant-repository";
import {
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  FileTextIcon,
  InboxIcon,
  UsersIcon,
} from "../../components/icons";
import "../academic/academic.css";
import "./admissions.css";

/* ==========================================================================
   Admissions

   Two things happen on this screen, and until now only one of them existed.

   Reviewing applications worked: the queue below reads real records and its
   status changes persist. What it was drawn over was fixture data — a set of
   invented applicants from domain/admissions/fixtures.ts that the real ones
   were merged on top of, so an empty queue looked busy and every count on
   the page was a literal typed into the markup.

   Opening and closing admissions did not exist at all. The intake was
   `const CURRENT_INTAKE_ID = "2026-2027"` in db/applicant-repository.ts —
   the school's own home page listed "Open the public admissions intake" as
   its next step, and there was nothing anywhere that could do it. The panel
   at the top of this screen is that missing control.
   ========================================================================== */

type ApplicationStatus = ApplicantApplication["status"];

const statusNames: Record<ApplicationStatus, string> = {
  draft: "Draft",
  submitted: "Awaiting review",
  "under-review": "Under review",
  offered: "Offer sent",
  rejected: "Not admitted",
  accepted: "Offer accepted",
  enrolled: "Enrolled",
};

/* The one step forward from each state, matching the transitions
   db/applicant-repository.ts will actually accept. The server is still the
   authority — this only decides what the button says. */
const nextStep: Partial<
  Record<ApplicationStatus, { label: string; status: ApplicationStatus }>
> = {
  submitted: { label: "Start review", status: "under-review" },
  "under-review": { label: "Make offer", status: "offered" },
  offered: { label: "Record acceptance", status: "accepted" },
  accepted: { label: "Create student record", status: "enrolled" },
};

const intakeStatusNames: Record<AdmissionIntake["status"], string> = {
  closed: "Closed",
  draft: "Not published",
  open: "Open",
};

/* The five states an application passes through, in order, each with the
   glyph and hue that label it. `draft` and `rejected` are deliberately not
   here: a funnel is the road through, and neither of those is on it — a draft
   has not been submitted, and a rejection is where the road stops. Both are
   still reachable from the queue's status filter.

   Labels are shortened from statusNames because these sit under a glyph in a
   fifth of the row: "Awaiting review" becomes "Submitted", which is the stage
   rather than the instruction. */
const PIPELINE_STAGES: ReadonlyArray<{
  hue: string;
  Icon: (props: { size?: number }) => ReactNode;
  label: string;
  status: ApplicationStatus;
}> = [
  { hue: "blue", Icon: InboxIcon, label: "Submitted", status: "submitted" },
  { hue: "amber", Icon: ClockIcon, label: "Review", status: "under-review" },
  { hue: "violet", Icon: FileTextIcon, label: "Offered", status: "offered" },
  { hue: "teal", Icon: CheckIcon, label: "Accepted", status: "accepted" },
  { hue: "lime", Icon: UsersIcon, label: "Enrolled", status: "enrolled" },
];

type AdmissionsData = {
  applications: ApplicantApplication[];
  counts: Record<string, number>;
  error?: string;
  intakes: AdmissionIntake[];
  years: AcademicYear[];
};

/* Outside the component so the mount effect can call it without the function
   itself being a dependency, and so nothing in it touches state — the caller
   decides what to do with the answer. */
async function fetchAdmissions(): Promise<AdmissionsData> {
  const empty = { applications: [], counts: {}, intakes: [], years: [] };
  try {
    const [applicationsResponse, intakeResponse] = await Promise.all([
      fetch("/api/admin/admissions"),
      fetch("/api/admin/intake"),
    ]);
    const applicationsPayload = (await applicationsResponse.json()) as {
      applications?: ApplicantApplication[];
      error?: string;
    };
    if (!applicationsResponse.ok || !applicationsPayload.applications) {
      return {
        ...empty,
        error: applicationsPayload.error ?? "Applications could not be loaded.",
      };
    }
    const intakePayload = (await intakeResponse.json()) as {
      applicationCounts?: Record<string, number>;
      error?: string;
      intakes?: AdmissionIntake[];
      years?: AcademicYear[];
    };
    if (!intakeResponse.ok || !intakePayload.intakes) {
      return {
        ...empty,
        error: intakePayload.error ?? "Intakes could not be loaded.",
      };
    }

    return {
      applications: applicationsPayload.applications,
      counts: intakePayload.applicationCounts ?? {},
      intakes: intakePayload.intakes,
      years: intakePayload.years ?? [],
    };
  } catch (error) {
    return {
      ...empty,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

export function AdmissionsView() {
  const [applications, setApplications] = useState<ApplicantApplication[]>([]);
  const [intakes, setIntakes] = useState<AdmissionIntake[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [state, setState] = useState<"error" | "loading" | "ready">("loading");
  const [selectedId, setSelectedId] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">(
    "all",
  );
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingIntake, setEditingIntake] = useState(false);

  const load = useCallback(async () => {
    const loaded = await fetchAdmissions();
    if (loaded.error) {
      setProblem(loaded.error);
      return false;
    }
    setApplications(loaded.applications);
    setIntakes(loaded.intakes);
    setYears(loaded.years);
    setCounts(loaded.counts);
    setState("ready");
    return true;
  }, []);

  useEffect(() => {
    let active = true;

    async function loadOnce() {
      const loaded = await fetchAdmissions();
      if (!active) return;
      if (loaded.error) {
        setProblem(loaded.error);
        setState("error");
        return;
      }
      setApplications(loaded.applications);
      setIntakes(loaded.intakes);
      setYears(loaded.years);
      setCounts(loaded.counts);
      setState("ready");
    }

    void loadOnce();
    return () => {
      active = false;
    };
  }, []);

  /* The one the school is working on: open if any is, otherwise the most
     recent — which is what an officer reviewing last month's applications
     after the door shut is looking at. */
  const activeIntake =
    intakes.find((intake) => intake.status === "open") ?? intakes[0] ?? null;

  const visibleApplications = useMemo(() => {
    const normalised = query.trim().toLowerCase();
    return applications.filter((application) => {
      const matchesStatus =
        statusFilter === "all" || application.status === statusFilter;
      const searchable = [
        application.applicantFirstName,
        application.applicantLastName,
        application.guardianName,
        application.guardianEmail,
      ]
        .join(" ")
        .toLowerCase();
      return matchesStatus && searchable.includes(normalised);
    });
  }, [applications, query, statusFilter]);

  const selected =
    applications.find((application) => application.id === selectedId) ??
    visibleApplications[0] ??
    applications[0] ??
    null;

  const byStatus = useMemo(() => {
    const tally: Partial<Record<ApplicationStatus, number>> = {};
    for (const application of applications) {
      tally[application.status] = (tally[application.status] ?? 0) + 1;
    }
    return tally;
  }, [applications]);

  async function sendIntake(body: unknown, success: string) {
    setBusy(true);
    setNotice("");
    setProblem("");
    try {
      const response = await fetch("/api/admin/intake", {
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

  async function advance(application: ApplicantApplication) {
    const step = nextStep[application.status];
    if (!step) return;

    setBusy(true);
    setNotice("");
    setProblem("");
    try {
      const response = await fetch("/api/admin/admissions", {
        body: JSON.stringify({
          applicationId: application.id,
          status: step.status,
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as {
        application?: ApplicantApplication;
        error?: string;
      };
      if (!response.ok || !payload.application) {
        throw new Error(
          payload.error ?? "The application could not be updated.",
        );
      }
      const updated = payload.application;
      setApplications((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice(
        `${fullName(application)} is now ${statusNames[updated.status].toLowerCase()}.`,
      );
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return <p className="academic-loading">Loading admissions…</p>;
  }

  if (state === "error") {
    return (
      <div className="academic-empty">
        <h2>Admissions could not be loaded.</h2>
        <p>{problem}</p>
        <button onClick={() => void load()} type="button">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="admin-content admissions-content">
      <section className="admin-welcome admissions-welcome">
        <div>
          <p className="eyebrow">{activeIntake?.label ?? "No intake set up"}</p>
          <h1>Admissions</h1>
          <p>
            Review applicants, issue offers, and decide when families can
            apply.
          </p>
        </div>
        <Link className="primary-admin-button" href="/admissions">
          <span aria-hidden="true">↗</span> View public page
        </Link>
      </section>

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

      <IntakePanel
        applicationCount={activeIntake ? (counts[activeIntake.id] ?? 0) : 0}
        busy={busy}
        editing={editingIntake}
        intake={activeIntake}
        intakes={intakes}
        onCreate={async (intake) => {
          const saved = await sendIntake(
            { intake, type: "create" },
            `${intake.label} was created. It is not public until you open it.`,
          );
          if (saved) setEditingIntake(false);
        }}
        onSetEditing={setEditingIntake}
        onSetStatus={(status) => {
          if (!activeIntake) return;
          void sendIntake(
            { intakeId: activeIntake.id, status, type: "status" },
            status === "open"
              ? `${activeIntake.label} is open. Families can apply from the public site.`
              : `${activeIntake.label} is closed. Applications already received are still here.`,
          );
        }}
        onUpdate={async (intake) => {
          if (!activeIntake) return;
          const saved = await sendIntake(
            { intake, intakeId: activeIntake.id, type: "update" },
            `${intake.label} was updated.`,
          );
          if (saved) setEditingIntake(false);
        }}
        years={years}
      />

      {/* ==================================================================
          One funnel, not a funnel and a scoreboard

          A row of four stat cards used to sit above this, and three of its
          four numbers were already in the pipeline underneath — "Awaiting
          review" is Submitted, "Offers issued" is Offered plus everything
          past it, "Learners enrolled" is Enrolled. Nine figures on screen
          answering five questions, and a reader had to work out which pairs
          were the same number before trusting either.

          The pipeline is the better of the two, because admissions is a
          sequence and a funnel says so. It now carries the two facts only
          the cards had — the total received, and the places available — in
          its caption, and the stages carry the glyphs.
          ================================================================== */}
      <section className="pipeline-panel" aria-label="Admissions pipeline">
        <header>
          <div>
            <p className="eyebrow">This intake</p>
            <h2>
              {applications.length}{" "}
              {applications.length === 1 ? "application" : "applications"}
            </h2>
          </div>
          <span>
            {activeIntake && activeIntake.capacity > 0
              ? `${byStatus.enrolled ?? 0} enrolled of ${activeIntake.capacity} places`
              : "No capacity set"}
          </span>
        </header>

        <ol>
          {PIPELINE_STAGES.map((stage, index) => (
            <li data-hue={stage.hue} key={stage.status}>
              <span className="pipeline-glyph" aria-hidden="true">
                <stage.Icon size={18} />
              </span>
              <p>
                {stage.label}
                <strong>{byStatus[stage.status] ?? 0}</strong>
              </p>
              {index < PIPELINE_STAGES.length - 1 && (
                <i aria-hidden="true">
                  <ChevronRightIcon size={16} />
                </i>
              )}
            </li>
          ))}
        </ol>
      </section>

      <div className="admissions-workspace">
        <section className="application-queue" aria-labelledby="queue-title">
          <div className="queue-heading">
            <div>
              <p className="eyebrow">Application queue</p>
              <h2 id="queue-title">Active applicants</h2>
            </div>
            <span>{visibleApplications.length} shown</span>
          </div>

          <div className="queue-controls">
            <label className="admission-search">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search applicants"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or guardian"
                value={query}
              />
            </label>
            <select
              aria-label="Filter by application status"
              onChange={(event) =>
                setStatusFilter(event.target.value as ApplicationStatus | "all")
              }
              value={statusFilter}
            >
              <option value="all">All statuses</option>
              {Object.entries(statusNames)
                .filter(([value]) => value !== "draft")
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
          </div>

          <div className="application-list">
            {visibleApplications.map((application) => (
              <button
                className={application.id === selected?.id ? "selected" : ""}
                key={application.id}
                onClick={() => {
                  setSelectedId(application.id);
                  setNotice("");
                }}
                type="button"
              >
                <span className="applicant-avatar">
                  {initials(fullName(application))}
                </span>
                <span className="application-summary">
                  <strong>{fullName(application)}</strong>
                  <small>
                    {reference(application.id)} ·{" "}
                    {application.desiredClass || "Class not stated"}
                  </small>
                </span>
                <span
                  className={`admission-status status-${application.status}`}
                >
                  {statusNames[application.status]}
                </span>
                <span className="application-date">
                  <small>Applied</small>
                  {formatDate(application.submittedAt)}
                </span>
                <b aria-hidden="true">›</b>
              </button>
            ))}
            {visibleApplications.length === 0 && (
              <p className="empty-queue">
                {applications.length === 0
                  ? activeIntake?.status === "open"
                    ? "No applications yet. The form is open, so they will appear here as families submit them."
                    : "No applications yet, and the intake is not open — families cannot apply until it is."
                  : "No applications match this filter."}
              </p>
            )}
          </div>
        </section>

        {selected ? (
          <aside className="applicant-detail" aria-labelledby="applicant-title">
            <div className="applicant-detail-head">
              <span className="detail-avatar">
                {initials(fullName(selected))}
              </span>
              <div>
                <p>{reference(selected.id)}</p>
                <h2 id="applicant-title">{fullName(selected)}</h2>
                <span className={`admission-status status-${selected.status}`}>
                  {statusNames[selected.status]}
                </span>
              </div>
            </div>

            <div className="detail-section">
              <div className="detail-section-title">
                <h3>Application details</h3>
              </div>
              <dl className="applicant-data">
                <div>
                  <dt>Applying to</dt>
                  <dd>{selected.desiredClass || "Not stated"}</dd>
                </div>
                <div>
                  <dt>Entry term</dt>
                  <dd>{selected.entryTerm || "Not stated"}</dd>
                </div>
                <div>
                  <dt>Date of birth</dt>
                  <dd>{formatDate(selected.dateOfBirth)}</dd>
                </div>
                <div>
                  <dt>Previous school</dt>
                  <dd>{selected.previousSchool || "Not provided"}</dd>
                </div>
                <div>
                  <dt>Application date</dt>
                  <dd>{formatDate(selected.submittedAt)}</dd>
                </div>
                <div>
                  <dt>Nationality</dt>
                  <dd>{selected.nationality || "Not stated"}</dd>
                </div>
              </dl>
            </div>

            <div className="detail-section">
              <div className="detail-section-title">
                <h3>Guardian</h3>
                <span>Primary contact</span>
              </div>
              <div className="guardian-card">
                <span>{initials(selected.guardianName || "?")}</span>
                <div>
                  <strong>{selected.guardianName || "Not provided"}</strong>
                  <small>
                    {selected.guardianRelationship || "Guardian"}
                    {selected.guardianPhone ? ` · ${selected.guardianPhone}` : ""}
                  </small>
                  {selected.guardianEmail && (
                    <a href={`mailto:${selected.guardianEmail}`}>
                      {selected.guardianEmail}
                    </a>
                  )}
                </div>
              </div>
            </div>

            {(selected.allergies ||
              selected.medicalConditions ||
              selected.supportNeeds) && (
              <div className="detail-section">
                <div className="detail-section-title">
                  <h3>Health and support</h3>
                </div>
                <dl className="applicant-data">
                  {selected.allergies && (
                    <div>
                      <dt>Allergies</dt>
                      <dd>{selected.allergies}</dd>
                    </div>
                  )}
                  {selected.medicalConditions && (
                    <div>
                      <dt>Medical conditions</dt>
                      <dd>{selected.medicalConditions}</dd>
                    </div>
                  )}
                  {selected.supportNeeds && (
                    <div>
                      <dt>Support needs</dt>
                      <dd>{selected.supportNeeds}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            <div className="detail-actions">
              {nextStep[selected.status] ? (
                <button
                  className="primary-action"
                  disabled={busy}
                  onClick={() => void advance(selected)}
                  type="button"
                >
                  {busy ? "Saving…" : nextStep[selected.status]?.label}{" "}
                  <span aria-hidden="true">→</span>
                </button>
              ) : (
                <p className="form-hint">
                  {selected.status === "enrolled"
                    ? "This applicant has a student record."
                    : "This application is closed."}
                </p>
              )}
            </div>
          </aside>
        ) : (
          <aside className="applicant-detail">
            <p className="form-hint">
              Select an application to see the family’s details.
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}

function IntakePanel({
  applicationCount,
  busy,
  editing,
  intake,
  intakes,
  onCreate,
  onSetEditing,
  onSetStatus,
  onUpdate,
  years,
}: {
  applicationCount: number;
  busy: boolean;
  editing: boolean;
  intake: AdmissionIntake | null;
  intakes: AdmissionIntake[];
  onCreate: (intake: IntakeDraft) => void | Promise<void>;
  onSetEditing: (editing: boolean) => void;
  onSetStatus: (status: AdmissionIntake["status"]) => void;
  onUpdate: (intake: IntakeDraft) => void | Promise<void>;
  years: AcademicYear[];
}) {
  if (!intake || editing) {
    return (
      <IntakeForm
        busy={busy}
        intake={editing ? intake : null}
        onCancel={intake ? () => onSetEditing(false) : undefined}
        onSubmit={intake && editing ? onUpdate : onCreate}
        years={years}
      />
    );
  }

  return (
    <section className="intake-panel" aria-label="Admissions intake">
      <div className="intake-headline">
        <div>
          <p className="eyebrow">Public admissions</p>
          <h2>{intake.label}</h2>
          <p className="intake-dates">
            {formatDate(intake.opensOn)} – {formatDate(intake.closesOn)}
            {intake.capacity > 0 ? ` · ${intake.capacity} places` : ""}
            {intakes.length > 1 ? ` · ${intakes.length} intakes on record` : ""}
          </p>
        </div>
        <span className={`intake-state is-${intake.status}`}>
          {intakeStatusNames[intake.status]}
        </span>
      </div>

      <p className="intake-explainer">
        {intake.status === "open"
          ? `Families can apply from the public site right now. ${applicationCount} ${applicationCount === 1 ? "application has" : "applications have"} come in.`
          : `The public form is refusing new applications. The ${applicationCount} already received ${applicationCount === 1 ? "stays" : "stay"} here to review.`}
      </p>

      <div className="form-actions">
        {intake.status === "open" ? (
          <button
            className="danger-button"
            disabled={busy}
            onClick={() => onSetStatus("closed")}
            type="button"
          >
            Close admissions
          </button>
        ) : (
          <button
            disabled={busy}
            onClick={() => onSetStatus("open")}
            type="button"
          >
            Open admissions
          </button>
        )}
        <button
          className="ghost-button"
          disabled={busy}
          onClick={() => onSetEditing(true)}
          type="button"
        >
          Edit dates and places
        </button>
      </div>
    </section>
  );
}

type IntakeDraft = {
  academicYearId: string;
  capacity: number;
  closesOn: string;
  label: string;
  opensOn: string;
};

function IntakeForm({
  busy,
  intake,
  onCancel,
  onSubmit,
  years,
}: {
  busy: boolean;
  intake: AdmissionIntake | null;
  onCancel?: () => void;
  onSubmit: (intake: IntakeDraft) => void | Promise<void>;
  years: AcademicYear[];
}) {
  const currentYear =
    years.find((year) => year.status === "current") ?? years[0] ?? null;
  const [label, setLabel] = useState(intake?.label ?? "");
  const [opensOn, setOpensOn] = useState(intake?.opensOn ?? "");
  const [closesOn, setClosesOn] = useState(intake?.closesOn ?? "");
  const [capacity, setCapacity] = useState(String(intake?.capacity ?? 0));
  const [academicYearId, setAcademicYearId] = useState(
    intake?.academicYearId ?? currentYear?.id ?? "",
  );

  if (years.length === 0) {
    return (
      <section className="intake-panel">
        <h2>An academic year comes first.</h2>
        <p className="intake-explainer">
          An intake admits families for a particular year, so there has to be
          one before admissions can open.
        </p>
        <Link className="ghost-button" href="/admin/academic">
          Set up an academic year
        </Link>
      </section>
    );
  }

  return (
    <form
      className="intake-panel"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void onSubmit({
          academicYearId,
          capacity: Number(capacity) || 0,
          closesOn,
          label,
          opensOn,
        });
      }}
    >
      <h2>{intake ? "Edit this intake" : "Set up an admissions intake"}</h2>
      <p className="intake-explainer">
        {intake
          ? "Changing the dates does not open or close the intake on its own."
          : "A new intake starts unpublished. Nothing is public until you open it."}
      </p>
      <div className="inline-form-fields">
        <label>
          <span>What families see it called</span>
          <input
            onChange={(event) => setLabel(event.target.value)}
            placeholder="2027 / 2028 intake"
            required
            value={label}
          />
        </label>
        <label>
          <span>Academic year</span>
          <select
            onChange={(event) => setAcademicYearId(event.target.value)}
            value={academicYearId}
          >
            {years.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Opens</span>
          <input
            onChange={(event) => setOpensOn(event.target.value)}
            required
            type="date"
            value={opensOn}
          />
        </label>
        <label>
          <span>Closes</span>
          <input
            onChange={(event) => setClosesOn(event.target.value)}
            required
            type="date"
            value={closesOn}
          />
        </label>
        <label>
          <span>Places available</span>
          <input
            min={0}
            onChange={(event) => setCapacity(event.target.value)}
            type="number"
            value={capacity}
          />
        </label>
      </div>
      <div className="form-actions">
        <button disabled={busy} type="submit">
          {intake ? "Save changes" : "Create intake"}
        </button>
        {onCancel && (
          <button className="ghost-button" onClick={onCancel} type="button">
            Cancel
          </button>
        )}
      </div>
      <p className="form-hint">
        The closing date is what the public site advertises and what the form
        enforces — past it, applications are refused whether or not anyone
        remembers to press Close.
      </p>
    </form>
  );
}

function fullName(application: ApplicantApplication) {
  return (
    `${application.applicantFirstName} ${application.applicantLastName}`.trim() ||
    "Unnamed applicant"
  );
}

/** A short reference a family can quote on the phone. */
function reference(id: string) {
  return `GA-${id.slice(0, 6).toUpperCase()}`;
}

function formatDate(date?: string) {
  if (!date) return "Not submitted";
  const parsed = date.includes("T")
    ? new Date(date)
    : new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return "Not provided";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function initials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("") || "?"
  );
}
