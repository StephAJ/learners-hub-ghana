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

Three variables matter more than they look:

- `SCHOOL_NAME` names the tenant row the first time it is created. After that
  the school renames itself on `/admin/school` and that edit wins, so changing
  this later does nothing.
- `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` create an administrator on
  first boot. The tenant itself is created either way now, so a box with
  neither still serves a public site.
- `DEMO_ACCOUNTS=true` with a `DEMO_PASSWORD` seeds the Greenfield demo school
  and makes its cast sign-in-able — a teacher, a learner, their guardian, an
  academic administrator and an admissions officer. This is what makes the
  teacher and learner workspaces reachable without setting a school up by
  hand. It stays off on the VPS: the addresses are in the repository and the
  password is shared. `DEMO_SCHOOL=true` seeds the records without the logins.

With both demo switches off you get an empty school: no year, no classes, no
subjects, nobody but the administrator. That is the correct starting point for
a real deployment, and it is what `/admin/academic` and `/admin/people` exist
to fill in.

### Checking the empty-school path

`.env.local` normally has `DEMO_ACCOUNTS=true`, so the demo school is what you
look at every time — and the thing most worth checking is the thing you never
see. To look at a brand-new school, point `.env.local` at a database of its
own and turn the demo off:

```bash
docker exec learners-hub-pg psql -U learners_hub -d postgres -c "CREATE DATABASE learners_hub_fresh OWNER learners_hub;"
```

Then set `DATABASE_URL` to `…/learners_hub_fresh`, `DEMO_ACCOUNTS=false`,
`DEMO_SCHOOL=false` and a `SCHOOL_NAME` of your own, comment out
`INITIAL_ADMIN_EMAIL`, and run `npm run dev` as usual. The public site should
carry your school's name and nothing of Greenfield's — including the page
description, which a link preview shows. `tests/integration/fresh-install.test.ts`
asserts the same thing without the manual setup.

Edit `.env.local` rather than wrapping `npm run dev` in a script that sets the
variables and spawns it: the wrapper puts the dev server in a child process the
tooling cannot manage, and what you get is a server that appears to hang on
every request for reasons that have nothing to do with your code.

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

`npm run test:domain` needs nothing but node. It covers the domain modules and
the SQL the schema generator produces.

### Tests that need the database

```bash
npm run test:integration
```

These drive the repositories against PostgreSQL, which is where every
authorisation check and every tenant scope actually executes — the domain suite
cannot reach any of it. They found two bugs on the first run that no amount of
pure-domain testing would have: a query filtering on a column that did not
exist, and a `SELECT DISTINCT` PostgreSQL rejects, both on the register a class
teacher submits every morning.

They use a database of their own, so a run can never damage the development
school. Create it once:

```bash
docker exec learners-hub-pg psql -U learners_hub -d postgres -c "CREATE DATABASE learners_hub_test OWNER learners_hub;"
```

Override the connection with `TEST_DATABASE_URL` if yours is elsewhere. `npm
test` runs the domain suite, these, and the H5P runtime's own tests.

`npm run build` is worth running before a deploy; it catches the things that
only fail when the app is compiled for production rather than served by the
dev server.
