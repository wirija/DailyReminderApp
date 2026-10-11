# Independent review: separate Follow-ups and PBC tabs

Scope: the latest project-tab separation and filtered shared-action rendering. This is a scoped review, not the outstanding full redesign audit.

| Check | Evidence / result |
| --- | --- |
| Tab wiring | Actual full-script handlers select Follow-ups or PBC independently, set the correct panel visibility and update `aria-selected`. |
| Separation | Actual module render assertions: Follow-ups contains Action and Clarification records; PBC contains only PBC records. The default unfiltered view still contains both. |
| Counts | Open/completed totals are calculated from each filtered subset, including after saves. |
| Creation / cancel | PBC creates with PBC selected; Follow-ups creates with Action selected. Saves update the appropriate list and the unfiltered mount. Cancel leaves the action collection unchanged. |
| Reclassification | Actual editor submissions move an Action into PBC and a PBC into Clarification; both mounts refresh immediately, with correct counts and retained change history. |
| Sorting | Ascending/descending title sort retains the PBC filter and exposes the current `aria-sort`. |
| Shared source | Source retains a single action collection. Mounts referencing that collection refresh together, with each mount's own filter. Meeting and opportunity calls omit the filter and remain comprehensive. |
| Initialization | Actual meeting, plan and client-picker scripts plus the full inline application script initialized under inert Node mocks. |
| Related health change | Actual `detail-health.onchange` smoke check confirmed the active Client portal project's updated health appears in both the register and portfolio. |

No unresolved defect found in these source/handler checks. Classification is based on the explicit Type field: Clarification currently belongs to Follow-ups. The review does not infer a broader future PBC workflow.

**Scoped verdict: source and handler checks passed.** Browser-rendered layout and real keyboard/focus behaviour remain unverified under the existing file-access restriction; no bypass was attempted. Full client-picker interaction review and full redesign verification are outside this scoped report.
