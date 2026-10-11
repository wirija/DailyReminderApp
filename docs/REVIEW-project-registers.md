# Independent review — Agreed items and Issue tracker

Scope: the two newly requested project tabs. The user requested offline agreed items organised into sections/subsections with date, client contact and description, plus a proposed issue tracker. This review covers those additions and their integration/regression risk, not the pending whole-app redesign.

## Requirements and checks

| Requirement / check | Result | Evidence |
| --- | --- | --- |
| Separate Agreed items and Issue tracker project tabs | Pass | `docs/mockup.html:21,26,97`; integrated app initialization and tab-selection handlers verify correct panel visibility. |
| Create sections and subsections for offline agreements | Pass | `docs/project-registers.js`, renderAgreements/editSection; independent inert DOM tests create Functionality → Screen 1 and rename the parent while retaining the existing agreement link. |
| Record agreed date, client contact and description | Pass | editAgreement; create and edit forms enforce values, keep selected section/subsection and expose them in the list. Cancel leaves the saved record unchanged. |
| Project-specific records | Pass | Production renderProjectRegisters tested with two project objects and revisit; agreements and issues remain independent. |
| Issue tracker design supports entry and follow-through | Pass | editIssue/renderIssues; issue ID/title, severity, status, owners, raised/due dates, description, notes, resolution and history are editable. Rows open details and headers sort. |
| Validate deadlines and retain accountability | Pass | Inert delegated handlers reject due-before-raised, require a reason on a changed existing deadline, save old/new values and reason, and retain resolution/status. |
| Search/filter issues; protect active drafts | Pass | Search by owner and unmatched text and Open/all status filters tested; active agreement editor blocks unrelated actions until save/cancel. |
| Compact table and accessible controls | Pass, source/DOM | `docs/project-registers.css` uses desktop nowrap/ellipsis, labelled forms, row hover, header buttons, focus-visible rules and mobile card rules. Native row Enter/Space handler present. Rendering is not visually certified. |
| Retain portfolio blocker data and existing project tabs | Pass after fix | Independent test begins with legacy `issues: string[]`, creates/edits issue records, and verifies original blocker strings remain identical. Actual app sample-project render test confirms no undefined issue rows or [object Object] portfolio output. Existing Follow-ups/PBC tabs and health update render checks pass. |

## Finding and verified correction

| Severity | Location | Problem | Exact fix / final status |
| --- | --- | --- | --- |
| High | `docs/project-registers.js:5,7` and `docs/mockup.html:56–64,143` | The new issue tracker reused `project.issues`, which already stores portfolio blocker strings. Existing sample projects rendered undefined issue fields, and new issue objects would corrupt portfolio text. | Store new structured issues in `project.issueRecords`. Builder applied this separation. Re-ran independent CRUD with legacy blocker strings and actual full-inline-app tests for all sample projects; strings preserved, no undefined rows and no [object Object] output. Resolved. |

Evidence: independent `/tmp/review-project-registers-integration.js` exercises create/edit/cancel, hierarchy, required values, issue dates/history, filtering, project isolation and legacy-data regression. `/tmp/review-integrated-registers.js` was independently inspected and rerun against the actual inline app and all sample records. No production source was edited by the reviewer.

The earlier explicit browser access restriction remains in force. Tests use inert Node DOM adapters, not a browser; no alternate browser/server/protocol workaround was attempted. Real pixel layout at 1440/768/375, contrast and keyboard rendering still need browser verification. Records are session-only. The issue register is separate from the sample portfolio blocker summaries; no live board import is claimed.

Verdict: **PASS for this scoped source/logic review.** No unresolved Critical, High or Medium findings. This is not a full-app visual QA verdict.
