# Learners Hub

A class-first learning and school management platform for Ghanaian schools.

The current build establishes the learner-facing product shell, academic
administration, and admissions foundations. It includes a responsive learner
dashboard, class subject policies, compulsory-subject entitlement rules, an
application review pipeline, and accepted-applicant conversion into student
records and class placements.

## Current technology

- Next.js 16 and React 19
- TypeScript in strict mode
- Tailwind CSS 4 plus product-specific CSS
- vinext/Vite for Cloudflare-compatible builds
- Node's native test runner for rendered-output checks
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

1. Add persistence for school, admissions, learner, class, placement, and entitlement records.
2. Replace dashboard fixtures with tenant-scoped API data.
3. Add identity, role, and relationship-based permissions.
4. Build teacher, guardian, content, and assessment workflows.
5. Start the Expo mobile client once the first contracts are stable.
