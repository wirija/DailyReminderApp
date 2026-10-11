# Backend integration review

Reviewed 11 October 2026. Scope: the first persisted application build, its API/legacy UI boundary, authorization, imports and account integration. The domain agent reviewed the workspace bridge, account code and services implemented by the other agents; the services agent independently reviewed domain/session behavior. This is not a claim of independent visual or production-environment certification.

## Requirements checked independently

- A private manager workspace with durable client, opportunity, project, team, phase/task/subtask, minutes, action/PBC, issue, agreement, document and planner records.
- Client → opportunity → won project, direct project creation, lost opportunities, idempotent handover and retained context.
- Separate task/subtask ownership; multiple owners; editable dates with accountable change history.
- Structured attendees, original meeting evidence, scope clarification follow-ups and the same meeting in minutes/calendar.
- Task and meeting overlap without silently pausing the task; reports count overlapping time once; scheduled meeting duration with actual corrections.
- Populated stable-ID Excel upserts; imports and administrator changes must be visible without a stale browser overwriting them.
- Local authentication, private uploads, no automatic mail or board writes, opt-in cloud AI and future Entra linking.
- Ubuntu/Docker deployment is prepared by the root agent; the services agent reviews its configuration separately.

## Findings and resolution

| Severity | Location | Finding | Fix and verification | Status |
|---|---|---|---|---|
| Critical | `workspace/views.py:19`, `planner/views.py:28`, `planner/admin.py:24` | Forced-authentication tests hid a runtime failure: real session users are lazy wrappers, so `type(request.user).objects` failed. | Use `get_user_model()` for locks. Exercise real login and CSRF-protected writes in `accounts/tests.py:20`, `workspace/tests.py:242`, integration real-session upload test. | Fixed |
| Critical | `workspace/bridge.py:106`, `workspace/views.py:16` | Aggregate writes needed protection against cross-workspace identifiers, stale revisions and account switches. | Scope all lookup relations, lock the user before data/state rows, return 409 for stale revisions or workspace identity mismatch; failed writes roll back. Negative tests in `workspace/tests.py:91`, `:125`, `:205`. | Fixed |
| High | `workspace/bridge.py:274`, `:434`, `:556` | Minutes and calendar could become separate meetings, lose exact non-quarter start times or lose actual-time corrections after reload. | Reuse canonical identity, prefer edited minutes over stale calendar timing, emit unscheduled-versus-scheduled state explicitly, retain exact timestamps and corrections in both payloads. Tests in `workspace/tests.py:171`, `:183`. | Fixed |
| High | `workspace/bridge.py:570` | Post-handover imported PBC/actions could disappear from shared opportunity/project views or be mapped to the wrong model during autosave. | Merge canonical linked evidence on reads; preserve native next-action type and safely adopt owned post-handover records. `workspace/tests.py:105`. | Fixed |
| High | `workspace/bridge.py:395`, `:45` | Removing uploaded documents only changed the browser; documents returned after reload. A naive JSON-key filter also hid fresh uploads. | Soft-archive missing attachments and restore them on Undo; keep original bytes. Filter both false and absent archive keys. `workspace/tests.py:293`. | Fixed |
| High | `accounts/adapters.py:19` | Entra linking originally expected flat claims although installed allauth returns validated ID-token claims nested under `id_token`. | Use validated token `tid`/`oid`, reject unassigned tenants/objects and avoid email-based linking. Account tests cover nested claims, hostile userinfo, changed email, inactive users and existing links. | Fixed |
| High | `planner/services.py:14`, `workspace/bridge.py:245` | Saving a scope request through the aggregate UI skipped the REST API's automatic clarification follow-up. | Shared idempotent helper plus stable `scope-<decisionId>` identity, explicit decision links and preserved completion state. `workspace/tests.py:212`. Frontend agent adds the same reminder immediately. | Fixed |
| High | `planner/services.py:108` | A workspace-wide running-session constraint prevented the required task + meeting overlap; scheduled/corrected/timed meetings could otherwise count twice. | One open session per activity; one running task while allowing meeting overlap. Manual correction supersedes timers, which supersede scheduled estimates; union total intervals. Planner timer/report tests. | Fixed |
| High | `workspace/bridge.py:534`, `integrations/exchange.py:236` | Imported date changes could lack visible browser history; stale history could incorrectly authorize a new deadline. | Require a fresh reason, preserve immutable before/after audit and expose external audit entries without feeding them back into stored history. Populated Excel → import → stale409 → reload → autosave test in `workspace/tests.py:268`. | Fixed |
| Medium | `workspace/bridge.py:298`, `planner/models.py:260` | Attendee and decision labels differed from actual frontend values. | Preserve expected/not-recorded attendance and internal discussion states; verify the real handler fixture and rich nested records in `workspace/tests.py:59`, `:74`. | Fixed |
| Medium | `workspace/bridge.py:427` | Daily and weekly Teams updates existed only as unqueryable metadata. | Normalize source, kind, date, team, summary, blockers and explicitly reviewed issue-status claims into TeamUpdate. Roundtrip test in `workspace/tests.py:252`. | Fixed |
| Medium | `integrations/word.py:24`, `integrations/exchange.py:174` | Word used UTC under a Singapore label; template context was incomplete; Excel trimmed user free text and rejected blank owners. | Explicit Singapore conversion, attendees/open actions/PBC prefill, free-text whitespace preservation and optional owner support. Focused service tests. | Fixed |
| Medium | `planner/admin.py:86`, `planner/serializers.py:129` | Team administration exposed internal UUID fields; document upload limits differed between routes. | Team forms use name/team/email/role/active; workspace defaults automatically. Shared configurable limit defaults to 20 MiB. Admin POST and size-boundary tests. | Fixed |
| Low | `workspace/bridge.py:155` | Full record snapshots were recomputed for every field during autosave comparison. | Compute once per candidate record. Further large-workspace query optimization is deferred until measured. | Fixed |

## Evidence and limits

- Real frontend handler payload is stored at `workspace/fixtures/frontend_state.json`; tests do not rely on invented substitute UI shapes for the core client/opportunity/won-project/minutes/timer flow.
- Planner/workspace integration suite: **37 tests passed**. It includes real authenticated sessions, normalized records, imports, actual-time corrections, document removal/Undo and administration.
- `manage.py makemigrations --check --dry-run`: no missing migrations.
- Full accounts/planner/workspace/integrations suite: **74 tests passed**, 21.477 seconds; Django system checks found no issues.
- Tests use Django's SQLite test database. PostgreSQL row-lock behavior, Docker image startup, actual Ubuntu HTTPS hosting, live Entra login, real GitLab/Jira accounts and Ollama availability require environment validation; mocks are not presented as live service verification.
- No live browser was available within the existing browser restriction. Visual layout, PWA installation and browser-to-running-server behavior remain outside this report. Frontend inert-DOM checks are reported separately.
- Domain ownership is per authenticated manager. Team members are assignment records, not an implemented multi-manager shared-workspace permissions system.

Verdict: **PASS for the automated backend integration scope**. No unresolved Critical or High finding in this scope. Production deployment and full browser acceptance remain unverified.
