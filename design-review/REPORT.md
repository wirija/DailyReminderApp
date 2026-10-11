# Design review implementation report

## 1. Summary

The prototype now reserves complete task durations, keeps time separately for each activity and calculates actual time reports. Project summaries use saved work records instead of fixed completion numbers. Draft guards, agreement revisions and Undo reduce accidental loss during a session. Existing lists have more search/filter controls, and opportunity descriptions and proposal notes can be edited. A shared style layer provides light/dark tokens, stronger contrast, focus styles and responsive fallbacks.

The plain HTML prototype, green identity, global **Add task**, existing screens and two-tier project navigation remain. No dependencies were added. The app is still session-only; it is not ready to hold your only copy of project information.

- **Branch:** `design-review-fixes`.
- **Commits:** 6 total: one baseline, four implementation commits and this final report commit. This folder did not previously have a Git repository.
- **Finding totals:** 4 Fixed, 8 Partially fixed, 6 Needs decision.
- **Independent review:** **PASS for the scoped code/behavior review**, with 14 independent regression checks passing. See `INDEPENDENT-REVIEW.md`; rendered UI/accessibility is not certified.
- **Verification limit:** browser access remains restricted. No screenshots, rendered mobile checks, axe, Lighthouse or assistive-technology certification are claimed.
- **Decisions deferred:** durable storage, shared calendar records, real ingestion, team administration and changes to core action/handover flows.

## 2. Status of every original finding

“Fixed” means the described functional defect has a reproducible passing check. It does not mean the entire application has passed browser or accessibility certification. Visual findings remain partial until rendered checks are available.

| # | Finding | Status | What changed / remaining reason | Files | Verified how |
|---|---|---|---|---|---|
| 1 | Work disappears on reload; no durable storage | **Needs decision** | Session-only disclosures remain explicit. A database, durable attachment storage and recovery/export policy change data handling substantially; these were deliberately not introduced. | `docs/mockup.html`, existing repository/meeting modules | Source inspection confirms no persistence claim. Reload durability is still absent. |
| 2 | Scheduler ignores full duration and drops priority/deadline | **Fixed** | Validates and preserves task fields; reserves rounded-up 15-minute intervals; checks full-span swaps; preserves meeting, pinned and running positions. Unfitted tasks stay unscheduled. | `docs/day-planner.js`, `docs/mockup.html` | Deterministic scheduling tests cover fields, collisions, unequal swaps, priorities, deadlines, overflow and next-quarter placement after the current time. |
| 3 | Shared timer and fabricated dashboard totals | **Fixed** | Separate timestamped sessions per task/meeting, pause/resume/finish, completed history and calculated period totals. Overall time unions overlaps; Singapore normal hours and overtime are calculated across day/period boundaries. | `docs/day-planner.js`, `docs/mockup.html` | Model and actual-handler tests cover isolation, overlap, completion, midnight/week/month boundaries and empty reports. |
| 4 | Stale overview/team signals and unreliable overdue flags | **Partially fixed** | Saved plans, actions, PBC and issues now drive attention signals. Parent warnings are retained while leaf work drives completion counts. Manual health is preserved. Full daily team snapshots and true weekly commitments still need a canonical history model. Labels now say **tracked work**, not weekly delivery. | `docs/project-summary.js`, `docs/project-plan.js`, `docs/mockup.html` | Summary mutation tests, overdue/completed checks and independent parent-task regression. Team history remains explicitly illustrative. |
| 5 | Meeting records do not drive My day’s calendar | **Needs decision** | Existing timeline meetings remain independent. Linking meetings across project/opportunity records, calendar placement and edits changes a core flow and requires conflict/identity rules. | `docs/day-planner.js`, `docs/meeting-workspace.js` | Separation confirmed by source inspection; no live/calendar integration claimed. |
| 6 | Unsaved edits disappear on sort, collapse, row selection or navigation | **Partially fixed** | Shared dirty guards protect plan, action, attendee, decision, agreement, document and PBC edits. Modal close offers Keep editing/Discard. Undo also respects active drafts. Browser-wide navigation, keyboard traversal and every native-dialog path remain unverified; reload protection is not implemented. | `docs/review-ui.js`, editor modules, `docs/mockup.html` | Actual handlers tested for dirty/pristine/reverted forms, local sort/filter/collapse, record return and cross-project Undo. |
| 7 | Decisions do not become follow-ups; agreement evidence is overwritten | **Partially fixed** | Agreement edits require a reason and retain immutable previous values with a timestamp. Unresolved decisions contribute to project attention. Converting a decision into a linked follow-up remains a core-flow decision. | `docs/project-registers.js`, `docs/project-summary.js` | Revision/reason/unchanged-save tests and decision-summary checks. No automated decision-to-action conversion. |
| 8 | Word/Teams intake is non-functional | **Needs decision** | Teams preview now plainly says it has not saved the message or changed records. Real document parsing, screenshot retention, extraction/review and error handling remain unimplemented; no dependency was added. | `docs/mockup.html`, existing meeting module | Source inspection of disabled/illustrative intake. No fabricated ingestion success. |
| 9 | Opportunity details/proposal cannot be edited | **Partially fixed** | Existing opportunity name, client, description and proposal notes can be edited. Client changes are locked after a project is linked to protect that relationship. Proposal document/version management remains a separate workflow decision. | `docs/mockup.html` | Integration checks exercise detail saving and rendering. No proposal upload/version workflow claimed. |
| 10 | No team-member administration | **Needs decision** | Current sample roster remains. A new administration screen and canonical member identities affect ownership across tasks, subtasks, meetings and imports; not added without that decision. | Existing member sources in `docs/mockup.html` | Source inspection confirms no admin portal. |
| 11 | Move silently chooses the first free slot; arbitrary placement is drag-only | **Fixed** | Move opens an exact-time selector, validates the whole interval and supports returning tasks to Unscheduled. Native buttons/selects provide an alternative to dragging. | `docs/day-planner.js` | Actual Move form handlers plus full-interval tests; physical keyboard/screen-reader use remains unverified. |
| 12 | Tablet overflow and missing mobile timeline information | **Partially fixed** | Planner collapses before the sidebar crowds it. Main registers become labelled cards; sorting remains visible; mobile work items retain date/status text. | `docs/design-review.css`, `docs/project-plan.css`, `docs/meeting-workspace.css`, renderers | Responsive source contracts pass. Actual 375/768/1440px layouts and long-content screenshots remain unverified. |
| 13 | Muted text/focus contrast too weak | **Partially fixed** | Shared text, semantic badge, border and focus tokens have passing numerical contrast in both themes. Named dialogs and current-navigation semantics were added. Computed styles across every rendered state remain unverified. | `docs/design-review.css`, `docs/review-ui.js`, `docs/mockup.html` | 21 color pairs per theme checked; all tested normal text ≥4.5:1 and boundaries/focus ≥3:1. No WCAG-conformance claim. |
| 14 | Due dates and next-chase dates are conflated | **Needs decision** | Existing dates and their history were preserved. Adding separate commitment/chase dates and scheduling rules changes the action model and core follow-up flow. | Existing action/PBC modules | Source review confirms the current single-date semantics; unresolved, not silently renamed. |
| 15 | Fragmented visual tokens and no dark mode | **Partially fixed** | Final shared tokens/aliases unify principal surfaces, controls, typography, semantic colors and focus. Light/Dark is available in Connections & preferences. Legacy declarations remain behind the override layer to avoid an unverified wholesale rewrite. | `docs/design-review.css`, `docs/review-ui.js`, `docs/mockup.html` | Token/contrast/style-order checks and theme handler checks. Rendered consistency and theme coverage remain unverified. |
| 16 | Client-creation detour and mandatory planning details at handover | **Needs decision** | Existing client-first and won-to-project flows are retained. Draft safeguards reduce accidental loss, but inline client creation and provisional project dates alter core flows and were skipped. | `docs/mockup.html`, `docs/review-ui.js` | Existing flow source and navigation regression checks; no claimed reduction in steps. |
| 17 | Inadequate contextual search/filter and empty results | **Partially fixed** | Added work search/status/owner filters, meeting search/status/sort, action search/status/owner filters, PBC search/status and agreement search. Main registers explain empty search results. Retains existing issue/document search. Large-volume usability and actual empty/long-content rendering remain unverified. | Project, meeting, PBC and register modules; `docs/mockup.html` | Actual-handler filtering, ancestor retention, no-match and draft-preservation checks. |
| 18 | Removal has no recovery; documents cannot change section | **Fixed** | Undo restores removed documents, meeting attachments and attendees. Move changes document section while retaining the original File, ID and upload date; duplicate destinations are rejected. Undo cannot repaint another project or discard a later draft. | `docs/project-documents.js`, `docs/meeting-workspace.js`, `docs/review-ui.js` | Independent File-identity, metadata, duplicate, cross-project and dirty-draft recovery tests. Recovery remains session-only and one latest removal. |

## 3. Judgment calls

- **Kept the current green design.** The latest task asked to respect the existing design system. Changing the established identity to a different brand palette would add redesign scope; shared tokens now express the existing palette consistently.
- **Kept plain HTML and local modules.** No framework, package manager, backend or new dependency was introduced.
- **Retained the global Add task and two-tier navigation.** Those are explicit preferences from the conversation; no screen was removed or merged.
- **Protected drafts by requiring Save or Cancel before leaving.** This is deliberately simpler than silently persisting partially valid records. Explicit Cancel/Discard still discards.
- **Rounded reservations up, not estimates.** A 20-minute estimate reserves 30 minutes on the 15-minute grid; the original estimate remains visible. The scheduler uses a continuous interval. Automatic splitting/future-day planning remains outside this defect fix.
- **Made overtime an explicit Replan choice.** This adds one decision but preserves control over working outside Monday–Friday 08:45–18:00.
- **Counted leaf work for completion and all levels for warnings.** This avoids counting a parent and its subtasks twice while still exposing blocked/overdue parent responsibilities.
- **Did not pretend illustrative team updates are current.** Completion labels refer to saved work; historical sample text is labelled illustrative.
- **Retained an override layer.** It is safer than deleting legacy CSS without rendered regression tests. Removal of obsolete declarations is deferred.
- **Used code and handler verification honestly.** An inert DOM executes logic but does not reproduce browser layout, native accessibility behavior or assistive technology.

## 4. Needs decision

| Decision | Recommendation | Why it needs agreement |
|---|---|---|
| Durable storage and backups (#1) | Choose the intended host and a small server-backed data/attachment store with backup, restore and export. | Determines deployment, schema, file handling and recovery guarantees. |
| One meeting record shared with My day (#5) | Use a stable meeting identity referenced from minutes and schedule; define rescheduling and conflict behavior. | Changes how users create/edit meetings across contexts. |
| Word and Teams intake (#8) | Complete one intake route with preview, validation and source retention before adding the next. | Requires parser/runtime choices and an explicit AI review boundary. |
| Member directory (#10) | Add the previously requested admin area with stable member IDs, team membership and inactive-member handling. | A new screen plus ownership migration affects many records. |
| Commitment due date versus chase date (#14) | Keep a separate next-follow-up date while preserving the original commitment and revision trail. | Changes scheduling, imports, list columns and accountability semantics. |
| Decision → action and evidence linkage (#7) | Let a user create a follow-up from a decision while keeping a backlink and confirmation state. | Introduces an important core workflow, not merely a visual control. |
| Client creation and provisional handover (#16) | Permit inline client creation with retained opportunity draft; allow provisional planning fields where appropriate. | Changes creation/handover validation and incomplete-record behavior. |
| Proposal documents (#9) | Link proposal versions to the opportunity and later project instead of adding another independent repository. | Requires version, attachment and handover rules. |

## 5. Before and after

These are provisional engineering-informed scores, not fresh visual/usability-study results.

| Dimension | Before | After | Reason |
|---|---:|---:|---|
| UI | 6/10 | **6/10, not visually rerated** | Shared styles and responsive rules improved in source; no rendered check to justify a higher visual score. |
| UX | 4/10 | **6/10, provisional** | Tested scheduling, timing, editing and recovery defects improved; persistence/intake/core workflow gaps remain. |
| Accessibility | 4/10 | **5/10, provisional** | Verified palette contrast and clearer control semantics; keyboard/AT, reflow and whole-page contrast remain unverified. |

| Nielsen heuristic | Before | After | What drove the score |
|---|---:|---:|---|
| Visibility of system status | 2 | 3 | Reports and saved-work attention now reflect records rather than constants. |
| Match with the real world | 3 | 3 | Existing project terminology remains; due/chase ambiguity is unresolved. |
| User control and freedom | 2 | 3 | Exact Move, explicit overtime, draft guards and Undo add control. |
| Consistency and standards | 2 | 3 | Shared tokens and filter patterns improve consistency; legacy styles remain. |
| Error prevention | 2 | 3 | Full-span placement, duplicate checks and draft guards prevent demonstrated errors. |
| Recognition rather than recall | 3 | 3 | Search and visible date/status text help, but shared evidence workflows remain incomplete. |
| Flexibility and efficiency | 2 | 3 | Exact placement and contextual filters reduce hunting; core creation detours remain. |
| Aesthetic and minimalist design | 3 | 3 | No new visual rating without screenshots. Existing information architecture is preserved. |
| Error recognition and recovery | 3 | 3 | Removal Undo and actionable validation improve recovery; reload still loses records. |
| Help and documentation | 3 | 3 | Clearer session-only and mock-processing copy; real intake guidance awaits implementation. |

## 6. Flow comparison

Counts are code-path interaction counts, excluding typing/native file-picker operations, not timed usability observations. Filling a field is not counted as a separate step. A higher count can be justified when it prevents an unintended action.

| Journey | Before → after | Effect |
|---|---|---|
| Add and arrange a personal task, then start | 4 → **5** | Add → Save → Replan → choose normal/overtime → Start. One explicit overtime decision; estimate, deadline and priority now work. |
| Move a task to a chosen time without dragging | Not achievable → **3** | Move → choose time → Move item. Before, Move chose a slot for the user. |
| Start A, pause A, start B | 3 → **3** | Same steps; B no longer inherits A’s timer. Starting B first offers an explicit pause/switch confirmation. |
| New client then new opportunity | 8 → **8** | Preserved pending the inline-create decision. |
| Mark opportunity won and create project | 3 → **3** | Core handover remains unchanged, including required planning fields. |
| Add phase, task and subtask | 6 → **6** | Same create/save sequence; editor changes are guarded and saved warnings refresh. |
| Record a scope decision and separately create follow-up | 5 → **5** | Deliberately not merged without the decision-to-action workflow decision. |
| Add PBC from project overview | 4 → **4** | Same grouped-navigation/create/save path; comments/filters no longer silently discard edits. |
| Upload project document from overview | 3 + file picker → **same** | Added a separate 3-interaction Move route; no repeat upload needed to change section. |
| Review a time period | 2 → **2** | Open Time dashboard → select period; totals now come from recorded sessions. |

## 7. Verification results

### Reproducible command

```sh
/Users/peterwirija/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node design-review/tests/run.cjs
```

The runner checks every local JavaScript file, parses the inline application script, verifies referenced local assets and unique static IDs, then runs each dependency-free behavioral/contrast suite.

| Check | Result / limit |
|---|---|
| JavaScript syntax and local asset integrity | **PASS:** 16 JavaScript files, one inline script, 23 local assets and 132 unique static IDs. |
| Existing build/lint/type configuration | None exists for this standalone HTML prototype. No npm/build/typecheck success is claimed. Syntax, assets and meaningful behavior suites are the available equivalent. |
| Scheduling and time reports | **PASS: 19 checks.** Covers full-duration, field validation, swaps, late-day placement, overflow, timers, periods, Singapore boundaries and overlap union. The UI smoke also checks delayed meeting warnings, focus retention and report markup. |
| Project/editor/PBC/document regressions | Actual handler tests in an inert DOM; includes dirty/pristine/reverted drafts, sorting/filtering, revisions and File-preserving recovery. |
| Integration | **PASS: 7 checks**, loading all 16 local scripts in the actual HTML order. Includes navigation, Add task, opportunity editing, action scheduling, summary escaping and theme changes. |
| Contrast | 56 source/style checks, including 42 palette pair calculations across both themes. |
| Independent review | **PASS: 9 root regression checks + 5 day UI checks.** Separate reviewers reproduced defects and retested their fixes. See `INDEPENDENT-REVIEW.md`. |
| Screenshots, 375/768/1440px light/dark | **Unavailable.** Earlier browser security restriction remains in force. No alternate browser, server or protocol workaround attempted. See `screenshots/README.md`. |
| Axe/Lighthouse, real keyboard, screen reader, 200% zoom, 320px reflow | **Not run.** Inert DOM/source checks cannot certify these. |
| Empty/error/long states | No-match/empty data and validation/duplicate/import-error logic exercised where tests exist. Rendered layouts, slow/offline/session-expiry and extreme-volume performance remain unverified. |

Calculated examples: muted text on a light surface **6.01:1**, light focus **7.04:1**, light control border **3.86:1**; dark equivalents **8.67:1**, **12.34:1**, **5.90:1**. All tested normal-text pairs pass 4.5:1; all tested focus/boundary pairs pass 3:1. These are token calculations, not a whole-page WCAG audit.

Validation was repeated when integrating phases and after independent review findings. Parallel modules were tested as they landed; there were no successful visual verification gates to report.

**Final suite result: PASS.** All eight test suites, source checks and `git diff --check` pass. The final documentation commit changes no production behavior. The same command is repeatable from the repository without installing dependencies.

Implementation history:

- `f1e913f` — baseline and phase plan [#1–18].
- `06090b7` — shared contrast-safe themes and responsive styles [#12, #13, #15].
- `0df9447` — project/meeting draft protection and filters [#4, #6, #12, #17, #18].
- `af9c95a` — interval planning and actual activity timing [#2, #3, #11].
- `ba6989e` — integrated summaries, evidence editing, recovery and regression tests [#4, #6, #7, #9, #15, #17, #18].
- Final commit — report, independent review and screenshot-limit documentation [#1–18].

## 8. New issues found during implementation

Independent reviewers found regressions in the initial implementation; these were corrected and covered with regression checks:

- Document Undo could repaint project A’s repository inside project B. Restoration now preserves record ownership and only rerenders the matching mount.
- New summary text could interpret an editable task name as HTML. Task names are escaped before summary rendering.
- Agreement subsection setup happened after dirty-state capture. Baselines are now taken after fields are populated.
- PBC local filtering/sorting could discard a side comment; blank legacy fields could appear dirty without edits. Both paths now distinguish clean baseline values and protect unsaved comments.
- Undo could discard an unrelated later draft. It now checks the shared draft guard first.
- Returning to the opportunity register bypassed draft protection. The return path now uses the same guard.
- Planner actions removed the focused card, and new report tables bypassed mobile card styles. Focus is now restored and report cells follow the shared table contract; independent checks pass.
- Replan could place afternoon work in the elapsed morning. It now starts at the next current-day 15-minute boundary. Meeting overlap warnings now cover the meeting interval so a delayed/background tick can still show them once.

Remaining limitations are disclosed rather than disguised as completed features: no durable records, independent sample calendar meetings, no real Word/Teams ingestion, no member administration, no separate chase date, no automatic task splitting or explicit future-day planner. Most are existing product gaps from the review/conversation, not newly introduced regressions.

## 9. Strategic proposals — not implemented

| Proposal | What changes and suggested approach | Expected impact | Effort | Main risks |
|---|---|---|---|---|
| Durable canonical records | Define stable IDs and a small persistence layer for clients, opportunities, projects, work, actions, meetings and files; add backup/restore before real use. | Trustworthy data, consistent summaries and recoverable work. | L | Migration, attachment lifecycle and deployment/backup choices. |
| A dependable daily plan | After validating the interval fixes, test a clear fixed-meetings / next-work / won’t-fit presentation and deliberate future-day/split-task controls. | Less decision paralysis, clearer capacity and fewer unrealistic plans. | M–L | Over-automation, excessive prompts and changing established planning habits. |
| Linked commitment trail | Connect decisions, agreements, source minutes, confirmation state, due-date revisions and next-chase date. Start with one meeting-to-action journey. | Easier client follow-up and defensible scope history. | L | Confusing discussion with confirmed agreement; duplicate actions/evidence. |
| Consistent interaction contracts | Specify edit/save/cancel/dirty/undo/focus patterns, then retire superseded CSS after real browser regression checks. | Predictable controls and safer maintenance. | M | Breaking existing keyboard/editor paths during consolidation. |
| Realistic-volume validation | Seed long names, many projects, a busy week and a large PBC list; observe search, scanning and recovery on work-laptop widths. | Reveals density/navigation problems that small sample data hides. | M | Optimizing for fabricated volumes rather than actual use. |
| One complete intake route | Choose Teams text or Word first; retain original source, preview extracted updates, require review and support retry/cancel without data loss. | Cuts manual consolidation while retaining user control. | L | Parsing ambiguity, privacy boundaries, AI mistakes and dependency/runtime choices. |

## 10. Recommended next steps

1. Enable a real browser QA pass: the full viewport/theme matrix, native keyboard paths, focus after actions, long content, 200% zoom, screen reader and axe.
2. Decide persistence/backup and deployment before putting unique client records into the prototype.
3. Validate a realistic working day: unexpected client meeting, delayed task, overtime decision and end-of-week review. Measure failed placements, abandoned arrangements and timing mistakes, not just clicks.
4. Test one PBC follow-up with a changed deadline and one disputed agreement. Check whether Peter can find the original statement and distinguish a commitment from a chase date without help.
5. Decide the shared meeting/action/roster model, then complete one intake route end to end.
6. Once rendered QA passes, remove obsolete style declarations and reassess UI/accessibility scores from evidence.
