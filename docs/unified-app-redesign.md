# Learners Hub Unified Application Redesign

Status: Validated design  
Date: 26 July 2026

## 1. Purpose

Learners Hub will be one coherent, school-branded application for public
admissions, school administration, teaching, learning, guardian access, and
applicant self-service.

The redesign corrects the current prototype structure, where a fixture-backed
learner dashboard is used as the root page and learner, teacher, guardian, and
administrator screens link directly to one another. The existing domain rules
and protected APIs remain useful, but routing, authentication, navigation,
workspace boundaries, setup guidance, and production data states require a
role-first redesign.

## 2. Understanding summary

- The main address is a public, school-branded homepage with `Apply for
  admission` and `Sign in` actions.
- One identity may hold several authorised roles, but enters a primary
  workspace and changes roles through an explicit workspace switcher.
- Administrators enter an operations dashboard that explains school readiness
  and pending work.
- Teachers enter a Today workspace for timetable, attendance, lessons,
  assignments, marking, and class activity.
- Students enter Today's learning; guardians enter a child overview; applicants
  enter an application overview.
- Admission forms use standard identity and guardian fields plus configurable
  school questions, documents, consent, and programme-specific sections.
- H5P is a built-in interactive activity authoring experience. Runtime,
  package, embed, and VPS concepts are hidden from ordinary teachers.
- The pilot supports 1–5 schools with up to approximately 2,000 users per
  school and remains multi-school capable.
- The product targets modest Android devices and unstable mobile data, with
  autosave and safe retries rather than full offline operation.
- The centrally operated service targets production-grade school security and
  99.5% monthly availability.

## 3. Assumptions

- Each school controls its branding, academic structure, staff, admissions
  configuration, learning content, and operational settings.
- Permissions combine role, school, class, subject, learner relationship, and
  record state.
- Public admissions never exposes the private school workspace.
- Navigation is generated centrally from the active workspace and permissions.
- Production failures never silently substitute fixture or preview records.
- A lesson may be reused across several authorised classes and adapted where
  necessary.
- Published academic records and submitted workflow states are versioned or
  superseded rather than overwritten.
- Full offline operation is deferred, while autosave, resumable uploads, and
  idempotent retry behaviour are required.
- Learners Hub's central product team maintains software, hosting, security,
  backups, monitoring, and upgrades. School staff administer school data and
  workflows.

## 4. Explicit non-goals for the first release

- Fees and accounting
- Payroll
- Transport management
- Hostel management
- Library circulation
- Inventory management
- National-scale deployment at launch
- Fully offline assessment or school administration
- Autonomous AI decisions for admissions, discipline, progression, or final
  grading

## 5. Selected approach

### Role-first application shell

One public site and authentication system lead to separate role workspaces
inside the same application. The workspaces share backend services, domain
rules, school data, design tokens, and appropriate components, but each has its
own layout, navigation, homepage, terminology, and access guard.

### Alternatives considered

1. A single adaptive dashboard was rejected because it would become cluttered
   and continue the current risk of role leakage.
2. Separate deployed frontend applications were rejected because they add
   deployment and maintenance overhead that is not justified at pilot scale.

## 6. Application architecture

The public root `/` contains school information, admissions details, and entry
actions. It never renders a learner or staff dashboard.

After authentication, `/app` resolves:

1. The signed-in identity
2. School membership and account status
3. Available roles and the primary role
4. The active workspace
5. Authorised record scope

It then redirects to:

| Route | Workspace |
|---|---|
| `/admin` | School administration |
| `/teacher` | Teaching and classroom operations |
| `/student` | Learning |
| `/guardian` | Linked-child information |
| `/applicant` | Admissions self-service |

Changing workspace changes the active authorised role but does not impersonate
another identity. Audit events retain the same actor identity and record the
active role.

Access is enforced at two layers:

1. Page and layout guards prevent an unauthorised workspace from rendering.
2. Server services validate school, role, class, subject, learner relationship,
   and record state for every operation.

An explicitly separate demo environment may use fixture data. Production
surfaces show genuine empty, unconfigured, unavailable, or forbidden states.

## 7. Workspaces and navigation

| Workspace | Home | Primary navigation |
|---|---|---|
| Administrator | Operations dashboard | Home, Admissions, People, Academics, School Operations, Reports, Settings |
| Teacher | Today | Today, My Classes, My Subjects, Lessons, Assessments, Markbook, Content Library |
| Student | Today's learning | Today, Subjects, Assignments, Assessments, Timetable, Progress |
| Guardian | Child overview | Overview, Attendance, Learning, Results, Reports, Messages |
| Applicant | Application overview | Application, Documents, Appointments, Offer, Messages |

### Administrator readiness path

`Configure school → create academic year → create classes and subjects → add
teachers → assign teachers → open admissions → enrol learners`

The homepage shows setup progress, admissions work, staff invitations,
incomplete assignments, class readiness, pending approvals, and operational
alerts.

### Teacher daily path

`Today's timetable → open class → take attendance → teach or create lesson →
assign work → review submissions → update marks`

Authorised learner preview is launched from a staff tool with a persistent
preview banner. It is not a link into a learner identity or unrestricted
student workspace.

## 8. Admissions

The public application journey is:

`Choose intake → applicant details → guardian details → education history →
programme/class choice → configurable questions → documents → consent → review
and submit`

Applicants verify an account using email or phone, save automatically, return
later, upload documents, see missing requirements, receive appointments, track
status, answer staff requests, and accept or decline an offer.

Schools configure additional questions, required documents, consent text,
programme-specific sections, opening dates, deadlines, and capacity. Essential
identity and guardian fields cannot be removed.

The administrator Admissions workspace contains intake configuration,
pipeline, review assignments, checklists, document queues, interview and
assessment scheduling, decisions, approvals, offers, acceptance tracking, and
enrolment conversion.

Conversion displays a review of the records to be created, then creates or
links the learner, guardian relationships, consent evidence, documents, student
identifier, class placement, and compulsory subject enrolments. Staff do not
re-enter accepted application information.

States and decisions are durable and audited. Applicants see understandable
public status labels rather than internal workflow terminology.

## 9. School setup and teacher onboarding

The guided setup dependency order is:

`School profile → academic year and terms → class groups → subject catalogue →
class subject policies → staff → teaching assignments`

Adding a teacher includes:

1. Identity and contact information
2. Primary role
3. Subject and class assignments
4. Optional class-teacher or department responsibility
5. Generated-access review
6. Invitation delivery

Assignments use controlled school records rather than free-text scope names.
They have effective dates and preserved history. Accepting an invitation opens
a populated teacher workspace with assigned timetable, classes, subjects, and
tasks.

Bulk import remains available through validation, preview, correction, and
commit stages.

## 10. Lessons and interactive content

The teacher authoring journey is:

`Choose subject → choose classes → add objectives and curriculum standards →
build activities → preview → schedule or publish`

A lesson is reusable across authorised classes. A teacher may create a
class-specific variation without duplicating unrelated content. Published
versions remain immutable for learner stability.

The activity builder offers text, media, interactive activities, practice,
assignments, assessment links, and reflection or discussion prompts.

Choosing an interactive activity opens the built-in H5P authoring experience.
The teacher selects a human-readable activity type and edits it inside Learners
Hub. Package uploads and external embeds are advanced administrative import
options.

Learners Hub owns permissions, placement, completion, scores, accessibility
alternatives, analytics, gradebook links, and reporting. The isolated H5P
service authors and renders content and emits bounded activity events.

Every interactive activity requires an accessible alternative. Teachers
preview desktop and mobile presentation before publication. Status labels are
limited to understandable product language such as Draft, Processing, Ready,
and Unavailable.

## 11. Data flow and failure behaviour

Workspace data follows:

`Identity → school membership → active role → authorised scope → workspace
data`

- Expired authentication retains safe unsaved drafts locally before requesting
  sign-in.
- Forms show Saving, Saved, or Needs attention.
- Uploads resume where supported and incomplete objects remain hidden.
- Duplicate invitations, applicants, and learners enter a review flow.
- H5P failure displays the accessible alternative and does not mark a learner
  unsuccessful.
- Published lessons, submitted applications, issued reports, and completed
  attempts are never overwritten in place.
- Removing a teacher assignment preserves historical ownership.
- Moving a learner recalculates future entitlement while retaining completed
  work and academic history.
- Guardians see only explicitly linked learners.
- A role switch never carries permissions from the previous workspace.
- Empty, unconfigured, unavailable, and forbidden states are distinct.

## 12. Non-functional requirements

### Performance

- Core workspace content should become usable in approximately two seconds on
  a modest Android device and unstable mobile data.
- Media and interactive content load progressively.
- Essential forms autosave and retry idempotently.
- Large uploads are resumable where infrastructure supports it.

### Scale

- Initial production target: 1–5 schools
- Approximate upper pilot target: 2,000 users per school
- Data and authorisation remain tenant-scoped for future growth.

### Security and privacy

- Production-grade role and record scope from the pilot
- Administrator MFA
- Encrypted transport and backups
- Session controls and recent-authentication checks for sensitive actions
- Immutable audit events for material academic and administrative changes
- Versioned consent evidence
- Safeguarding and sensitive-record access boundaries

### Reliability

- 99.5% monthly availability target
- Daily encrypted backups
- Regularly tested restoration
- Monitoring for availability, authentication, jobs, uploads, H5P, slow
  requests, and backup completion
- Communicated maintenance windows

### Ownership

- Central Learners Hub team owns software and platform operations.
- Schools own configuration, people, academics, content, and operational use.

## 13. Verification strategy

1. Domain tests cover admissions, enrolment, lesson versions, assessment,
   grading, and permissions.
2. API integration tests use real migrations and representative school
   records.
3. Browser tests cover every role and critical end-to-end journey.
4. Mobile and low-bandwidth checks use constrained viewport, CPU, and network
   profiles.
5. Permission tests prove both allowed and forbidden operations across schools,
   roles, classes, subjects, guardianship relationships, and membership states.
6. Production readiness checks cover migrations, configuration, backups,
   accessibility, and service health.

Mandatory end-to-end journeys:

- `Apply → review → offer → accept → enrol`
- `Add teacher → assign classes → accept invitation → create and publish
  lesson`
- `Student studies → completes H5P → submits work → teacher marks → guardian
  sees released result`

## 14. Risks acknowledged

- The current pages combine prototype navigation and fixture fallback logic, so
  workspace migration must avoid preserving accidental coupling.
- The current root route is a learner prototype and must be replaced without
  losing useful student dashboard components.
- Built-in H5P authoring is a larger integration than package playback and
  requires editor, library-management, licensing, security, and operational
  validation.
- Authentication currently protects APIs more consistently than pages;
  workspace guards must precede production exposure.
- Admissions and academic setup still depend on fixtures and require durable
  tenant-scoped repositories.
- Multi-role switching needs explicit session and audit semantics to avoid
  permission confusion.

## 15. Decision log

| Decision | Alternatives | Reason |
|---|---|---|
| One unified application | Separate portals | One identity and coherent shared school data |
| Role-first workspaces | One combined dashboard | Clear tasks and lower role-leakage risk |
| Primary workspace plus switcher | Combined navigation; prompt every sign-in | Predictable entry with explicit role context |
| Public school homepage at `/` | Platform directory; sign-in-only root | Clear school identity and admissions entry |
| Standard admissions form with configurable sections | Fixed form; unrestricted form builder | Reliable records without blocking school variation |
| Administrator operations home | Module grid; analytics-first | Explains setup and pending work |
| Teacher Today home | Subject-first; analytics-first | Matches daily classroom work |
| Student Today's learning home | Subject library; class social home | Prioritises actionable learning |
| Guardian child overview | Inbox-first; reports-first | Provides a complete child context |
| Verified applicant account | Magic-link record; one-session form | Supports return, documents, status, and offers |
| Built-in H5P authoring | Package/embed workflow; central team only | Removes infrastructure concepts from teaching |
| Guided teacher onboarding | Separate identity and assignment steps; import-first | Produces a ready-to-work teacher account |
| Reusable lessons assigned to classes | Per-class duplication; library-copy model | Efficient reuse with controlled variation |
| Pilot scale | Regional or national launch | Matches current product maturity and operating risk |
| Low-bandwidth web app | Fully offline; broadband assumed | Fits target devices without premature offline complexity |
| Production-grade pilot security | Basic pilot controls; external identity only | The platform holds minors' and academic data |
| 99.5% pilot availability | 99.9%; best effort | Strong service with proportionate pilot cost |
| Central platform operation | School-hosted; implementation partner | Consistent security, backups, and upgrades |

## 16. Remaining product-detail decisions

The accepted architecture is not blocked by later decisions about visual
branding, grading policies, notification providers, exact admissions questions,
report templates, H5P activity types enabled at launch, or deployment provider
selection.
