"use client";

import { useSearchParams } from "next/navigation";
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
import { PersonAvatar } from "../../components/person-avatar";
import type { GuardianLink } from "../../../db/directory-repository";
import {
  IMPORT_TEMPLATE,
  parsePeopleImport,
  type ImportRowInput,
} from "../../../domain/identity/bulk-import";
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

/* ==========================================================================
   No preview directory

   This screen opened on the demo school's staff and kept them whenever
   /api/admin/people failed, so an administrator could be looking at nine
   people who work somewhere else. Inviting in that state refused with a
   sentence about "the authenticated private site" — a state the product no
   longer has.
   ========================================================================== */

type DirectoryResponse = {
  guardianLinks?: GuardianLink[];
  actor: { email: string; name: string; role: SchoolRole };
  people: DirectoryPerson[];
  school: { id: string; name: string };
};

export function PeopleView() {
  const searchParams = useSearchParams();
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  /* Guardian links were written by admissions and by the demo seed, and by
     nothing else — so a parent could only ever be linked to a child by
     admitting that child, and a wrong link could never be corrected. */
  const [guardianLinks, setGuardianLinks] = useState<GuardianLink[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [kindFilter, setKindFilter] = useState<DirectoryPerson["kind"] | "all">(
    "all",
  );
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"error" | "loading" | "ready">("loading");
  const [problem, setProblem] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState("");
  /* The academic screen sends people here to invite a teacher. That used to
     be a #invite fragment scrolling to a form that was always on screen; now
     that inviting is a task, the caller has to be able to open it, and a
     query the router hands us at render does that without an effect that
     sets state on mount (and without the flash of a closed panel). */
  /* Editing, offboarding and importing. The directory was invite-only, so a
     person invited into the wrong role stayed in it and a leaver stayed
     active for ever. */
  const [editing, setEditing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inviting, setInviting] = useState(
    searchParams.get("invite") !== null,
  );

  useEffect(() => {
    let active = true;

    async function loadDirectory() {
      try {
        const response = await fetch("/api/admin/people");
        const directory = (await response.json()) as DirectoryResponse & {
          error?: string;
        };
        if (!active) return;
        if (!response.ok || !directory.people) {
          throw new Error(directory.error ?? "The directory is unavailable.");
        }
        setPeople(directory.people);
        setGuardianLinks(directory.guardianLinks ?? []);
        setSelectedId((current) =>
          directory.people.some((person) => person.id === current)
            ? current
            : (directory.people[0]?.id ?? ""),
        );
        setState("ready");
      } catch (thrown) {
        if (!active) return;
        setProblem(
          thrown instanceof Error
            ? thrown.message
            : "The directory could not be reached.",
        );
        setState("error");
      }
    }

    void loadDirectory();
    return () => {
      active = false;
    };
  }, [reloadKey]);

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

  /* Everything but the invitation goes through here: each of these changes
     more than one row, so the directory is re-read rather than patched. */
  async function send(body: unknown, success: string) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/people", {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "That change could not be saved.");
      }
      setReloadKey((key) => key + 1);
      setNotice(success);
      return true;
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Something went wrong.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return <p className="workspace-loading">Loading the school directory…</p>;
  }

  if (state === "error") {
    return (
      <div className="workspace-failure">
        <h2>The school directory could not be loaded.</h2>
        <p>{problem}</p>
        <button onClick={() => setReloadKey((key) => key + 1)} type="button">
          Try again
        </button>
      </div>
    );
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
                {/* Inviting a hundred and twenty learners one form at a time
                    is what setting a school up used to mean. */}
                <button
                  className="ghost-button"
                  onClick={() => setImporting(true)}
                  type="button"
                >
                  Import a list
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
              {selected && (
                <PersonAccessCard
                  busy={busy}
                  editing={editing}
                  onEdit={() => setEditing(true)}
                  onCancelEdit={() => setEditing(false)}
                  onOffboard={(reason) =>
                    send(
                      {
                        action: "offboard",
                        personId: selected.id,
                        reason,
                      },
                      `${selected.name} no longer has access.`,
                    )
                  }
                  onReinstate={() =>
                    send(
                      { action: "reinstate", personId: selected.id },
                      `${selected.name} has access again.`,
                    )
                  }
                  onSave={async (input) => {
                    const saved = await send(
                      { action: "update", personId: selected.id, ...input },
                      `${input.firstName} ${input.lastName} was updated.`,
                    );
                    if (saved) setEditing(false);
                  }}
                  person={selected}
                />
              )}
            </aside>
          </div>

          <GuardianLinksPanel
            busy={busy}
            links={guardianLinks}
            onLink={(input) =>
              send(
                { action: "link-guardian", ...input },
                "Guardian linked. They can see this child from their next page load.",
              )
            }
            onRevoke={(linkId, reason) =>
              send(
                { action: "revoke-guardian", linkId, reason },
                "Link removed. That guardian can no longer see this child.",
              )
            }
            people={people}
          />

          {importing && (
            <ImportPeopleForm
              busy={busy}
              onCancel={() => setImporting(false)}
              onImport={async (rows) => {
                const response = await fetch("/api/admin/people", {
                  body: JSON.stringify({ action: "import", rows }),
                  headers: { "content-type": "application/json" },
                  method: "POST",
                });
                const payload = (await response.json()) as {
                  error?: string;
                  outcome?: {
                    failed: Array<{ name: string; problem: string }>;
                    imported: number;
                  };
                };
                setReloadKey((key) => key + 1);
                return (
                  payload.outcome ?? {
                    failed: [],
                    imported: 0,
                  }
                );
              }}
            />
          )}

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

type PersonEdit = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: SchoolRole;
  scopeId: string;
  scopeType: "tenant" | "class" | "subject" | "learner";
};

function PersonAccessCard({
  busy,
  editing,
  onCancelEdit,
  onEdit,
  onOffboard,
  onReinstate,
  onSave,
  person,
}: {
  busy: boolean;
  editing: boolean;
  onCancelEdit: () => void;
  onEdit: () => void;
  onOffboard: (reason: string) => Promise<boolean>;
  onReinstate: () => Promise<boolean>;
  onSave: (input: PersonEdit) => Promise<void>;
  person: DirectoryPerson;
}) {
  const permissions = permissionsFor(person.role);

  if (editing) {
    return (
      <PersonEditForm
        busy={busy}
        onCancel={onCancelEdit}
        onSave={onSave}
        person={person}
      />
    );
  }

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

      {/* None of this existed. A person invited into the wrong role stayed in
          it, a leaver stayed active, and a mistyped address could never be
          corrected: the whole write surface was one invitation form. */}
      <div className="person-actions">
        <button className="ghost-button" onClick={onEdit} type="button">
          Edit details
        </button>
        {person.status === "revoked" ? (
          <button
            className="ghost-button"
            disabled={busy}
            onClick={() => void onReinstate()}
            type="button"
          >
            Restore access
          </button>
        ) : (
          <OffboardButton busy={busy} onOffboard={onOffboard} person={person} />
        )}
      </div>
    </section>
  );
}

/**
 * Removing access, with the reason it asks for.
 *
 * Two presses rather than one, and a reason in between. Nothing is deleted —
 * the membership is revoked, so the person keeps their record and every mark
 * they gave stays attached to it — but losing access to a school system in
 * the middle of a term is not a one-click action.
 */
function OffboardButton({
  busy,
  onOffboard,
  person,
}: {
  busy: boolean;
  onOffboard: (reason: string) => Promise<boolean>;
  person: DirectoryPerson;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");

  if (!confirming) {
    return (
      <button
        className="ghost-button"
        onClick={() => setConfirming(true)}
        type="button"
      >
        Remove access
      </button>
    );
  }

  return (
    <form
      className="offboard-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const done = await onOffboard(reason);
        if (done) setConfirming(false);
      }}
    >
      <label>
        <span>Why is {person.name} being removed?</span>
        <input
          onChange={(event) => setReason(event.target.value)}
          placeholder="Left the school at the end of term"
          required
          value={reason}
        />
      </label>
      <p className="form-hint">
        Their record and everything attached to it is kept. They stop being
        able to sign in, and stop appearing on a roster.
      </p>
      <div className="form-actions">
        <button disabled={busy} type="submit">
          Remove access
        </button>
        <button
          className="ghost-button"
          onClick={() => setConfirming(false)}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function PersonEditForm({
  busy,
  onCancel,
  onSave,
  person,
}: {
  busy: boolean;
  onCancel: () => void;
  onSave: (input: PersonEdit) => Promise<void>;
  person: DirectoryPerson;
}) {
  const [firstName, setFirstName] = useState(person.name.split(" ")[0] ?? "");
  const [lastName, setLastName] = useState(
    person.name.split(" ").slice(1).join(" "),
  );
  const [email, setEmail] = useState(person.email ?? "");
  const [phone, setPhone] = useState(person.phone ?? "");
  const [role, setRole] = useState<SchoolRole>(person.role);
  const [scopeType, setScopeType] = useState<PersonEdit["scopeType"]>(
    person.scopeLabel === "Whole school" ? "tenant" : "class",
  );
  const [scopeId, setScopeId] = useState(
    person.scopeLabel === "Whole school"
      ? ""
      : (person.scopeLabel.split(" \u00b7 ")[1] ?? ""),
  );

  return (
    <section className="person-access-card">
      <form
        className="person-edit-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({
            email,
            firstName,
            lastName,
            phone,
            role,
            scopeId,
            scopeType,
          });
        }}
      >
        <h2>Edit {person.name}</h2>
        <label>
          <span>First name</span>
          <input
            onChange={(event) => setFirstName(event.target.value)}
            required
            value={firstName}
          />
        </label>
        <label>
          <span>Last name</span>
          <input
            onChange={(event) => setLastName(event.target.value)}
            required
            value={lastName}
          />
        </label>
        <label>
          <span>Email address</span>
          <input
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
        </label>
        <label>
          <span>Telephone</span>
          <input
            onChange={(event) => setPhone(event.target.value)}
            value={phone}
          />
        </label>
        <label>
          <span>Role</span>
          <select
            onChange={(event) => setRole(event.target.value as SchoolRole)}
            value={role}
          >
            {Object.entries(roleLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Scope</span>
          <select
            onChange={(event) =>
              setScopeType(event.target.value as PersonEdit["scopeType"])
            }
            value={scopeType}
          >
            <option value="tenant">Whole school</option>
            <option value="class">One class</option>
            <option value="subject">One subject</option>
          </select>
        </label>
        {scopeType !== "tenant" ? (
          <label>
            <span>Which one</span>
            <input
              onChange={(event) => setScopeId(event.target.value)}
              placeholder="JHS 1 Blue"
              value={scopeId}
            />
          </label>
        ) : null}
        <div className="form-actions">
          <button disabled={busy} type="submit">
            Save changes
          </button>
          <button className="ghost-button" onClick={onCancel} type="button">
            Cancel
          </button>
        </div>
      </form>
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

/* ==========================================================================
   Importing a roll

   Setting a school up meant inviting learners one form at a time, and getting
   every one of them right first time, because there was no way to correct a
   row afterwards either. A JHS with three streams is a hundred and twenty
   forms.

   Two steps on purpose. The paste is checked first and every line gets a
   verdict, because the rule the product scope is firmest about is that a bulk
   import never silently skips an invalid row — so the school reads what will
   happen before anything is written, and reads what did happen afterwards.
   ========================================================================== */
function ImportPeopleForm({
  busy,
  onCancel,
  onImport,
}: {
  busy: boolean;
  onCancel: () => void;
  onImport: (rows: ImportRowInput[]) => Promise<{
    failed: Array<{ name: string; problem: string }>;
    imported: number;
  }>;
}) {
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState<{
    failed: Array<{ name: string; problem: string }>;
    imported: number;
  } | null>(null);

  const preview = text.trim() ? parsePeopleImport(text) : null;

  if (outcome) {
    return (
      <section className="admin-panel import-panel">
        <div className="admin-panel-heading">
          <div>
            <p className="eyebrow">Import</p>
            <h2>
              {outcome.imported} added
              {outcome.failed.length > 0
                ? `, ${outcome.failed.length} not added`
                : ""}
            </h2>
          </div>
        </div>
        {outcome.failed.length > 0 ? (
          <ul className="import-problems">
            {outcome.failed.map((row) => (
              <li key={`${row.name}-${row.problem}`}>
                <strong>{row.name}</strong>
                <span>{row.problem}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="form-hint">Everybody in that list is on the roll.</p>
        )}
        <div className="form-actions">
          <button onClick={onCancel} type="button">
            Done
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-panel import-panel">
      <div className="admin-panel-heading">
        <div>
          <p className="eyebrow">Import</p>
          <h2>Add a list of people</h2>
        </div>
      </div>

      <p className="form-hint">
        Paste straight from a spreadsheet. Columns: first name, last name,
        email, role, class, telephone. A header row is fine. Roles are learner,
        guardian, teacher, class teacher, academic admin, admissions officer
        and school admin.
      </p>

      <label className="wide-field">
        <span>Rows</span>
        <textarea
          onChange={(event) => setText(event.target.value)}
          placeholder={IMPORT_TEMPLATE}
          rows={10}
          value={text}
        />
      </label>

      {preview ? (
        <div className="import-preview">
          <p>
            <strong>{preview.accepted.length}</strong> ready to add
            {preview.rejected.length > 0 ? (
              <>
                {" · "}
                <strong className="is-blocking">
                  {preview.rejected.length}
                </strong>{" "}
                cannot be
              </>
            ) : null}
          </p>
          {preview.rejected.length > 0 ? (
            <ul className="import-problems">
              {preview.rejected.map((row) => (
                <li key={row.line}>
                  <strong>Line {row.line}</strong>
                  <span>{row.problem}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="form-actions">
        <button
          disabled={busy || !preview || preview.accepted.length === 0}
          onClick={async () => {
            if (!preview) return;
            setOutcome(await onImport(preview.accepted));
          }}
          type="button"
        >
          {busy
            ? "Adding…"
            : `Add ${preview?.accepted.length ?? 0} ${
                (preview?.accepted.length ?? 0) === 1 ? "person" : "people"
              }`}
        </button>
        <button className="ghost-button" onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </section>
  );
}

/* ==========================================================================
   Who answers for a child

   `guardian_relationships` rows were written by enrolApplicant() and by the
   demo seed, and by nothing else. So a guardian could only ever be linked to
   a child by admitting that child through admissions: there was no way to
   link a parent to a learner already on roll, no way to correct a wrong link,
   and no way to revoke one.

   That last one is the important one. The integrity rules require guardian
   access to be revocable and the change to take effect immediately, and every
   read path now filters on the status this sets — so a revoked link stops
   granting access rather than merely looking revoked.
   ========================================================================== */
function GuardianLinksPanel({
  busy,
  links,
  onLink,
  onRevoke,
  people,
}: {
  busy: boolean;
  links: GuardianLink[];
  onLink: (input: {
    guardianId: string;
    learnerId: string;
    relationship: string;
  }) => Promise<boolean>;
  onRevoke: (linkId: string, reason: string) => Promise<boolean>;
  people: DirectoryPerson[];
}) {
  const [adding, setAdding] = useState(false);
  const [guardianId, setGuardianId] = useState("");
  const [learnerId, setLearnerId] = useState("");
  const [relationship, setRelationship] = useState("Parent");
  const [revokingId, setRevokingId] = useState("");
  const [reason, setReason] = useState("");

  const guardians = people.filter((person) => person.kind === "guardian");
  const learners = people.filter((person) => person.kind === "learner");
  const active = links.filter((link) => link.status === "active");

  return (
    <section className="admin-panel guardian-links">
      <div className="admin-panel-heading">
        <div>
          <p className="eyebrow">Families</p>
          <h2>Guardians and children</h2>
        </div>
        <button
          className="ghost-button"
          disabled={busy || guardians.length === 0 || learners.length === 0}
          onClick={() => setAdding(!adding)}
          type="button"
        >
          {adding ? "Cancel" : "Link a guardian"}
        </button>
      </div>

      {guardians.length === 0 || learners.length === 0 ? (
        <p className="form-hint">
          A link needs a guardian and a learner on the roll. Invite or import
          them first.
        </p>
      ) : null}

      {adding ? (
        <form
          className="inline-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const done = await onLink({ guardianId, learnerId, relationship });
            if (done) {
              setAdding(false);
              setGuardianId("");
              setLearnerId("");
            }
          }}
        >
          <div className="inline-form-fields">
            <label>
              <span>Guardian</span>
              <select
                onChange={(event) => setGuardianId(event.target.value)}
                required
                value={guardianId}
              >
                <option value="">Choose</option>
                {guardians.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Child</span>
              <select
                onChange={(event) => setLearnerId(event.target.value)}
                required
                value={learnerId}
              >
                <option value="">Choose</option>
                {learners.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Relationship</span>
              <input
                onChange={(event) => setRelationship(event.target.value)}
                placeholder="Mother"
                value={relationship}
              />
            </label>
          </div>
          <div className="form-actions">
            <button disabled={busy} type="submit">
              Link them
            </button>
          </div>
        </form>
      ) : null}

      {active.length === 0 ? (
        <p className="form-hint">
          No guardian is linked to a child yet. Admitting an applicant creates
          a link automatically; this is for everybody already on the roll.
        </p>
      ) : (
        <ul className="guardian-link-list">
          {active.map((link) => (
            <li key={link.linkId}>
              <span>
                <strong>{link.guardianName}</strong>
                <small>
                  {link.relationship} of {link.learnerName}
                </small>
              </span>
              {revokingId === link.linkId ? (
                <form
                  className="offboard-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const done = await onRevoke(link.linkId, reason);
                    if (done) {
                      setRevokingId("");
                      setReason("");
                    }
                  }}
                >
                  <label>
                    <span>Why is this link being removed?</span>
                    <input
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Court order, September 2026"
                      required
                      value={reason}
                    />
                  </label>
                  <div className="form-actions">
                    <button disabled={busy} type="submit">
                      Remove link
                    </button>
                    <button
                      className="ghost-button"
                      onClick={() => setRevokingId("")}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  className="ghost-button"
                  disabled={busy}
                  onClick={() => setRevokingId(link.linkId)}
                  type="button"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
