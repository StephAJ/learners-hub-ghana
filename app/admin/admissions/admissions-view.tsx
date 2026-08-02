"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  acceptAdmissionOffer,
  convertAcceptedApplication,
  recordAdmissionDecision,
  startApplicationReview,
} from "../../../domain/admissions/admissions";
import { admissionApplications } from "../../../domain/admissions/fixtures";
import type {
  AdmissionApplication,
  AdmissionDocumentType,
  AdmissionStatus,
} from "../../../domain/admissions/types";
import type { ApplicantApplication } from "../../../db/applicant-repository";
import { academicClasses } from "../../../domain/academic/fixtures";
import "../academic/academic.css";
import "./admissions.css";

const documentNames: Record<AdmissionDocumentType, string> = {
  "birth-certificate": "Birth certificate",
  "previous-report": "Previous school report",
  "passport-photo": "Passport photograph",
  "medical-note": "Medical information",
};

const statusNames: Record<AdmissionStatus, string> = {
  draft: "Draft",
  submitted: "Awaiting review",
  "under-review": "Under review",
  offered: "Offer sent",
  rejected: "Not admitted",
  accepted: "Offer accepted",
  enrolled: "Enrolled",
};

export function AdmissionsView() {
  const [applications, setApplications] = useState(admissionApplications);
  const [selectedId, setSelectedId] = useState(admissionApplications[0].id);
  const [statusFilter, setStatusFilter] = useState<AdmissionStatus | "all">(
    "all",
  );
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSubmittedApplications() {
      try {
        const response = await fetch("/api/admin/admissions");
        const payload = (await response.json()) as {
          applications?: ApplicantApplication[];
          error?: string;
        };
        if (!response.ok || !payload.applications) {
          throw new Error(payload.error ?? "Applications could not be loaded.");
        }
        if (cancelled || payload.applications.length === 0) return;

        const persistentApplications = payload.applications.map(
          mapApplicantApplication,
        );
        setApplications((current) => {
          const persistentIds = new Set(
            persistentApplications.map((application) => application.id),
          );
          return [
            ...persistentApplications,
            ...current.filter((application) => !persistentIds.has(application.id)),
          ];
        });
        setSelectedId(persistentApplications[0].id);
      } catch (error) {
        if (!cancelled) {
          setNotice(
            error instanceof Error
              ? error.message
              : "Applications could not be loaded.",
          );
        }
      }
    }

    void loadSubmittedApplications();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleApplications = useMemo(() => {
    const normalisedQuery = query.trim().toLowerCase();
    return applications.filter((application) => {
      const matchesStatus =
        statusFilter === "all" || application.status === statusFilter;
      const searchableText = [
        application.applicationNumber,
        application.applicant.firstName,
        application.applicant.lastName,
        application.guardian.fullName,
      ]
        .join(" ")
        .toLowerCase();
      return matchesStatus && searchableText.includes(normalisedQuery);
    });
  }, [applications, query, statusFilter]);

  const selected =
    applications.find((application) => application.id === selectedId) ??
    applications[0];
  const selectedClass = className(selected.desiredClassGroupId);

  async function updateApplication(
    updated: AdmissionApplication,
    message: string,
  ) {
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/admissions", {
        body: JSON.stringify({
          applicationId: updated.id,
          status: updated.status,
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as {
        application?: ApplicantApplication;
        error?: string;
      };
      if (!response.ok || !payload.application) {
        throw new Error(payload.error ?? "The application could not be updated.");
      }

      setApplications((current) =>
        current.map((application) =>
          application.id === updated.id ? updated : application,
        ),
      );
      setNotice(message);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The application could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function advanceApplication() {
    if (selected.status === "submitted") {
      const reviewing = startApplicationReview(
        selected,
        "staff-admissions-1",
        "2026-07-23",
      );
      await updateApplication(
        reviewing,
        `${fullName(selected)} is now under review.`,
      );
      return;
    }

    if (selected.status === "under-review") {
      const offered = recordAdmissionDecision(selected, {
        decidedAt: "2026-07-23",
        decidedBy: "staff-admissions-1",
        decision: "offered",
        note: "Application reviewed and entry requirements confirmed.",
        offerExpiresAt: "2026-08-15",
      });
      await updateApplication(
        offered,
        `An admission offer was prepared for ${fullName(selected)}.`,
      );
      return;
    }

    if (selected.status === "offered") {
      const accepted = acceptAdmissionOffer(
        selected,
        "2026-07-23",
        `guardian-${selected.id}`,
      );
      await updateApplication(
        accepted,
        `${fullName(selected)}'s offer is now accepted.`,
      );
      return;
    }

    if (selected.status === "accepted") {
      const sequence = applications.indexOf(selected) + 176;
      const conversion = convertAcceptedApplication(selected, {
        academicYearId: "year-2026-27",
        effectiveFrom: "2026-09-08",
        guardianId: `guardian-${selected.id}`,
        learnerId: `learner-${selected.id}`,
        placementId: `placement-${selected.id}`,
        studentId: `GA-26${sequence}`,
      });
      await updateApplication(
        conversion.application,
        `${fullName(selected)} now has student ID ${conversion.learner.studentId} and a ${selectedClass} placement.`,
      );
    }
  }

  return (
    <>


        <div className="admin-content admissions-content">
          <section className="admin-welcome admissions-welcome">
            <div>
              <p className="eyebrow">2026 / 2027 intake</p>
              <h1>Admissions</h1>
              <p>Review applicants, issue offers, and create complete student records.</p>
            </div>
            <Link className="primary-admin-button" href="/admissions/apply">
              <span aria-hidden="true">↗</span> View public form
            </Link>
          </section>

          <section className="admin-stats admissions-stats" aria-label="Admissions summary">
            <article>
              <span className="admin-stat-icon blue">↓</span>
              <div><small>Applications received</small><strong>128</strong></div>
              <em>12 this week</em>
            </article>
            <article>
              <span className="admin-stat-icon gold">◷</span>
              <div><small>Awaiting review</small><strong>34</strong></div>
              <em>8 need attention</em>
            </article>
            <article>
              <span className="admin-stat-icon purple">✉</span>
              <div><small>Offers issued</small><strong>18</strong></div>
              <em>6 awaiting response</em>
            </article>
            <article>
              <span className="admin-stat-icon green">✓</span>
              <div><small>Learners enrolled</small><strong>71</strong></div>
              <em>55% of applications</em>
            </article>
          </section>

          <section className="pipeline-panel" aria-label="Admissions pipeline">
            {[
              ["Submitted", 34],
              ["Review", 21],
              ["Offered", 18],
              ["Accepted", 9],
              ["Enrolled", 71],
            ].map(([label, count], index) => (
              <div key={label}>
                <span>{index + 1}</span>
                <p>{label}<strong>{count}</strong></p>
                {index < 4 && <i aria-hidden="true">→</i>}
              </div>
            ))}
          </section>

          {notice && <p className="admissions-notice" role="status">{notice}</p>}

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
                    placeholder="Search name or application number"
                    value={query}
                  />
                </label>
                <select
                  aria-label="Filter by application status"
                  onChange={(event) =>
                    setStatusFilter(event.target.value as AdmissionStatus | "all")
                  }
                  value={statusFilter}
                >
                  <option value="all">All statuses</option>
                  {Object.entries(statusNames).map(([value, label]) => (
                    <option value={value} key={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="application-list">
                {visibleApplications.map((application) => (
                  <button
                    className={application.id === selected.id ? "selected" : ""}
                    key={application.id}
                    onClick={() => {
                      setSelectedId(application.id);
                      setNotice("");
                    }}
                    type="button"
                  >
                    <span className="applicant-avatar">{initials(fullName(application))}</span>
                    <span className="application-summary">
                      <strong>{fullName(application)}</strong>
                      <small>{application.applicationNumber} · {className(application.desiredClassGroupId)}</small>
                    </span>
                    <span className={`admission-status status-${application.status}`}>
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
                  <p className="empty-queue">No applications match this filter.</p>
                )}
              </div>
            </section>

            <aside className="applicant-detail" aria-labelledby="applicant-title">
              <div className="applicant-detail-head">
                <span className="detail-avatar">{initials(fullName(selected))}</span>
                <div>
                  <p>{selected.applicationNumber}</p>
                  <h2 id="applicant-title">{fullName(selected)}</h2>
                  <span className={`admission-status status-${selected.status}`}>
                    {statusNames[selected.status]}
                  </span>
                </div>
                <button type="button" aria-label="More applicant actions">•••</button>
              </div>

              <div className="detail-section">
                <div className="detail-section-title">
                  <h3>Application details</h3>
                  <span>Verified profile</span>
                </div>
                <dl className="applicant-data">
                  <div><dt>Applying to</dt><dd>{selectedClass}</dd></div>
                  <div><dt>Date of birth</dt><dd>{formatDate(selected.applicant.dateOfBirth)}</dd></div>
                  <div><dt>Previous school</dt><dd>{selected.applicant.previousSchool ?? "Not provided"}</dd></div>
                  <div><dt>Application date</dt><dd>{formatDate(selected.submittedAt)}</dd></div>
                </dl>
              </div>

              <div className="detail-section">
                <div className="detail-section-title">
                  <h3>Guardian</h3>
                  <span>Primary contact</span>
                </div>
                <div className="guardian-card">
                  <span>{initials(selected.guardian.fullName)}</span>
                  <div>
                    <strong>{selected.guardian.fullName}</strong>
                    <small>{selected.guardian.relationship} · {selected.guardian.phone}</small>
                    <a href={`mailto:${selected.guardian.email}`}>{selected.guardian.email}</a>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <div className="detail-section-title">
                  <h3>Documents</h3>
                  <span>{selected.submittedDocumentTypes.length} received</span>
                </div>
                <ul className="document-list">
                  {(["birth-certificate", "previous-report", "passport-photo"] as AdmissionDocumentType[]).map((documentType) => {
                    const received = selected.submittedDocumentTypes.includes(documentType);
                    return (
                      <li className={received ? "received" : "missing"} key={documentType}>
                        <span aria-hidden="true">{received ? "✓" : "!"}</span>
                        <p><strong>{documentNames[documentType]}</strong><small>{received ? "Received and ready for review" : "Still required"}</small></p>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {selected.decision?.note && (
                <div className="review-note">
                  <span aria-hidden="true">“</span>
                  <p><strong>Review note</strong>{selected.decision.note}</p>
                </div>
              )}

              <div className="detail-actions">
                <button className="secondary-action" type="button">Save note</button>
                <button
                  className="primary-action"
                  disabled={
                    saving ||
                    selected.status === "enrolled" ||
                    selected.status === "rejected"
                  }
                  onClick={() => void advanceApplication()}
                  type="button"
                >
                  {saving ? "Saving…" : nextAction(selected.status)}{" "}
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </aside>
          </div>
        </div>

    </>
  );
}

function className(classGroupId: string) {
  return academicClasses.find((item) => item.id === classGroupId)?.name ??
    "Class pending";
}

function fullName(application: AdmissionApplication) {
  return `${application.applicant.firstName} ${application.applicant.lastName}`;
}

function formatDate(date?: string) {
  if (!date) return "Not submitted";
  const parsed = date.includes("T") ? new Date(date) : new Date(`${date}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("");
}

function nextAction(status: AdmissionStatus) {
  const actions: Record<AdmissionStatus, string> = {
    draft: "Submit application",
    submitted: "Start review",
    "under-review": "Make offer",
    offered: "Record acceptance",
    accepted: "Create student record",
    enrolled: "Student record created",
    rejected: "Application closed",
  };
  return actions[status];
}

function mapApplicantApplication(
  application: ApplicantApplication,
): AdmissionApplication {
  return {
    applicant: {
      dateOfBirth: application.dateOfBirth,
      firstName: application.applicantFirstName,
      lastName: application.applicantLastName,
      previousSchool: application.previousSchool || undefined,
    },
    applicationNumber: `GA-2026-${application.id.slice(0, 6).toUpperCase()}`,
    desiredClassGroupId: desiredClassId(application.desiredClass),
    guardian: {
      email: application.guardianEmail,
      fullName: application.guardianName,
      phone: application.guardianPhone,
      relationship: "Parent or guardian",
    },
    id: application.id,
    status: application.status,
    submittedAt: application.submittedAt,
    submittedDocumentTypes: [],
    tenantId: "tenant-greenfield",
  };
}

function desiredClassId(desiredClass: string) {
  const classIds: Record<string, string> = {
    "JHS 1": "class-jhs1-blue",
    "JHS 2": "class-jhs2-gold",
    "SHS 1 General Arts": "class-shs1-arts",
  };
  return classIds[desiredClass] ?? "";
}
