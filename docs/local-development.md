# Running Learners Hub locally

Every route in this app awaits `ensurePlatformReady()` — including the public
home page, which calls `getAuthenticatedUser()` to decide whether the header
says "Sign in" or "My hub". That function runs the Better Auth
migrations, the schema migration and the demo seed, all against PostgreSQL. So
there is no useful "run it without a database" mode: without one, `next dev`
returns 500 for every path, and UI work has to fall back to the static harness
in `outputs/harness/`.

One PostgreSQL container is the whole setup.

## 1. Start PostgreSQL

```bash
docker run -d --name learners-hub-pg -e POSTGRES_USER=learners_hub -e POSTGRES_PASSWORD=learners_hub -e POSTGRES_DB=learners_hub -p 127.0.0.1:5432:5432 postgres:17-alpine
```

Bound to `127.0.0.1` rather than `0.0.0.0` so the throwaway password is not
reachable from anything but this machine. The image matches the one the VPS
runs, so migrations behave the same way here as they do in production.

Afterwards it is `docker start learners-hub-pg` / `docker stop
learners-hub-pg`. To wipe the database and re-seed from scratch:

```bash
docker rm -f learners-hub-pg
```

then run the `docker run` above again.

## 2. Configure the app

Copy `.env.example` to `.env.local` and set at minimum `DATABASE_URL`,
`BETTER_AUTH_URL` and `BETTER_AUTH_SECRET`. Generate the secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Two variables matter more than they look:

- `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` create the school and an
  administrator on first boot. Without them there is no tenant, and the seed
  that follows has nothing to attach people to.
- `DEMO_ACCOUNTS=true` with a `DEMO_PASSWORD` makes the Greenfield cast
  sign-in-able — a teacher, a learner, their guardian, an academic
  administrator and an admissions officer. This is what makes the teacher and
  learner workspaces reachable at all. It stays off on the VPS: the addresses
  are in the repository and the password is shared.

`H5P_RUNTIME_BASE_URL` and `H5P_RUNTIME_SHARED_SECRET` can stay unset. They
are read when an interactive activity is opened, not at boot, and an
unconfigured runtime reports itself as such rather than breaking the lesson.

## 3. Run it

```bash
npm run dev
```

First boot takes a few seconds longer than later ones: it runs the Better Auth
migrations, creates the 51 application tables, and seeds the demo school.

Sign in at `/sign-in`. The demo addresses are in
`domain/demo/greenfield.ts` — `grace.mensah@greenfield.edu.gh` is the
Integrated Science teacher, and `kwame.agyeman@student.greenfield.edu.gh` is
the learner whose subjects, lessons and attempts the demo data is built
around.

## Checks

```bash
npm run typecheck
npm run lint
npm run test:domain
```

`npm run build` is worth running before a deploy; it catches the things that
only fail when the app is compiled for production rather than served by the
dev server.
