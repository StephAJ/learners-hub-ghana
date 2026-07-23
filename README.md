# Learners Hub

A class-first learning and school management platform for Ghanaian schools.

The current build establishes both the learner-facing product shell and the
academic administration foundation. It includes a responsive learner dashboard,
class subject policies, learner placement, and automatic compulsory-subject
entitlement rules.

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

1. Add persistence for school, class, offering, placement, and entitlement records.
2. Replace dashboard fixtures with tenant-scoped API data.
3. Add identity, role, and relationship-based permissions.
4. Build teacher, guardian, admissions, and assessment workflows.
5. Start the Expo mobile client once the first contracts are stable.
