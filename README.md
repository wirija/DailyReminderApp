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

With dependencies installed, start the full app and background worker using one command:

```sh
.venv/bin/python scripts/run_app.py
```

This builds the PWA cache, applies pending migrations, collects static files and opens the server at **http://localhost:8000/app/**. Keep this terminal running; Ctrl+C stops both processes. Use `--port 8001` for another port or `--no-worker` to run only the web server.

In Chrome or Edge, use **Install app** when offered (or the browser’s install menu). On iPhone/iPad, open the URL in Safari and choose **Share → Add to Home Screen**. For another device, use the Ubuntu HTTPS deployment described below; its own `localhost` address does not point to this computer.

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

My day offers Day, Week and Month views, Previous/Next controls, Today and a date picker. Day and desktop Week show the full **00:00–24:00** calendar. Each event is one block sized by its duration; overlaps appear side by side. Drag unscheduled tasks into a desktop Week column to choose its day and time, or drag scheduled blocks between columns. In the narrow weekly agenda, dropping onto a date opens the date/time editor. On narrow screens, Week becomes a daily agenda with overlaps grouped alongside one another. Click a date heading to open that day, or an event to open its details and actions in the side panel.

The calendar scrolls within the browser viewport. Todo lists unfinished tasks across dates; meetings are excluded. Unscheduled tasks stay in the right task panel. Weekly headers show weekday, day and month with stronger hour rules. Drag a scheduled task outside the calendar to return it to Unscheduled tasks; its timer and logged time are retained. General tasks have an editable duration in their details panel. Default project start, milestone and end rows use the same phase editor and child-task controls as user-created phases.


Unscheduled tasks appear in the right panel on desktop. Use **Unscheduled** (or **Tasks** on mobile) to toggle the panel. The compact **Add task** form opens and highlights the new task there after creation. The timer appears as a slim bar while a task is active or paused. Click the toolbar date to pick another date; **Now** returns to the current time. Routine feedback appears briefly at the bottom without shifting the calendar.

At Singapore midnight, unfinished tasks from earlier dates return to today’s unscheduled list. The same catch-up runs when the app reopens, and unassigned tasks remain visible across dates. Completed tasks and meetings stay unchanged; deadlines and timer records are retained.

Use **Remove from schedule** in a task’s side panel to return it to Unscheduled tasks. Its timer and recorded time remain intact. Use **Mark complete** when the work is finished. Explicit moves may overlap; Replan finds free space and preserves meetings, pinned tasks and running timers.

The compact calendar toolbar is available in every view. Open **Calendar options (⋯)** and choose **Download JSON template**, select **Day**, **Week** (Monday–Sunday) or **Month**, edit the file, then choose **Import JSON** from the same menu. Version 2 templates contain `period`, an anchor `date` matching the calendar’s selected date, and a `date` on every task/meeting. All row dates must fall within that period. Preview dates, assigned times and clash counts before importing.

Explicit `startTime` values accept 00:00–23:45 in 15-minute steps, and durations from 1 to 1,440 minutes that fit within the date. Split imported work crossing midnight into one item per date. Existing meetings spanning midnight are shown on both days. A blank task start time finds free space on its own date. `allowOvertime` controls only automatic placement: `false` uses weekdays 08:45–18:00; `true` uses all 24 hours. Explicit times are kept, including overlaps. Existing work is not rearranged, and tasks that do not fit remain unscheduled.

Use exact existing project names or leave project blank. IDs must be unique within each date; repeated imports are rejected. Version 2 accepts up to 1,000 items in a 1 MB file, with atomic validation. Version 1 daily files remain supported with their original 200-item limit. Stored schedule timestamps are preserved when moving from the old 08:00 slot origin to midnight.

## Visual system

The shared stylesheet adapts the [AiRTS Figma branding reference](https://www.figma.com/design/t5I0z19le7CZyq4wAUTARz/Design-System--Draft-?node-id=14078-539). That file contains a logo library, not a complete UI component/token library. The original white logo (`14083:48`) and navy `#0B203E`, plus text colour `#172434` (`14083:3`), are used with the existing responsive components. Supporting light/dark shades and component sizing are app adaptations, not claimed Figma specifications. The original logo is stored locally and included in the offline shell.

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

Verification in this build uses Django's in-process test client, mocked external services and the existing JavaScript/inert-DOM test suite. The My day update was also exercised in Chrome at 1440, 768 and 375 pixels in light and dark mode, including authenticated import/save/reload and task removal. Docker execution and real Entra/Ollama/GitLab/Jira credentials remain unverified. Independent findings and fixes are recorded in `backend/REVIEW.md` and `backend/REVIEW-SERVICES.md`.

The local full-app check also verified Chrome PWA installation eligibility (no manifest or installability errors), authenticated workspace loading, offline app-shell reopening, reconnection, and responsive views at 1440, 768 and 375px. The offline cache contains only public app assets; authenticated APIs and private uploads are excluded. Database-backed tests passed across accounts, planner, workspace and integrations.
