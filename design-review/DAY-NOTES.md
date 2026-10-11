# Daily planner corrections

## Files

- `docs/day-planner.js`: isolated browser controller and pure scheduling/reporting model.
- `design-review/tests/day-planner.cjs`: deterministic model and inert DOM tests.

No HTML, CSS, repository history or external data was changed by this scoped implementation.

## Integration contract

Load `day-planner.js` before the main inline application script. Keep the existing `$`, `toast`, `modal`, navigation and project integrations. Replace the old scheduler data/functions and its `new`, `pause`, `finish`, `simulate`, `replan` and `period` handlers with:

```js
const dayPlanner = window.createDayPlanner({
  document,
  toast,
  modal,
  projectOptions: () => projectRecords.map(project => project.name)
});
const tasks = dayPlanner.tasks;
const render = () => dayPlanner.render();
```

The project-options callback is only evaluated when opening Add task, so the initializer may appear before `projectRecords` is populated. `tasks` is the original mutable array, preserving the existing opportunity-to-project retagging integration. The workspace schedule bridge becomes `dayPlanner.addAction(context, action, owner)`; it preserves deadline and source action identity and prevents duplicate task creation.

The controller uses existing IDs: `schedule`, `backlog`, `backlog-count`, `timer-name`, `timer-value`, `pause`, `finish`, `simulate`, `replan`, `new`, `period`, `total`, `normal`, `overtime`, `reports` and `modal`. It replaces `#reports section.panel` with the actual activity breakdown. It retains the existing task/meeting category classes. Timeline explanatory copy should say 08:00–20:00 and describe the actual Singapore-time line, replacing the old sample-time claim.

## Behavior changed

- Personal tasks retain validated name, optional project, estimated whole minutes, marked priority and optional deadline. Estimates are rounded upward only when reserving 15-minute planning blocks; the original estimate remains visible.
- Task and meeting moves validate complete occupied intervals. A task dropped onto a single task swaps start times if both complete spans fit; an unscheduled source returns the target to the backlog. Swaps that hit a third item or meeting are rejected atomically. Meetings remain manually movable into sufficient free time and remain fixed during automatic replanning.
- The keyboard-accessible Move form lets the user select an exact time or return a task to Unscheduled. It does not silently choose the first free slot.
- Replan asks whether overtime may be used. It starts at the next 15-minute boundary when planning the current day and allocates marked priority then deadline, preserving meetings, pins and running tasks. Normal capacity is Monday–Friday 08:45–18:00; the full display is 08:00–20:00. Weekends have no normal-hours capacity. A shorter lower-priority task can fill a gap too small for higher-priority work. Overflow stays explicitly unscheduled.
- Start, pause and finish record separate timestamped sessions for each task. Resume accumulates its own time; switching tasks asks to pause the previous timer. Completed tasks keep their history, leave the schedule and appear in a completed list.
- Meeting timers are separate. Starting a meeting during a task offers pause or continue; continued overlap is preserved as two activity records. Running meeting controls remain accessible even when midnight rolls the schedule forward. The scheduled meeting-start warning also offers pause/continue without silently starting the meeting timer. If the app resumes late, it warns once while the meeting is still underway.
- Start, pause, move and unpin restore focus to the corresponding task control after rendering. Report tables use the shared responsive table class and explicit mobile field labels.
- The dashboard computes live session totals, filters week/month/all-time, clips cross-period sessions, unions overlaps and divides actual time into Singapore normal hours and overtime. Task and meeting activities remain separately visible; their overlapping activity totals are explicitly described as non-additive. Zero data produces an instructional empty state.
- The actual current Singapore time positions the timeline line. Midnight returns unfinished plans to the backlog while running timers continue until the user acts.

## Verification

Run:

```sh
node --check docs/day-planner.js
node design-review/tests/day-planner.cjs
```

19 checks passed: input validation; full-span collisions; atomic swaps and overflow; preserved meeting/pinned/running placement; priority and deadline ordering; same-day late-afternoon replanning; weekends/overtime; per-task pause/resume/finish; concurrent task/meeting union; Singapore weekday boundaries; overnight/week/month clipping; zero records; timer formatting beyond 24 hours; inert DOM initialization, focus restoration, delayed overlap warning, task/Move/report/action-bridge handlers and responsive report markup.

`design-review/tests/app-integration.cjs` also loads every local script in the real HTML order and passes 7 checks for initialization, grouped navigation, global Add task, opportunity edits, action-to-My day transfer, escaped live project summaries and theme behavior.

The inert DOM does not render pixels or emulate a full browser. No browser, mobile screenshot, screen-reader or visual-layout verification was performed because the prior browser restriction remains in force.

## Explicit limits

- Sessions and tasks remain in memory for the current mockup session; reload clears them. Persistence/backend and calendar sharing remain deferred.
- Automatic task splitting is not implemented. The scheduler reserves a continuous block or leaves the task unscheduled; it never silently overlaps work to fit it.
- The shared meeting-to-calendar capture flow requires a product decision. Existing sample timeline meetings remain independently tracked, with no Outlook integration.
- There is no future-day date selector in this change. Unscheduled work can be retained for the next day; an explicit future-day planning flow remains outside this scoped fix.
- Root integration passes the inert application checks above. Rendered browser and assistive-technology verification remain unavailable.
