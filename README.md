# Learners Hub

A class-first learning and school management platform for Ghanaian schools.

The current build establishes the learner-facing product shell and the first
vertical slice: a responsive dashboard centred on class membership, compulsory
subjects, current learning, assessments, timetable, attendance, and academic
progress.

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

1. Establish shared academic contracts and persistence.
2. Implement school, academic year, class, subject, and enrolment administration.
3. Replace dashboard fixtures with tenant-scoped API data.
4. Add identity, role, and relationship-based permissions.
5. Build teacher, guardian, admissions, and assessment workflows.
6. Start the Expo mobile client once the first contracts are stable.
