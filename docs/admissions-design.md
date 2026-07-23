# Admissions and Student Records Design

Status: Accepted through the approved product scope and “proceed” instruction  
Date: 23 July 2026

## Understanding summary

- Admissions covers application, document checks, review, decision, offer
  acceptance, and conversion to an enrolled learner.
- Admissions officers and school administrators are the first users of this
  workspace; guardians will later receive a public application experience.
- Conversion must create one student record, one guardian relationship, and a
  class placement without re-entering applicant data.
- The existing academic module remains authoritative for class placement and
  compulsory-subject access.
- This release is an interactive, fixture-backed operational prototype. It must
  not imply that personal data is durably stored yet.
- Native mobile clients remain planned API consumers, so lifecycle rules stay
  independent of React and browser state.
- Fees, payments, and autonomous admission decisions are outside this slice.

## Assumptions and non-functional requirements

- A pilot school has hundreds, not millions, of annual applications.
- All records are tenant-scoped and every state transition is attributable.
- Sensitive applicant data will only become persistent after authenticated,
  authorised, encrypted storage and retention controls are implemented.
- The web experience must remain usable on entry-level Android devices and at
  narrow screen widths.
- Lifecycle transitions must be deterministic and unit-tested.
- Historical applications and decisions are retained; they are not overwritten
  or hard-deleted through ordinary workflows.

## Approaches considered

1. **Recommended: lifecycle-first admissions module.** Keep application states
   explicit and convert an accepted offer through the existing placement
   policy. This prevents duplicate learner entry and is suitable for future API
   and mobile clients.
2. **Form-only intake.** Faster initially, but leaves review, offers, audit, and
   learner conversion as manual processes.
3. **Full applicant self-service now.** Valuable later, but premature before
   identity, uploads, messaging, and durable storage are ready.

## Selected design

The workspace presents an admissions pipeline, actionable application queue,
document readiness, applicant details, and a controlled offer-to-enrolment
action. Domain functions own valid lifecycle transitions. React state only
drives the current prototype view.

Conversion takes an accepted application and returns a learner profile,
guardian relationship, and class placement. The placement is created through
the academic domain module so admissions cannot bypass class-first access
rules.

## Decision log

| Decision | Alternatives | Reason |
|---|---|---|
| Use an explicit application state machine | Free-form status edits | Prevents invalid or unaudited lifecycle jumps |
| Require document readiness before submission | Review incomplete applications | Gives staff a predictable review queue |
| Convert accepted offers into linked records | Re-enter learner after admission | Removes duplicate entry and mismatch risk |
| Reuse academic placement rules | Admissions-owned class logic | Preserves one authoritative entitlement policy |
| Keep this release fixture-backed | Store personal data locally | Avoids pretending prototype storage is production-safe |
| Defer the public applicant portal | Build both staff and public flows now | Identity, uploads, messaging, and consent need a dedicated slice |

