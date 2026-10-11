# Independent interim review: opportunity stages and Won handover

Scope: stage/follow-up changes, Won conversion into a project, retained opportunity context, and direct project creation regression. The browser denied local-page access; no alternate surface or server was used. Evidence consists of source inspection and independent non-browser handler tests. This is not the full redesign review.

| Check | Evidence in `docs/mockup.html` | Result |
|---|---|---|
| Stage and follow-up changes | Lines 167–181: selected record captured, action/date validation, date/time change reason, timestamped stage history, prior action/follow-up preservation. | Source + handler tests |
| Won does not save early | Lines 109–136, 173: opening setup only prefills fields; invalid submission leaves stage and record count unchanged. | Handler tests |
| Successful Won conversion | Lines 128–135: linked project reference, Won stage/history, original client selection retained, existing personal follow-up relinked. | Source + handler tests |
| Duplicate conversion prevented | Lines 111, 129: existing linked project opens instead of creating another. | Handler tests |
| Direct project creation retained | `newProject()` without source still creates an independent project. | Handler test |
| Historical context visible from project | Lines 163–164: summary, proposal, follow-up, meetings, notes and stage history read through the stored source opportunity ID; strings escaped. | Source checked |
| New follow-up after conversion | Line 153 chooses linked project name when one exists. | Handler test |
| Syntax | Complete inline script passed bundled Node `--check`. | Checked |

Independent tests extracted actual handlers into a plain-node harness with mocked field objects. Cases covered: changed-date reason rejection, history recording, opening/cancelling setup without mutation, invalid project dates, successful conversion, original-client association, existing-task relinking, repeated conversion, direct creation, previous-text preservation, and new post-conversion follow-up association.

## Findings and recheck

| Severity | Location | Problem | Exact fix / disposition |
|---|---|---|---|
| Medium, resolved | Stage save and `stageHistoryMarkup` | Changing stage overwrote the original next action and detailed follow-up without retaining those strings. | Builder stores and renders `previousAction` and `previousFollowup`. Independently checked with an original detailed follow-up string. |
| Medium, resolved | `opptask` handler | Follow-ups created after handover still used an opportunity-only label instead of the converted project. | Builder uses `o.projectName` when present. Independently checked after conversion. |

Scoped verdict: no unresolved actionable issue found in the reviewed source/handler paths. Browser appearance and real user interaction remain unverified. Full requirements compliance, live integrations, persistence and the pending full redesign are outside this verdict; no overall PASS is asserted.
