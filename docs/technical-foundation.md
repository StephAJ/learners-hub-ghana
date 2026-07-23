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

## Next engineering milestone

Implement the academic foundation with tests for these invariants:

1. A learner placed in a class receives every active compulsory subject.
2. A learner cannot remove a compulsory subject.
3. Approved optional subjects can be added without changing compulsory access.
4. Moving class changes future entitlements but preserves historical records.
5. Every query and mutation is tenant-scoped.
6. All manual exceptions record actor, reason, and effective date.

