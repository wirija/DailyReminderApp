# Project and meeting fixes

Scope: `docs/project-plan.js`, `docs/meeting-workspace.js`. Existing structure, session-only storage, defaults, phase/task/subtask ownership, calendar selection, PBC interchange and meeting workflow are preserved.

## Implemented
- **Finding 4:** task and phase overdue labels use the current Singapore date and exclude Done items. Plan saves invoke `bridge.changed(project)` for the root's reconciled project summaries.
- **Finding 6:** project edit snapshots compare name, status, date range, estimate, selected owners, notes and change reason. Sort, collapse, another row, filters and fresh render cannot discard changed fields; clean/reverted forms remain navigable. Follow-up/action edits use the same saved-versus-draft distinction. Attendee and decision edits are guarded when switching records/tabs or saving a version.
- **Finding 12:** every phase/task/subtask has a `.pp-mobile-dates` fallback containing start/end, status and an explicit Overdue label; the shared stylesheet controls responsive presentation.
- **Finding 17:** project Tasks search/status/owner filters retain matching ancestors for context and remember choices per project. Meetings search includes title, attendee and notes; status and date/title/attendee/status sorting are available. Actions search/status/owner filters include Overdue. No-match messages direct users to adjust filters.
- **Finding 18:** attendee and meeting attachment removal offer `ReviewUndo.offer(label, restore)`. Restore retains identity, order and original attachment URL.

## Integration hooks
- Load `window.DraftGuard` before initializing these modules. Registered keys: `project-plan`, `meeting-forms`, `action-<mountId>`.
- Call `DraftGuard.canLeave()` before global navigation or replacing records. Local controls are already guarded. A clean form is never blocked merely because it is open.
- Pass `changed(project)` to `createProjectPlan`; it runs after a successful save. The root can recompute summaries without reopening/replacing the record.
- Existing `workspace.changed(context)` bridge still runs after action/PBC commits.
- `ReviewUndo.offer` must retain its restore callback until used or replaced. An attachment URL is deliberately retained to support Undo; page reload still clears session attachments.
- Shared styles: `.pp-filters`, `.mw-list-filters`, `.pp-mobile-dates`. Meeting sorting uses `button[data-meeting-column]`; a sort select remains available on mobile.

## Verification
Run `node design-review/tests/project-fixes.cjs` with the bundled Node runtime. The dependency-free inert DOM tests execute real module handlers for overdue exclusion of completed tasks; mobile information presence; dirty/clean/reverted drafts; collapse/sort/row protection; saved notes and the changed hook; deadline reason/history; contextual work/action/meeting filters; and attendee/attachment undo. Both JavaScript modules pass Node syntax checks.

This is executable logic/markup validation only. Browser rendering, focus traversal in an actual browser, layout at 375/768/1440px and screen-reader output remain unverified under the existing browser restriction.

## Needs decision / deliberately unchanged
Unresolved-decision to linked-follow-up automation, Word extraction/template generation, Teams ingestion and durable persistence require the separately identified workflow/architecture decisions. No placeholder was represented as a working backend.
