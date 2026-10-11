# Independent interim review: project register

Scope: the latest requested project-register interactions only. This is not the full redesign review or its final Step 5 verdict.

Reviewed `docs/mockup.html` independently. Browser access to this local page was denied by policy; no alternate browser or serving route was attempted. Consequently, rendering, pointer interaction, and assistive-technology behavior remain unverified on screen.

| Check | Evidence | Result |
|---|---|---|
| Every register column has a clickable sorting header | Line 18: eight native buttons. Lines 50–67: key mapping, ascending/descending toggle, indicators, `aria-sort`, live announcement. | Verified in source |
| Dates and health sort meaningfully | Lines 51–57: chronological date values and health ranks. Independent Node execution of all eight sort keys over sample records produced correct ascending orders and reversed descending orders. | Logic verified |
| Whole row opens the selected project | Lines 32 and 62: delegated `closest('[data-project]')` and row-level project identifier. | Verified in source |
| Keyboard row activation | Lines 62 and 68: focusable rows, Enter/Space handling, Space default prevented. | Verified in source |
| Focus follows list/detail navigation | Lines 43 and 69: opening focuses Back; returning focuses original row or search fallback. | Verified in source after fix |
| No redundant Open button or stacked register fields | Lines 18 and 62: separate reference/name and milestone/date columns; no action column. Line 12: no-wrap cells. | Verified in source |
| JavaScript parses | Extracted complete inline script and ran bundled Node `--check`; exit 0. | Verified |

## Findings

| Severity | Location | Problem | Exact fix / disposition |
|---|---|---|---|
| Low | `showProject`, `showRegister` | Initially, keyboard opening hid the focused row without moving focus into details. | Builder added focus to Back and focus restoration to the original row. Source rechecked; resolved. |

No unresolved actionable defect identified in this limited source/logic review. This does not establish an on-screen PASS or approval of the outstanding full redesign.
