"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  DirectoryPerson,
  SchoolRole,
} from "../../../domain/identity/types";
import "../academic/academic.css";
import "./people.css";

const navigation = [
  { href: "/admin", label: "Home", symbol: "⌂" },
  { href: "/admin/admissions", label: "Admissions", symbol: "+" },
  { href: "/admin/people", label: "People", symbol: "◎" },
  { href: "/admin/academic", label: "Academics", symbol: "▦" },
];

const roleLabels: Record<SchoolRole, string> = {
  "school-admin": "School administrator",
  "academic-admin": "Academic administrator",
  "admissions-officer": "Admissions officer",
  teacher: "Subject teacher",
  "class-teacher": "Class teacher",
  guardian: "Guardian",
  learner: "Learner",
};

const previewPeople: DirectoryPerson[] = [
  {
    id: "person-preview-admin",
    name: "Stephen Arthur",
    email: "stephen@greenfield.edu.gh",
    phone: "+233 24 100 2003",
    kind: "staff",
    role: "school-admin",
    scopeLabel: "Whole school",
    status: "active",
  },
  {
    id: "person-mary",
    name: "Mary Asante",
    email: "mary.asante@greenfield.edu.gh",
    phone: "+233 24 401 2278",
    kind: "staff",
    role: "academic-admin",
    scopeLabel: "Whole school",
    status: "active",
  },
  {
    id: "person-joseph",
    name: "Joseph Kumi",
    email: "joseph.kumi@greenfield.edu.gh",
    phone: "+233 20 785 4301",
    kind: "staff",
    role: "admissions-officer",
    scopeLabel: "Whole school",
    status: "active",
  },
  {
    id: "person-grace",
    name: "Grace Mensah",
    email: "grace.mensah@greenfield.edu.gh",
    phone: "+233 27 330 1842",
    kind: "staff",
    role: "teacher",
    scopeLabel: "Subject · Integrated Science",
    status: "active",
  },
  {
    id: "person-emmanuel",
    name: "Emmanuel Ofori",
    email: "emmanuel.ofori@greenfield.edu.gh",
    phone: "+233 55 681 0913",
    kind: "staff",
    role: "class-teacher",
    scopeLabel: "Class · JHS 2 Gold",
    status: "active",
  },
  {
    id: "person-kwame",
    name: "Kwame Agyeman",
    email: "kwame.agyeman@student.greenfield.edu.gh",
    phone: null,
    kind: "learner",
    role: "learner",
    scopeLabel: "Class · JHS 2 Gold",
    status: "active",
  },
  {
    id: "person-efua",
    name: "Efua Agyeman",
    email: "efua.agyeman@example.com",
    phone: "+233 24 665 8031",
    kind: "guardian",
    role: "guardian",
    scopeLabel: "Learner · Kwame Agyeman",
    status: "active",
  },
];

type DirectoryResponse = {
  actor: { email: string; name: string; role: SchoolRole };
  people: DirectoryPerson[];
  school: { id: string; name: string };
};

export default function PeoplePage() {
  const [people, setPeople] = useState(previewPeople);
  const [selectedId, setSelectedId] = useState(previewPeople[0].id);
  const [kindFilter, setKindFilter] = useState<DirectoryPerson["kind"] | "all">(
    "all",
  );
  const [query, setQuery] = useState("");
  const [dataMode, setDataMode] = useState<"loading" | "protected" | "preview">(
    "loading",
  );
  const [actor, setActor] = useState({
    email: "stephen@greenfield.edu.gh",
    name: "Stephen Arthur",
    role: "school-admin" as SchoolRole,
  });
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDirectory() {
      try {
        const response = await fetch("/api/admin/people");
        if (!response.ok) throw new Error("Protected records unavailable.");
        const directory = (await response.json()) as DirectoryResponse;
        if (!active) return;
        setPeople(directory.people);
        setActor(directory.actor);
        setSelectedId((current) =>
          directory.people.some((person) => person.id === current)
            ? current
            : directory.people[0]?.id ?? "",
        );
        setDataMode("protected");
      } catch {
        if (active) setDataMode("preview");
      }
    }

    void loadDirectory();
    return () => {
      active = false;
    };
  }, []);

  const visiblePeople = useMemo(() => {
    const normalisedQuery = query.trim().toLowerCase();
    return people.filter((person) => {
      const matchesKind = kindFilter === "all" || person.kind === kindFilter;
      const searchable = [person.name, person.email, roleLabels[person.role]]
        .join(" ")
        .toLowerCase();
      return matchesKind && searchable.includes(normalisedQuery);
    });
  }, [kindFilter, people, query]);

  const selected =
    people.find((person) => person.id === selectedId) ?? people[0];
  const staffCount = people.filter((person) => person.kind === "staff").length;
  const learnerCount = people.filter((person) => person.kind === "learner").length;
  const guardianCount = people.filter((person) => person.kind === "guardian").length;
  const invitedCount = people.filter((person) => person.status === "invited").length;

  async function invitePerson(
    input: {
      email: string;
      firstName: string;
      lastName: string;
      role: SchoolRole;
      scopeId: string;
      scopeType: "tenant" | "class" | "subject" | "learner";
    },
  ) {
    if (dataMode !== "protected") {
      setNotice(
        "Invitations become persistent when this page is opened through the authenticated private site.",
      );
      return;
    }

    const response = await fetch("/api/admin/people", {
      body: JSON.stringify({
        ...input,
        kind: kindForRole(input.role),
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as {
      error?: string;
      person?: DirectoryPerson;
    };
    if (!response.ok || !payload.person) {
      setNotice(payload.error ?? "The invitation could not be created.");
      return;
    }

    setPeople((current) => [payload.person as DirectoryPerson, ...current]);
    setSelectedId(payload.person.id);
    setNotice(`${payload.person.name} has been added with invited access.`);
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label="School administration">
        <Link className="brand" href="/admin" aria-label="Administration home">
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
              className={item.href === "/admin/people" ? "nav-link active" : "nav-link"}
              href={item.href}
              key={item.label}
            >
              <span aria-hidden="true">{item.symbol}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="academic-year-card access-summary">
          <p>Access protection</p>
          <strong>Server enforced</strong>
          <span>Role, school, class, subject & child scope</span>
        </div>

        <Link className="admin-profile" href="/admin">
          <span className="avatar">{initials(actor.name)}</span>
          <span><strong>{actor.name}</strong><small>{roleLabels[actor.role]}</small></span>
          <b aria-hidden="true">↗</b>
        </Link>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div className="admin-mobile-brand">
            <span className="brand-mark" aria-hidden="true">LH</span>
            <strong>People & access</strong>
          </div>
          <nav aria-label="Breadcrumb">
            <Link href="/admin">Greenfield Academy</Link>
            <span aria-hidden="true">/</span>
            <strong>People & access</strong>
          </nav>
          <div className="admin-top-actions">
            <span className={`data-mode mode-${dataMode}`}>
              <i aria-hidden="true" />
              {dataMode === "protected" ? "Protected records" : dataMode === "loading" ? "Connecting" : "Preview data"}
            </span>
            <span className="avatar">{initials(actor.name)}</span>
          </div>
        </header>

        <div className="admin-content people-content">
          <section className="admin-welcome">
            <div>
              <p className="eyebrow">Identity & permissions</p>
              <h1>People & access</h1>
              <p>Manage school members and exactly what each person is allowed to reach.</p>
            </div>
            <div className="signed-in-card">
              <span className="shield-mark" aria-hidden="true">✓</span>
              <div><small>Signed in as</small><strong>{actor.name}</strong><p>{actor.email}</p></div>
            </div>
          </section>

          <section className="admin-stats" aria-label="People summary">
            <article>
              <span className="admin-stat-icon green">◎</span>
              <div><small>Staff profiles</small><strong>{staffCount}</strong></div>
              <em>School and scoped roles</em>
            </article>
            <article>
              <span className="admin-stat-icon blue">L</span>
              <div><small>Learner profiles</small><strong>{learnerCount}</strong></div>
              <em>Class-bound access</em>
            </article>
            <article>
              <span className="admin-stat-icon purple">G</span>
              <div><small>Guardian profiles</small><strong>{guardianCount}</strong></div>
              <em>Relationship-bound</em>
            </article>
            <article>
              <span className="admin-stat-icon gold">✉</span>
              <div><small>Pending invitations</small><strong>{invitedCount}</strong></div>
              <em>Awaiting activation</em>
            </article>
          </section>

          <section className="access-principles" aria-label="Access model">
            <article><span>1</span><p><strong>Identity</strong><small>Who is signed in?</small></p></article>
            <i aria-hidden="true">→</i>
            <article><span>2</span><p><strong>School role</strong><small>What work can they do?</small></p></article>
            <i aria-hidden="true">→</i>
            <article><span>3</span><p><strong>Relationship scope</strong><small>Which records can they reach?</small></p></article>
            <i aria-hidden="true">→</i>
            <article className="decision"><span>✓</span><p><strong>Server decision</strong><small>Allow or deny every request</small></p></article>
          </section>

          {notice && <p className="people-notice" role="status">{notice}</p>}

          <div className="people-workspace">
            <section className="people-directory" aria-labelledby="directory-title">
              <div className="directory-heading">
                <div><p className="eyebrow">School directory</p><h2 id="directory-title">Members</h2></div>
                <span>{visiblePeople.length} shown</span>
              </div>

              <div className="directory-controls">
                <label>
                  <span aria-hidden="true">⌕</span>
                  <input
                    aria-label="Search people"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search name, email or role"
                    value={query}
                  />
                </label>
                <div className="kind-filters" aria-label="Filter people">
                  {(["all", "staff", "learner", "guardian"] as const).map((kind) => (
                    <button
                      className={kindFilter === kind ? "active" : ""}
                      key={kind}
                      onClick={() => setKindFilter(kind)}
                      type="button"
                    >
                      {kind === "all" ? "Everyone" : pluralKind(kind)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="people-table-wrap">
                <table className="people-table">
                  <thead><tr><th>Person</th><th>Role</th><th>Access scope</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {visiblePeople.map((person) => (
                      <tr
                        className={person.id === selected?.id ? "selected" : ""}
                        key={person.id}
                        onClick={() => setSelectedId(person.id)}
                      >
                        <td>
                          <span className={`person-avatar avatar-${person.kind}`}>{initials(person.name)}</span>
                          <span><strong>{person.name}</strong><small>{person.email ?? "No email on record"}</small></span>
                        </td>
                        <td><strong>{roleLabels[person.role]}</strong><small>{person.kind}</small></td>
                        <td><span className="scope-pill">{person.scopeLabel}</span></td>
                        <td><span className={`member-status member-${person.status}`}>{person.status}</span></td>
                        <td><button type="button" aria-label={`View ${person.name}`}>›</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <aside className="access-sidebar">
              {selected && <PersonAccessCard person={selected} />}
              <InvitePersonForm onInvite={invitePerson} />
            </aside>
          </div>
        </div>
      </main>

      <nav className="admin-mobile-nav" aria-label="Mobile administration">
        {navigation.slice(0, 5).map((item) => (
          <Link className={item.href === "/admin/people" ? "active" : ""} href={item.href} key={item.label}>
            <span aria-hidden="true">{item.symbol}</span><small>{item.label}</small>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function PersonAccessCard({ person }: { person: DirectoryPerson }) {
  const permissions = permissionsFor(person.role);
  return (
    <section className="person-access-card" aria-labelledby="person-access-title">
      <div className="person-access-head">
        <span className={`person-avatar avatar-${person.kind}`}>{initials(person.name)}</span>
        <div><p>{person.kind}</p><h2 id="person-access-title">{person.name}</h2><small>{roleLabels[person.role]}</small></div>
        <button type="button" aria-label="More access actions">•••</button>
      </div>
      <dl>
        <div><dt>Access scope</dt><dd>{person.scopeLabel}</dd></div>
        <div><dt>Membership</dt><dd className={`member-${person.status}`}>{person.status}</dd></div>
      </dl>
      <div className="permission-list">
        <h3>Effective permissions</h3>
        {permissions.map((permission) => (
          <p key={permission}><span aria-hidden="true">✓</span>{permission}</p>
        ))}
      </div>
      <div className="access-rule"><span aria-hidden="true">i</span><p>Every API request rechecks school, role, membership status, and relationship scope.</p></div>
    </section>
  );
}

function InvitePersonForm({
  onInvite,
}: {
  onInvite: (input: {
    email: string;
    firstName: string;
    lastName: string;
    role: SchoolRole;
    scopeId: string;
    scopeType: "tenant" | "class" | "subject" | "learner";
  }) => Promise<void>;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<SchoolRole>("teacher");
  const [scopeType, setScopeType] = useState<"tenant" | "class" | "subject" | "learner">("subject");
  const [scopeId, setScopeId] = useState("Integrated Science");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onInvite({ email, firstName, lastName, role, scopeId, scopeType });
  }

  return (
    <section className="invite-card" id="invite" aria-labelledby="invite-title">
      <div><p className="eyebrow">Controlled onboarding</p><h2 id="invite-title">Add a teacher or school member</h2></div>
      <form onSubmit={submit}>
        <div className="name-fields">
          <label><span>First name</span><input required value={firstName} onChange={(event) => setFirstName(event.target.value)} /></label>
          <label><span>Last name</span><input required value={lastName} onChange={(event) => setLastName(event.target.value)} /></label>
        </div>
        <label><span>Email address</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>
          <span>School role</span>
          <select value={role} onChange={(event) => setRole(event.target.value as SchoolRole)}>
            {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <div className="name-fields">
          <label>
            <span>Scope type</span>
            <select
              value={scopeType}
              onChange={(event) => {
                const nextScopeType = event.target.value as typeof scopeType;
                setScopeType(nextScopeType);
                setScopeId(scopeOptions[nextScopeType][0]?.value ?? "");
              }}
            >
              <option value="tenant">Whole school</option>
              <option value="class">Class</option>
              <option value="subject">Subject</option>
              <option value="learner">Learner</option>
            </select>
          </label>
          <label>
            <span>Assigned area</span>
            <select
              disabled={scopeType === "tenant"}
              onChange={(event) => setScopeId(event.target.value)}
              value={scopeId}
            >
              {scopeOptions[scopeType].map((option) => (
                <option key={option.value || "whole-school"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit">Create invitation <span aria-hidden="true">→</span></button>
      </form>
    </section>
  );
}

const scopeOptions: Record<
  "tenant" | "class" | "subject" | "learner",
  { label: string; value: string }[]
> = {
  tenant: [{ label: "Whole school", value: "" }],
  class: [
    { label: "JHS 1 Blue", value: "class-jhs1-blue" },
    { label: "JHS 2 Gold", value: "class-jhs2-gold" },
    { label: "JHS 3 Green", value: "class-jhs3-green" },
    { label: "SHS 1 General Arts", value: "class-shs1-arts" },
  ],
  subject: [
    { label: "Integrated Science", value: "Integrated Science" },
    { label: "Mathematics", value: "Mathematics" },
    { label: "English Language", value: "English Language" },
    { label: "Social Studies", value: "Social Studies" },
    { label: "Computing", value: "Computing" },
  ],
  learner: [
    { label: "Yaa Nkrumah", value: "learner-yaa" },
    { label: "Daniel Asare", value: "learner-daniel" },
    { label: "Adwoa Boateng", value: "learner-adwoa" },
  ],
};

function permissionsFor(role: SchoolRole) {
  const permissions: Record<SchoolRole, string[]> = {
    "school-admin": ["Manage school people", "Configure academics", "Manage admissions", "Publish assessments"],
    "academic-admin": ["View school people", "Configure academics", "Publish assessments", "View reports"],
    "admissions-officer": ["Review applicants", "Create student records", "View intake learners"],
    teacher: ["Create subject lessons", "Publish subject assessments", "View assigned learners"],
    "class-teacher": ["Create lessons", "View class records", "Publish assessments", "View class reports"],
    guardian: ["View linked child", "View released reports"],
    learner: ["View own subjects", "View own reports"],
  };
  return permissions[role];
}

function kindForRole(role: SchoolRole): DirectoryPerson["kind"] {
  if (role === "learner") return "learner";
  if (role === "guardian") return "guardian";
  return "staff";
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("");
}

function pluralKind(kind: DirectoryPerson["kind"]) {
  if (kind === "staff") return "Staff";
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}s`;
}
