# Learners Hub

A class-first learning and school management platform for Ghanaian schools.

The current build establishes the learner-facing product shell, academic
administration, admissions, identity, and teaching foundations. It includes a
responsive learner dashboard, class subject policies, compulsory-subject
entitlement rules, an application review pipeline, and accepted-applicant
conversion into student records and class placements. The People & Access
workspace adds durable tenant-scoped records, role and relationship
permissions, and protected APIs. Teachers can now author and publish structured
lessons, while learners can study text, video, interactive, practice, and
resource blocks with persistent progress.

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

1. Build the assessment kernel, question bank, quiz runner, and attempt review.
2. Move the remaining academic and admissions fixtures behind tenant-scoped repositories.
3. Add the guardian relationship dashboard and learner reporting.
4. Add media uploads and an isolated H5P-compatible content service.
5. Start the Expo mobile client once the assessment contracts are stable.
