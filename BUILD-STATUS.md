# Application build status

This is the first working server-backed build of the existing planner PWA. It is a substantial implementation, not a claim that every item in the historical requirements audit is complete or that the Ubuntu deployment has been certified.

## Implemented in this build

| Area | Working implementation | Main location |
| --- | --- | --- |
| Identity | Local sign-in, closed registration, CSRF protection, attempt limits, private workspace ownership; optional Entra tenant/object linking | `backend/accounts/`, `backend/config/` |
| Persistence | Normalized records, transactional autosave, revision conflicts, server audit, API/admin changes reflected on reload | `backend/planner/`, `backend/workspace/`, `docs/api-client.js` |
| Clients and opportunities | Client records, multiple project relationships, opportunity stages including Lost, next actions, meetings/notes, Won → linked project | Existing register screens + workspace/REST APIs |
| Project work | Phases/tasks/subtasks, owners, date-change reasons/history, health, PBC, follow-ups, issues, agreed items and section organization | Project screens + planner models |
| My day and time | 15-minute schedule, manual meeting moves, task swaps, priority/deadline estimates, Start/Pause/Finish, retained time sessions, normal/overtime accounting | `docs/day-planner.js`, `backend/planner/services.py` |
| Meetings | Full minutes workspace, structured attendees, decisions, versions, supporting files, editable drafts, calendar linkage and actual-duration corrections | `docs/meeting-workspace.js`, meeting APIs |
| Word | Populated DOCX template, text/attendee extraction preview, retained original evidence; screenshots stay supporting documents | `backend/integrations/word.py` |
| Excel | Current-list exports and reviewed ID-based upserts for PBC/issues, validation, all-or-nothing import, date audit | Existing exchange UI + `backend/integrations/exchange.py` |
| Documents | Private binary storage/downloads, sections, version relation, reference removal and restoration without destroying originals | Document models/services + Documents screen |
| Team updates | Daily and weekly records, original Teams message, structured progress/blockers, reviewed status claims and history | `docs/server-features.js`, TeamUpdate model |
| GitLab/Jira | Multiple project sources, encrypted credentials, GET-only pulls, snapshots, daily discrepancies; no automatic personal tasks | `backend/integrations/connectors.py` |
| AI | Ollama default, optional explicitly selected cloud provider, background jobs, reviewed drafts, no autonomous sending or cloud fallback | `backend/integrations/ai.py`, worker, frontend draft controls |
| Administration | Add/edit team roster with names, teams, contact details, roles and active state; operator access to canonical records | Django administration |
| Hosting | Ubuntu Compose definition: Django/Gunicorn, Huey worker, PostgreSQL and Caddy; persistent volumes and backup procedure | `Dockerfile`, `compose.yaml`, `deploy/`, `DEPLOYMENT.md` |

## Calendar, JSON and user administration

Day/Week/Month views, period navigation and date selection preserve dated task allocations. A downloadable JSON template supports previewed automatic assignment of imported tasks around existing work, with explicit overtime and duplicate/overlap validation. Administrators can create sign-in accounts and delete access to accounts; deletion retains project records/audit evidence and prevents self-deletion. Each signed-in user owns a private workspace.

## Latest meeting and timeline changes

- Project start, delivery milestone and project end can be renamed and rescheduled directly beneath the timeline row. Date changes require a reason. Existing phases retain their full inline editor.
- Minutes include a PBC capture form beside the notes, linked to the same shared request list.
- Save records a checkpoint for autosaved meeting details and written notes; Cancel restores those fields to the opening/last saved checkpoint. Nested attendees, decisions, files and PBC requests save separately.
- Confirmed meeting deletion removes minutes/calendar/time records and preserves PBC requests, follow-ups and uploaded documents; deletion is audited and workspace-scoped.
- “Record actual meeting time” corrects report durations without rescheduling the meeting.

## Known remaining product work

These earlier requirements are retained for subsequent application work rather than silently marked complete:

- Advanced scheduling: automatic replanning when the day changes (Replan is currently explicit), recurring series/occurrence editing, splitting one personal task around meetings, and choosing a future working day for overflow through the UI.
- Custom date-range/report comparisons beyond the current day/week/month/all-time reports. Calendar Day/Week/Month navigation is now implemented.
- Richer AI extraction acceptance: structured meeting/task suggestions are available through the API, but the UI currently emphasizes reviewed text and email drafts plus manual record edits.
- A guided FSD/document-version and scope-comparison workflow. The data model supports file version relationships and scope decisions; it does not yet provide a complete revision comparison screen.
- Durable offline record editing and synchronization. An open tab retains unsaved changes through a temporary outage; reopening offline does not load private records.
- A final visual/accessibility recheck in real browsers across mobile/tablet/desktop and both themes. This build preserves the established interface; it does not complete the earlier full-design-system audit.

## Verification and independent review

Automated checks exercise actual Django requests and database transactions, real form/session authentication, full frontend-generated workspace payloads, mocked connector responses, DOCX/XLSX round trips, timers and reports. Frontend checks use the existing inert DOM harness and service-worker event tests. They are not browser rendering tests.

Final merged checks on 11 October 2026: **79 Django tests passed**, **19 authenticated frontend checks passed**, **22 planner checks passed**, and the full existing JavaScript suite passed. This includes 24 independent PWA checks and 56 source/contrast checks. Six in-process PWA serving tests passed; migration consistency and generated PWA asset checks were clean. The local development database has been migrated. The Admin superuser was created at the user’s explicit request; no external connection has been created.

Independent review reports:

- `backend/REVIEW.md`: workspace bridge and cross-module correctness.
- `backend/REVIEW-SERVICES.md`: authentication, configuration, deployment inspection and integration cross-review.

Detected failures were fixed and retested, including ordinary-session request failures hidden by API mocks, incorrect Entra claim lookup, cross-module field mismatches, duplicate meeting/calendar records, discarded document removals, stale uploads, date-change accountability and in-flight connector source changes.

**Not executed here:** Docker image/container startup, PostgreSQL concurrency under real workers, backup restoration, HTTPS issuance, browser installation/rendering, or live Entra/Ollama/cloud/GitLab/Jira connections. Configuration and deployment instructions are ready; those checks require the Ubuntu host and your chosen service credentials.

No deployment, email sending, external board mutation or external account connection was performed.
