# Learners Hub

A class-first learning and school management platform for Ghanaian schools.

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
Docker Compose deployment with automatic HTTPS.

## Current technology

- Next.js 16 and React 19
- TypeScript in strict mode
- Tailwind CSS 4 plus product-specific CSS
- vinext/Vite for Cloudflare-compatible builds
- Node's native test runner for rendered-output checks
- Cloudflare D1 for persistent structured school records
- Cloudflare R2 for private lesson media and H5P packages
- Isolated Lumi H5P Node.js runtime for self-hosted interactive content
- Docker Compose and Caddy for the Hostinger VPS runtime
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
