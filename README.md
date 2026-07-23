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

## Current technology

- Next.js 16 and React 19
- TypeScript in strict mode
- Tailwind CSS 4 plus product-specific CSS
- vinext/Vite for Cloudflare-compatible builds
- Node's native test runner for rendered-output checks
- Cloudflare D1 for persistent structured school records
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

1. Add assignment briefs, rubric marking, attendance capture, and timetable operations.
2. Move the remaining academic and admissions fixtures behind tenant-scoped repositories.
3. Add secure media uploads and rich hotspot, composite, and file-response authoring.
4. Generate signed report PDFs and downloadable school documents.
5. Start the Expo mobile client using the stable learning, assessment, and report contracts.
