# Hostinger VPS deployment

This deployment runs Learners Hub behind the VPS's existing
CyberPanel/OpenLiteSpeed proxy. Containers never bind public ports 80 or 443.

## Hostnames

The initial staging hostnames are:

- portal: `learn.stephenarthur.org`
- H5P: `h5p.stephenarthur.org`

Both can be changed later. Update the DNS records, `.env` origins, reverse
proxy virtual hosts, and TLS certificates. Rebuilds are not required solely
for a hostname change.

## DNS prerequisite

Create these A records in the Hostinger DNS zone:

| Name | Type | Value |
|---|---|---|
| `learn` | A | `31.97.53.194` |
| `h5p` | A | `31.97.53.194` |

Do not request certificates until both names resolve publicly.

## Runtime configuration

Copy `.env.example` to `.env` on the VPS and set a unique H5P shared secret.
The production `.env` file must remain untracked and readable only by the
deployment user.

The default loopback bindings are:

- portal: `127.0.0.1:13000`
- H5P: `127.0.0.1:18080`

CyberPanel/OpenLiteSpeed proxies the public hostnames to those addresses.
Redis has no host port.

## Commands

Run from `/opt/learners-hub/deploy/hostinger`:

```bash
docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps
```

Local health checks:

```bash
curl --fail http://127.0.0.1:13000/api/health
curl --fail http://127.0.0.1:18080/health
```

## Current staging boundary

The portal UI can run in the standard Node container. H5P also runs as an
isolated Node service. The persistent school APIs still use the existing
Cloudflare D1, R2, and platform-authentication adapters. PostgreSQL, S3/R2
access, and Better Auth must replace those adapters before production data is
cut over to the VPS.
