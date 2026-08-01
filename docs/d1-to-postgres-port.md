# D1 to PostgreSQL Port

Status: Written, not yet run against a database
Date: 1 August 2026

## The problem

`docs/vps-auth-and-postgres-design.md` moved identity and admissions to
PostgreSQL and left everything else. That left the learning half of the product
with no database on the deployment target:

- Five repositories — `learning`, `content`, `assessment`, `operations`,
  `reporting` — around 7,800 lines and 202 prepared statements, all calling
  `getD1Database()`.
- `getD1Database()` did `import("cloudflare:workers")`. The Docker image runs
  `node server.js` on a VPS, where that module does not exist.
- So every learning call threw, and every screen fell through to the hardcoded
  preview data in its page component.

Roughly 40 of the 48 tables in `db/schema.ts` had no PostgreSQL equivalent.

## Approach: adapt, do not rewrite

Rewriting 202 prepared statements by hand would be several thousand lines of
mechanical edits, most of them untestable without a database. A survey of what
those statements actually use showed the gap was much narrower than the line
count suggests:

- The D1 API surface used is only `prepare`, `bind`, `first`, `all`, `run` and
  `batch`. No `exec`, no `last_row_id`, no `meta.changes`.
- The only SQLite-specific SQL is `INSERT OR IGNORE`, used 52 times. There is
  no `json_extract`, `strftime`, `group_concat`, `AUTOINCREMENT` or
  `INSERT OR REPLACE` anywhere.
- The eight `ON CONFLICT` clauses already present are PostgreSQL-compatible.

So the repositories keep their D1-shaped code, and a small adapter sits
underneath:

| File | What it does |
| --- | --- |
| `db/sqlite-to-postgres.ts` | Rewrites `?` to `$n` and `INSERT OR IGNORE` to `ON CONFLICT DO NOTHING`. Throws on anything else SQLite-specific. |
| `db/school-database.ts` | Implements that surface over a `pg` pool. `batch()` runs in one transaction. |
| `db/learning-schema.ts` | Generated PostgreSQL DDL for the 42 remaining tables. |
| `scripts/generate-learning-schema.ts` | Generates the above from `db/schema.ts`. |

`getSchoolDatabase()` returns the adapter. Cloudflare has since been dropped as
a deployment target, so there is no longer a binding to fall back to — the types
are named `SchoolDatabase` and `SchoolStatement` rather than after D1, though
the repositories' 202 statements still have the shape D1 gave them.

## Decisions worth knowing

**Storage types mirror SQLite rather than idiomatic PostgreSQL.** Timestamps
are `text`, not `timestamptz`, because the repositories write and read ISO
strings and never compare them in SQL — a `timestamptz` column would hand back
`Date` objects and change what the APIs serialise. Booleans are `bigint`, not
`boolean`, because `db/schema.ts` declares them as integers with boolean mode
and the repositories bind `ready ? 1 : 0`. Tightening either is a later change
that has to move the read sites with it.

**The schema is generated, not hand-written.** Transcribing 42 tables by hand
is how a wrong column type survives for months. Regenerate with
`npm run schema:generate` after any change to `db/schema.ts`.

**It is a TypeScript module, not a `.sql` file.** A `.sql` read at runtime
through `import.meta.url` does not reliably survive the Next standalone build
the Docker image is built from. As a module it is bundled like any other
import — verified present in `.next/standalone` after `npm run build`.

**Tables are emitted in dependency order.** PostgreSQL resolves foreign keys at
`CREATE TABLE` time; SQLite does not. The generator topologically sorts and
throws on a reference cycle rather than emitting DDL that fails halfway.

**Seed ordering is now enforced.** Every learning seed row carries a foreign key
to `tenants` or `people`, which PostgreSQL checks. `ensureLearningFoundation()`
now awaits `ensurePeopleSeed()` first, and `seedPeople()` creates the tenant
unconditionally rather than relying on `INITIAL_ADMIN_*` being configured. Under
D1 this worked by ordering luck and would have failed on a fresh database the
moment a learning route was hit first.

**The seed reads the shared demo dataset.** `ensureLearningFoundation()` now
iterates `domain/demo/greenfield.ts` instead of carrying a hand-written copy of
Integrated Science. Without this the port would have been a regression: with the
database live, the pages would have shown the older, narrower seed instead of
the four subjects.

## Media storage

`getMediaStore()` was the second Cloudflare binding, and it is ported the
same way. `db/media-storage.ts` implements the four operations the
content repository uses — `put`, `get`, `get` with a byte range, and `delete` —
against a directory, and `getMediaStore()` returns it, reading
`MEDIA_STORAGE_DIR`.

A directory on a named Docker volume rather than an object store: a MinIO
container would compete for memory on a VPS already close to its limit, for a
single-node deployment that would not use the redundancy. PostgreSQL and the
H5P runtime already persist the same way.

Worth knowing:

- **Uploads are written to a temporary name and renamed into place.** A crash
  part-way through an upload would otherwise leave a truncated file that the
  database already has a row for, and it would serve as a valid but corrupt
  video.
- **Object keys are checked for traversal.** They are built from a tenant id,
  an offering id and a generated UUID, so nothing can currently escape the
  media directory — but the cost of being wrong is reading or overwriting an
  arbitrary file on the host, so it is enforced rather than assumed.
- **The container's root filesystem is read-only.** Uploads need the mounted
  volume; the Dockerfile creates `/data/media` owned by the unprivileged user
  so that Docker seeds a fresh named volume with that ownership instead of
  root's.
- **Reads are streamed, including ranges**, so video seeking works and a
  request does not hold a whole file in memory.

Unlike the database port, this was testable here: `tests/media-storage.test.ts`
runs 20 tests against a real temporary directory, including a round trip
through `getMediaStore()` itself.

## What is not done

**Verification against a real database.** Nothing in the database port has been executed against
PostgreSQL — there is none in the development environment. What exists instead
is `tests/postgres-port.test.ts`: 26 tests covering the SQL translation, the
adapter's result shapes and transaction behaviour, and the generated schema's
ordering and coverage, including a check that every table the repositories query
is created. That is not the same as having run it.

**The other foundations still seed their own data.** `ensureAssessmentFoundation`,
`ensureOperationsFoundation` and `ensureReportingFoundation` create unrelated
sample data, so markbook, attendance and reports show a different school from
the rest of the demo. They should be moved onto the shared dataset too.

## First deployment

Set `DATABASE_URL` and restart. `MEDIA_STORAGE_DIR` already defaults to
`/data/media` in the image, and the compose file mounts the `media-data` volume
there. On first request the boot sequence runs Better Auth migrations, then
`db/postgres.ts` identity tables, then the generated learning schema, then the
people seed, then the learning seed.

Watch for:

- A migration error naming a table — most likely a dependency-order or type
  problem in the generated DDL.
- A foreign key violation during the seed — most likely the tenant or a person
  missing, or a dataset id that `tests/demo-dataset.test.ts` does not cover.
- A screen still showing "Preview mode" — the API call failed; the response body
  carries the reason.
- An upload failing with a permission error — the `media-data` volume was
  created before the Dockerfile set ownership on `/data`. Remove the volume and
  let it be recreated.

Rolling back is setting `DATABASE_URL` aside: the repositories return to
throwing, and the pages return to their preview fallbacks. Media is separate —
unsetting `MEDIA_STORAGE_DIR` only breaks uploads, it does not roll back the
database.

## Related

- `docs/vps-auth-and-postgres-design.md` — the identity and admissions move
- `docs/demo-walkthrough.md` — what the demo shows and how to enable it
- `docs/technical-foundation.md` — the original D1 design
