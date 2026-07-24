# Learners Hub Technical Foundation

Status: Accepted direction; implementation has started  
Date: 23 July 2026

## Architecture decision

Learners Hub will use a TypeScript-first modular architecture with separate
delivery clients for the web and mobile experiences.

The primary product begins as a responsive progressive web app. A native mobile
application will be added with Expo and React Native once the first academic,
identity, and assessment API contracts are stable. The mobile app is therefore
an intended client of the platform, not a packaged web view and not an
afterthought.

## Selected tools

| Concern | Choice | Reason |
|---|---|---|
| Web application | Next.js 16, React 19, TypeScript | Strong application routing, rendering, accessibility ecosystem, and long-term React alignment |
| Web runtime | vinext/Vite on Cloudflare-compatible infrastructure | Fast edge deployment and compatibility with the current Sites environment |
| Mobile application | Expo and React Native with Expo Router | One TypeScript mobile codebase, strong Android support, over-the-air delivery options, and mature native APIs |
| API | NestJS modular monolith | Explicit module boundaries, dependency injection, OpenAPI support, background jobs, and a clear path to later service extraction |
| Transactional database | PostgreSQL | Strong relational integrity for enrolment, guardianship, attempts, grades, reports, and audit history |
| ORM and migrations | Drizzle ORM | Type-safe SQL, visible schema design, and predictable migrations |
| Queue/cache | Redis-compatible service with BullMQ | Assessment jobs, notifications, media work, report generation, and safe retries |
| File/media storage | S3-compatible object storage and CDN | Direct resumable uploads, signed access, and scalable document/media delivery |
| Interactive content | Isolated H5P service/integration | Broad content ecosystem without coupling the academic record to H5P internals |
| API contract | OpenAPI plus generated TypeScript clients | The web and mobile clients consume the same versioned contract |
| Authentication | Standards-based OIDC with server-enforced tenant membership | Supports web, mobile, SSO, MFA, and institutional identity without browser-only assumptions |
| Testing | Vitest, Playwright, contract tests, and native-device tests | Covers domain rules, integrations, critical journeys, and mobile behaviour |
| Observability | Structured logs, traces, metrics, audit events, and error tracking | Assessment and academic changes require explainable operational evidence |

Exact managed providers will be selected before personal learner data is placed
in production. Data location, processor terms, backup guarantees, and Ghana
Data Protection Act obligations are provider-selection gates.

## Repository direction

The current web application remains deployable at the repository root while the
first experience is established. The target layout is:

```text
apps/
  web/          Next.js learner, teacher, guardian, and admin experience
  mobile/       Expo/React Native application
  api/          NestJS modular API and background workers
packages/
  contracts/    OpenAPI-generated clients and transport types
  domain/       Framework-independent rules and value objects
  design/       Tokens shared conceptually across web and mobile
  config/       Shared TypeScript, lint, and test configuration
```

The move into this layout should happen when the first API module is introduced,
not as an empty restructuring exercise.

## Mobile strategy

### What is shared

- API schemas and generated clients
- Authentication and authorisation semantics
- Academic identifiers and status values
- Validation rules that do not depend on a UI framework
- Design tokens such as colour, spacing, typography scale, and motion policy
- Analytics event names and error codes

### What is not forced to be shared

- Web and native visual components
- Navigation containers
- Browser-only H5P rendering
- Native downloads, camera, biometric, notification, and secure-storage code

This avoids the common failure where a theoretically shared UI produces a poor
experience on both platforms.

### Mobile release sequence

1. Make the PWA fully usable on entry-level Android devices.
2. Stabilise login, learner profile, class, subject, lesson, progress, timetable,
   and assessment contracts.
3. Create the Expo shell with secure token storage, deep linking, and push
   notification foundations.
4. Deliver learner and guardian read-heavy flows first.
5. Add lesson downloads and offline progress synchronisation.
6. Add teacher attendance and lightweight marking.
7. Keep high-stakes assessment online until a separate secure-offline design is
   tested and approved.

## Initial module boundaries

```text
Identity
School configuration
People and guardianship
Academic structure
Enrolment and entitlement
Curriculum and content
Assessment and question bank
Assignments and grading
Attendance and timetable
Reports and documents
Admissions
Communication
Analytics and integrations
```

Modules communicate through explicit application services and domain events.
They do not read or mutate one another's tables directly.

## First vertical slice

The first implemented surface is the student dashboard. It establishes:

- Class-first terminology.
- Compulsory subject visibility.
- Current lesson and progress.
- Subject switching and search.
- Attendance, upcoming work, timetable, and average.
- Class-teacher communication.
- Responsive desktop and mobile navigation.
- Installable PWA metadata.

The data is intentionally fixture-backed until tenant identity and the academic
schema are introduced. The next slice replaces these fixtures with real school,
class, subject-offering, and subject-enrolment records.

## Academic foundation build

The second implemented slice adds:

- An administrator workspace for academic structure.
- Class groups with class teachers, rooms, and learner counts.
- Compulsory and optional subject policies.
- A learner-placement workflow that automatically calculates subject access.
- Immutable domain rules preventing compulsory-subject removal.
- Transfer rules that preserve placement history.
- Tenant-bound records and automated policy tests.

The current interface uses fixture data, while the enrolment policy itself is a
framework-independent module ready to sit behind the web, API, and mobile
clients.

## Admissions foundation build

The third implemented slice adds:

- An admissions pipeline and application queue.
- Applicant, guardian, desired-class, and document review context.
- Explicit submission, review, offer, acceptance, and enrolment states.
- Offer expiry checks and invalid-transition protection.
- Accepted-offer conversion into learner, guardian relationship, and class
  placement records.
- Mobile-responsive administration layouts.

The interface remains fixture-backed. Admissions lifecycle rules are
framework-independent and reuse the academic placement policy.

## Identity and persistence foundation build

The fourth implemented slice adds:

- Cloudflare D1 persistence and generated migrations.
- Tenant, person, identity, membership, guardian relationship, and audit tables.
- Platform-authenticated administrator identity.
- Once-only first-administrator bootstrap for the private school site.
- Server-enforced role, tenant, membership, and relationship permissions.
- Protected People & Access APIs.
- A responsive school directory and persistent invitation workflow.

This D1 layer is the durable platform store for the deployed prototype. The
long-term PostgreSQL decision remains appropriate when the standalone API and
multi-school production infrastructure are introduced.

## Teaching and learning foundation build

The fifth implemented slice adds:

- Subject-offering, curriculum-unit, teacher-assignment, lesson, version, block,
  and learner-progress records in D1.
- Assignment-aware teacher authorisation with administrative oversight.
- Structured lesson authoring for text, video, interactive, practice, and
  resource blocks.
- Explicit draft and published lesson versions so learner content is stable.
- A responsive learner lesson player with block navigation, interactive
  checkpoints, and persistent progress.
- Protected teacher and learner APIs designed to support the future mobile
  client.

The interactive block contract creates a safe integration boundary for an
isolated H5P-compatible service. Media object storage and full H5P package
processing remain separate infrastructure milestones.

## Assessment foundation build

The sixth implemented slice adds:

- Tenant-scoped question-bank items with immutable approved versions.
- Objective, text, numeric, matching, ordering, essay, file-upload, hotspot,
  and composite question identities.
- Versioned quizzes that pin exact question snapshots and mark allocations.
- Server-issued timed attempts with response autosave and submission locking.
- Automatic scoring for supported objective and structured item types.
- A separate manual-marking queue, teacher feedback, and controlled result
  release.
- Responsive teacher authoring and review workspaces plus a mobile-conscious
  learner quiz runner.
- Protected web APIs designed for reuse by the planned Expo client.

Binary file responses remain disabled until R2 storage, type validation,
malware scanning, and retention controls are introduced. Published versions
and completed attempts are never edited in place.

## Gradebook and reporting foundation build

The seventh implemented slice adds:

- Tenant-scoped grading periods, weighted grade categories, grade items, marks,
  grading bands, submissions, report cards, and immutable issued versions.
- Explicit raw and adjusted marks with mandatory reasons for corrections.
- Missing-mark detection that blocks premature gradebook submission.
- Configurable Ghanaian-school grading scales without hard-coding one national
  policy.
- A report lifecycle covering teacher submission, academic approval, and
  guardian release.
- Relationship-scoped guardian reads that return only formally released
  records.
- Responsive teacher gradebook and guardian report-card experiences.
- Protected contracts suitable for the future Expo teacher and guardian
  clients.

Browser printing is supported for convenience. Signed PDF reports, verification
codes, and QR-based authenticity checks remain a later document-generation
milestone.

## Daily school operations foundation build

The eighth implemented slice adds:

- Published assignment snapshots with due dates, text/offline submission
  modes, and learner submission states.
- Criterion-level rubrics, stored performance levels, explainable totals, and
  released teacher feedback.
- Daily attendance registers with configurable codes, write-freezing after
  submission, reasoned corrections, and preserved prior evidence.
- Idempotent guardian alerts created only from submitted unexcused absences.
- Timetable periods and class entries with class, teacher, and room clash
  rules plus reasoned cancellation and substitution.
- Responsive teacher, learner, and guardian school-day experiences.
- Protected APIs suitable for future offline capture and Expo clients.

File submissions remain disabled until object storage, scanning, retention,
and access controls are available. Automatic timetable generation and outbound
SMS/email delivery are intentionally deferred.

## Next engineering milestone

Complete school configuration and communication infrastructure:

1. Move remaining academic structure and admissions fixtures behind durable
   tenant-scoped repositories.
2. Add school calendar, holidays, and rollover operations.
3. Add approved communication templates, guardian inboxes, delivery tracking,
   and communication permission checks.
4. Add secure object storage for assignment, admissions, and assessment files.
5. Feed assignment results and attendance summaries into explicit report-card
   mappings.
6. Begin the Expo learner and guardian clients against the stable contracts.
