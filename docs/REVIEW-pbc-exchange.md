# Independent review — PBC exchange and task editor

Scope: the current PBC Excel template/import, PBC IDs, comment previews, and requested task/subtask editor layout/default dates. This is not a review of the entire pending redesign.

## Evidence and result

| Requirement / check | Result | Evidence |
| --- | --- | --- |
| Download a real Excel template; upload and ingest | Pass | `docs/pbc-exchange.js:10–32`, actual XLSX ZIP/XML checks and Node round-trip through production read/download functions. Header, frozen row, validation list, blank template, existing rows checked. |
| Seven columns including visible, retained PBC ID | Pass | `docs/pbc-table.js:4–15`; inert DOM checks confirm seven headings and sequential PBC-PRJ001-001/002/003 identifiers. |
| Match existing IDs; blank IDs create new records | Pass | `docs/pbc-exchange.js:7,23–24`; updates retain object identity and ID, repeated exported import is Unchanged, cross-project/duplicate IDs and repeated blank-ID requests rejected. |
| Validate workbook and preserve change accountability | Pass | `docs/pbc-exchange.js:9–24`; invalid archive/header/sheet/formula/date/status/owner tested. Mixed-invalid batch rejected before changes; changed dates require reason and retain old/new history. Excel 1900 leap anomaly and 1904 dates checked. |
| Review import before commit; cancel safely | Pass | `docs/pbc-table.js:39–59`; inert event-flow test verifies no mutation before commit, cancel, editing guard, date-reason error, successful create/update. Preview now shows all imported fields. |
| One-line comment preview with side editor | Pass, source/DOM | `docs/pbc-table.js:15,32–36,66`; actual comment text visible, escaped, editable; draft comments deferred until save. `docs/pbc-table.css:24,28` imposes nowrap/ellipsis and fixed 28px preview height. No rendered-height claim. |
| Task editor Name+Status, Date+Estimate, Owners, Notes | Pass, source/DOM | `docs/project-plan.js:64`, `docs/project-plan.css:90–93`; visual-grid order and DOM order now agree. |
| New task/subtask dates today through one week later | Pass | `docs/project-plan.js:50–51`; actual delegated creation tests independently assert Singapore today and +7 days for both levels. Existing dates preserved. |
| Existing inline editing/sorting/history/scheduling | Pass | Inert DOM tests exercise add/edit/cancel, date validation, audit reasons, bidirectional sort, draft guard, comment history, scheduling by original object reference, focus restoration. |

## Findings and fixes verified

| Severity | Location | Problem | Exact fix / final status |
| --- | --- | --- | --- |
| Medium | `docs/project-plan.js:64` | Owners preceded estimated hours in DOM, causing keyboard/read order to disagree with visual rows. | Estimated-hours markup moved before Owners; rechecked production markup and reran task/subtask handler suite. Resolved. |
| Medium | `docs/pbc-table.js:48` | New imports previewed only title/ID, hiding owner, dates, status and comment until committed. | Added all imported field values to every preview row; inspected final markup and reran import event flow. Resolved. |

Test harnesses: `/tmp/review-pbc-exchange-ui.js`, `/tmp/review-pbc-exchange-ui-import.js`, `/tmp/pbc-build/reviewer-test.cjs`, `/tmp/review-row-plan-new.js`. They exercise production functions in inert DOM/XML adapters and do not automate a browser. The existing explicit browser access restriction was respected. Pixel layout, real download/file-picker interaction, responsive rendering and row heights cannot be visually certified. Data and IDs persist only for the current mockup session.

Verdict: **PASS for this scoped source/logic review.** No unresolved Critical, High or Medium findings. This verdict does not certify full-app visual QA or the broader redesign.
