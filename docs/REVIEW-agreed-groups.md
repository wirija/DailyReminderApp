# Independent review — grouped Agreed items

Scope: the latest requested change integrates sections/subsections with the agreements being read, replacing the detached organisation controls and flat table. The review covers grouped reading, contextual editing and regressions in the shared project-register module.

## Requirements and verification

| Requirement / behavior | Result | Evidence |
| --- | --- | --- |
| Read agreements directly within their section and subsection | Pass | `docs/project-registers.js`, renderAgreements/group/itemList. Independent structural DOM test seeds six agreements across two sections and two subsections and verifies each appears exactly once under its correct heading. |
| Full agreed description and date/client-contact metadata | Pass, source/DOM | Agreement articles display full escaped prose with preserved line breaks, a time element and contact. CSS uses pre-wrap rather than truncation; metadata appears side by side on desktop and wraps on narrow screens. |
| Correct section and subsection counts | Pass | Tests verify parent count includes direct plus child agreements, child count includes its own agreements, and total displayed items equals stored count after additions/moves. |
| Collapse sections/subsections without losing records | Pass | Toggle changes hidden state and aria-expanded; agreements remain stored. Saving an item opens its target section/subsection and focuses its Edit button. |
| Contextual Add item / Add subsection / Rename | Pass | Actual delegated handlers preselect section/subsection, save to that group, and rename without breaking existing item membership. |
| Editors immediately below the relevant heading or item | Pass | Tests assert the editor is the immediate sibling of the related group heading for contextual add/rename and of the agreement article for edit. Only one editor exists. |
| Move an agreement between groups | Pass | Editing a subsection agreement and changing to another section resets the subsection, saves into that section, opens it and renders the item once. |
| Sort items while retaining hierarchy | Pass | Description sort changes order within the seeded child group while preserving membership and other section placement. |
| Draft guards and cancellation | Pass | Collapse and sort during editing are blocked; sort selection is restored. Cancel retains the original data and returns focus to the invoking Edit button. |
| Retain issue drawer and workbook flows | Pass | Independently reran issue create/edit/cancel, due validation/history, search/status filters, drawer open/Escape/Close/focus/cleanup, and Excel preview/cancel/upsert/export guards. |
| Keep app initialization and project routing working | Pass | Actual inline-app initialization harness rerun: project tabs, health refresh and all sample projects initialize; legacy portfolio blockers remain unchanged. |

## Findings

| Severity | Location | Problem | Exact fix |
| --- | --- | --- | --- |
| — | Reviewed scope | No unresolved Critical, High or Medium findings identified. | None required. |

Independent new test: `/tmp/reviewer-agreed-groups.js`, created from source inspection and the inert DOM adapter, exercises the actual production handlers with direct-section and subsection records. Regression checks: `/tmp/review-drawer-current.js`, `/tmp/reviewer-issue-import-ui.js`, `/tmp/review-upsert-init.js`. The reviewer did not edit production code.

The earlier explicit browser restriction was respected. No browser/server/protocol workaround was used. Source and inert DOM tests cannot certify the visual polish, pixel spacing, real focus rendering or responsive appearance; those remain unverified. Records remain session-only.

Verdict: **PASS for this scoped source/logic review.** No unresolved findings; this is not a full-app visual QA verdict.
