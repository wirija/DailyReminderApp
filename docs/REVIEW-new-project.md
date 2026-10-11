# Independent interim review: New project

Scope: direct project creation only, including related register, client-link, and empty-record behavior. This is not the outstanding full redesign review. Browser policy denied local-page UI access; no bypass was attempted. Evidence below is source inspection and non-browser Node execution, not on-screen verification.

| Check | Evidence in `docs/mockup.html` | Result |
|---|---|---|
| Discoverable creation action | Line 32: Projects changes header action to New project and routes it to `newProject`. Other views retain Add task. | Source checked |
| Form fields and labels | Lines 108–110: name, client checkboxes, start/end dates, health, milestone/date, description; required fields and session-only storage explained. | Source checked |
| Validation | Lines 111–117: trimmed name, duplicate name, client required, end-before-start and milestone range checks. Native required/date fields cover omitted dates. | Source and logic checked |
| Record creation and many-client links | Lines 118–122: next reference, new record, selected client links, all list renderers, opening detail. | Source and logic checked |
| Counts and empty records | Lines 42–43, 60: dynamic counts, zero-count progress handling, empty tasks/history/minutes messages. | Source checked |
| User-provided text | Name and milestone escaped in register, portfolio, Gantt, client linking; description uses `textContent`. | Source checked |
| Syntax | Complete inline script passed bundled Node `--check`. | Checked |
| Submit logic | Extracted actual `newProject` function exercised using plain mocked form nodes: invalid dates, missing clients, out-of-range milestone, same-day creation, two-client links, empty task/minute arrays, detail opening, duplicate name rejection. | Checked |

## Findings and recheck

| Severity | Location | Problem | Fix / disposition |
|---|---|---|---|
| Medium, resolved | `renderRecordExtras`, lines 74–77 | Allowed same-day projects were displayed as ending one day later because the nonzero timeline denominator also supplied the actual end. | Actual duration now drives end milestone and axis labels; a separate nonzero denominator drives positioning. Rechecked in source. |
| Medium, resolved | `showProject`, line 43; new record, line 121 | New projects with no follow-ups still exposed sample deadline and draft actions referring to another record. | New records mark follow-ups absent; those two buttons are hidden for empty records and restored when opening existing sample records. Rechecked in source. |

No unresolved actionable issue found within this narrow scope. On-screen behavior and the larger requirements remain unverified here; no overall redesign PASS is asserted.
