"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import {
  createClassPlacement,
  createSubjectEntitlements,
} from "../../../domain/academic/enrolment";
import {
  academicClasses,
  academicTenantId,
  availableLearners,
} from "../../../domain/academic/fixtures";
import "./academic.css";

type PlacementRow = {
  className: string;
  compulsoryCount: number;
  date: string;
  id: string;
  learnerName: string;
  optionalCount: number;
  studentId: string;
};

const navigation = [
  { href: "/", label: "Overview", symbol: "⌂" },
  { href: "/admin/academic", label: "Academic setup", symbol: "▦" },
  { href: "#admissions", label: "Admissions", symbol: "+" },
  { href: "#people", label: "People", symbol: "◎" },
  { href: "#assessment", label: "Assessment", symbol: "✓" },
  { href: "#reports", label: "Reports", symbol: "↗" },
];

const initialPlacements: PlacementRow[] = [
  {
    id: "row-ama",
    learnerName: "Ama Serwaa",
    studentId: "LH-260112",
    className: "JHS 2 Gold",
    compulsoryCount: 6,
    optionalCount: 1,
    date: "21 Jul 2026",
  },
  {
    id: "row-kwame",
    learnerName: "Kwame Agyeman",
    studentId: "LH-260138",
    className: "JHS 2 Gold",
    compulsoryCount: 6,
    optionalCount: 0,
    date: "21 Jul 2026",
  },
  {
    id: "row-esi",
    learnerName: "Esi Nyarko",
    studentId: "LH-260207",
    className: "JHS 1 Blue",
    compulsoryCount: 6,
    optionalCount: 2,
    date: "20 Jul 2026",
  },
];

export default function AcademicSetupPage() {
  const [selectedClassId, setSelectedClassId] = useState("class-jhs2-gold");
  const [learnerId, setLearnerId] = useState(availableLearners[0].id);
  const [optionalIds, setOptionalIds] = useState<Set<string>>(new Set());
  const [effectiveDate, setEffectiveDate] = useState("2026-09-08");
  const [placements, setPlacements] = useState(initialPlacements);
  const [notice, setNotice] = useState("");

  const selectedClass =
    academicClasses.find((item) => item.id === selectedClassId) ??
    academicClasses[0];
  const compulsoryOfferings = selectedClass.offerings.filter(
    (item) => item.requirement === "compulsory",
  );
  const optionalOfferings = selectedClass.offerings.filter(
    (item) => item.requirement === "optional",
  );
  const selectedLearner =
    availableLearners.find((item) => item.id === learnerId) ??
    availableLearners[0];

  const placementCompletion = useMemo(() => {
    const totalLearners = academicClasses.reduce(
      (total, item) => total + item.learnerCount,
      0,
    );
    return Math.round((totalLearners / 165) * 100);
  }, []);

  function selectClass(classId: string) {
    setSelectedClassId(classId);
    setOptionalIds(new Set());
    setNotice("");
  }

  function toggleOptionalSubject(offeringId: string) {
    setOptionalIds((current) => {
      const next = new Set(current);
      if (next.has(offeringId)) {
        next.delete(offeringId);
      } else {
        next.add(offeringId);
      }
      return next;
    });
  }

  function placeLearner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const placement = createClassPlacement({
      id: `placement-${selectedLearner.id}-${selectedClass.id}`,
      tenantId: academicTenantId,
      learnerId: selectedLearner.id,
      classGroupId: selectedClass.id,
      academicYearId: "year-2026-27",
      effectiveFrom: effectiveDate,
    });
    const entitlements = createSubjectEntitlements(
      placement,
      selectedClass.offerings,
      optionalIds,
    );
    const optionalCount = entitlements.filter(
      (item) => item.requirement === "optional",
    ).length;

    setPlacements((current) => [
      {
        id: placement.id,
        learnerName: selectedLearner.name,
        studentId: selectedLearner.studentId,
        className: selectedClass.name,
        compulsoryCount: entitlements.length - optionalCount,
        optionalCount,
        date: formatDate(effectiveDate),
      },
      ...current.filter((item) => item.studentId !== selectedLearner.studentId),
    ]);
    setNotice(
      `${selectedLearner.name} now has ${entitlements.length} subject entitlements in ${selectedClass.name}.`,
    );
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label="School administration">
        <Link className="brand" href="/" aria-label="Learners Hub home">
          <span className="brand-mark" aria-hidden="true">LH</span>
          <span>
            <strong>Learners</strong>
            <small>Hub</small>
          </span>
        </Link>

        <div className="school-identity">
          <span aria-hidden="true">GA</span>
          <div>
            <strong>Greenfield Academy</strong>
            <small>Accra Campus</small>
          </div>
        </div>

        <nav className="desktop-nav">
          <p className="nav-label">School management</p>
          {navigation.map((item, index) => (
            <Link
              className={index === 1 ? "nav-link active" : "nav-link"}
              href={item.href}
              key={item.label}
            >
              <span aria-hidden="true">{item.symbol}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="academic-year-card">
          <p>Current academic year</p>
          <strong>2026 / 2027</strong>
          <span>Term 1 begins 8 September</span>
        </div>

        <Link className="admin-profile" href="/">
          <span className="avatar">SA</span>
          <span>
            <strong>Stephen Arthur</strong>
            <small>School administrator</small>
          </span>
          <b aria-hidden="true">↗</b>
        </Link>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div className="admin-mobile-brand">
            <span className="brand-mark" aria-hidden="true">LH</span>
            <strong>Academic setup</strong>
          </div>
          <nav aria-label="Breadcrumb">
            <Link href="/">Greenfield Academy</Link>
            <span aria-hidden="true">/</span>
            <strong>Academic setup</strong>
          </nav>
          <div className="admin-top-actions">
            <button type="button" aria-label="Notifications">●</button>
            <span className="avatar">SA</span>
          </div>
        </header>

        <div className="admin-content">
          <section className="admin-welcome">
            <div>
              <p className="eyebrow">School year foundation</p>
              <h1>Academic structure</h1>
              <p>Manage classes, subject policies, teachers, and learner placement.</p>
            </div>
            <div className="year-selector">
              <small>Academic year</small>
              <strong>2026 / 2027</strong>
              <span aria-hidden="true">⌄</span>
            </div>
          </section>

          <section className="admin-stats" aria-label="Academic setup summary">
            <article>
              <span className="admin-stat-icon green">▦</span>
              <div><small>Active classes</small><strong>8</strong></div>
              <em>KG to SHS</em>
            </article>
            <article>
              <span className="admin-stat-icon blue">◎</span>
              <div><small>Placed learners</small><strong>159</strong></div>
              <em>of 165 expected</em>
            </article>
            <article>
              <span className="admin-stat-icon gold">✓</span>
              <div><small>Subject offerings</small><strong>42</strong></div>
              <em>34 compulsory</em>
            </article>
            <article>
              <span className="admin-stat-icon purple">↗</span>
              <div><small>Placement complete</small><strong>{placementCompletion}%</strong></div>
              <em>6 learners pending</em>
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
                  <button type="button">+ New class</button>
                </div>

                <div className="class-tabs" role="tablist" aria-label="Classes">
                  {academicClasses.map((academicClass) => (
                    <button
                      aria-selected={selectedClass.id === academicClass.id}
                      className={
                        selectedClass.id === academicClass.id ? "selected" : ""
                      }
                      key={academicClass.id}
                      onClick={() => selectClass(academicClass.id)}
                      role="tab"
                      type="button"
                    >
                      <span>{academicClass.name}</span>
                      <small>{academicClass.learnerCount} learners</small>
                    </button>
                  ))}
                </div>

                <div className="class-summary">
                  <div className="class-monogram" aria-hidden="true">
                    {selectedClass.name
                      .split(" ")
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")}
                  </div>
                  <div>
                    <p>{selectedClass.level}</p>
                    <h3>{selectedClass.name}</h3>
                    <span>{selectedClass.room}</span>
                  </div>
                  <div className="teacher-assignment">
                    <small>Class teacher</small>
                    <strong>{selectedClass.classTeacher}</strong>
                  </div>
                  <button type="button">Edit class</button>
                </div>

                <div className="subject-policy-grid">
                  <div>
                    <div className="policy-heading">
                      <span className="policy-icon required">✓</span>
                      <div>
                        <h3>Compulsory subjects</h3>
                        <p>Automatically added for every learner in this class.</p>
                      </div>
                      <strong>{compulsoryOfferings.length}</strong>
                    </div>
                    <div className="policy-subjects">
                      {compulsoryOfferings.map((offering) => (
                        <span key={offering.id}>
                          <b>{offering.subjectCode}</b>
                          {offering.subjectName}
                          <i aria-label="Locked compulsory subject">●</i>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="policy-heading">
                      <span className="policy-icon optional">+</span>
                      <div>
                        <h3>Optional subjects</h3>
                        <p>Available through an approved learner selection.</p>
                      </div>
                      <strong>{optionalOfferings.length}</strong>
                    </div>
                    <div className="policy-subjects optional-list">
                      {optionalOfferings.map((offering) => (
                        <span key={offering.id}>
                          <b>{offering.subjectCode}</b>
                          {offering.subjectName}
                          <i>Approval</i>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="policy-rule">
                  <span aria-hidden="true">i</span>
                  <p>
                    <strong>Class-first access rule:</strong> learners cannot remove
                    compulsory subjects. Moving class closes future access while
                    keeping all lesson, assessment, and grade history.
                  </p>
                </div>
              </section>

              <section className="admin-panel">
                <div className="admin-panel-heading placement-heading">
                  <div>
                    <p className="eyebrow">Latest activity</p>
                    <h2>Recent learner placements</h2>
                  </div>
                  <div className="table-filter">
                    <span aria-hidden="true">⌕</span>
                    <input aria-label="Search placements" placeholder="Search learners" />
                  </div>
                </div>

                <div className="placement-table-wrap">
                  <table className="placement-table">
                    <thead>
                      <tr>
                        <th>Learner</th>
                        <th>Class</th>
                        <th>Subject access</th>
                        <th>Effective</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {placements.map((placement) => (
                        <tr key={placement.id}>
                          <td>
                            <span className="table-avatar">
                              {initials(placement.learnerName)}
                            </span>
                            <span>
                              <strong>{placement.learnerName}</strong>
                              <small>{placement.studentId}</small>
                            </span>
                          </td>
                          <td>{placement.className}</td>
                          <td>
                            <strong>{placement.compulsoryCount} compulsory</strong>
                            <small>
                              {placement.optionalCount
                                ? `${placement.optionalCount} optional`
                                : "No optional subjects"}
                            </small>
                          </td>
                          <td>{placement.date}</td>
                          <td><span className="status-pill">Active</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <aside className="placement-card" aria-labelledby="placement-title">
              <div className="placement-card-heading">
                <span aria-hidden="true">+</span>
                <div>
                  <p className="eyebrow">New placement</p>
                  <h2 id="placement-title">Place a learner</h2>
                </div>
              </div>
              <p className="placement-intro">
                Selecting a class grants every compulsory subject automatically.
              </p>

              <form onSubmit={placeLearner}>
                <label>
                  <span>Learner</span>
                  <select
                    onChange={(event) => setLearnerId(event.target.value)}
                    value={learnerId}
                  >
                    {availableLearners.map((learner) => (
                      <option key={learner.id} value={learner.id}>
                        {learner.name} · {learner.studentId}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Class</span>
                  <select
                    onChange={(event) => selectClass(event.target.value)}
                    value={selectedClass.id}
                  >
                    {academicClasses.map((academicClass) => (
                      <option key={academicClass.id} value={academicClass.id}>
                        {academicClass.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Effective date</span>
                  <input
                    onChange={(event) => setEffectiveDate(event.target.value)}
                    type="date"
                    value={effectiveDate}
                  />
                </label>

                <div className="auto-entitlement">
                  <div>
                    <span className="policy-icon required" aria-hidden="true">✓</span>
                    <div>
                      <strong>{compulsoryOfferings.length} subjects included</strong>
                      <small>Locked by {selectedClass.name} policy</small>
                    </div>
                  </div>
                  <ul>
                    {compulsoryOfferings.map((item) => (
                      <li key={item.id}>{item.subjectCode}</li>
                    ))}
                  </ul>
                </div>

                {optionalOfferings.length > 0 && (
                  <fieldset>
                    <legend>Approved optional subjects</legend>
                    {optionalOfferings.map((offering) => (
                      <label className="option-check" key={offering.id}>
                        <input
                          checked={optionalIds.has(offering.id)}
                          onChange={() => toggleOptionalSubject(offering.id)}
                          type="checkbox"
                        />
                        <span>
                          <strong>{offering.subjectName}</strong>
                          <small>{offering.subjectCode} · Requires approval</small>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                )}

                <button className="place-button" type="submit">
                  Place learner <span aria-hidden="true">→</span>
                </button>
                {notice && <p className="placement-notice" role="status">{notice}</p>}
              </form>
            </aside>
          </div>
        </div>
      </main>

      <nav className="admin-mobile-nav" aria-label="Mobile administration">
        {navigation.slice(0, 5).map((item, index) => (
          <Link className={index === 1 ? "active" : ""} href={item.href} key={item.label}>
            <span aria-hidden="true">{item.symbol}</span>
            <small>{item.label}</small>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}
