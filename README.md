# Daily Project Planner

A private planner for clients, opportunities, project delivery, meeting minutes and personal time. The existing HTML PWA now connects to a Django application instead of losing records when a tab closes.

## Application architecture

- **Django 5.2 / Django REST Framework:** authenticated APIs, workspace ownership, validation, administration and audit history.
- **PostgreSQL 17:** canonical records, sessions, application cache and the Huey background queue.
- **Huey worker:** Ollama/cloud drafts and read-only GitLab/Jira pulls.
- **Caddy:** HTTPS and reverse proxy on Ubuntu.
- **Existing HTML/CSS/JavaScript PWA:** kept intact and connected to the backend. The public app shell is cacheable; records, credentials and uploaded files are private and are never put in its offline cache.

The four Compose services are `web`, `worker`, `db` and `proxy`. Ollama can remain on your existing machine. Microsoft Entra sign-in is optional; local login works independently.

## Run locally

Python 3.14 was used for this build. From the repository root:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
.venv/bin/python backend/manage.py migrate
.venv/bin/python backend/manage.py collectstatic --noinput
.venv/bin/python backend/manage.py createsuperuser
```

Start the application and keep it running:

```sh
.venv/bin/python backend/manage.py runserver 127.0.0.1:8000
```

In another terminal, start background jobs:

```sh
.venv/bin/python backend/manage.py run_huey
```

Open [the application](http://localhost:8000/app/) and sign in. Accounts start empty. Create a client, then an opportunity or project; use **Team administration** to add team members for assignment. Team members are roster records, not additional login accounts. Administrators can use **User administration** to create sign-in accounts. Each account has its own private projects and workspace; accounts do not share project access. Deleting an account disables sign-in, invalidates its password and removes it from the active directory while retaining project records and audit history. You cannot delete the account you are signed in with.

Local development uses SQLite unless `DATABASE_URL` is set. PostgreSQL is the deployment database. Configure `OLLAMA_BASE_URL` and `OLLAMA_MODEL` in the process environment if they differ from the defaults. Django does not automatically read `.env`; Docker Compose does.

`docs/mockup.html` and `scripts/serve_pwa.py` remain a **sample preview**. They do not use the database. Use `/app/` on the Django server for the working application.

## Ubuntu and Docker

See [DEPLOYMENT.md](DEPLOYMENT.md) for HTTPS, initial login, persistent volumes, backups, upgrades and Entra setup.

## How records are saved

The browser loads `/api/workspace/` after authentication and autosaves changes in transactions. The server maps the workspace to separate client, opportunity, project, phase, work item, meeting, attendee, decision, follow-up, PBC, issue, document and time-session tables. Imports and admin changes are visible on the next load.

Each save carries a revision. An older tab cannot silently overwrite a newer workspace: it stops saving and offers an export of its unsaved changes. Keep the tab open during a failed save and use Retry. Offline edits made in an open tab remain in memory until reconnection; **durable offline editing is not implemented**. Reopening offline displays the cached shell and a connection message, not a stale copy of private records.

Deadlines and changes are audited on the server. File removal from a view retains underlying stored evidence for recovery; backups include it. Document binaries are served only through an authenticated download endpoint, never directly by Caddy.

## Calendar and JSON planning

My day offers Day, Week and Month views, Previous/Next period controls, Today and a date picker. Click a date or event in Week/Month to open its daily timeline. Navigation preserves each task’s planned date and time.

In the daily timeline toolbar, choose **Download JSON template**, fill in tasks/meetings, then choose **Import JSON**. The template uses the selected date and Singapore time. Preview the assigned times before importing. Tasks without a start time are scheduled by priority/deadline around existing work; meetings keep the supplied time. Existing work is not rearranged. Set `allowOvertime` explicitly to allow task planning outside normal hours. Items that do not fit remain unscheduled.

Use exact existing project names or leave project blank. IDs must be unique within the date; repeated IDs are rejected rather than silently duplicated. Imports accept up to 200 items in a 1 MB JSON file, and only import after all validation passes.

## Integrations

- **GitLab/Jira:** configure each repository or board in Connections. A project can have multiple sources. Pulls use GET requests only and preserve snapshots. Imported issues are reference information and do not become personal tasks automatically.
- **Ollama:** default AI provider. Drafts are separate records; you review and accept them. No email or calendar account is connected and the application does not send client messages.
- **Optional cloud AI:** configure an OpenAI-compatible endpoint, model and key on the server, then explicitly select it in the application. There is no automatic cloud fallback.
- **Word:** download a populated meeting template, upload completed notes, review extracted text and append it to the meeting. Original files and screenshots remain supporting documents.
- **Excel:** PBC and issue templates include existing rows. Import previews are upserts by stable ID; omitted rows are retained. Changes to dates require a reason.

API details are in [backend/planner/README.md](backend/planner/README.md) and [backend/integrations/README.md](backend/integrations/README.md).

## Verification

```sh
.venv/bin/python backend/manage.py test accounts planner workspace integrations
.venv/bin/python backend/manage.py makemigrations --check --dry-run
.venv/bin/python backend/manage.py check
python3 scripts/build_pwa.py --check
node design-review/tests/run.cjs
python3 scripts/test_pwa_server.py
```

After changing app assets, run `python3 scripts/build_pwa.py` before packaging. The Docker image refuses to build with a stale service worker.

Verification in this build uses Django's in-process test client, mocked external services and the existing JavaScript/inert-DOM test suite. Browser execution, Docker execution and real Entra/Ollama/GitLab/Jira credentials were not available for end-to-end deployment verification. Independent findings and fixes are recorded in `backend/REVIEW.md` and `backend/REVIEW-SERVICES.md`.
