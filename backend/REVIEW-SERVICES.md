# Independent authentication and deployment review

Date: 11 October 2026. Reviewer: `backend_services` agent.

This agent implemented the integration services, but did **not** build the
authentication, core planner, workspace bridge, Docker image or deployment
configuration reviewed here. Authentication checks below were written as an
independent pass against the running Django request stack, using its in-process
test client. No browser or listening server was used.

## Findings and recheck

| Severity | Location | Finding | Exact fix and verification | Final status |
| --- | --- | --- | --- | --- |
| Critical | `planner/views.py:OwnedViewSet.lock_workspace`, `workspace/views.py:workspace`, `integrations/views.py:workspace_write_state` | Locking via `type(request.user).objects` failed for a real session's `SimpleLazyObject`. Force-authenticated API tests concealed the failure; ordinary signed-in API writes returned 500. | Use `get_user_model().objects.select_for_update()` while preserving user → workspace-state → record lock order. The independent test signs in through the actual form, creates a client with CSRF, reads the aggregate workspace, and checks logout. A separate real-session file upload regression also passes. | Fixed |
| High | `accounts/views.py:PlannerLoginView`, `templates/registration/login.html` | Django's basic login view bypassed allauth's login attempt limits; the evolving template also submitted `login` rather than the basic view's `username`. | Use allauth's LoginView with its `login` field, configure account/IP limits and a shared database cache in production. Tests verify valid login and that repeated bad passwords block subsequent authentication attempts. | Fixed |
| High | `config/settings.py:SECRET_KEY` production guard | The literal `.env.example` replacement marker satisfied the previous minimum-length guard, allowing deployment with a known application secret. | Reject obvious replacement/example/development markers as well as short secrets when DEBUG is false. Current guard and `.env.example` inspected. | Fixed |
| Medium | `requirements.txt`, `config/settings.py:HUEY`, `deploy/entrypoint.sh` | An earlier Huey lower bound admitted versions without the PostgreSQL backend used by production configuration. | Require Huey ≥3.4; lockfile pins 3.4.0. Inspected the installed `PostgresStorage` constructor and built-in `create_huey_tables` command against DSN/configuration and startup order. | Fixed |
| Medium | `config/settings.py:SOCIALACCOUNT_PROVIDERS` | The OIDC provider default fetched userinfo even though account linking used the validated ID token; Entra userinfo would introduce an unnecessary Graph request. | Set `fetch_userinfo=False`; retain ID-token tenant/object validation and PKCE. Independent tests reject userinfo attempts to override token identity and verify stable linking when email changes. | Fixed |
| Medium | `accounts/middleware.py:PrivateResponseMiddleware` | Most private JSON endpoints relied on frontend fetch options to prevent caching. | Apply `Cache-Control: private, no-store` to API, account and admin responses. Real-session API tests assert the server response policy; PWA shell assets remain separately cacheable. | Fixed |
| Medium | `integrations/views.py:file_upload`, `deploy/Caddyfile` | The application permitted 50 MB documents while the proxy rejected requests at 20 MB. | Use the 20 MiB application upload limit and a 22 MB proxy request limit to allow multipart overhead. Inspected both settings. | Fixed |

No unresolved Critical, High or Medium finding remains in this review scope.

## Authentication evidence

`accounts/tests.py` contains ten independent tests covering:

- Actual local login, CSRF enforcement on login/API/logout, POST-only logout,
  authenticated workspace reads and server-side no-store headers.
- Closed public registration and unauthenticated API rejection.
- External `next` URL refusal and password-attempt throttling.
- Public PWA asset allowlisting and rejection of private/path traversal URLs.
- Entra tenant/object allowlisting, validated-token-only identity linking,
  changed-email continuity, inactive accounts, missing explicit links and
  conflicting identities. Existing linked social accounts are not redundantly
  reconnected on subsequent sign-ins.

Entra tests deliberately mock the post-validation identity payload. They do not
claim a live token exchange or cryptographic interoperability test against a
Microsoft tenant. The configured allauth code path was inspected directly.

## Integration cross-review and checks

Other builders independently reviewed this agent's integration implementation:

- `backend_domain` found incomplete Word prefilling, a UTC time labelled as
  Singapore time, free-text whitespace stripping and unassigned PBC round-trip
  failures. These were corrected and covered by focused tests.
- `frontend_app` found that a connection edited during a remote pull could
  receive the previous source's results. Synchronisation now rechecks the locked
  connection's provider, server, repository/board, account, encrypted credential,
  project and enabled state before writing imported items. A simulated edit
  during the HTTP response is rejected without importing stale records.
- File uploads check the expected workspace revision before saving and return
  the before/after revisions for a safe frontend merge.

`integrations/tests/test_services.py` now contains 27 tests. They exercise private
file access, source retention, populated DOCX/XLSX output, all-or-nothing imports,
stable IDs, date-change audit, formula protection, whitespace and owner handling,
credential encryption and non-disclosure, GET-only pagination and redirect
refusal, snapshots, explicit cloud selection with no fallback, draft-only AI,
and daily team/board discrepancy expiry. GitLab opened/closed states compare only
completed versus unfinished work, avoiding false discrepancies for in-progress,
blocked or review work. Jira retains its richer workflow comparison. Ambiguous
GitLab issue numbers across repositories require a repository-qualified key
instead of a guessed match.

Recheck command:

```sh
.venv/bin/python backend/manage.py test accounts integrations.tests --noinput
```

Result: **37 tests passed**, Django system checks clean. Shell syntax checks for
`deploy/entrypoint.sh` and `scripts/backup.sh` also passed. The extended real-session
workspace read and migration consistency checks were checked after the final
authentication change.

## Deployment inspection and limits

Reviewed `Dockerfile`, `compose.yaml`, `.dockerignore`, `.env.example`,
`deploy/Caddyfile`, `deploy/entrypoint.sh`, `scripts/backup.sh`, `requirements.lock`,
`README.md` and `DEPLOYMENT.md`:

- Application processes run as an unprivileged container user; only proxy ports
  are published. PostgreSQL and private uploads use persistent volumes.
- The database becomes healthy before migrations; cache and Huey tables are
  created before web readiness, and the worker starts after the web health check.
- Production cookies require HTTPS; forwarded protocol trust is restricted by
  the unpublished application port. API records/files are not public assets.
- Connector encryption keys are stable/configurable and invalid dedicated keys
  fail startup. Access logs omit URL query strings.
- Backup instructions cover a consistent database/file recovery point and the
  configuration keys needed to decrypt credentials; restoration targets a fresh
  recovery deployment.

Docker is unavailable in this environment. Image build/run, PostgreSQL row-lock
behaviour under concurrent processes, backup restoration, HTTPS certificate
issuance, live Entra/Ollama/cloud/GitLab/Jira connections and browser rendering
remain **unverified on the Ubuntu deployment**. The documentation states those
limits and the necessary host checks. This report does not certify production
deployment or replace those checks.

**Verdict: PASS for the inspected implementation and automated review scope.**
