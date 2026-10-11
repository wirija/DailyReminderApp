# Independent interim review: opportunity detail design

Scope: redesigned opportunity detail in `docs/mockup.html` and `docs/opportunity-detail.css`. The browser previously denied local-file access; no alternate browser or server was used. This review cannot establish a visual PASS or actual viewport measurements. It checks source, CSS cascade, contrast calculations and independently extracted rendering handlers.

| Check | Evidence | Result |
|---|---|---|
| Existing controls preserved | All required static IDs exist once: Change stage, conversion, meetings, notes, global Add task and Back. Existing event bindings still target them. | Source checked |
| Current stage is truthful | `renderOpportunityProgress` gives `aria-current="step"` only to current stage. No completed-step styling or inferred completion is emitted. | Handler tested |
| Counts and empty content | Real meetings, notes and history lengths populate counts; missing meetings/notes show empty explanations. | Handler tested |
| Theme scope and navigation | `showOpportunity` adds `opportunity-detail`; `view` and `showOpportunityRegister` remove it. Details and dialogs use scoped colors; other screens return to their existing styles. | Source checked |
| Stylesheet loading/cascade | Relative stylesheet path exists. It loads before inline CSS; scoped selectors have sufficient specificity for detail typography, buttons, dialogs, page header and sidebar. Shared names remain unchanged. | Source checked |
| 1440px layout intent | Two-column workspace and seven-stage track; zero-minimum content tracks, bounded controls, wrapping text. | CSS inspection only |
| 768px layout intent | 980px breakpoint produces one-column workspace and three-column stage track. Sidebar remains at the original width until its 750px breakpoint. | CSS inspection only |
| 375px layout intent | Original sidebar wraps above content; 500px rules reduce padding and use two-column stage track; cards and controls shrink/wrap. | CSS inspection only |
| Focus and keyboard | Existing register/detail navigation and form handlers preserved; scoped visible focus applies to interactive elements. Native history disclosure remains keyboard operable. | Source checked |
| Syntax and structure | Full JavaScript parses with bundled Node; no duplicate static IDs. | Checked |

## Findings and recheck

| Severity | Location | Problem | Exact fix / disposition |
|---|---|---|---|
| Medium, resolved | Opportunity-detail dialog validation errors | Existing dark red `#9b4136` on dark surface `#182231` had 2.44:1 contrast. | Builder added `--opp-danger`, with dark value `#ffb4a9`, and scoped error styling. Recalculated ratio is 9.42:1; selectors rechecked. |

Independent plain-node rendering tests verified current-stage-only marking, nonfabricated completion, record counts and empty displays. No unresolved actionable issue identified in the examined code/CSS. Layout appearance and real browser interaction at all three widths remain unverified. The pending full redesign and requirements review are outside this scoped result.
