# Learners Hub

A unified learning and school management platform for Ghanaian schools.

## How the product is organised

Learners Hub has one public website and one authenticated app. The public home
page explains the school and starts admission applications. After sign-in,
`/app` resolves the person's school membership and opens the correct workspace:

- School administrators open `/admin` to review admissions, add teachers and
  other people, and configure academic structures.
- Teachers open `/teacher` to run today's classes, create lessons, add
  interactive activities, publish assessments, and mark work.
- Students open `/student` for today's learning, due work, progress, and
  released activities.
- Parents and guardians open `/guardian` for their linked child's attendance,
  learning progress, and released reports.
- Applicants open `/applicant` to continue an application and follow its
  status.

Each role has its own navigation. A person with more than one active school
role gets a workspace switcher, while server-side guards prevent a role from
opening another role's routes directly.

## Core workflows

### Admissions

1. A family opens `/admissions` and selects **Start application**.
2. After secure sign-in, the form at `/admissions/apply` saves a durable draft
   and can be submitted.
3. The applicant tracks the submission at `/applicant`.
4. Authorised staff see submitted forms in `/admin/admissions`, where the
   review-to-enrolment workflow is presented.

### Add a teacher

1. A school administrator opens `/admin`.
2. They choose **Add a teacher**, which opens the invite section in
   `/admin/people`.
3. The new member receives a teacher role and only sees the teacher workspace
   after sign-in.

### Create a lesson and interactive activity

1. A teacher opens `/teacher` and chooses **Create lesson**.
2. Lesson drafts are managed under `/teacher/subjects`.
3. Reusable media and interactive activities are managed in
   `/teacher/content`.
4. A teacher can save an activity plan in the content studio. The currently
   executable H5P path is to import an existing `.h5p` package or use an
   advanced activity link; the isolated player records learner interactions.
   Full in-app H5P editing is not yet connected.

The current build establishes the learner-facing product shell, academic
administration, admissions, identity, teaching, assessment, and reporting
foundations. It
includes a responsive learner dashboard, class subject policies,
compulsory-subject entitlement rules, an application review pipeline, and
accepted-applicant conversion into student records and class placements. The
People & Access workspace adds durable tenant-scoped records, role and
relationship permissions, and protected APIs. Teachers can author lessons,
manage reusable versioned questions, publish quizzes, and review constructed
responses. Learners can study structured content, take timed assessments with
autosave, and receive controlled results. Teachers can manage weighted,
auditable marks and move reports through submission, approval, and release.
Guardians can see only released reports for children linked to their accounts.
The daily-operations slice adds versioned assignments and rubrics, attendance
registers with reasoned correction history, clash-conscious timetables, and
relationship-protected guardian absence alerts.
The advanced lesson release adds ordered multi-activity authoring, Ghanaian
curriculum-standard mapping, reusable lesson duplication, scheduled and
prerequisite release rules, and learner pathways that unlock from durable
completion records.
The secure-content slice adds a teacher content studio, private R2-backed
media, subject-scoped streaming, validated H5P package storage, HTTPS embed
contracts, lesson-block attachments, and normalized learner interaction
results.
The self-hosted H5P slice adds a signed package-import bridge, an isolated
Node.js player runtime, short-lived learner launch grants, xAPI forwarding,
opaque content identifiers, persistent VPS volumes, and a Hostinger-ready
Docker Compose deployment behind the VPS reverse proxy.

## Current technology

- Next.js 16 and React 19
- TypeScript in strict mode
- Tailwind CSS 4 plus product-specific CSS
- vinext/Vite for Cloudflare-compatible builds
- Node's native test runner for rendered-output checks
- Cloudflare D1 for persistent structured school records
- Cloudflare R2 for private lesson media and H5P packages
- Isolated Lumi H5P Node.js runtime for self-hosted interactive content
- Docker Compose behind the existing CyberPanel/OpenLiteSpeed reverse proxy
- Server-enforced role and relationship permissions
- PWA manifest and responsive mobile navigation

The approved product scope is in
[`docs/product-scope.md`](docs/product-scope.md). The architecture and mobile
strategy are in
[`docs/technical-foundation.md`](docs/technical-foundation.md).

## Local development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

The development site runs at `http://localhost:3000`.

## Hostinger staging

The VPS deployment model, DNS prerequisites, and operating commands are in
[`deploy/hostinger/README.md`](deploy/hostinger/README.md). Public hostnames
are environment and reverse-proxy configuration, so they can be changed
without rebuilding the application images.

## Validation

```bash
npm run build
npm test
npm run lint
```

## Near-term implementation order

1. Move the remaining academic and admissions fixtures behind tenant-scoped repositories.
2. Deploy and connect the self-hosted H5P runtime, then add media transcoding and rich hotspot authoring.
3. Generate signed report PDFs and downloadable school documents.
4. Add approved school communication templates, delivery tracking, and family inboxes.
5. Start the Expo mobile client using the stable learning, assessment, report, and school-day contracts.
