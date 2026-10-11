# Independent review: project timeline row layout

Scope: the latest single-line timeline markup and typography correction in `project-plan.js` and `project-plan.css`. This is not a full redesign audit.

| Check | Evidence / result |
| --- | --- |
| Single-line aligned rows | Source uses the same three-column grid for headings and labels; fixed 48px row height, no wrapping for names, owners or Add buttons. Type badges and the stacked owner line were removed. |
| Typography | Explicit 13px item/owner text and 12px captions match the current register styling. This does not certify the separate pending design-system requirements. |
| Long text / warnings | Names and owners use ellipsis and title attributes. Names remain native edit buttons. Date warnings have inline icons with accessible labels and explanatory titles. |
| Narrow layout | Source retains the three inline columns with narrower owner/action widths and hides date tracks at 768px. Dates remain accessible in the item editor; a title tooltip alone should not be treated as a mobile interaction. |
| Hierarchy controls | Actual-source inert Node tests still pass create/edit, correct parent binding, cancellation, independent ownership, date reasons/history, synchronization, sorting and Enter/Space editing. |
| Initialization | Actual full inline script initialized with both external modules; initial opportunity, portfolio, project and client renders completed. Syntax check passed. |

| Severity | Location | Finding | Suggested fix |
| --- | --- | --- | --- |
| Low — resolved | `project-plan.js`, milestone rows / column headings | Milestone dates occupied the column labelled Owner. | Verified final source: date now sits inline beside the milestone name in Work item; Owner displays an em dash. `.pp-milestone-date` prevents date wrapping. |

**Scoped result:** no functional regression found in source and handler checks; the minor heading-clarity finding is resolved. Browser rendering, responsive screenshots and visual typography were not verified because the existing browser file-access restriction remains applicable; no workaround was attempted.
