# VPS Authentication and PostgreSQL Design

Status: Accepted for implementation  
Date: 29 July 2026

## Understanding summary

- Learners Hub is tested from `https://learn.stephenarthur.org`, not from the
  ChatGPT-hosted site.
- The VPS currently renders public pages but login fails because the application
  links to ChatGPT platform authentication routes that do not exist on the VPS.
- Admissions reads and writes fail in the Node container because the repository
  imports Cloudflare D1 bindings.
- Applicants need email/password registration, login, draft saving, submission,
  and a persistent applicant workspace.
- School administrators need a protected admissions queue backed by the same
  persistent records.
- The current deployment is staging. It must not hold real learner data until
  production privacy, backup, recovery, and operational controls are complete.

## Assumptions

- CyberPanel/OpenLiteSpeed continues to terminate HTTPS and forward the original
  host and protocol.
- A PostgreSQL container with a named Docker volume is acceptable for staging.
- A future production deployment can replace the container connection string
  with a managed PostgreSQL URL without changing application behavior.
- The administrator email, name, and initial password are supplied through the
  untracked VPS environment file.
- Applicant self-registration is open for the staging admissions journey.
- Document uploads, password-reset email delivery, and multi-factor
  authentication are later production-hardening work.

## Selected design

Better Auth provides email/password identities and secure HTTP-only web
sessions through a standard Next.js route handler. Authentication only proves
identity; Learners Hub continues to resolve school roles from its own tenant
membership records.

PostgreSQL stores Better Auth records plus the minimum Learners Hub records
needed by the VPS journey: tenants, people, identity links, memberships, audit
events, guardian relationships, and admission applications. SQL migrations run
as a separate deployment command before the web container becomes healthy.

Public registration creates an ordinary Better Auth user and does not create a
school membership. An authenticated user can manage only the admission
application attached to that user's verified session email. A configured
administrator account is created idempotently by the deployment bootstrap
command and receives the `school-admin` membership. No "first user wins"
bootstrap behavior is permitted.

## Request flows

### Applicant

1. Applicant registers or signs in at `/sign-in`.
2. Better Auth issues a secure, HTTP-only session cookie.
3. The applicant opens `/admissions/apply`.
4. The server resolves the session and loads the application by tenant, intake,
   and normalized session email.
5. Draft and submit actions validate and upsert the record in PostgreSQL.

### Administrator

1. The configured administrator signs in at `/sign-in`.
2. Learners Hub resolves the Better Auth user to an active school membership.
3. Admissions APIs require the `admissions:manage` permission.
4. The queue lists non-draft applications for the active tenant.

## Security and failure behavior

- Better Auth validates every protected request against PostgreSQL.
- Cookies are secure in production and remain host-only.
- The configured application origin is the only trusted browser origin.
- Passwords and session tokens are handled by Better Auth.
- Database failures return explicit errors and never report a successful save.
- Administrator bootstrap secrets remain outside source control.
- PostgreSQL is bound only to the internal Compose network.

## Alternatives considered

1. **Selected: Better Auth plus PostgreSQL.** Matches the accepted VPS
   architecture and can move from container PostgreSQL to managed PostgreSQL.
2. **Temporary signed-cookie login plus SQLite.** Faster but creates disposable
   authentication code and a second migration.
3. **Keep ChatGPT authentication and proxy identity headers.** Rejected because
   the VPS does not own or validate the ChatGPT hosting identity flow.

## Decision log

| Decision | Alternatives | Reason |
|---|---|---|
| Use Better Auth | Custom auth; ChatGPT headers | Maintained password/session implementation for Next.js |
| Use PostgreSQL | D1; SQLite | Matches the approved VPS architecture and future managed database |
| Run PostgreSQL in Compose for staging | Require managed database now | No managed connection is configured and the current goal is VPS testing |
| Bootstrap admin from environment | First user becomes admin | Prevents public registration from claiming school control |
| Keep identity separate from membership | Put role in session | Role changes remain authoritative in the school database |
| Migrate the admissions slice first | Rewrite every repository | Delivers the requested test journey without an unrelated full-system rewrite |

## Verification strategy

- Unit tests for safe return paths and role/bootstrap behavior.
- Repository integration tests against PostgreSQL where the environment permits.
- Type checking, linting, domain tests, and production builds.
- Docker Compose configuration validation.
- Browser smoke test covering registration, login, draft save, submission, and
  administrator queue on the VPS-shaped local deployment.
