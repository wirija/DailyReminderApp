# Independent review — agreed-item names

Scope: separate item names from discussion/comments in the grouped Agreed items view.

| Requirement / behavior | Result | Evidence |
| --- | --- | --- |
| Item name is distinct from discussion/comment | Pass | `docs/project-registers.js:25,47–53` renders and edits separate `name` and retained `description` fields. Independent handler test creates a named item with separate discussion under the selected subsection. |
| Required name; blank and whitespace-only values refused | Pass | Production save handler trims the name and rejects missing text. Tests verify no new record or legacy mutation on invalid submissions. |
| Create, edit and cancel preserve expected data | Pass | Test saves a trimmed name, verifies description unchanged, then cancels changes to both fields and checks the entire record remains unchanged. |
| Legacy descriptions are preserved | Pass | An existing nameless agreement displays Unnamed item with its full original multiline description. Its stored name remains absent until explicitly supplied; the editor does not invent a name. |
| Name and discussion sorting keep the hierarchy | Pass | Item-name A–Z and discussion A–Z tests verify ordering within the group, exact record counts and unchanged parent membership. |
| Grouped-reading/editing regression | Pass | Reran independent nesting, counts, contextual creation, editor-anchor position, collapse, move, rename, focus and draft-guard assertions, with new required names supplied when creating records. |
| Typography and responsive layout | Source reviewed | `docs/project-registers.css` uses the existing text token for the item name and places the combined name/discussion wrapper across the mobile grid. Browser rendering is not certified. |

| Severity | Location | Problem | Exact fix |
| --- | --- | --- | --- |
| — | Reviewed scope | No unresolved Critical, High or Medium findings. | None required. |

Evidence: `/tmp/reviewer-agreed-names.js` runs the actual production handlers in an inert DOM adapter. The reviewer did not edit production code. Existing browser restrictions were respected; visual/pixel and real-browser accessibility verification remain unavailable. Records remain session-only.

Verdict: **PASS for this scoped source/logic review.**
