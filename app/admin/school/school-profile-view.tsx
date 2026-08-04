"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { SchoolProfileEdit } from "../../../domain/school/public-profile";
import "../academic/academic.css";
import "./school-profile.css";

/* ==========================================================================
   The school's own details

   Everything on this screen was, until now, a TypeScript constant:
   `greenfieldProfile` in domain/school/public-profile.ts, imported directly
   by the landing page, the sign-in page, the admissions section, the
   applicant account and the admissions emails. A school could not correct its
   own telephone number without a developer and a redeploy.

   Deliberately not everything the public site shows. Hero photographs,
   programmes, news and testimonials are still carried in the profile document
   and still rendered — they just need an editor of their own, with image
   upload, which is a bigger screen than this one. What is here is the part a
   school gets wrong soonest: who they are and how to reach them.
   ========================================================================== */

/* Four is what the design allows for and what a Ghanaian postal address
   needs — street, district, region, country. */
const ADDRESS_LINES = 4;

const BLANK: SchoolProfileEdit = {
  admissionsNote: "",
  contactAddress: [],
  contactEmail: "",
  established: new Date().getUTCFullYear(),
  location: "",
  name: "",
  officeHours: "",
  strapline: "",
  telephone: "",
};

async function fetchProfile(): Promise<SchoolProfileEdit | null> {
  try {
    const response = await fetch("/api/admin/school");
    const payload = (await response.json()) as {
      error?: string;
      profile?: SchoolProfileEdit;
    };
    return response.ok ? (payload.profile ?? null) : null;
  } catch {
    return null;
  }
}

export function SchoolProfileView() {
  const [profile, setProfile] = useState<SchoolProfileEdit>(BLANK);
  const [state, setState] = useState<"error" | "loading" | "ready">("loading");
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadOnce() {
      const loaded = await fetchProfile();
      if (!active) return;
      if (!loaded) {
        setProblem("The school’s details could not be loaded.");
        setState("error");
        return;
      }
      setProfile(loaded);
      setState("ready");
    }

    void loadOnce();
    return () => {
      active = false;
    };
  }, []);

  function set<Field extends keyof SchoolProfileEdit>(
    field: Field,
    value: SchoolProfileEdit[Field],
  ) {
    setProfile((current) => ({ ...current, [field]: value }));
    setNotice("");
  }

  function setAddressLine(index: number, value: string) {
    setProfile((current) => {
      const lines = [...current.contactAddress];
      while (lines.length < ADDRESS_LINES) lines.push("");
      lines[index] = value;
      return { ...current, contactAddress: lines };
    });
    setNotice("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    setProblem("");
    try {
      const response = await fetch("/api/admin/school", {
        body: JSON.stringify(profile),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      const payload = (await response.json()) as {
        error?: string;
        profile?: SchoolProfileEdit;
      };
      if (!response.ok || !payload.profile) {
        throw new Error(
          payload.error ?? "The school’s details could not be saved.",
        );
      }
      /* Replaced with what the server stored rather than what was typed, so
         the trimming and lower-casing it does are visible immediately instead
         of appearing on the next load. */
      setProfile(payload.profile);
      setNotice("Saved. The public site is showing these details now.");
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return <p className="academic-loading">Loading the school’s details…</p>;
  }

  if (state === "error") {
    return (
      <div className="academic-empty">
        <h2>The school’s details could not be loaded.</h2>
        <p>{problem}</p>
      </div>
    );
  }

  const addressLines = [...profile.contactAddress];
  while (addressLines.length < ADDRESS_LINES) addressLines.push("");

  return (
    <div className="admin-content">
      <section className="admin-welcome">
        <div>
          <p className="eyebrow">Public identity</p>
          <h1>School details</h1>
          <p>
            What the public site, the sign-in page and every admissions email
            say about this school.
          </p>
        </div>
        <Link className="ghost-button" href="/">
          View public site
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

      <form className="school-form" onSubmit={save}>
        <section className="admin-panel school-section">
          <div className="admin-panel-heading">
            <div>
              <p className="eyebrow">Identity</p>
              <h2>Who this school is</h2>
            </div>
          </div>
          <div className="inline-form-fields">
            <label>
              <span>School name</span>
              <input
                onChange={(event) => set("name", event.target.value)}
                required
                value={profile.name}
              />
            </label>
            <label>
              <span>Town or district</span>
              <input
                onChange={(event) => set("location", event.target.value)}
                placeholder="Osu, Accra"
                value={profile.location}
              />
            </label>
            <label>
              <span>Established</span>
              <input
                max={new Date().getUTCFullYear()}
                min={1800}
                onChange={(event) =>
                  set("established", Number(event.target.value) || 0)
                }
                type="number"
                value={profile.established}
              />
            </label>
          </div>
          <label className="wide-field">
            <span>Strapline</span>
            <input
              onChange={(event) => set("strapline", event.target.value)}
              placeholder="Basic education in Osu, Accra, since 2004"
              value={profile.strapline}
            />
            <small>The line under the crest, in the school’s own words.</small>
          </label>
        </section>

        <section className="admin-panel school-section">
          <div className="admin-panel-heading">
            <div>
              <p className="eyebrow">Contact</p>
              <h2>How families reach the office</h2>
            </div>
          </div>
          <div className="inline-form-fields">
            <label>
              <span>Email address</span>
              <input
                onChange={(event) => set("contactEmail", event.target.value)}
                required
                type="email"
                value={profile.contactEmail}
              />
            </label>
            <label>
              <span>Telephone</span>
              <input
                onChange={(event) => set("telephone", event.target.value)}
                value={profile.telephone}
              />
            </label>
            <label>
              <span>Office hours</span>
              <input
                onChange={(event) => set("officeHours", event.target.value)}
                placeholder="Monday to Friday, 7:30am – 4:00pm"
                value={profile.officeHours}
              />
            </label>
          </div>

          <fieldset className="address-fieldset">
            <legend>Postal address</legend>
            {addressLines.slice(0, ADDRESS_LINES).map((line, index) => (
              <input
                aria-label={`Address line ${index + 1}`}
                key={index}
                onChange={(event) => setAddressLine(index, event.target.value)}
                placeholder={index === 0 ? "12 Otswe Street, Osu" : ""}
                value={line}
              />
            ))}
            <small>Blank lines are left out. At least one is needed.</small>
          </fieldset>
        </section>

        <section className="admin-panel school-section">
          <div className="admin-panel-heading">
            <div>
              <p className="eyebrow">Admissions</p>
              <h2>What applicants are told</h2>
            </div>
          </div>
          <label className="wide-field">
            <span>Note on the admissions page</span>
            <textarea
              onChange={(event) => set("admissionsNote", event.target.value)}
              rows={3}
              value={profile.admissionsNote}
            />
            <small>
              Shown above the steps. The intake’s own name and closing date
              come from{" "}
              <Link href="/admin/admissions">the intake</Link>, not from here,
              so the date families read is the date the form enforces.
            </small>
          </label>
        </section>

        <div className="form-actions school-actions">
          <button disabled={busy} type="submit">
            {busy ? "Saving…" : "Save school details"}
          </button>
        </div>
      </form>
    </div>
  );
}
