# Secure Content Storage and H5P Delivery

Status: Accepted through the approved roadmap and repeated instruction to
proceed  
Date: 24 July 2026

## Understanding summary

- Teachers need one place to upload reusable lesson media and register
  interactive H5P content.
- Uploaded bytes must be private school assets, not public files or browser
  storage.
- Metadata, ownership, subject scope, audit evidence, and learning results must
  remain queryable in D1 while file bytes live in R2.
- Lesson blocks may reference media or H5P activities through stable identifiers
  so the same contracts can be rendered by the web app and a future mobile app.
- Learners receive media only through authenticated, tenant- and
  subject-scoped application routes.
- Embedded H5P content must use a constrained iframe launch contract with an
  accessible fallback and exact-origin message checks.
- This release creates the H5P integration boundary; it does not yet bundle and
  execute uploaded `.h5p` packages with a self-hosted H5P PHP/Node runtime.

## Assumptions and non-functional requirements

- The existing ChatGPT/Sites identity headers, tenant memberships, teacher
  assignments, class scope, and learner records remain authoritative.
- R2 uses the logical `MEDIA` binding and stores opaque object keys; user file
  names never become object paths.
- The initial upload limit is 25 MB per asset to fit school bandwidth and
  edge-request constraints. Larger video delivery and resumable uploads are a
  later transcoding release.
- Accepted uploads are images, audio, video, PDFs, office documents, and H5P
  packages. MIME type, extension, size, and empty-file checks run server-side.
- R2 writes complete before D1 metadata is marked ready. Failed metadata writes
  trigger best-effort object cleanup.
- H5P launch URLs must use HTTPS. Their exact origin is stored and checked for
  result messages.
- Public H5P embeds require the source platform's publishing and optional domain
  allowlisting configuration. Protected H5P.com content should later use LTI
  1.3 rather than exposing credentials in this application.
- Uploaded H5P packages are securely stored and marked as packages awaiting a
  compatible runtime; registered embed URLs are immediately launchable.

## Approaches considered

1. **Recommended: D1 metadata + private R2 bytes + H5P embed/LTI boundary.**
   Keeps school ownership, access rules, and mobile contracts inside Learners
   Hub without attempting to recreate the H5P runtime.
2. **Store uploads inside D1.** Simpler binding surface, but inefficient,
   expensive, and inappropriate for media blobs.
3. **Ship a self-hosted H5P runtime now.** Broad package playback, but it adds a
   separate execution stack, library lifecycle, content unpacking, and security
   review beyond this release.

## Selected design

The teacher content studio lists media and H5P activities for an assigned
subject. Uploads pass a pure validation policy, are written to R2 under a
tenant/offering/random key, and then receive durable D1 metadata and an audit
event. Download and streaming requests resolve the caller's school scope before
reading the R2 object.

H5P activities are registered from an HTTPS embed URL or an uploaded `.h5p`
package. URL-backed activities are launchable in a sandboxed iframe. Package
activities remain safely stored with an explicit awaiting-runtime state.
Lesson blocks reference assets and activities in versioned JSON configuration.
Learner result events are validated, attributed to the authenticated learner,
and stored as completion/score statements.

## Decision log

| Decision | Alternatives | Reason |
|---|---|---|
| Use private R2 for bytes | D1 blobs or public assets | Scales for media and keeps access server-controlled |
| Keep metadata in D1 | Infer from object keys | Enables ownership, filtering, audit, and future retention workflows |
| Cap direct uploads at 25 MB | Accept arbitrary video sizes | Protects edge memory and low-bandwidth users |
| Use opaque object keys | Use original filenames | Prevents traversal, collisions, and information leakage |
| Register HTTPS H5P embeds | Accept arbitrary HTML embed code | Avoids script injection and stores one auditable launch origin |
| Store packages without executing them | Bundle a runtime immediately | Preserves packages safely while isolating a complex runtime decision |
| Record normalized results | Store only raw postMessage payloads | Supports reports and analytics while retaining a bounded evidence payload |

