# Gradebook and Reporting Foundation

Status: Approved implementation direction  
Date: 23 July 2026

## Understanding summary

- Released assessment evidence must flow into a subject gradebook without
  overwriting the original attempt.
- Schools configure grading periods, category weights, and grade scales; one
  national formula is never hard-coded as universal.
- Teachers own marks in assigned subject offerings, while authorised academic
  leaders approve and release reports.
- Missing, absent, and excused work are explicit states rather than ambiguous
  blank cells.
- Reports are immutable issued versions; corrections create a new version.
- Guardians see only linked children and only released academic records.
- Web contracts must remain usable by the planned learner and guardian mobile
  clients.

## Assumptions

- The pilot uses Term 1 with a stored 40% continuous-assessment and 60%
  examination template. This is sample school policy, not a platform constant.
- The first gradebook surface is Integrated Science for JHS 2 Gold.
- The first report template includes subject score, grade, remark, attendance,
  conduct, class-teacher comment, headteacher comment, and next-term date.
- Privacy-sensitive class and subject rankings are disabled.
- PDF issue and QR verification are later document infrastructure; this release
  preserves the immutable data and report identifier required for them.
- The private site’s signed-in school administrator may preview every role
  surface, while guardian API access still applies relationship checks.

## Approaches considered

### Selected: evidence-led gradebook with immutable report versions

Grade items reference academic evidence, category policy calculates weighted
grades, and report versions snapshot issued results. This is more structured
than a spreadsheet-shaped table but preserves provenance and corrections.

### Rejected: store only final subject percentages

This is fast, but removes assessment evidence, category weighting,
missing-work controls, and explainable corrections.

### Deferred: formula expression language

An arbitrary formula engine would support edge cases but introduces security,
debugging, and migration risks. Versioned weighted categories cover the pilot
and leave a deliberate extension point.

## Lifecycle

1. An open grading period receives subject grade items and learner entries.
2. Released assessment results may populate entries; teachers may add authorised
   offline evidence.
3. Category percentages and weighted totals are calculated from stored policy.
4. Missing-entry checks must pass before teacher submission.
5. Report drafts snapshot calculated subject results and comments.
6. Academic leadership approves complete reports.
7. Release creates an immutable issued version visible to authorised guardians.
8. Later corrections create a superseding report version with reason and audit.

## Security and integrity

- Every grade and report query includes the tenant.
- Teacher writes require the relevant subject assignment.
- Adjusted marks require a reason and retain raw values.
- Closed periods reject ordinary grade changes.
- Approval and release require academic-administrator authority.
- Guardian reads resolve active relationships on the server.
- Unreleased reports never appear in guardian responses.
- Every grade change, submission, approval, and release creates an audit event.

## Decision log

| Decision | Alternatives | Reason |
|---|---|---|
| Store category weights | Hard-code 30/70 or 40/60 | School policies vary |
| Preserve raw and adjusted marks | Replace the mark | Auditability |
| Model missing/absent/excused | Treat blank as zero | Correct academic meaning |
| Block incomplete submission | Permit silent blanks | Prevent report errors |
| Snapshot report versions | Recalculate issued reports | Historical integrity |
| Relationship-scope guardian reads | Guardian role alone | Protect minors |
| Keep ranking disabled | Default positions | Privacy and policy sensitivity |

