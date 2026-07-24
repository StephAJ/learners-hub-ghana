# Self-hosted H5P Runtime

Status: Accepted through the Hostinger VPS decision and instruction to proceed  
Date: 24 July 2026

## Understanding summary

- Learners Hub will use the free, open-source H5P ecosystem without H5P.com.
- Teachers upload `.h5p` packages in the existing private content studio.
- A dedicated runtime on the Hostinger VPS imports and plays those packages.
- Learners continue to open activities inside lessons; they never browse the
  runtime as a separate product.
- Learners Hub remains authoritative for school access, lesson membership,
  attempts, scores, completion, and reporting.
- The web application and future mobile app use the same launch contract.
- The runtime is isolated so it can be upgraded without changing the school
  domain model.

## Assumptions and non-functional requirements

- The VPS runtime is available only through HTTPS in production.
- Learners Hub and the runtime share a long random signing secret stored as a
  runtime secret, never in source control or browser code.
- Package imports are idempotent by Learners Hub activity identifier.
- Learner launch grants expire after five minutes and are scoped to one learner,
  activity, lesson, and published lesson version.
- H5P xAPI statements are normalized and stored by Learners Hub.
- Existing 25 MB package limits remain in force for the first release.
- Runtime health failures leave activities safely in `awaiting-runtime`.
- Horizontal runtime scaling and offline mobile package playback are later
  releases; the contract must not prevent either.

## Approaches considered

1. **Dedicated Node H5P runtime on Hostinger (selected).** Keeps the current app
   and mobile API clean while using the maintained H5P Node integration
   libraries behind a narrow service boundary.
2. **WordPress or Moodle as a hidden H5P backend.** Official plugins are mature,
   but their user, content, and reporting models would duplicate Learners Hub.
3. **Execute H5P inside the edge application.** Avoids a second service, but H5P
   package extraction, library storage, and server APIs do not fit the current
   edge runtime well.

## Selected design

Package activation is an explicit teacher action. Learners Hub reads the
authorized package from private object storage and sends its bytes to the
runtime with a timestamped HMAC signature. When import succeeds, Learners Hub
stores only the opaque runtime content identifier and marks the activity
launchable.

For a learner launch, Learners Hub rechecks active membership, subject access,
and the published lesson link. It then creates a five-minute HMAC-signed grant
containing the tenant, learner, activity, lesson, version, and runtime content
identifier. The iframe receives the signed runtime URL. The runtime emits
bounded H5P xAPI messages to the parent, and Learners Hub records normalized
results through its authenticated API.

Runtime service contract:

- `POST /v1/packages` imports raw `.h5p` bytes and returns
  `{ "contentId": "opaque-id" }`.
- Import requests include the activity, tenant, timestamp, package digest, and
  an HMAC signature in `x-learners-hub-*` headers.
- `GET /v1/player/:contentId?grant=...` validates the short-lived grant and
  renders the H5P player.
- `GET /health` supports VPS health checks.

## Decision log

| Decision | Alternatives | Reason |
|---|---|---|
| Use a separate runtime service | Embed runtime internals in the main app | Isolates H5P libraries and supports web and mobile clients |
| Push package bytes from Learners Hub | Give the runtime direct object-storage credentials | Keeps storage credentials and tenant authorization in one place |
| Sign imports with HMAC | Static bearer token | Binds authentication to the exact package digest and timestamp |
| Issue five-minute learner grants | Public permanent player URLs | Prevents sharing a durable activity URL outside the assigned class |
| Store an opaque runtime content ID | Store runtime database details | Keeps the integration replaceable |
| Keep results in Learners Hub | Use runtime reports as the source of truth | Preserves one gradebook and guardian reporting model |
| Use filesystem-backed H5P storage for the first VPS | Add PostgreSQL and S3 immediately | A persistent Docker volume is simpler for one runtime instance and can be backed up as a unit |
| Use UUID content identifiers | Use the library's random integer identifiers | Makes unauthorised asset discovery materially harder |
| Put Caddy in front of the runtime | Expose Node directly | Provides automatic HTTPS, compression, and one public ingress |
| Block outbound H5P network access initially | Permit arbitrary external media | Reduces data leakage from uploaded library code; reviewed external providers can be allowlisted later |

## Implementation snapshot

The first runtime implementation is in `services/h5p-runtime`. It includes:

- HMAC validation for package imports with five-minute replay protection.
- Five-minute learner grants with a hard ten-minute runtime limit.
- Idempotent activity-to-content mapping with atomic file replacement.
- UUID-backed H5P content storage and shared library storage.
- A learner-only H5P player with exact-origin framing and xAPI forwarding.
- Disabled runtime authoring, downloads, state writes, and public account flows.
- A health endpoint, non-root container user, persistent `/data` volume, and
  Caddy HTTPS ingress.
- Hostinger Compose configuration in `deploy/hostinger`.

Production connection still requires the VPS hostname, DNS record, and one
shared secret to be configured on both the runtime and Learners Hub.
