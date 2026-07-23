# Identity, Permissions, and Persistence Design

Status: Accepted through the approved roadmap and repeated “proceed” instruction  
Date: 23 July 2026

## Understanding summary

- School records must survive sessions and become the authoritative source for
  later web and mobile clients.
- The current private site uses the platform’s authenticated ChatGPT identity
  for its administrator surface.
- Authentication identifies a person; tenant membership, role, relationship,
  and scope determine what that person may do.
- Every school-owned table carries a tenant identifier and every mutation is
  authorised on the server.
- The first operational surface is People & Access: staff, learners, guardians,
  invitations, roles, and access scope.
- External learner and guardian sign-in is not introduced until the public
  identity-provider path is selected.
- Document uploads remain out of this slice; R2 stays unconfigured.

## Assumptions and non-functional requirements

- D1 is appropriate for this deployed prototype and its first-school data
  volume; the documented long-term PostgreSQL target remains unchanged.
- The first authenticated site owner may bootstrap the initial school
  administrator identity exactly once.
- The private Sites access policy remains an outer access boundary; application
  permissions remain mandatory inside it.
- Unknown identities receive no tenant data after bootstrap.
- Revoked or inactive memberships grant no permissions.
- Queries are tenant-scoped and avoid accepting a client-provided tenant as
  authority.
- The design must support API consumers beyond React, including the future Expo
  application.

## Approaches considered

1. **Recommended: platform identity + application RBAC/relationship scope.**
   Reuse the signed-in user headers, map them to a tenant identity, and enforce
   permissions in server code. This is secure enough for the private
   administration surface and avoids inventing a public auth stack.
2. **Role-only client checks.** Simple, but cannot protect APIs and cannot
   represent class, subject, or guardian-child access.
3. **Full external OIDC now.** Required later for the public product, but the
   current hosting path and provider selection are intentionally not assumed.

## Selected design

D1 stores tenants, people, identity accounts, memberships, guardian
relationships, and audit events. A small repository owns all database access.
The server resolves the signed-in email to an identity and active tenant
membership before returning records or accepting mutations.

The permission domain combines a role with optional class, subject, learner, or
tenant scope. School administrators receive tenant-wide administration;
admissions and academic administrators receive bounded operational access;
teachers receive class/subject access; guardians receive relationship-derived
child access; learners receive self access.

The People & Access page uses persistent APIs when authenticated. It retains
clearly labelled preview fixtures only for local rendering and automated page
tests where platform identity and D1 are unavailable.

## Decision log

| Decision | Alternatives | Reason |
|---|---|---|
| Use D1 now | Browser storage or premature PostgreSQL service | D1 is the supported durable store for this deployed site |
| Keep R2 null | Store files now | This slice has no real uploads |
| Treat identity and authorisation separately | Trust sign-in alone | Sign-in does not establish school membership or scope |
| Bootstrap the first administrator once | Hard-code an owner email | Deployment identity is not known at build time |
| Enforce permissions server-side | Hide buttons only | UI checks are not a security boundary |
| Model scoped roles and guardian relationships | Flat global roles | Ghanaian school access depends on class, subject, and child relationships |
| Keep external sign-in deferred | Scaffold OAuth | Current platform guidance requires confirming the public auth path first |

