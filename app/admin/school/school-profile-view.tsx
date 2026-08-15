"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type {
  HeroSlide,
  NewsItem,
  Programme,
  SchoolFact,
  SchoolProfileEdit,
  Testimonial,
} from "../../../domain/school/public-profile";
import "../academic/academic.css";
import "./school-profile.css";

/* ==========================================================================
   The school's own details

   Everything on this screen was, until now, a TypeScript constant:
   `greenfieldProfile` in domain/school/public-profile.ts, imported directly
   by the landing page, the sign-in page, the admissions section, the
   applicant account and the admissions emails. A school could not correct its
   own telephone number without a developer and a redeploy.

   It now reaches every word the public site says. It used to cover ten
   fields — name, address, telephone and the like — and carry the rest of the
   document through untouched, so a school that filled this in still published
   Greenfield's story about a mural, its BECE results, its three programmes and
   two testimonials from people who do not work there.

   Photographs are the one thing still carried through rather than edited.
   Choosing one is a media-library job rather than a text field, and a school
   part-way through replacing them is better served by the stock images than by
   empty frames.
   ========================================================================== */

/* Four is what the design allows for and what a Ghanaian postal address
   needs — street, district, region, country. */
const ADDRESS_LINES = 4;

const BLANK: SchoolProfileEdit = {
  aboutBody: "",
  aboutFacts: [],
  aboutHeading: "",
  aboutLead: "",
  academicsHeading: "",
  academicsLead: "",
  admissionsNote: "",
  contactAddress: [],
  contactEmail: "",
  established: new Date().getUTCFullYear(),
  heroSlides: [],
  location: "",
  name: "",
  news: [],
  officeHours: "",
  programmes: [],
  strapline: "",
  studentLifeHeading: "",
  studentLifeHighlights: [],
  studentNumberPrefix: "",
  telephone: "",
  testimonials: [],
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

  /* One updater for every repeated section, so adding a programme and adding a
     news item are not two nearly-identical pieces of state juggling. */
  function setRow<Field extends keyof SchoolProfileEdit>(
    field: Field,
    index: number,
    row: SchoolProfileEdit[Field] extends Array<infer Item> ? Item : never,
  ) {
    setProfile((current) => {
      const rows = [...(current[field] as unknown as unknown[])];
      rows[index] = row;
      return { ...current, [field]: rows };
    });
    setNotice("");
  }

  function addRow<Field extends keyof SchoolProfileEdit>(
    field: Field,
    row: SchoolProfileEdit[Field] extends Array<infer Item> ? Item : never,
  ) {
    setProfile((current) => ({
      ...current,
      [field]: [...(current[field] as unknown as unknown[]), row],
    }));
    setNotice("");
  }

  function removeRow(field: keyof SchoolProfileEdit, index: number) {
    setProfile((current) => ({
      ...current,
      [field]: (current[field] as unknown as unknown[]).filter(
        (_, position) => position !== index,
      ),
    }));
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

          {/* Everything else on this screen is published on the public site.
              This is not — it is the school's own filing, and it is here
              because this is where a school edits itself. */}
          <label className="wide-field">
            <span>Student number prefix</span>
            <input
              maxLength={6}
              onChange={(event) =>
                set("studentNumberPrefix", event.target.value)
              }
              placeholder="GA"
              value={profile.studentNumberPrefix}
            />
            <small>
              Goes in front of each learner&rsquo;s number:{" "}
              {previewStudentNumber(profile.studentNumberPrefix)}. Letters and
              digits only. Changing it renames nobody — learners already
              enrolled keep the number the school gave them.
            </small>
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

        <section className="admin-panel school-section">
          <div className="admin-panel-heading">
            <div>
              <p className="eyebrow">Public page</p>
              <h2>Who we are</h2>
            </div>
          </div>
          <label className="wide-field">
            <span>Heading</span>
            <input
              onChange={(event) => set("aboutHeading", event.target.value)}
              required
              value={profile.aboutHeading}
            />
          </label>
          <label className="wide-field">
            <span>Opening paragraph</span>
            <textarea
              onChange={(event) => set("aboutLead", event.target.value)}
              rows={4}
              value={profile.aboutLead}
            />
          </label>
          <label className="wide-field">
            <span>Second paragraph</span>
            <textarea
              onChange={(event) => set("aboutBody", event.target.value)}
              rows={3}
              value={profile.aboutBody}
            />
          </label>

          <fieldset className="profile-rows">
            <legend>Figures beside the photograph</legend>
            {profile.aboutFacts.map((fact, index) => (
              <div className="profile-row profile-row-pair" key={fact.id || index}>
                <label>
                  <span>Label</span>
                  <input
                    onChange={(event) =>
                      setRow("aboutFacts", index, {
                        ...fact,
                        label: event.target.value,
                      })
                    }
                    placeholder="Learners"
                    value={fact.label}
                  />
                </label>
                <label>
                  <span>Figure</span>
                  <input
                    onChange={(event) =>
                      setRow("aboutFacts", index, {
                        ...fact,
                        value: event.target.value,
                      })
                    }
                    placeholder="640"
                    value={fact.value}
                  />
                </label>
                <button
                  className="ghost-button"
                  onClick={() => removeRow("aboutFacts", index)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className="ghost-button"
              onClick={() =>
                addRow("aboutFacts", {
                  id: `fact-${Date.now()}`,
                  label: "",
                  value: "",
                } satisfies SchoolFact)
              }
              type="button"
            >
              Add a figure
            </button>
            <small>
              A figure with no label is left out. Nothing here is checked
              against the register — these are the school&rsquo;s own claims.
            </small>
          </fieldset>
        </section>

        <section className="admin-panel school-section">
          <div className="admin-panel-heading">
            <div>
              <p className="eyebrow">Public page</p>
              <h2>Academics</h2>
            </div>
          </div>
          <label className="wide-field">
            <span>Heading</span>
            <input
              onChange={(event) => set("academicsHeading", event.target.value)}
              required
              value={profile.academicsHeading}
            />
          </label>
          <label className="wide-field">
            <span>Introduction</span>
            <textarea
              onChange={(event) => set("academicsLead", event.target.value)}
              rows={3}
              value={profile.academicsLead}
            />
          </label>

          <fieldset className="profile-rows">
            <legend>Stages</legend>
            {profile.programmes.map((programme, index) => (
              <div className="profile-row" key={programme.id || index}>
                <div className="inline-form-fields">
                  <label>
                    <span>Name</span>
                    <input
                      onChange={(event) =>
                        setRow("programmes", index, {
                          ...programme,
                          name: event.target.value,
                        })
                      }
                      placeholder="Junior High"
                      value={programme.name}
                    />
                  </label>
                  <label>
                    <span>Years</span>
                    <input
                      onChange={(event) =>
                        setRow("programmes", index, {
                          ...programme,
                          years: event.target.value,
                        })
                      }
                      placeholder="JHS 1 – 3"
                      value={programme.years}
                    />
                  </label>
                  <label>
                    <span>Ages</span>
                    <input
                      onChange={(event) =>
                        setRow("programmes", index, {
                          ...programme,
                          ages: event.target.value,
                        })
                      }
                      placeholder="Ages 12 – 15"
                      value={programme.ages}
                    />
                  </label>
                </div>
                <label className="wide-field">
                  <span>Summary</span>
                  <textarea
                    onChange={(event) =>
                      setRow("programmes", index, {
                        ...programme,
                        summary: event.target.value,
                      })
                    }
                    rows={2}
                    value={programme.summary}
                  />
                </label>
                <label className="wide-field">
                  <span>Points</span>
                  <textarea
                    onChange={(event) =>
                      setRow("programmes", index, {
                        ...programme,
                        points: event.target.value.split("\n"),
                      })
                    }
                    rows={3}
                    value={programme.points.join("\n")}
                  />
                  <small>One per line.</small>
                </label>
                <button
                  className="ghost-button"
                  onClick={() => removeRow("programmes", index)}
                  type="button"
                >
                  Remove this stage
                </button>
              </div>
            ))}
            <button
              className="ghost-button"
              onClick={() =>
                addRow("programmes", {
                  ages: "",
                  id: `programme-${Date.now()}`,
                  name: "",
                  points: [],
                  summary: "",
                  years: "",
                } satisfies Programme)
              }
              type="button"
            >
              Add a stage
            </button>
          </fieldset>
        </section>

        <section className="admin-panel school-section">
          <div className="admin-panel-heading">
            <div>
              <p className="eyebrow">Public page</p>
              <h2>Student life</h2>
            </div>
          </div>
          <label className="wide-field">
            <span>Heading</span>
            <input
              onChange={(event) => set("studentLifeHeading", event.target.value)}
              required
              value={profile.studentLifeHeading}
            />
          </label>
          <label className="wide-field">
            <span>On the timetable</span>
            <textarea
              onChange={(event) =>
                set("studentLifeHighlights", event.target.value.split("\n"))
              }
              rows={5}
              value={profile.studentLifeHighlights.join("\n")}
            />
            <small>
              One per line. Leave it empty and the panel is not shown.
            </small>
          </label>
        </section>

        <section className="admin-panel school-section">
          <div className="admin-panel-heading">
            <div>
              <p className="eyebrow">Public page</p>
              <h2>Hero slides</h2>
            </div>
          </div>
          {profile.heroSlides.map((slide, index) => (
            <div className="profile-row" key={slide.id || index}>
              <div className="inline-form-fields">
                <label>
                  <span>Eyebrow</span>
                  <input
                    onChange={(event) =>
                      setRow("heroSlides", index, {
                        ...slide,
                        eyebrow: event.target.value,
                      })
                    }
                    placeholder="Academics"
                    value={slide.eyebrow}
                  />
                </label>
                <label>
                  <span>Figure</span>
                  <input
                    onChange={(event) =>
                      setRow("heroSlides", index, {
                        ...slide,
                        stat: { ...slide.stat, value: event.target.value },
                      })
                    }
                    placeholder="18"
                    value={slide.stat.value}
                  />
                </label>
                <label>
                  <span>What it counts</span>
                  <input
                    onChange={(event) =>
                      setRow("heroSlides", index, {
                        ...slide,
                        stat: { ...slide.stat, label: event.target.value },
                      })
                    }
                    placeholder="Average class size"
                    value={slide.stat.label}
                  />
                </label>
              </div>
              <label className="wide-field">
                <span>Headline</span>
                <input
                  onChange={(event) =>
                    setRow("heroSlides", index, {
                      ...slide,
                      headline: event.target.value,
                    })
                  }
                  value={slide.headline}
                />
              </label>
              <label className="wide-field">
                <span>Body</span>
                <textarea
                  onChange={(event) =>
                    setRow("heroSlides", index, {
                      ...slide,
                      body: event.target.value,
                    })
                  }
                  rows={3}
                  value={slide.body}
                />
              </label>
              <button
                className="ghost-button"
                onClick={() => removeRow("heroSlides", index)}
                type="button"
              >
                Remove this slide
              </button>
            </div>
          ))}
          <button
            className="ghost-button"
            onClick={() =>
              addRow("heroSlides", {
                body: "",
                eyebrow: "",
                headline: "",
                id: `hero-${Date.now()}`,
                image: { alt: "", src: "" },
                stat: { label: "", value: "" },
              } satisfies HeroSlide)
            }
            type="button"
          >
            Add a slide
          </button>
          <small className="form-hint">
            A slide keeps the photograph already behind it. A slide with no
            headline is left out.
          </small>
        </section>

        <section className="admin-panel school-section">
          <div className="admin-panel-heading">
            <div>
              <p className="eyebrow">Public page</p>
              <h2>News and events</h2>
            </div>
          </div>
          {profile.news.map((item, index) => (
            <div className="profile-row" key={item.id || index}>
              <div className="inline-form-fields">
                <label>
                  <span>Title</span>
                  <input
                    onChange={(event) =>
                      setRow("news", index, {
                        ...item,
                        title: event.target.value,
                      })
                    }
                    value={item.title}
                  />
                </label>
                <label>
                  <span>Category</span>
                  <input
                    onChange={(event) =>
                      setRow("news", index, {
                        ...item,
                        category: event.target.value,
                      })
                    }
                    placeholder="Admissions"
                    value={item.category}
                  />
                </label>
                <label>
                  <span>Date</span>
                  <input
                    onChange={(event) =>
                      setRow("news", index, {
                        ...item,
                        date: event.target.value,
                      })
                    }
                    type="date"
                    value={item.date}
                  />
                </label>
              </div>
              <label className="wide-field">
                <span>Summary</span>
                <textarea
                  onChange={(event) =>
                    setRow("news", index, {
                      ...item,
                      summary: event.target.value,
                    })
                  }
                  rows={2}
                  value={item.summary}
                />
              </label>
              <button
                className="ghost-button"
                onClick={() => removeRow("news", index)}
                type="button"
              >
                Remove this item
              </button>
            </div>
          ))}
          <button
            className="ghost-button"
            onClick={() =>
              addRow("news", {
                category: "",
                date: new Date().toISOString().slice(0, 10),
                href: "/admissions",
                id: `news-${Date.now()}`,
                summary: "",
                title: "",
              } satisfies NewsItem)
            }
            type="button"
          >
            Add a news item
          </button>
        </section>

        <section className="admin-panel school-section">
          <div className="admin-panel-heading">
            <div>
              <p className="eyebrow">Public page</p>
              <h2>What people say</h2>
            </div>
          </div>
          {profile.testimonials.map((testimonial, index) => (
            <div className="profile-row" key={testimonial.id || index}>
              <label className="wide-field">
                <span>Quote</span>
                <textarea
                  onChange={(event) =>
                    setRow("testimonials", index, {
                      ...testimonial,
                      quote: event.target.value,
                    })
                  }
                  rows={3}
                  value={testimonial.quote}
                />
              </label>
              <div className="inline-form-fields">
                <label>
                  <span>Name</span>
                  <input
                    onChange={(event) =>
                      setRow("testimonials", index, {
                        ...testimonial,
                        name: event.target.value,
                      })
                    }
                    value={testimonial.name}
                  />
                </label>
                <label>
                  <span>Who they are</span>
                  <input
                    onChange={(event) =>
                      setRow("testimonials", index, {
                        ...testimonial,
                        role: event.target.value,
                      })
                    }
                    placeholder="Parent, Primary 4"
                    value={testimonial.role}
                  />
                </label>
                <button
                  className="ghost-button"
                  onClick={() => removeRow("testimonials", index)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button
            className="ghost-button"
            onClick={() =>
              addRow("testimonials", {
                id: `testimonial-${Date.now()}`,
                name: "",
                quote: "",
                role: "",
              } satisfies Testimonial)
            }
            type="button"
          >
            Add a quote
          </button>
          <small className="form-hint">
            Real people, with their permission. The first one is shown on the
            student life panel.
          </small>
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

/* What the school will see on the next learner it admits. Rendered from the
   same shape allocateStudentNumber() builds, so the example cannot drift from
   what is actually issued. */
function previewStudentNumber(prefix: string): string {
  const cleaned = prefix.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
  const year = String(new Date().getFullYear()).slice(-2);
  return `${cleaned || "LH"}-${year}0001`;
}
