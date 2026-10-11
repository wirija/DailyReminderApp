# Independent review — populated PBC and issue workbook upserts

Scope: the latest populated-template download/update-import workflow for PBC and issues, shared XLSX codec, and issue side drawer. This is an independent source/logic review, not the pending full-app visual redesign review.

## Requirements and evidence

| Requirement / check | Result | Evidence |
| --- | --- | --- |
| PBC download contains the current saved list and IDs | Pass | `docs/pbc-table.js:57` exports canonical `owner.actionItems` filtered to PBC; shared production XLSX download/read round-trip retains values and IDs. |
| PBC upload updates matching IDs, adds blank-ID rows and retains omitted records | Pass | `docs/pbc-exchange.js`, plan/apply; regression tests verify identity, unchanged detection, additions, duplicate/cross-project rejection, history and preview cancellation. |
| Issue workbook includes all current issues, independent of screen filters | Pass | `docs/issue-exchange.js`, download(project) passes the full `issueRecords`; `docs/issue-import.js` passes the project rather than filtered table rows. Independent download handler test captures all three records, including a Closed item. |
| Issue upsert preserves matching identity and assigns new IDs | Pass | Production XLSX round-trip and independent UI event tests update ISS-001 without replacing its object, create ISS-003 while retaining omitted ISS-002, and preserve all fields. |
| Protect against per-project ISS-001 collisions | Pass | Populated workbooks include the project reference in M12. Independent actual-XLSX test imports PRJ-A workbook into PRJ-B with its own ISS-001 and proves atomic rejection. Existing IDs without metadata are also rejected. |
| Reject unknown/duplicate IDs and invalid workbook data | Pass | Actual XLSX checks cover unknown issue IDs, duplicate IDs, wrong project, missing metadata, formulas, invalid calendar dates, invalid status/severity, absent raised date, and due-before-raised. Mixed valid/invalid batches make no changes. |
| Allow blank-template additions | Pass | Blank XLSX accepts new rows with blank IDs; defaults Medium/Open and assigns sequential IDs. Repeated blank-ID fingerprints are rejected. |
| Preview all fields before mutation, with cancel | Pass | `docs/issue-import.js` presents every field and differences. Independent handlers verify preview leaves records unchanged, Cancel restores focus, and existing editor guard blocks exchange. |
| Date changes retain reasons and before/after history | Pass | Issue due and raised date updates require a reason in the import flow. Tests verify old/new values, filename/row and reason in history. |
| Download/upload loading and failure paths | Pass, source/DOM | Buttons disabled during async work; 5MB/.xlsx validation; reading status; empty/error feedback; invalid preview disables commit. Apply also validates, independent of button disabling. |
| Issue editing opens in a side drawer | Pass, source/DOM | Native `dialog.pr-issue-drawer` uses showModal with accessible heading, Escape/Close/Cancel and focus restoration. Tests cover opening, editing, saving, cancellation and cleanup on rerender. CSS defines right-side desktop drawer, full-width mobile and reduced motion. |
| Existing project/meeting/PBC functionality retained | Pass | Re-ran PBC inline/comment/import tests and actual full-inline-app initialization tests, including sample portfolio blockers, project tabs and health updates. Agreement CRUD and issue CRUD/filtering remain covered. |

## Findings

| Severity | Location | Problem | Exact fix |
| --- | --- | --- | --- |
| — | Reviewed scope | No unresolved Critical, High or Medium findings identified. | None required. |

Independent extensions written and run: `/tmp/reviewer-issue-import-ui.js` (production event handlers and plan/apply with inert file/download adapters), `/tmp/pbc-build/reviewer-issue-xlsx.cjs` (actual XLSX and production codec). Regression suites rerun: `/tmp/pbc-build/reviewer-test.cjs`, `/tmp/review-pbc-exchange-ui-import.js`, `/tmp/review-drawer-current.js`, `/tmp/review-upsert-init.js`. The reviewer did not edit production code.

The explicit browser access restriction was respected. No browser or alternate protocol/server workaround was attempted. Inert DOM/XML tests do not certify pixel layout, native file-picker/download behavior, real focus trapping, responsive appearance or contrast. Data remains session-only; loading the page afresh resets records, so a prior-session populated workbook cannot recreate missing IDs through update import.

Final free-text preservation recheck: `/tmp/pbc-build/reviewer-whitespace.cjs` independently exports and reads actual XLSX files containing leading/trailing spaces, multiple newlines, tabs and whitespace-only free text. PBC Comment and issue Description/Notes/Resolution remain byte-for-byte equal; both plans return Unchanged and create no spurious history. The inert XML adapter was configured to retain whitespace-only text nodes, matching browser XML DOM behavior. Check passed after the final codec change.

Verdict: **PASS for this scoped source/logic review.** No unresolved findings. Full visual/browser QA remains unverified.
