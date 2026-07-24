# Daily School Operations Design

Status: Accepted for implementation  
Date: 24 July 2026

## Understanding summary

- Build the next vertical slice around assignments, rubric marking, attendance,
  and timetable operations.
- Give subject teachers one daily workspace for their assigned class and
  offering.
- Give learners a mobile-conscious school-day view for due work, attendance,
  and the timetable.
- Make guardian absence alerts relationship-scoped and generated only from a
  submitted attendance register.
- Preserve original attendance and marking evidence when an authorised
  correction is made.
- Reuse the existing tenant, people, class placement, subject offering,
  teacher assignment, gradebook, and audit foundations.
- Keep contracts suitable for a later Expo client and offline capture without
  claiming offline synchronisation in this slice.

The user accepted this milestone by replying “proceed” after the previous
release explicitly named assignments, rubrics, attendance, and timetable
operations as the next build.

## Assumptions

- The first operational class is `JHS 2 Gold`, with Integrated Science used as
  the first fully connected subject offering.
- Teachers may create and mark assignments only for offerings to which they are
  assigned; school and academic administrators retain oversight.
- An assignment is immutable after publication. Later content changes create a
  new version.
- Rubric criteria and performance levels are stored with the published
  assignment version.
- Learner submissions may be on time or late. File uploads remain disabled
  until object storage and malware controls are available.
- A daily class register is the first attendance mode. Subject-period
  attendance uses the same record model but is not the primary UI in this
  slice.
- Attendance codes are present, absent, late, excused, sick, school activity,
  and remote.
- Excused records are excluded from the attendance denominator. Present, late,
  school activity, and remote count as attendance.
- A submitted register is write-frozen. An authorised correction requires a
  reason and retains the previous code in correction history.
- Only unexcused absence creates a guardian alert in this slice.
- Timetables are manually configured; automatic scheduling is not included.

## Non-functional requirements

- Target a pilot school of up to 2,000 learners, 150 staff, 100 classes, and
  approximately 3,000 daily attendance records without changing architecture.
- Keep initial teacher and learner responses below one second under normal
  pilot load, excluding platform-authentication latency.
- Every write is tenant-scoped, role-checked, and recorded in the audit trail.
- Guardians never receive alerts or records for an unlinked learner.
- Register submission and alert creation are idempotent.
- The responsive web experience must remain usable on entry-level Android
  devices and narrow screens.
- The school owns assignment, attendance, timetable, and alert records. Platform
  operators do not silently alter academic evidence.
- The existing private-site availability model remains acceptable for the
  pilot. Formal uptime and recovery objectives become provider-selection gates
  before multi-school production.

## Approaches considered

### Selected: One operational vertical slice

Assignments, attendance, timetable entries, and alerts share the existing
class, learner, and teacher scope. This produces an end-to-end daily workflow
and stable mobile contracts without a premature service split.

### Alternative: Assignment module only

This would be smaller, but it would leave the learner dashboard’s attendance
and timetable summaries disconnected from durable school records.

### Alternative: Separate services for each domain

Independent services may be appropriate at much larger scale. They add
deployment, consistency, and operational complexity before the pilot has
demonstrated that need.

## Domain design

### Assignments and rubrics

An assignment belongs to a subject offering and has draft, published, closed,
and archived states. Published versions pin the brief, dates, marks, submission
mode, rubric criteria, and performance levels. Learner submissions retain their
submitted time and status. Marking stores one score per rubric criterion,
teacher feedback, marker identity, and release time. A released rubric total
can later feed the existing gradebook through an explicit grade-item mapping.

### Attendance

An attendance session identifies tenant, class, date, mode, and optional
timetable entry. One record exists per rostered learner. Teachers may save a
working register and submit it once complete. Submitted registers are frozen.
Corrections append the previous and new code, reason, actor, and time before
updating the effective record. Guardian alerts are generated from newly
submitted unexcused absences and use a unique source key to prevent duplicates.

### Timetable

Timetable periods define the school day. Entries bind period, weekday, class,
offering, teacher, and room. A timetable entry may be scheduled, substituted,
cancelled, or completed. Overlapping active entries cannot share the same
class, teacher, or room. Substitution and cancellation require a reason.

## API and interface design

- `GET /api/teacher/operations` returns the assigned class day, assignment
  marking queue, attendance register, and weekly timetable.
- `POST /api/teacher/operations` saves attendance, submits the register, or
  releases rubric marking.
- `GET /api/learn/school-day` returns only the authenticated learner’s
  assignments, attendance summary, and timetable.
- `GET /api/guardian/school-day` returns the same daily summary only for linked
  children, plus issued attendance alerts.
- Teacher UI: `/teacher/operations`
- Learner UI: `/learn/school-day`
- Guardian UI: `/guardian/school-day`

## Error handling and edge cases

- Missing roster entries block register submission.
- A second register submission is idempotent.
- Attendance changes after submission require a reasoned correction action.
- A rubric score cannot exceed its criterion maximum.
- Rubric release requires a score for every criterion.
- Late submissions remain markable and visibly late.
- Cancelled timetable entries do not participate in clash detection.
- Guardian alerts are created only after submission and never from draft
  register changes.
- Empty learner or guardian views return a valid, explanatory workspace rather
  than exposing another learner’s fixtures.

## Testing strategy

- Domain tests cover rubric totals, incomplete marking, attendance aggregation,
  correction reasons, alert eligibility, register completeness, and timetable
  clashes.
- Migration replay verifies all schema generations from an empty database.
- Rendered tests cover teacher, learner, and guardian surfaces.
- Anonymous API tests cover all new protected routes.
- Strict TypeScript, lint, production build, and diff checks remain release
  gates.

## Decision log

| Decision | Alternatives | Reason |
|---|---|---|
| Deliver one operational vertical slice | Assignment-only; separate services | Connects the actual daily school loop with lower operational complexity |
| Version published assignments | Mutable assignment rows | Protects learner instructions and marking evidence |
| Store rubric scores by criterion | Store only a total | Keeps grading explainable and supports moderation |
| Submit then freeze attendance | Freely editable register | Protects a high-trust school record |
| Append attendance corrections | Overwrite codes | Preserves previous evidence and actor/reason history |
| Alert only on submitted absence | Alert during draft capture | Prevents premature or duplicate guardian messages |
| Manual timetable with clash detection | Automatic scheduling | Meets current need without speculative optimisation |
| Build mobile-ready APIs now | Couple data to web components | Supports the planned Expo client without sharing UI code |

