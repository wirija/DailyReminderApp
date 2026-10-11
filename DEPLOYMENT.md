# Ubuntu deployment and Microsoft Entra readiness

## 1. Prepare configuration

Install Docker Engine and the Compose plugin on the Ubuntu host. Copy this repository to the host, then:

```sh
cp .env.example .env
chmod 600 .env
```

Edit `.env` before starting. Set:

| Setting | Value |
|---|---|
| `APP_DOMAIN` | Hostname you will open, without `https://` or a path |
| `DJANGO_SECRET_KEY` | Unique random secret, at least 32 characters |
| `POSTGRES_PASSWORD` | Separate random password; hexadecimal avoids URL-encoding issues |
| `OLLAMA_BASE_URL` | Reachable Ollama address; `host.docker.internal` reaches the Ubuntu host |
| `OLLAMA_MODEL` | Exact name of an installed model |

Generate a separate value for each secret with `openssl rand -hex 32`. Do not reuse example values. Keep `.env` outside version control and include it in an encrypted backup: losing the encryption key means stored connector credentials must be re-entered.

`CONNECTOR_ENCRYPTION_KEY` optionally accepts a Fernet key. Without it, encryption derives from `DJANGO_SECRET_KEY`; keep that key stable when upgrading.

For an optional cloud provider, set `CLOUD_AI_BASE_URL` (including the compatible API prefix, commonly `/v1`), `CLOUD_AI_MODEL` and `CLOUD_AI_API_KEY`. It remains unused unless selected explicitly in the app.

## 2. HTTPS and networking

Point the hostname to this server and make ports 80/443 available to Caddy. A publicly resolvable domain with the required certificate-validation access gets automatic HTTPS. Database and application-container ports are not published.

For an internal-only company hostname, use a certificate issued by your company, or configure Caddy's `tls internal` and have IT trust its root certificate on your work computer. `localhost` also uses an internal certificate. A certificate trusted by your browser is required for reliable PWA installation. Do not use an untrusted certificate as the permanent setup.

If the company already runs an HTTPS proxy, route it to this deployment and configure the trusted-proxy boundary deliberately. Django trusts `X-Forwarded-Proto` here because only Caddy can reach the unpublished web port. Do not publish port 8000 directly while keeping that trust setting.

Ollama can run outside Docker. On Linux, a service bound exclusively to `127.0.0.1` cannot be reached from the container through the host gateway. Bind Ollama to an address reachable from the Docker network and restrict access to trusted hosts with the company firewall. Do not publish its API to the internet.

## 3. Start the application

```sh
docker compose up --build -d
docker compose exec web python manage.py createsuperuser
```

Choose your own username and password. Open `https://YOUR-HOSTNAME/app/`. There are no default credentials and no automatic public registration.

The web container runs migrations, creates the database cache and Huey queue tables, then starts Gunicorn. The worker starts after the web service is healthy. Persistent named volumes hold PostgreSQL data, uploaded files and Caddy certificate state.

Check status and logs:

```sh
docker compose ps
docker compose logs --tail=100 web worker
docker compose exec web python manage.py check --deploy
```

The initial HSTS duration is one hour and does not include subdomains or preload. Longer HSTS policies should follow your company's hostname and certificate policy.

## 4. Configure integrations

Add login accounts through **User administration** (administrators only); each account owns separate projects. Account deletion disables access and retains project/audit records. Add task-assignment roster members in **Team administration**. Create clients and projects in the app. In Connections, add one source per GitLab repository or Jira board and choose **Pull now**. Give each credential only the read access needed for its source. Credentials are encrypted in the database and are never returned to the browser.

Background jobs need the `worker` service. An unavailable AI service produces a failed draft job; it does not overwrite your notes or fall back to a cloud provider. Original Teams messages and document uploads remain available independently of AI.

## 5. Optional Microsoft Entra sign-in

Local login remains available. Entra integration uses a single-tenant OpenID Connect app registration and stable tenant/object IDs. It does not match users by email and does not require Outlook, calendar or Microsoft Graph access.

1. Register a **single-tenant web application** in the company's Entra tenant.
2. Add the exact redirect URI: `https://YOUR-HOSTNAME/accounts/oidc/entra/login/callback/`.
3. Create a client secret and store it in `.env`; record its expiry in your normal operations process.
4. Set `ENTRA_ENABLED=true`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` and `ENTRA_ALLOWED_OBJECT_IDS`.
5. For your single-user installation, set `ENTRA_LINK_USERNAME` to the existing planner username and allow exactly your Entra user **object ID**. The first verified sign-in links that identity to the same existing records.
6. Recreate the application services: `docker compose up -d --force-recreate web worker`.
7. Use **Sign in with Microsoft** and verify that the same projects appear.

Alternatively, leave `ENTRA_LINK_USERNAME` blank and link an identity explicitly:

```sh
docker compose exec web python manage.py link_entra YOUR_USERNAME TENANT_UUID USER_OBJECT_UUID
```

The object ID must still be in `ENTRA_ALLOWED_OBJECT_IDS`. An account from another tenant, an unlisted object ID or an inactive local account is rejected. The library handles OIDC code exchange, issuer/audience validation and PKCE. Application checks then enforce the tenant and user assignment.

The optional provider wiring and rejection cases are tested locally. A live Entra authorization round trip still requires your tenant and app registration.

## 6. Backups and restoration

Back up before upgrades, and keep encrypted copies away from this server. From the repository root:

```sh
sh scripts/backup.sh
```

The script briefly stops web and worker writes, saves a PostgreSQL custom-format dump, copies private uploads and `.env`, then restarts the services. Keep the three outputs together. Named volumes alone are not backups.

To restore into a **fresh recovery deployment**:

1. Restore `environment.env` as `.env`, adjust the recovery hostname, and protect its permissions.
2. Start only `db`: `docker compose up -d db`; wait for it to be healthy.
3. Restore the database and media, substituting the actual backup paths:

```sh
docker compose exec -T db pg_restore -U planner -d planner --no-owner < BACKUP/database.dump
docker compose run --rm --no-deps -T --entrypoint tar web -C /data/media -xzf - < BACKUP/media.tar.gz
docker compose up --build -d
```

Build the image first if it does not exist (`docker compose build`). Restore only trusted archives. These commands target an empty recovery database; do not run them over a live installation. Check login, a project, a file download and a completed background job after restoration. Do not delete the original backup until recovery is verified.

## 7. Upgrade

Back up, update the code and lockfile deliberately, then run `docker compose up --build -d`. Database migrations run at startup. Keep the previous image and matching backup for rollback; older code may not support a newer schema.

## Verification boundary

Docker is not installed in the build environment, so the Compose file and image definition have been inspected and syntax-checked but not executed here. PostgreSQL-specific runtime behavior, HTTPS issuance, live external connections and browser installation must be verified on the Ubuntu host before relying on the app for live work. No server was published or external account connected during this build.
