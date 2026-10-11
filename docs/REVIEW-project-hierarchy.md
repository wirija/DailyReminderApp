# Independent review: project phases, tasks and subtasks

Scope: the project hierarchy editor in `project-plan.js`, its stylesheet, and integration with `mockup.html`. This is a scoped review, not the outstanding full redesign audit.

## Verification

The actual module was executed under inert Node DOM mocks. The actual full inline application script was also initialized with both external factories loaded in document order. No browser or alternate server was used: the earlier browser file-access restriction remains applicable. Visual layout, real browser focus behaviour and responsive rendering remain unverified.

| Check | Result and evidence |
| --- | --- |
| Phase → task → subtask creation | Passed handler assertions. `edit()` inserts at the chosen parent and rejects a subtask directly under a phase. |
| Parent accountability | Passed: assigning a subtask to Minh leaves its parent assigned to Peter; later changing the parent to Sarah leaves the subtask assignment intact. |
| Cancel and validation | Passed: opening/closing an add dialog creates no work item. Editing dates without a reason leaves saved dates unchanged. |
| Deadline accountability | Passed: accepted changes retain old/new dates, reason and timestamp in item history. Child dates remain unchanged. |
| Overview / Tasks synchronization | Passed: `render()` regenerates both the timeline and work table from the same plan after saving. User-provided names are escaped. |
| Timeline bounds | Passed: final-day task in a year-long plan stays within the calculated range, within floating-point tolerance. Due-only migrated tasks explicitly retain unknown starts. |
| Legacy migration | Passed: existing owner, team, description, status and due date retained; missing due/start dates remain unknown. Migration occurs once. |
| Sorting / keyboard handlers | Passed actual-handler assertions for ascending/descending sibling name sorting and Enter/Space opening a work item. Source preserves parent grouping for every sort key. |
| Integration | Passed full inline startup with actual external modules. Initial opportunity, portfolio, project and client renders completed without a missing-node/init-order exception in the inert harness. |
| Personal task separation | Source verified: the global Add task handler still opens “Add a personal task”; project work uses separate Add phase / Task / Subtask controls. |
| Responsive / focus CSS | Source verified breakpoint alternatives and explicit focus rules. This is not a rendered accessibility or mobile-layout pass. |

## Findings resolved during review

| Severity | Location | Problem | Final disposition |
| --- | --- | --- | --- |
| Medium | `project-plan.js`, save handler | Focus selected the wrong Add phase control because tabs use the `hidden` property rather than a class. | Fixed to inspect `record-tasks.hidden`; actual handler now focuses the Overview control when Tasks is hidden. |
| Medium | `project-plan.js`, timeline bar width | A minimum percentage width could extend final-day bars beyond a long project timeline. | Minimum removed; actual rendered markup bounds assertion passes. |

No unresolved defect found in the scoped source/handler checks. Weekly team summaries and portfolio indicators remain illustrative sample data; this review does not claim that they recalculate from newly entered work. Storage remains session-only as disclosed by the editor.

**Scoped verdict: source and handler checks passed. Browser visual verification and full requirements/design-system review remain outstanding.**
