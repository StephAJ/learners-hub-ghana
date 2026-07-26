"use client";

import { FormEvent, useState } from "react";
import type {
  ApplicantApplication,
  SaveApplicantApplicationInput,
} from "../../../db/applicant-repository";

const emptyApplication: SaveApplicantApplicationInput = {
  applicantFirstName: "",
  applicantLastName: "",
  dateOfBirth: "",
  desiredClass: "",
  guardianEmail: "",
  guardianName: "",
  guardianPhone: "",
  previousSchool: "",
  supportNeeds: "",
};

export function ApplicationForm({
  applicantEmail,
  initialApplication,
}: {
  applicantEmail: string;
  initialApplication: ApplicantApplication | null;
}) {
  const [application, setApplication] = useState<SaveApplicantApplicationInput>(
    initialApplication
      ? {
          applicantFirstName: initialApplication.applicantFirstName,
          applicantLastName: initialApplication.applicantLastName,
          dateOfBirth: initialApplication.dateOfBirth,
          desiredClass: initialApplication.desiredClass,
          guardianEmail: initialApplication.guardianEmail,
          guardianName: initialApplication.guardianName,
          guardianPhone: initialApplication.guardianPhone,
          previousSchool: initialApplication.previousSchool,
          supportNeeds: initialApplication.supportNeeds,
        }
      : emptyApplication,
  );
  const [status, setStatus] = useState(initialApplication?.status ?? "draft");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(action: "save" | "submit") {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admissions/application", {
        body: JSON.stringify({ ...application, action }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        application?: ApplicantApplication;
        error?: string;
      };
      if (!response.ok || !payload.application) {
        throw new Error(payload.error ?? "The application could not be saved.");
      }
      setStatus(payload.application.status);
      setNotice(
        action === "submit"
          ? "Your application has been submitted to Greenfield Academy."
          : "Draft saved. You can safely return later.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The application could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save("submit");
  }

  const isSubmitted = status !== "draft";

  return (
    <form className="application-form" onSubmit={submit}>
      <header>
        <div>
          <p className="public-kicker">Standard application</p>
          <h1>Apply to Greenfield Academy</h1>
          <p>
            Signed in as <strong>{applicantEmail}</strong>
          </p>
        </div>
        <span className={`application-status status-${status}`}>
          {humaniseStatus(status)}
        </span>
      </header>

      {notice ? <p className="application-notice" role="status">{notice}</p> : null}

      <fieldset disabled={busy || isSubmitted}>
        <legend>
          <span>1</span>
          <div>
            <strong>Applicant details</strong>
            <small>Tell us about the learner applying to the school.</small>
          </div>
        </legend>
        <div className="application-field-grid">
          <ApplicationField
            label="First name"
            onChange={(value) => update(setApplication, "applicantFirstName", value)}
            required
            value={application.applicantFirstName}
          />
          <ApplicationField
            label="Last name"
            onChange={(value) => update(setApplication, "applicantLastName", value)}
            required
            value={application.applicantLastName}
          />
          <ApplicationField
            label="Date of birth"
            onChange={(value) => update(setApplication, "dateOfBirth", value)}
            required
            type="date"
            value={application.dateOfBirth}
          />
          <label>
            <span>Class applying for</span>
            <select
              onChange={(event) =>
                update(setApplication, "desiredClass", event.target.value)
              }
              required
              value={application.desiredClass}
            >
              <option value="">Choose a class</option>
              <option value="JHS 1">JHS 1</option>
              <option value="JHS 2">JHS 2</option>
              <option value="SHS 1 General Arts">SHS 1 · General Arts</option>
              <option value="SHS 1 Business">SHS 1 · Business</option>
              <option value="SHS 1 Science">SHS 1 · General Science</option>
            </select>
          </label>
          <ApplicationField
            label="Previous school"
            onChange={(value) => update(setApplication, "previousSchool", value)}
            value={application.previousSchool}
          />
        </div>
      </fieldset>

      <fieldset disabled={busy || isSubmitted}>
        <legend>
          <span>2</span>
          <div>
            <strong>Parent or guardian</strong>
            <small>This person will receive official application updates.</small>
          </div>
        </legend>
        <div className="application-field-grid">
          <ApplicationField
            label="Full name"
            onChange={(value) => update(setApplication, "guardianName", value)}
            required
            value={application.guardianName}
          />
          <ApplicationField
            label="Email address"
            onChange={(value) => update(setApplication, "guardianEmail", value)}
            required
            type="email"
            value={application.guardianEmail}
          />
          <ApplicationField
            label="Phone number"
            onChange={(value) => update(setApplication, "guardianPhone", value)}
            required
            type="tel"
            value={application.guardianPhone}
          />
        </div>
      </fieldset>

      <fieldset disabled={busy || isSubmitted}>
        <legend>
          <span>3</span>
          <div>
            <strong>Learning and support</strong>
            <small>Share information that will help the school support the learner.</small>
          </div>
        </legend>
        <label>
          <span>Support needs or important context</span>
          <textarea
            onChange={(event) =>
              update(setApplication, "supportNeeds", event.target.value)
            }
            placeholder="This information is reviewed only by authorised admissions and learner-support staff."
            value={application.supportNeeds}
          />
        </label>
      </fieldset>

      <section className="application-consent">
        <strong>Before submitting</strong>
        <p>
          By submitting, you confirm that the information is accurate and
          consent to Greenfield Academy using it to process this application.
          Required documents can be added from your applicant workspace.
        </p>
      </section>

      <footer>
        <a href="/applicant">Return to overview</a>
        <div>
          <button
            disabled={busy || isSubmitted}
            onClick={() => void save("save")}
            type="button"
          >
            {busy ? "Saving…" : "Save draft"}
          </button>
          <button
            className="application-submit"
            disabled={busy || isSubmitted}
            type="submit"
          >
            {isSubmitted ? "Application submitted" : "Review and submit"}
          </button>
        </div>
      </footer>
    </form>
  );
}

function ApplicationField({
  label,
  onChange,
  required = false,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: "date" | "email" | "tel" | "text";
  value: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}

function update(
  setApplication: React.Dispatch<
    React.SetStateAction<SaveApplicantApplicationInput>
  >,
  field: keyof SaveApplicantApplicationInput,
  value: string,
) {
  setApplication((current) => ({ ...current, [field]: value }));
}

function humaniseStatus(status: ApplicantApplication["status"]): string {
  return status
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
