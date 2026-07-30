# Hostinger VPS deployment

This deployment runs Learners Hub, PostgreSQL, Redis, and the H5P runtime
behind the VPS's existing CyberPanel/OpenLiteSpeed proxy. Containers never bind
public ports 80 or 443.

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

Copy `.env.example` to `.env` on the VPS. Set unique PostgreSQL, Better Auth,
administrator, and H5P secrets. The deployment `.env` file must remain
untracked and readable only by the deployment user.

Generate the two machine secrets on the VPS:

```bash
openssl rand -base64 48
openssl rand -base64 48
```

Use one value for `BETTER_AUTH_SECRET` and the other for
`H5P_RUNTIME_SHARED_SECRET`. Use separately generated strong passwords for
`POSTGRES_PASSWORD` and `INITIAL_ADMIN_PASSWORD`.

`INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` create the first school
administrator idempotently. Subsequent applicant registrations never receive a
school role.

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

The web health check applies idempotent Better Auth and Learners Hub database
migrations, creates the configured administrator when absent, and verifies the
PostgreSQL connection. A failed migration keeps the web service unhealthy.

Local health checks:

```bash
curl --fail http://127.0.0.1:13000/api/health
curl --fail http://127.0.0.1:18080/health
```

The web response should include `"database":"connected"`.

After CyberPanel has created both child domains, configure their reverse
proxies as root:

```bash
bash configure-openlitespeed-proxies.sh
```

The script verifies both container backends, preserves each original vhost
configuration, validates the resulting OpenLiteSpeed configuration, and
performs a graceful restart.

On hosts where Nginx owns port 80, install the included ACME challenge
location before asking CyberPanel to issue certificates:

```bash
install -m 644 nginx-acme-location.conf \
  /etc/nginx/default.d/learners-hub-acme.conf
nginx -t
systemctl reload nginx
```

Install the hostname-specific HTTP redirects after certificates are issued:

```bash
install -m 644 nginx-http-redirects.conf \
  /etc/nginx/conf.d/learners-hub.conf
nginx -t
systemctl reload nginx
```

## Staging boundary

VPS email/password authentication, school membership resolution, and
admissions records use PostgreSQL. The remaining school repositories and
private media still have Cloudflare-specific adapters and are outside this
admissions test slice. Do not enter real learner data until private-file
storage, backups, recovery testing, password-reset delivery, staff MFA, and the
remaining PostgreSQL adapters are complete.

## Staging test journey

1. Open `https://learn.stephenarthur.org/sign-in`.
2. Sign in with `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`.
3. Confirm `/app` opens the administration workspace.
4. Sign out, return to `/sign-in?mode=register&returnTo=/admissions/apply`, and
   create an applicant account.
5. Save an application draft, reload the page, and confirm it remains.
6. Submit the application.
7. Sign back in as the administrator and confirm it appears under
   `/admin/admissions`.

## PostgreSQL backup for staging

Create a logical backup before upgrades that change persistence:

```bash
docker compose exec -T postgres pg_dump \
  -U "$POSTGRES_USER" "$POSTGRES_DB" \
  > "learners-hub-$(date +%Y%m%d-%H%M%S).sql"
```
