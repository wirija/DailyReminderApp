# Independent implementation review

Reviewer: separate agent from the implementer of the JavaScript changes below.

## Scope and limits

Reviewed the current source and executable behavior of `docs/review-ui.js`, `docs/project-summary.js`, `docs/project-registers.js`, `docs/project-documents.js`, `docs/pbc-table.js`, their `docs/mockup.html` integration, and the new daily planner's UI integration. Reviewed the document action-column CSS contract. This is a focused regression review of the fixes in `PLAN.md`, not certification that every requested product capability is implemented.

No browser, server, screenshot, CDP, axe, screen-reader or rendered viewport check was used. The earlier browser security restriction remains in force. Tests use dependency-free, inert DOM objects and actual production event handlers, plus pure functions. They establish behavior and source contracts; they cannot establish visual fit, browser focus fidelity, accessibility conformance or responsive rendering. The reviewer previously contributed shared CSS, so the CSS observations are explicitly not an independent visual-design approval.

## Findings and remediation

| ID | Severity | Location | Problem found | Exact remedy and current evidence | Status |
|---|---|---|---|---|---|
| R1 | High | `docs/project-documents.js:11,44` | Undoing a removal from project A after opening B rendered A's documents into B's shared mount. | Bind the mount to its project identity and rerender only if that identity still matches. Independent test removes A, opens B, undoes A, and checks both model and visible markup isolation. | Fixed; behavioral test passes |
| R2 | High | `docs/mockup.html:65–67` | The new live summaries made task names user-controlled, but some team-work labels were interpolated as HTML. | Escape `p.sgWork`, `p.hnWork` and mapped `work` at every HTML interpolation. Inspected the live portfolio and project detail render paths. | Fixed; source inspected |
| R3 | High | `docs/project-summary.js:5–13` | A blocked or overdue parent task disappeared from attention signals when it had subtasks. | Use leaves for completion counts and all phases/tasks/subtasks for attention. Independent test includes a blocked, overdue parent with a future child. | Fixed; behavioral test passes |
| R4 | High | `docs/review-ui.js:12` | Undo could replace the current document view while a later section-edit draft was dirty, silently discarding it. | Check `DraftGuard.canLeave()` before consuming the Undo action. The pending Undo must remain available after Save/Cancel. Independent test verifies draft retention and a successful later restore. | Fixed; behavioral test passes |
| R5 | High | `docs/mockup.html:184,199` | Back to opportunities bypassed the shared draft guard, allowing an unsaved next-action form to be hidden and subsequently replaced. | Guard `showOpportunityRegister()` at entry, including its direct Back button path. The independent test executes the extracted production function with a dirty guard and verifies that it changes neither the view nor the rendered register. | Fixed; behavioral test passes |
| R6 | Medium | `docs/project-registers.js:39,55–59` | An existing agreement with a subsection was considered dirty immediately upon opening. The baseline was captured before dependent options were populated. | Capture the form baseline after populating the section/subsection controls. Independent test opens an untouched existing item and checks `DraftGuard.isDirty() === false`. | Fixed; behavioral test passes |
| R7 | Medium | `docs/pbc-table.js:19–20,38–39,54–57,72` | Search and sorting silently discarded a typed side-panel comment even though global navigation was guarded. | Include comment dirtiness in local navigation checks and provide explicit Cancel comment. Independent search and sorting scenarios retain the typed text. | Fixed; behavioral tests pass |
| R8 | Medium | `docs/project-registers.css:39`; `docs/design-review.css` | The 14% action column had been sized for one button; adding Move beside Remove created a clipping risk under nowrap/hidden overflow. | Reserve a shared 176px action-column token above the mobile breakpoint; retain labelled mobile cards. Source contract is fixed; actual rendered fit remains unverified. | Fixed in source; visual verification outstanding |
| R9 | Medium | `docs/day-planner.js:146–171,185–187` | Start, Pause and Move recreated the focused card without restoring keyboard focus to the replacement. | Restore a connected control by item identity and action after rendering, with a safe fallback when the item disappears. Independent Start, Pause and Move regressions now all pass. | Fixed; behavioral tests pass |
| R10 | Medium | `docs/day-planner.js:206–212` | The newly generated Recorded activity table bypassed the shared responsive table/card styles and omitted mobile field labels. | Use the shared register-table component contract and populate `data-label` on all four cells. The independent test verifies those generated markup contracts. | Fixed in source; contract test passes; rendered layout unverified |

## Positive checks

- Moving a document retains its original File object, upload timestamp and metadata while changing only its destination section.
- Agreement edits require a change reason and retain the full prior agreed-item snapshot rather than overwriting history.
- PBC requests commit on Save; comment drafts are protected separately from row drafts.
- Project summary counts and attention are derived from saved session records. Manual project health is kept distinct from calculated attention.
- Daily planner forms retain deadline, priority, project and estimate. Its Move dialog provides a non-drag input path.
- Generated daily report activity and project names are HTML escaped.
- The prototype's session-only nature and lack of live AI/connectors are disclosed; this review does not interpret sample records as durable data.

## Verification

`design-review/tests/independent-root-review.cjs`: **9 passed, 0 failed**. Independent assertions exercise production functions and event handlers. The file reuses only an inert element parser from the builder's test helper.

`design-review/tests/independent-day-ui.cjs`: **5 passed, 0 failed**. Independent scenarios cover Start/Pause/Move focus retention, responsive report markup and escaping. The file reuses only a non-rendering element parser.

Separate algorithm review of scheduling intervals and reports is owned by the project-flow reviewer; this review deliberately focuses on integration and interaction regressions rather than repeating the same assertions.

## Verdict

**Scoped code-behavior verdict: PASS — 14 independent regression checks pass, and the reported High/Medium code defects have been corrected.**

**Rendered UI/accessibility QA: NOT VERIFIED.** There is no unconditional full-product or WCAG verdict. Actual layouts at 1440px, 768px and 375px, dark-mode rendering, browser focus behavior and assistive-technology behavior still require browser validation.
