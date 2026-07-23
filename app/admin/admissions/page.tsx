"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
import { academicClasses } from "../../../domain/academic/fixtures";
import "../academic/academic.css";
import "./admissions.css";

const navigation = [
  { href: "/", label: "Overview", symbol: "⌂" },
  { href: "/admin/academic", label: "Academic setup", symbol: "▦" },
  { href: "/admin/admissions", label: "Admissions", symbol: "+" },
  { href: "/admin/people", label: "People", symbol: "◎" },
  { href: "/teacher/subjects", label: "Teaching", symbol: "✎" },
  { href: "#assessment", label: "Assessment", symbol: "✓" },
  { href: "#reports", label: "Reports", symbol: "↗" },
];

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

export default function AdmissionsPage() {
  const [applications, setApplications] = useState(admissionApplications);
  const [selectedId, setSelectedId] = useState(admissionApplications[0].id);
  const [statusFilter, setStatusFilter] = useState<AdmissionStatus | "all">(
    "all",
  );
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");

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

  function updateApplication(updated: AdmissionApplication, message: string) {
    setApplications((current) =>
      current.map((application) =>
        application.id === updated.id ? updated : application,
      ),
    );
    setNotice(message);
  }

  function advanceApplication() {
    if (selected.status === "submitted") {
      const reviewing = startApplicationReview(
        selected,
        "staff-admissions-1",
        "2026-07-23",
      );
      updateApplication(reviewing, `${fullName(selected)} is now under review.`);
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
      updateApplication(offered, `An admission offer was prepared for ${fullName(selected)}.`);
      return;
    }

    if (selected.status === "offered") {
      const accepted = acceptAdmissionOffer(
        selected,
        "2026-07-23",
        `guardian-${selected.id}`,
      );
      updateApplication(accepted, `${fullName(selected)}'s offer is now accepted.`);
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
      updateApplication(
        conversion.application,
        `${fullName(selected)} now has student ID ${conversion.learner.studentId} and a ${selectedClass} placement.`,
      );
    }
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label="School administration">
        <Link className="brand" href="/" aria-label="Learners Hub home">
          <span className="brand-mark" aria-hidden="true">LH</span>
          <span><strong>Learners</strong><small>Hub</small></span>
        </Link>

        <div className="school-identity">
          <span aria-hidden="true">GA</span>
          <div><strong>Greenfield Academy</strong><small>Accra Campus</small></div>
        </div>

        <nav className="desktop-nav">
          <p className="nav-label">School management</p>
          {navigation.map((item) => (
            <Link
              className={item.href === "/admin/admissions" ? "nav-link active" : "nav-link"}
              href={item.href}
              key={item.label}
            >
              <span aria-hidden="true">{item.symbol}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="academic-year-card">
          <p>2026 admissions</p>
          <strong>84% complete</strong>
          <span>Applications close 14 August</span>
        </div>

        <Link className="admin-profile" href="/">
          <span className="avatar">SA</span>
          <span><strong>Stephen Arthur</strong><small>School administrator</small></span>
          <b aria-hidden="true">↗</b>
        </Link>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div className="admin-mobile-brand">
            <span className="brand-mark" aria-hidden="true">LH</span>
            <strong>Admissions</strong>
          </div>
          <nav aria-label="Breadcrumb">
            <Link href="/">Greenfield Academy</Link>
            <span aria-hidden="true">/</span>
            <strong>Admissions</strong>
          </nav>
          <div className="admin-top-actions">
            <button type="button" aria-label="Notifications">●</button>
            <span className="avatar">SA</span>
          </div>
        </header>

        <div className="admin-content admissions-content">
          <section className="admin-welcome admissions-welcome">
            <div>
              <p className="eyebrow">2026 / 2027 intake</p>
              <h1>Admissions</h1>
              <p>Review applicants, issue offers, and create complete student records.</p>
            </div>
            <button className="primary-admin-button" type="button" onClick={() => setNotice("Public application intake will connect here after secure identity and document upload are enabled.")}>
              <span aria-hidden="true">+</span> New application
            </button>
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
                  disabled={selected.status === "enrolled" || selected.status === "rejected"}
                  onClick={advanceApplication}
                  type="button"
                >
                  {nextAction(selected.status)} <span aria-hidden="true">→</span>
                </button>
              </div>
            </aside>
          </div>
        </div>
      </main>

      <nav className="admin-mobile-nav" aria-label="Mobile administration">
        {navigation.slice(0, 5).map((item) => (
          <Link
            className={item.href === "/admin/admissions" ? "active" : ""}
            href={item.href}
            key={item.label}
          >
            <span aria-hidden="true">{item.symbol}</span>
            <small>{item.label}</small>
          </Link>
        ))}
      </nav>
    </div>
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
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
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
