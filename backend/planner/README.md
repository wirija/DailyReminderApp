# Planner domain API

All routes require a Django session and CSRF protection for writes. Querysets and
related-record selectors are restricted to the signed-in user's workspace. Team
members are assignable records, not login accounts.

The router is mounted at `/api/`. Standard list/create/detail/update/delete routes:

| Resource | Purpose |
| --- | --- |
| `clients`, `team-members` | Client directory and roster |
| `opportunities`, `next-actions` | Opportunity stages and multiple next actions |
| `projects`, `milestones`, `phases`, `work-items` | Many-client projects; phases → tasks → subtasks with independent multiple owners |
| `meetings`, `attendees`, `decisions` | Meeting records, structured people, confirmed/unconfirmed decisions |
| `follow-ups`, `pbc`, `issues` | Separate action, request and issue registers |
| `agreed-sections`, `agreed-items` | Section/subsection organisation and named agreements |
| `document-sections`, `documents` | Private original files and explicit document versions |
| `activities`, `schedule-blocks`, `time-sessions` | Personal work, split scheduling blocks and actual timer intervals |
| `team-updates` | Original daily/weekly messages, drafts, reviewed progress and dated discrepancies |
| `audit-events` | Read-only audit history |

Identifiers are UUIDs. `client_key` preserves stable identifiers used by the HTML
client; `metadata` preserves its additional structured record content. Project,
opportunity, PBC and issue references are assigned separately and never reused.
The aggregate workspace bridge projects these canonical models into the existing
frontend's structures.

List routes support applicable filters such as `?project=UUID`, `?status=Open`,
`?search=term` and `?ordering=end_date`. Related IDs must belong to the same user,
and project-specific parent/section references must belong to the same project.

Changes to project/work/request/deadline dates require `change_reason`. Every CRUD
operation through the API appends a before/after event; `/RESOURCE/ID/history/`
returns the record's history. Timer actions and manual calendar swaps audit their
own intent without asking for a deadline-change reason. Calendar moves never edit
the task deadline.

Special actions:

- `POST /api/opportunities/ID/win/`: optional project name, description, start/end
  and milestone fields. Creates exactly one linked project in a transaction;
  retrying returns the existing project. Stage `Won` cannot bypass this action.
- `POST /api/activities/ID/start/`, `/pause/`, `/finish/`: server timestamps,
  resumable intervals and one running task; meetings can run alongside a task.
- `POST /api/schedule-blocks/ID/swap/` with `{"target":"UUID"}`: swap positions,
  retain durations and pin both blocks. A conflicting swap is rejected atomically.
- `GET /api/time-report/?start=YYYY-MM-DD&end=YYYY-MM-DD`: union of work intervals,
  normal time and overtime in Singapore. Normal time is weekdays 08:45–18:00.
  Elapsed scheduled meeting time counts by default, labelled as an estimate;
  actual meeting start/end overrides it. Overlaps count once in totals.
- `GET /api/projects/ID/attention/`: missing deadlines, overdue work, work beyond
  a week and today's discrepancy records. Older discrepancies remain as history
  but do not appear as today's alerts.
- `GET /api/documents/ID/download/`: authenticated original-file download with
  no-store headers. Upload new evidence with `previous_version` instead of
  replacing the original file.

`python backend/manage.py test planner` exercises workspace isolation, date
accountability, hierarchy validation, stable references, idempotent handover,
time overlap/overtime rules, confirmation follow-ups, private downloads and swaps.
