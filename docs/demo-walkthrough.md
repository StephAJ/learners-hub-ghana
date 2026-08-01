# Greenfield Academy Demo Walkthrough

Status: Staging demo guide
Date: 31 July 2026

One coherent school you can sign into as five different people and follow the
same learner through every workspace.

## What is real, and what is not

Read this first, because it determines what the demo proves.

**Backed by PostgreSQL:** accounts and sign-in, roles and memberships, the
guardian-to-learner link, the admissions queue, and — since the D1 port — the
subjects, lessons, lesson content, media library, assessments and markbook.

The learning repositories still use an interface shaped like Cloudflare's D1
API, but it is backed by PostgreSQL and Cloudflare is no longer a deployment
target. See `docs/d1-to-postgres-port.md`.

**Not yet verified against a running PostgreSQL.** The adapter, the generated
schema and the dataset-driven seed are written and unit-tested, but no part of
this has been executed against a real database — there is none in the
development environment. Treat the first deployment as the test: watch the boot
logs, and expect the learning schema migration and the seed to be where any
problem shows up.

The demo dataset lives in `domain/demo/greenfield.ts`, deliberately free of
database imports. It now feeds both the PostgreSQL seed and the browser
fallbacks, so the content is the same whichever path serves it.
`tests/demo-dataset.test.ts` holds it to the referential integrity PostgreSQL
will enforce.

**Still served from the browser fallback:** nothing in the learning path, once
the database is up. If a screen shows "Preview mode", the API call failed —
check the logs rather than assuming it is by design.

## Turning the demo accounts on

Set both in the VPS environment file, then restart the web container:

```bash
DEMO_ACCOUNTS=true
DEMO_PASSWORD=choose-a-long-password-you-do-not-reuse
```

Every account below shares that one password. That is acceptable on a staging
box you are willing to have anyone sign into, and unacceptable anywhere else —
so leave `DEMO_ACCOUNTS` unset in production and nothing is created. Enabling
it without a password of at least 10 characters fails the boot rather than
inventing one.

| Who | Signs in as | Lands on |
| --- | --- | --- |
| Grace Mensah, teacher | `grace.mensah@greenfield.edu.gh` | `/teacher` |
| Kofi Boateng, teacher | `kofi.boateng@greenfield.edu.gh` | `/teacher` |
| Abena Owusu, teacher | `abena.owusu@greenfield.edu.gh` | `/teacher` |
| Emmanuel Ofori, class teacher | `emmanuel.ofori@greenfield.edu.gh` | `/teacher` |
| Kwame Agyeman, learner | `kwame.agyeman@student.greenfield.edu.gh` | `/student` |
| Efua Agyeman, guardian | `efua.agyeman@example.com` | `/guardian` |
| Mary Asante, academic admin | `mary.asante@greenfield.edu.gh` | `/admin` |
| Joseph Kumi, admissions officer | `joseph.kumi@greenfield.edu.gh` | `/admin` |

## The school

Kwame Agyeman is in JHS 2 Gold and takes four subjects. Efua is his mother.

| Subject | Teacher | Lessons | Kwame's progress |
| --- | --- | --- | --- |
| Integrated Science | Grace Mensah | 3 | 47% |
| Mathematics | Kofi Boateng | 2 | 30% |
| English Language | Abena Owusu | 1 published, 1 draft | 25% |
| Social Studies | Emmanuel Ofori | 1 | 0% |

Between them the lessons use all five block types — reading, video, interactive,
practice and downloadable resource. Videos are real published recordings from
Amoeba Sisters, Math Antics, and Channels Television, embedded through
`youtube-nocookie` so YouTube's tracking cookies are deferred until a learner
presses play.

## Walking it

**As Kwame.** Sign in, land on Today. The continue card points at the
least-finished subject. **My subjects** now lists all four rather than jumping
straight into Integrated Science. Open Integrated Science: the first lesson is
complete, the second is part-way, and the third is locked behind it — press
through the second to watch the prerequisite release. Every lesson has a video
that plays. **Assessments** opens the digestive system check, which covers all
eight question types the marker supports: single choice, multiple choice,
true/false, short text, numeric, matching, ordering and essay.

**As Grace.** **My subjects** shows the same Integrated Science library Kwame is
studying, including the draft that has not reached him. **Content studio** holds
the media and the H5P activities: one activity is launchable, one is uploaded
but awaiting runtime import, and one is a planning draft. Press **Preview** on a
video to watch the stream a learner gets.

Upload a video, attach it to a new lesson's video block, and publish — then open
Integrated Science as a learner *in the same tab* and it plays. That is the
in-memory preview path; a reload clears it.

**As Efua.** The guardian workspace resolves to Kwame through the
`guardian_relationships` record, so the child on screen comes from the database
rather than the demo dataset.

**As Joseph.** **Admissions** has Yaa Mensimah's application waiting on a
decision, submitted 29 July for JHS 1 with a support need recorded. It resets to
awaiting-review on every boot, so the review can be demonstrated repeatedly.

## Known gaps

- None of the PostgreSQL learning path has been run against a real database
  yet. See `docs/d1-to-postgres-port.md` for what to watch on first boot.
- Markbook, reports and attendance still seed their own unrelated foundation
  data rather than reading the shared dataset, so those screens show a
  different school from the rest.
- Uploaded media lives on a Docker volume, not in PostgreSQL, so a database
  backup does not include it. Back up the `media-data` volume separately.

## Related

- `docs/teacher-authoring-walkthrough.md` — the authoring flow in detail
- `docs/vps-auth-and-postgres-design.md` — what moved to PostgreSQL and why
- `docs/teaching-and-learning-design.md` — the lesson and block model
