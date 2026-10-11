# Independent review: inline PBC rows

Scope: `pbc-table.js`, its stylesheet, the PBC branch in `meeting-workspace.js`, and script integration in `mockup.html`. This is a scoped review, not the full redesign audit.

Actual module handlers ran under inert Node DOM mocks. The row-editor checks used structural element trees and scoped selectors; integration checks ran the actual workspace bridge and complete inline application script. No browser or alternative server was used.

| Check | Result |
| --- | --- |
| Columns | Verified exactly Request, Owner, Request date, Due date, Status and Comment. |
| Inline edits / creation | Row click opens inline fields; Add creates an unsaved draft row. Saving creates one PBC record. Existing rows retain identity. |
| Cancel / comments | Cancelling preserves saved values. A comment saved into a row draft stays unsaved until the row is committed and is discarded with Cancel. |
| Legacy dates | Unknown request dates remain blank/“Not set”; no historical request date is invented. |
| Validation | Blank request/owner and due-before-request fail without committing. Existing date changes require a reason. Saved history retains old/new dates and reason. |
| Comment side editor | Standalone comment saves persist the text; final implementation retains old and new text in history. The expandable History renders timestamped existing entries with escaped content. Add to my day passes the original record reference. |
| Sorting | Title sort toggles both directions. Attempting to sort during a draft preserves the draft and requires save/cancel first. Source wires all six headers. |
| Shared collections | Actual workspace bridge adds exactly once to the canonical collection, preserves shared opportunity/project references, refreshes unfiltered views and leaves Follow-ups free of PBC records. |
| Focus | Actual handler assertions confirm row-save focus returns to the row; comment save/side close return to its Comment button. |
| Initialization | Full application startup passed with the new PBC script loaded; existing tab and health-update smoke checks passed. |

| Severity | Location | Finding | Disposition |
| --- | --- | --- | --- |
| Medium | `pbc-table.js`, standalone comment save | Previous comment text was overwritten while history recorded only “Comment updated”. | Fixed and retested: history retains old/new text, and unchanged text does not add a redundant history entry. |
| Medium | `pbc-table.js`, save / side close handlers | Rerendering or hiding the side editor did not restore a useful keyboard focus target. | Fixed and retested for row save, comment save and side close. |

**Scoped verdict: source and handler checks passed; no unresolved scoped defect found.** Browser-rendered table density, side-panel placement, responsive layout and actual accessibility behaviour remain unverified under the existing file-access restriction. This is not a full requirements or visual PASS.
