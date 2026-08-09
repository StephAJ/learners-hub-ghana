"use client";

import { useSearchParams } from "next/navigation";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { demoDirectoryPeople } from "../../../domain/demo/greenfield";
import type {
  DirectoryPerson,
  SchoolRole,
} from "../../../domain/identity/types";
import { PersonAvatar } from "../../components/person-avatar";
import {
  BooksIcon,
  InboxIcon,
  SchoolIcon,
  UsersIcon,
} from "../../components/icons";
import "../academic/academic.css";
import "../../teacher/assessments/composer-shell.css";
import "./people.css";

const roleLabels: Record<SchoolRole, string> = {
  "school-admin": "School administrator",
  "academic-admin": "Academic administrator",
  "admissions-officer": "Admissions officer",
  teacher: "Subject teacher",
  "class-teacher": "Class teacher",
  guardian: "Guardian",
  learner: "Learner",
};

/* Projected from the shared demo dataset rather than written out again
   here: the hand-kept copy this replaces had drifted to five of the nine
   people and none of the photographs. */
const previewPeople: DirectoryPerson[] = demoDirectoryPeople;

type DirectoryResponse = {
  actor: { email: string; name: string; role: SchoolRole };
  people: DirectoryPerson[];
  school: { id: string; name: string };
};

export function PeopleView() {
  const searchParams = useSearchParams();
  const [people, setPeople] = useState(previewPeople);
  const [selectedId, setSelectedId] = useState(previewPeople[0].id);
  const [kindFilter, setKindFilter] = useState<DirectoryPerson["kind"] | "all">(
    "all",
  );
  const [query, setQuery] = useState("");
  const [dataMode, setDataMode] = useState<"loading" | "protected" | "preview">(
    "loading",
  );
  const [notice, setNotice] = useState("");
  /* The academic screen sends people here to invite a teacher. That used to
     be a #invite fragment scrolling to a form that was always on screen; now
     that inviting is a task, the caller has to be able to open it, and a
     query the router hands us at render does that without an effect that
     sets state on mount (and without the flash of a closed panel). */
  const [inviting, setInviting] = useState(
    searchParams.get("invite") !== null,
  );

  useEffect(() => {
    let active = true;

    async function loadDirectory() {
      try {
        const response = await fetch("/api/admin/people");
        if (!response.ok) throw new Error("Protected records unavailable.");
        const directory = (await response.json()) as DirectoryResponse;
        if (!active) return;
        setPeople(directory.people);
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
    <>


        <div className="admin-content people-content">
          <section className="admin-stats" aria-label="People summary">
            <article>
              <span className="admin-stat-icon" data-hue="teal" aria-hidden="true"><SchoolIcon size={20} /></span>
              <div><small>Staff profiles</small><strong>{staffCount}</strong></div>
              <em>School and scoped roles</em>
            </article>
            <article>
              <span className="admin-stat-icon" data-hue="blue" aria-hidden="true"><BooksIcon size={20} /></span>
              <div><small>Learner profiles</small><strong>{learnerCount}</strong></div>
              <em>Class-bound access</em>
            </article>
            <article>
              <span className="admin-stat-icon" data-hue="violet" aria-hidden="true"><UsersIcon size={20} /></span>
              <div><small>Guardian profiles</small><strong>{guardianCount}</strong></div>
              <em>Relationship-bound</em>
            </article>
            <article>
              <span className="admin-stat-icon" data-hue="amber" aria-hidden="true"><InboxIcon size={20} /></span>
              <div><small>Pending invitations</small><strong>{invitedCount}</strong></div>
              <em>Awaiting activation</em>
            </article>
          </section>

          {/* The four-step "Identity → School role → Relationship scope →
              Server decision" strip that used to sit here explained how the
              product's authorisation works. True, and no help at all to
              someone who came to add a teacher: it was a diagram of our
              architecture on their operational screen, above the fold, every
              visit. The one part of it they can act on — what a role can
              actually reach — is on the person's own card, where it is about
              a person rather than about us. */}

          {notice && <p className="people-notice" role="status">{notice}</p>}

          <div className="people-workspace">
            <section className="people-directory" aria-labelledby="directory-title">
              <div className="directory-heading">
                <div><p className="eyebrow">School directory</p><h2 id="directory-title">Members</h2></div>
                <span>{visiblePeople.length} shown</span>
                <button
                  className="directory-invite"
                  onClick={() => setInviting(true)}
                  type="button"
                >
                  Invite someone
                </button>
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
                          <PersonAvatar
                            className="person-avatar"
                            kind={person.kind}
                            name={person.name}
                            photoUrl={person.photoUrl}
                            size={36}
                          />
                          <span><strong>{person.name}</strong><small>{person.email ?? "No email on record"}</small></span>
                        </td>
                        <td><strong>{roleLabels[person.role]}</strong><small>{person.kind}</small></td>
                        <td><span className="scope-pill">{person.scopeLabel}</span></td>
                        <td><span className={`member-status member-${person.status}`}>{person.status}</span></td>
                        <td>
                          {/* The row carries a click handler, but a <tr> is
                              not keyboard-reachable, so this button is the
                              accessible way in rather than decoration that
                              only works because the click bubbles. */}
                          <button
                            aria-label={`View access for ${person.name}`}
                            onClick={() => setSelectedId(person.id)}
                            type="button"
                          >
                            ›
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <aside className="access-sidebar">
              {selected && <PersonAccessCard person={selected} />}
            </aside>
          </div>

          {inviting && (
            <InvitePersonForm
              onCancel={() => setInviting(false)}
              onInvite={async (input) => {
                await invitePerson(input);
                setInviting(false);
              }}
            />
          )}
        </div>

    </>
  );
}

function PersonAccessCard({ person }: { person: DirectoryPerson }) {
  const permissions = permissionsFor(person.role);
  return (
    <section className="person-access-card" aria-labelledby="person-access-title">
      <div className="person-access-head">
        <PersonAvatar
          className="person-avatar"
          kind={person.kind}
          name={person.name}
          photoUrl={person.photoUrl}
          size={52}
        />
        <div><p>{person.kind}</p><h2 id="person-access-title">{person.name}</h2><small>{roleLabels[person.role]}</small></div>
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

/**
 * Inviting someone, as a task rather than a permanent column.
 *
 * This was six fields open in the sidebar on every visit, beside a person's
 * access card that had nothing to do with them — so the screen always showed
 * a half-filled form nobody had started. It is the same fields, opened when
 * someone says they want to invite a person, in the panel shell the quiz
 * builder and the class planner already use.
 */
function InvitePersonForm({
  onCancel,
  onInvite,
}: {
  onCancel: () => void;
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
    <div className="composer-scrim" role="dialog" aria-modal="true">
      <form className="composer" id="invite" onSubmit={submit}>
        <header className="composer-head">
          <div>
            <p className="composer-eyebrow">Controlled onboarding</p>
            <h2 id="invite-title">Add a teacher or school member</h2>
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

        <div className="composer-body">
          <div className="composer-meta invite-names">
            <label className="composer-field">
              <span>First name</span>
              <input required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
            </label>
            <label className="composer-field">
              <span>Last name</span>
              <input required value={lastName} onChange={(event) => setLastName(event.target.value)} />
            </label>
          </div>

          <label className="composer-field">
            <span>Email address</span>
            <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>

          <label className="composer-field">
            <span>School role</span>
            <select value={role} onChange={(event) => setRole(event.target.value as SchoolRole)}>
              {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          {/* What the chosen role will actually be able to reach, before the
              invitation is sent rather than after it is accepted. The list
              was already computed for the directory's access card; showing
              it here is what makes the role dropdown a decision rather than
              a guess. */}
          <p className="invite-permissions">
            <strong>{roleLabels[role]} will be able to:</strong>
            {permissionsFor(role).join(" · ")}
          </p>

          <div className="composer-meta invite-names">
            <label className="composer-field">
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
            <label className="composer-field">
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
        </div>

        <footer className="composer-foot">
          <p className="composer-hint">
            They are sent an invitation and get access once they accept.
          </p>
          <div className="composer-actions">
            <button className="composer-quiet" onClick={onCancel} type="button">
              Cancel
            </button>
            <button className="composer-primary" type="submit">
              Create invitation
            </button>
          </div>
        </footer>
      </form>
    </div>
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


function pluralKind(kind: DirectoryPerson["kind"]) {
  if (kind === "staff") return "Staff";
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}s`;
}
