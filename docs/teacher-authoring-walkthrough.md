# Teacher Authoring Walkthrough

Status: Operational guide
Date: 31 July 2026

The design docs describe how lesson authoring is modelled. This one describes
how a teacher actually uses it: getting an account, uploading a video, building
a lesson around it, and publishing it to a class.

## 1. Getting a teacher account

There is no public teacher sign-up, by design — a stranger must not be able to
create an account that can publish to a class. Accounts are created inside the
school.

**First, the school gets an administrator.** On first boot the platform
bootstraps one from environment variables (see `server/platform-ready.ts`):

```
INITIAL_ADMIN_EMAIL=admin@your-school.com
INITIAL_ADMIN_NAME=School Administrator
INITIAL_ADMIN_PASSWORD=<a strong unique password>
```

This runs once. It creates the Better Auth user, the person record, and an
active `school-admin` membership in the tenant.

**Then the administrator invites the teacher.** Sign in as the administrator,
open **Admin → People**, and invite a person with kind `staff` and role
`teacher` or `class-teacher`. That writes a `tenant_memberships` row with
status `invited`, scoped to the subject offerings they will teach.

**Then the teacher registers against that invitation.** The teacher signs up at
`/sign-in` with the invited email address. `resolveAuthenticatedSchoolUser`
matches the new identity to the waiting membership, so signing in lands them in
the teaching workspace rather than the applicant one.

A teacher can only author inside subject offerings assigned to their
membership. The API enforces this on every write, not just in the UI.

## 2. Uploading a video

**Teaching → Content studio** (`/teacher/content`) is the subject's media
library. It is one library per subject offering, shared by every lesson in it.

1. Under **Add lesson media**, set *Content kind* to `Video`.
2. Choose the file. Accepted: `.mp4`, `.webm`, `.mov`, up to 25 MB.
3. Upload.

The file is stored under an opaque object key — on the VPS that is a directory
on a mounted volume, on Cloudflare it is R2. The original filename is kept
only as display metadata, so a predictable name cannot be used to guess at
another school's files. Nothing is served from a public bucket URL: learners
stream through `/api/content/media?assetId=…`, which checks the session, the
tenant, and the offering on every request, and supports range requests so
seeking works on a slow connection.

Press **Preview** on any video row to play the exact stream a learner will get,
without leaving the workspace.

For low-bandwidth classes, export around 480p. The player streams rather than
downloading the whole file up front.

## 3. Building the lesson

**Teaching → My subjects** (`/teacher/subjects`), then **New lesson draft**.

Fill in the unit, title, summary, and one objective per line. Tick the
curriculum standards the lesson covers — publishing is blocked without at least
one, because an unmapped lesson cannot appear in coverage reporting.

Then add activities. A lesson is an ordered list of blocks, and each block is
one of five kinds:

| Kind | What the learner gets |
| --- | --- |
| `text` | Reading content with an optional highlighted note |
| `video` | The player, from a video in the content studio |
| `interactive` | A knowledge check, or an H5P activity |
| `practice` | A written or ordering task |
| `resource` | A downloadable file |

For a video block: pick the block type **video**, give it a title and a
description, then choose the upload from **Video to play**. The dropdown only
offers video and audio assets — a `resource` block gets the documents instead,
so a PDF can no longer end up behind a play button.

Leaving the attachment empty is allowed. The learner then sees "No video
attached yet" rather than a play control that does nothing.

Add each block with **+ Add activity**. Reorder with the arrows; the order in
the list is the order learners step through.

## 4. Publishing

Save the draft, then select it in the lesson library and press **Publish to
class**. Publishing sets version 1 and is attributed and audited.

Release timing is set on the draft:

- **immediate** — available as soon as it is published.
- **scheduled** — available from a date and time you choose.
- **prerequisite** — unlocks only once a named lesson is complete.

Drafts are private to authorised staff until published. Publishing a new
version never rewrites learner progress against the old one.

## 5. Trying the flow without a database

The authoring screens fall back to a local preview mode when the school API is
unreachable — no `DATABASE_URL`, or a session that cannot reach the subject.
The header shows "Preview library" or "Preview mode" instead of "Saving to
school".

Preview mode runs the whole path in the browser: upload a video, watch it back
in the media library, attach it to a lesson block, publish, and open the lesson
in the learner view with the video playing. It is held in memory for one tab
only — a reload clears it. It is for walking the flow, never for real content.

## Related

- `docs/teaching-and-learning-design.md` — the lesson and block model
- `docs/secure-content-and-h5p-design.md` — media storage and the H5P boundary
- `docs/identity-and-persistence-design.md` — roles, memberships, scoping
- `docs/vps-auth-and-postgres-design.md` — deployment and environment
