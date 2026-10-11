# Design review implementation plan

No navigation restructuring, new dependency, or feature removal. Keep the plain HTML prototype, green palette, global Add task, existing section boundaries and two-tier navigation. All original findings are numbered as in the review.

## Phase 1 — critical/high, accessibility first
- #11–13: exact-time keyboard move, readable/focused shared controls, responsive information retention. Touch `docs/mockup.html`, new shared review CSS/JS, existing component CSS.
- #2–3: preserve task fields, interval-based planning, per-task sessions and computed time totals within existing controls. Touch a dedicated daily-planner module plus integration. No new calendar route or automatic scheduling policy.
- #4: reconcile available local project counts/overdue signals; mark legacy information honestly. Touch project plan hooks and main rendering.
- #6: retain/guard local drafts across editing/sorting/navigation. Touch project-plan.js, meeting-workspace.js and shared UI integration.
- #7: retain agreed-item revisions; unresolved-decision to action workflow requires a new core flow and is Needs decision.
- #1, #5, #8, #10: durable backend/shared calendar, Word/Teams ingestion and team administration overlap Phase 5 or introduce core flows. Needs decision; improve existing prototype disclosure only.
- #9: basic opportunity detail editing can follow existing client editing patterns; proposal document workflow is Needs decision.
- #14: separate chase-date semantics changes the action model and core flow. Needs decision; do not repurpose current due dates.

## Phase 2 — quick wins
Shared contrast/focus, tablet breakpoint, mobile date/status fallback, useful empty search results, current navigation semantics, named dialogs, touch targets and mobile sort access. Files: shared CSS/JS, main markup, component renderers.

## Phase 3 — medium
- #15: consolidate shared tokens and add theme via existing preferences without a dependency; verify declared colors. If rendered validation stays unavailable, report visual status as partial.
- #16: keep client-first/direct-project/won flow. Draft retention is in scope; inline client creation and unknown planning dates are Needs decision.
- #17: add contextual filtering to existing lists where practical using shared patterns; preserve current sort/row behavior.
- #18: undo removal and move existing document to another section, preserving identity; no destructive file deletion.

## Phase 4 — polish
Consistent helper text, Save/Cancel labels, input/error semantics and reduced-motion behavior. No unrelated refactor.

## Phase 5 — proposals only
Durable canonical records, trustworthy day guidance, linked commitment trail, standard interaction rules, realistic-volume usability work, complete intake route. Document impact/effort/risks, do not implement these architectural proposals.

## Dependencies and verification
- Local task/session corrections are explicit defect fixes (#2–3), not a new core flow. The app remains session-only; never claim durable records.
- CSS source improvements cannot be fully visually certified. Prior browser security restriction remains in effect; do not use alternate browser, server or CDP workarounds.
- No package/build/lint suite exists. Use Node syntax checks, HTML/asset checks, numerical contrast, existing inert-DOM regressions, and new meaningful behavior tests. Add a reproducible dependency-free test runner.
- Parallel ownership: shared CSS/UI foundations; project/meeting JS; daily planner; root integration/documents/review/report. Integrate sequentially, then independent QA.
- Commit baseline, then small logical finding-referenced chunks. Never include unrelated download_hls.py or generated personal outputs.
