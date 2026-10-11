# Daily Project Planner — requirements audit

**Current stage:** The Django application build is underway and the existing PWA now has a persistent server mode. See `README.md`, `DEPLOYMENT.md` and `BUILD-STATUS.md` for current implementation and verification. The table below is the **historical Step 1 baseline**, followed by incremental changes; its original statuses are not a certification of the new application.

**Audit basis:** Full conversation, including browser annotations and the latest six-step instruction; all markup, CSS and JavaScript in `docs/mockup.html` and `docs/requirements.html`. These are the only current mockup/document files. `download_hls.py` is unrelated and is not part of the mockup.

**Status meaning:** **Met** = present in the current source for the stated behaviour; **Partly met** = incomplete behaviour or display-only example; **Missing** = absent; **Wrong** = behaviour contradicts the requirement. These are baseline source/supplied-screenshot findings, not a new runtime certification. The old HTML requirements document describes intentions; its prose does not establish that the app implements them. Negative requirements are marked Met where the prohibited behaviour is absent.

**Scope caveat:** The requested deliverable is a redesigned mockup, while the interview includes production integrations, document ingestion, hosting and durable records. Those requirements are retained, not silently waived. Decision A below must establish what counts as implemented versus explicitly simulated before any final “Met” claims.

Quotes below are verbatim excerpts from user messages, each fewer than 15 words. “yes”, “sure” and similar quotes refer to the immediately preceding proposal accepted in the conversation. Inferred acceptance criteria are labelled **Implicit**.

## Numbered requirements table

| ID | Requirement | Source (quote my words, under 15 words) | Status in current mockup: Met / Partly met / Missing / Wrong |
|---|---|---|---|
| R001 | Deliver an interactive HTML application mockup, not just an HTML requirements document. Working name: Daily Project Planner, accepted by the user. | “nono i mean HTML mock up”; “ok” | Met — `docs/mockup.html` is the app preview. |
| R002 | Personal workspace for a manager coordinating several projects and communicating with clients; support a quick next-action decision. | “i am just assigned to multiple projects at the same time” | Partly met — screens exist; many workflows remain static. |
| R003 | Reduce decision paralysis through a visible suggested day and understandable progress. **Implicit:** clear language, low interruption, easy scanning. | “sometime i get decision paralysis” | Partly met — timeline exists but does not reflect real time or task duration. |
| R004 | Daily planner and project meetings/follow-ups must ship together, connected from the start. | “I need them together from the start” | Partly met — sections coexist but most project actions cannot feed the planner. |
| R005 | Primary use on a work computer; support installable PWA use. | “work computer. Can this be a progressive web app?” | Met in source/behavior checks — manifest, icons, optional install prompt, offline shell and localhost/HTTPS launcher. Actual browser installation remains unverified; records remain session-only. See `PWA.md`. |
| R006 | Self-hostable on a MacBook or company server; Dell DG10 is a possibility, not a decided target. | “I might host it on the company's dell DG10” | Partly met — static file portable; no app server/deployment configuration. |
| R007 | One user only; team members do not need accounts or direct data entry. | “No. Only me” | Met — single-user preview. |
| R008 | No Outlook/calendar integration; enter meetings manually. | “this app will not be conencted to my otulook or cal” | Partly met — no integration; new-meeting form cannot save. |
| R009 | No automatic sending of email/documents or follow-up actions; user reviews and sends externally. | “ultimately up to the sender to send the documents” | Met — no sending or external actions. |
| R010 | Quiet in-app reminders; no sounds or desktop notifications. The requested overlap popup is allowed. | “no sounds etc etc. Just serve it” | Met — no sound/notification APIs. |
| R011 | Show today's calls, client meetings and personal to-dos, plus what is coming this week. | “what are the call or client meeting i have today” | Partly met — static sample day; no date/week navigation or weekly agenda. |
| R012 | My day is the start screen with a suggested day already arranged. | “that will be wonderful” | Partly met — hard-coded blocks instead of a generated daily plan. |
| R013 | My day has Schedule and Projects tabs; projects are no longer below the timeline. | “Actually put projects as another tab within your day” | Met — both tabs exist. |
| R014 | Schedule layout: collapsible timeline on the left; unscheduled task card on its right. | “Put timeline as 1 collapsible section. On its right” | Met — desktop layout present. |
| R015 | Current task appears at the top of the right-hand card. | “Current taks should move to the top” | Met — timer section precedes backlog. |
| R016 | Replace “To arrange” with an understandable label and purpose; current accepted label is “Unscheduled tasks”. | “can you rename to arrange? what is this card supposed to do” | Met — new label and instructions exist. |
| R017 | Unscheduled tasks can be placed into the timeline or included in suggested scheduling. | “can you rename to arrange?” | Met — drag and Replan placement exist, subject to duration defect R023. |
| R018 | Outlook-style daily calendar with a moving current-time line, aligned to actual Singapore time. | “Something liek outlook calendar where there ia line moving down” | Wrong — line is fixed at a CSS offset on a hard-coded date. |
| R019 | Timeline grid uses equal 15-minute intervals. | “Timineline - put as 15 mins blocks” | Partly met — labels are 15 minutes apart, but row height expands with content. |
| R020 | Normal hours: Monday–Friday, 8:45am–6pm, Singapore time. | “845am - 6pm Mon-Fri as normal workig time” | Partly met — labels/sample grid only; no classification engine. |
| R021 | Work outside normal hours, including all weekend work, is overtime. | “Weekends are considered Overtime.” | Partly met — dashboard text only. |
| R022 | No automatic lunch or break reservations. | “No need.” | Met — none inserted. |
| R023 | Store user-entered task title, duration estimate, deadline and priority; honour duration in scheduling and rendering. | “I will need to provide the detalil”; “Lemme mark the priority” | Wrong — priority/deadline discarded; every task occupies one slot regardless of duration. |
| R024 | Let the user enter tasks manually; do not automatically harvest personal to-dos from emails. | “I think better i enter it myself” | Met — manual task entry. |
| R025 | Support project-linked and standalone personal tasks. | “it doesnt have to belong to a project” | Partly met — all newly created tasks forced to General; no project selector. |
| R026 | User marks priority; suggested scheduling considers that priority, deadline and estimated duration. | “Lemme mark the priority” | Wrong — Replan only considers sample urgent flag and empty slots. |
| R027 | Overdue follow-ups lead the suggestion, but user may override the order. | “in a way yes. but i need to be allowed to rearranged.” | Partly met — sample urgent sorting; no real overdue calculation. |
| R028 | Automatically rearrange task blocks when the day changes, preserving meeting times during automatic replanning. | “the task for the day can be changed” | Missing — rearrangement requires Replan; no automatic change-driven planning. |
| R029 | Meetings may be moved manually. Latest instruction supersedes blanket immovability. | “Fixed meeting can also be moved.” | Met — whole meeting moves to an open span. |
| R030 | Drag/drop personal task blocks like Outlook; moving a block alone must not silently change its deadline. | “rearragement of a task shold be drag drop like outlook calendar” | Partly met — drag exists, but task deadlines are not stored. |
| R031 | Dropping one task onto another swaps their scheduled positions/timings. | “they will swap place / timing” | Partly met — swaps start-slot indices only; ignores different durations. |
| R032 | Manually placed blocks are pinned against automatic replanning. | “yes” | Met — pin flag survives manual Replan. Automatic replan missing under R028. |
| R033 | Long tasks can split into blocks around meetings; retain one task identity and total time. | “it can be split” | Missing — no split representation or allocation. |
| R034 | Duration is an estimate; do not interrupt to request a revised estimate when a task runs over. | “this is estimated timing only” | Met — no such prompt. |
| R035 | If the day overflows, let user choose overtime or moving work to another working day; show deadline risk. | “It should let me choose” | Missing — overflow tasks remain unscheduled without a choice. |
| R036 | Recurring tasks and meetings, including daily/weekly routines. Accepted proposal includes single-occurrence/series edits. | “yes” | Missing — no recurrence fields or behaviour. |
| R037 | Different category colours and text labels for client meetings, internal project meetings, non-project tasks; retain project-task distinction. | “Client meeeting”; “internal project emeting”; “non-project related task” | Partly met — sample colours exist; create form cannot choose category. |
| R038 | Start, Pause, Finish; preserve resumable sessions, start/end times, and accumulated time per task. | “Start pause finish. Yes” | Wrong — one shared seconds counter; no task sessions or completed state. |
| R039 | User is responsible for pausing; meeting start must not silently pause a task. | “It is my responisbility to client on the pause myself” | Met — no automatic pause. |
| R040 | When actual meeting time overlaps a running task, popup offers “Pause task” or “Continue”. | “Just a popup to say overlap - pause or continue” | Partly met — only a manual simulation button triggers it. |
| R041 | Continuing retains both records but counts shared minutes once in total work time. | “yes” | Missing — confirmation text only; no interval accounting. |
| R042 | Meetings count scheduled duration automatically; allow correction for shorter/longer actual duration. | “Yes it should” | Missing — meetings do not generate editable time records. |
| R043 | Daily task/meeting actions and project context remain consistent. **Implicit:** do not show another project's data in a selected record. | “update and keep track of it inmy project” | Wrong — deadline/email/Teams summary dialogs use unrelated fixed sample text. |
| R044 | Save work history across days/months for review. **Implicit:** retained records, not session-only data. | “after a few months”; “all times” | Missing — app state disappears on reload. |
| R045 | Resource visibility for four Singapore developers and a Hanoi team; show daily work and delivery pace. | “manage a team of 4 developers”; “a team in Hanoi” | Partly met — sample SG/HN work, but only two SG names and no roster management. |
| R046 | Focus on what teams are doing and missed deadlines, not just capacity allocation. | “What are they doing. and is the progress too slow” | Partly met — summary text; no dynamic progress/late detection. |
| R047 | Allow optional task hour estimates going forward; actual daily hours are not required. | “I thin i want them to going forward.” | Missing — team task details have no optional estimate field. |
| R048 | Do not flag missing hours in daily updates; the team does not report at that granularity. | “the team does not go down to thelevel of hours” | Met — no missing-hours warning. |
| R049 | User pastes updates from each project's Teams channel; no team login needed. | “each project i have a teams channel”; “paste the team message” | Partly met — textarea exists, but content is ignored. |
| R050 | Capture weekly plan separately for each project at the start of the week. | “At the start of each week the team will layout the task” | Missing — no weekly plan entry/type or history. |
| R051 | Daily updates capture yesterday's progress, today's plan and blockers/issues. | “what is the progress yesterday, what is to be done today” | Partly met — placeholder only. |
| R052 | Hanoi daily update occurs at 11am Singapore time; retain context without forcing a meeting. | “update me everyday over teams at 11am sg time” | Partly met — sample uses a check-in meeting; no update schedule context. |
| R053 | Store original Teams message, date, summary, and changes to project progress over time. | “store and summarise the message”; “progress change over time” | Missing — fixed sample history, no source storage. |
| R054 | Review extracted task updates before accepting; maintain links to source evidence. | “these are just summary” | Missing — no editable extraction or acceptance flow. |
| R055 | Flag missing task deadlines, missed deadlines, and open/stalled tasks beyond one week. | “Just missing deadline”; “task that stretch ebyond a week is shold be flag” | Partly met — fixed labels, not computed. Definition requires Decision B. |
| R056 | Show actual progress history and dated evidence so slow progress is assessable. | “help me keep track of hoe the data/progress change over time” | Partly met — fixed historical entries only. |
| R057 | Include individual team members on task lists alongside Singapore/Hanoi team, in separate side-by-side fields. Latest no-stacking rule applies. | “Include team members”; “side by side is fine” | Partly met — names shown above team labels instead of alongside. |
| R058 | SG and HN weekly delivery figures sit side by side. | “put this side by side” | Met — paired progress cells. |
| R059 | Long-running task and missing-deadline warnings belong under blockers/follow-ups, not weekly delivery. | “This shold be under blockers / follow up” | Met — overview warnings moved. |
| R060 | Separate client and project records; many clients per project and many projects per client. | “1 client can have many project. 1 project can have multiple client” | Met — in-memory many-to-many mapping and sample relationships. Persistence in R044. |
| R061 | Add/edit clients through a discoverable Clients area; client name, contact, email, linked projects. Field set is an inferred implementation of client-specific info. | “How do i add client ?”; “client specific info” | Met — client directory/form, session-only. |
| R062 | Maintain project-specific details, start/end dates, milestones, deadlines, health/status and blockers. | “Include project start date, project end date”; “all the items mention” | Partly met — records display fields; no project creation/editing. |
| R063 | No project budget or fees. | “No need for budget and fees” | Met — absent. |
| R064 | Do not tightly couple tasks with enforced dependency rules. | “letsnot tightly couple the task” | Met — no dependency enforcement. |
| R065 | No mandatory client-level tagging on each project action, PBC or meeting; contacts still supported. | “no need for now” | Met — project-level records. |
| R066 | My day Projects tab gives a dense, at-a-glance overview of all current projects and current work. | “one look get an overview of what are the current project” | Met — portfolio table contains work, progress, dates and flags. |
| R067 | Show both delivery/team blockers and client follow-ups/PBC/meetings in project visibility. | “I want to see both items.” | Partly met — content spread across tabs; portfolio omits some upcoming meeting context. |
| R068 | Colour-coded side marker on each project row based on project health, with a readable status label. | “Have a color coded side bar for each row” | Met — health borders and badges. |
| R069 | Sort projects by next milestone and health. | “Project should be sortable - by next milestones and health” | Met — portfolio/register sort controls. |
| R070 | Projects main screen is a traditional case-management listing; click anywhere on a record row to enter details, with a way back to the list. | “Each row should be clickable to open details.” | Partly met — only project-name/Open buttons navigate. |
| R071 | Replace the old horizontal project selector and clean up the delivery panel layout. | “This looks horrible. design it better”; “design it cleaner” | Partly met — selector removed; old styling and density issues remain. |
| R072 | Project Overview tab emphasises overall project timeline, work and milestones, with coherent dates. | “overall project timline with task and what not” | Wrong — timeline shown but task bars use arbitrary percentages unrelated to task deadlines. |
| R073 | Task list is a separate tab in a project record. | “So should the task list.” | Met — Tasks tab. |
| R074 | Meeting minutes is a separate tab in a project record. | “Meeting minutes should be another tab.” | Met — Meeting minutes tab/list/detail. |
| R075 | Project meeting records retain discussions, decisions, attendees, actions, relevant documents and dates. | “Meetings and meeting notes” | Partly met — generated sample records, not saved input. |
| R076 | Accept both typed rough/structured notes and an existing transcript as meeting input. | “I think we should have both options.” | Partly met — note fields only; no transcript path. Word workflow later adds to this unless Decision F changes it. |
| R077 | Create new meeting with title, project, date/time and attendee context; save to project and daily calendar. | “whenever i ask to create new meeting” | Missing — unsaved title/time form only; no project/attendee/duration submission. |
| R078 | Download a Word meeting template whenever creating a new meeting. | “create an word doc tempalte for me to download” | Missing — disabled button. |
| R079 | Template prefilled with meeting/project details and previous outstanding actions/PBC items. | “yes.” | Missing — only explanatory text. |
| R080 | Word template supports discussion, decisions, scope changes, actions, PBC and screenshot evidence. | “in some cases i will be taking screenshots” | Missing — no template file. |
| R081 | Upload completed Word document and ingest its written content into the relevant meeting. | “i will upload the word doc into the app”; “ingest the content” | Missing — no upload or document parser. |
| R082 | Keep original document and screenshots as supporting evidence, linked to notes; no screenshot interpretation/OCR requirement. | “Keep them as supporting documents” | Missing — filenames mentioned but no attachment storage/view. |
| R083 | AI drafts summaries, minutes, follow-up actions and emails; human reviews/edits before accepting official records. | “these are just summary. Draft emails and what not.” | Missing — no connected review/accept flow. |
| R084 | Email draft can be edited and used externally after user review; final send remains with user. | “For me to review before sending.” | Partly met — editable fixed text, no copy/export or saved draft. |
| R085 | Store engagement letter and FSD with version history. | “the engagement letter and the FSD”; “yeah sure” | Missing — version names only. |
| R086 | Preserve changing FSD scope linked to meetings, dated decisions and relevant document version. | “FSD tends to change post meetings” | Missing — no linked version/scope model. |
| R087 | Distinguish discussed/unconfirmed change from explicit client confirmation. | “Sometimes there is no explicit confirmation” | Partly met — static pending confirmation text. |
| R088 | Unconfirmed scope changes become visible follow-up items. | “it should show as follow up items” | Partly met — static example, no creation/resolution flow. |
| R089 | PBC means Prepared by client; support document requests and requests for clarification. | “document request or request for clarification” | Partly met — static examples, no create/edit workflow. |
| R090 | Each PBC/action supports owner or client contact, due date, status and notes. | “Yeah i woudl.” | Partly met — some labels; contact/owner and editing absent. |
| R091 | Dated activity log of attempts and client responses, including no response. | “on this date i followed up and the client has not replied” | Missing — fixed description only. |
| R092 | Every action item can have follow-up; user chooses next follow-up date. | “for each action item, i woudl like follow up”; “set up myself” | Missing — no follow-up date control. |
| R093 | Keep overdue items visible until resolved or rescheduled. | “become visbile” | Partly met — static overdue entries. |
| R094 | Sending a follow-up is a dated activity; underlying request can remain awaiting response with another follow-up date. | “suggest some statuses that i can use”; “ok can” | Missing — no activity/status transition flow. |
| R095 | Accepted statuses: To do, In progress, Awaiting client, Awaiting team, Awaiting my review, Blocked, Done, Cancelled. | “ok can” | Partly met — subset in sample data; no full selector/transitions. |
| R096 | Overdue, missing deadline and stalled are flags separate from status. | “ok can” | Partly met — task labels partly separate; follow-up record uses Overdue as action state. |
| R097 | Every deadline change records prior date, new date, change timestamp and required reason for accountability. | “each change of dates for any deadline should be tracked for accountability” | Wrong — dialog only posts a toast; changes neither date nor history. |
| R098 | Require reason before saving a deadline change. | “sure” | Partly met — reason checked but not retained. |
| R099 | Opportunity tracker for potential engagements before conversion into projects. | “Project and opportunity tracker” | Partly met — two static samples only. |
| R100 | Stages: Contact → Schedule meeting → Call → Walkthrough → Proposal → Proposal follow-up. | “contact them,s chedule meeting with them, call, wakthorugh, proposal, follow up” | Partly met — text displays stages; no stage transitions or editor. |
| R101 | Follow-up actions/reminders at every opportunity stage. | “at each stage tehre will be follow ups” | Missing — one static follow-up action only. |
| R102 | Opportunity follow-up emails are personal tasks; calls/walkthroughs are scheduled client meetings. | “It iwll just be a follow up email”; “these will be client meetings” | Partly met — email task added; walkthrough cannot be scheduled. |
| R103 | Marking an opportunity Won automatically creates a linked project, retaining meetings, proposals, notes and follow-ups. Repeated saves must not create duplicates (implicit). Latest instruction replaces manual conversion as the primary flow. | “if opportunities are won then create project automatically” | Missing — Convert button only shows toast. |
| R104 | Summary of time spent/activities over week; extend to month, all time and selected ranges. | “monthly on month. all times” | Partly met — three fixed period totals; no custom range or computed activity summary. |
| R105 | Report personal time by project/client context, plus standalone/general work. | “Yeah.” | Wrong — project bars stay fixed when period changes. |
| R106 | Include both meeting and task time; distinguish normal hours and overtime. | “Yes.”; “review on a dashboard how the week went” | Partly met — normal/overtime sample totals; no task-vs-meeting breakdown. |
| R107 | Use tracked actual durations and estimates to learn patterns over months; do not invent team time. | “understanding what im doing and how long it will take” | Missing — no stored session history or comparisons. |
| R108 | Shared records across planner/project/report screens. **Implicit:** totals and actions reflect actual app edits. | “keep track and review on a dashboard” | Wrong — independent constants and illustrative data. |
| R109 | Separate modular GitLab and Jira connectors; shared app-facing model, so either source can feed project views. | “structure the code”; “Jira and gitlab board connectors” | Missing — static connection text, no adapters. |
| R110 | GitLab/Jira pull only; never write changes back. | “Only pull” | Partly met — no writes, but no pulling either. |
| R111 | Each project can map to multiple GitLab repositories and Jira boards. | “multiple repositories” | Missing — description only, no mapping configuration. |
| R112 | Imported issues show source task, status, assignee, available deadline and source context as FYI. | “Just as aFYI”; “1 pager” | Missing — no imported data/model/source indication. |
| R113 | Imported team issues do not automatically enter personal planner; user may add a review/follow-up task. | “Just as aFYI” | Partly met — exclusion occurs by absence; explicit add-to-day flow missing. |
| R114 | Flag board-versus-update discrepancies for user review, scoped to the day; retain history without repeating old alerts. | “discrepencies should be day basis”; “shouldnt persist across multiple day” | Missing — no discrepancy model/view. |
| R115 | Connectors for on-prem Ollama and cloud AI through interchangeable provider interfaces. | “Create connectors for both. my on prem is served via ollama” | Missing — selector only, no connector implementation. |
| R116 | Ollama default; cloud only explicitly selected; no silent cloud fallback. | “yes. Ollama should be the default” | Partly met — default selector correct; no actual request routing. |
| R117 | AI supports Teams summaries and meeting/document/email drafts; suggestions remain reviewable, never autonomous final records. | “Its is ultimately up to the sender” | Partly met — explanatory copy and static examples only. |
| R118 | Create a polished, professional redesign while retaining all requested behaviours; no unrequested feature expansion. | “looks polished and professional AND meets every requirement” | Partly met — patchwork prototype, audit gaps above. |
| R119 | Keep plain HTML/CSS technology if current mockup is plain HTML; reproduce shadcn/ui and Tailwind component/token styles. | “keep its tech but reproduce the same tokens and component styles” | Wrong — no shared shadcn-style design system. |
| R120 | Use Lucide icons consistently. | “with Lucide icons” | Missing — Unicode symbols used. |
| R121 | Define tokens once as CSS variables and use them throughout; no hard-coded colours/one-off spacing. | “Define tokens once as CSS variables and use only them.” | Wrong — extensive inline literals and repeated overrides. |
| R122 | Neutral slate/zinc base, navy primary accent #1E3A6E; semantic success, warning, danger and info. | “one primary accent (navy #1E3A6E)” | Wrong — green-tinted base and green primary action. |
| R123 | All text meets WCAG AA contrast in both themes. | “All text meets WCAG AA contrast.” | Wrong — several muted text/background pairs fail normal-text contrast. |
| R124 | Inter or system font stack; font scale 12/14/16/20/24/30px and 14–16px body. | “Scale 12 / 14 / 16 / 20 / 24 / 30 px.” | Partly met — system font/body14; many off-scale sizes. |
| R125 | Spacing exclusively from the 4px grid: 4, 8, 12, 16, 24, 32, 48. | “Spacing: 4px grid” | Wrong — many 5/7/9/10/13/18/22/38px gaps/paddings. |
| R126 | Cards/inputs 6–8px radius; badges fully rounded. | “Radius: 6–8px on cards and inputs; full radius on badges.” | Wrong — mixed card radii and rectangular badges. |
| R127 | Borders as primary elevation; shadows only for popovers, dropdowns and modals. | “borders first; shadows only on popovers, dropdowns, modals” | Partly met — modal shadow appropriate; obsolete selector shadow remains in stylesheet. |
| R128 | Light and dark themes with a usable theme control. | “Light and dark mode.” | Missing — light only. |
| R129 | One primary action per screen; other actions outline or ghost. | “One primary action per screen” | Wrong — global Add task competes with screen-specific primary actions. |
| R130 | Consistent navigation, page title/action header, cards within max-width content container. | “content in cards inside a max-width container” | Partly met — shell exists; no max-width; inconsistent headings and card layout. |
| R131 | Tables have sticky headers, right-aligned numeric cells, row hover, coloured status badges and clickable sortable data headers. | “sticky header, right-aligned numbers, row hover”; “all headers should be sortable” | Partly met — some badges/hover and external sort controls; no header sorting. |
| R132 | Switch table content to readable cards on mobile. | “switch to cards on mobile” | Missing — fixed minimum-width tables and scroll wrappers. |
| R133 | Form labels above inputs, required fields marked, helper/error text below fields. | “required fields marked, helper/error text below the field” | Partly met — labels present; errors native/toasts and required markings missing. |
| R134 | Disable submit while saving and prevent duplicate submissions; appropriate success/error feedback. | “disabled submit while saving” | Missing — no saving state. |
| R135 | Every list/data view needs an empty state with useful action. | “Empty, loading (skeleton) and error states for every list and data view.” | Missing — at most a zero-result count. |
| R136 | Every list/data view needs a loading skeleton. | “loading (skeleton)” | Missing. |
| R137 | Every list/data view needs error state and recovery. | “error states for every list and data view” | Missing. |
| R138 | Responsive down to 375px with no horizontal scrolling, including tables/timelines. | “Responsive down to 375px with no horizontal scroll.” | Wrong — minimum widths up to1120px and horizontal overflow wrappers. |
| R139 | Keyboard access to all actions, proper tab/dialog behaviour, visible focus rings. | “Keyboard accessible with visible focus rings” | Partly met — native buttons but no full tab keyboard pattern; drag alternative selects arbitrary slot. |
| R140 | All inputs labelled; preserve understandable accessible names, statuses and contrast-independent meanings. | “all inputs labelled” | Partly met — labels mostly present; some dialogs lack explicit accessible title links. |
| R141 | Same-looking controls use same reusable components; consistent tables/forms/buttons/badges/tabs. | “If two things look alike, they must be the same component.” | Wrong — repeated string markup and conflicting style definitions. |
| R142 | Step 1: review full chat and all current mockup files, numbered sourced checklist with honest baseline statuses. | “BUILD THE REQUIREMENTS CHECKLIST (no code changes yet)” | Met — this document. |
| R143 | Record changes of mind and superseded instructions; surface ambiguity before redesign. | “Where I changed my mind, the latest instruction wins” | Met — supersession and decision sections below. |
| R144 | Show REQUIREMENTS.md; wait for explicit go-ahead before code/design changes. | “Show me REQUIREMENTS.md and wait for my go-ahead” | Met — current gate; only this audit document created. |
| R145 | After approval implement fixes and redesign, then run every screen at1440/768/375 in both themes; screenshots when possible. | “Check every screen at 1440px, 768px and 375px” | Missing — future build/QA stage. |
| R146 | Update every checklist ID with final status and concrete implementation location; never call placeholders complete. | “set the new status and say where it's met” | Missing — pending redesign and clarified scope. |
| R147 | Independent second agent must review; supply the user's reviewer brief verbatim. | “a second, independent agent must check the work” | Missing — required after implementation, before completion report. |
| R148 | Reviewer independently derives requirements from chat before opening this file; verifies each on screen with Pass/Fail evidence. | “build your OWN requirements list before opening REQUIREMENTS.md” | Missing — pending independent review. |
| R149 | Review design-system adherence, contrast, states, mobile/accessibility and regressions. | “Check for regressions” | Missing — pending independent review. |
| R150 | REVIEW.md severity/location/problem/exact fix and PASS/FAIL; any unmet requirement or High/Critical means FAIL. | “Any Critical or High finding, or any unmet requirement, is a FAIL.” | Missing — pending independent review. |
| R151 | Fix all High/Critical and nonconflicting Medium findings; re-review up to3 rounds; disclose unresolved issues if still failing. | “Repeat until the verdict is PASS, up to 3 rounds.” | Missing — future review loop. |
| R152 | Final report includes final checklist, reviewer verdict/document, before/after changes, assumptions and user decisions. | “Final REQUIREMENTS.md”; “reviewer's final REVIEW.md and verdict” | Missing — final deliverable, not this approval checkpoint. |
| R153 | Normal creation sequence is Client → Opportunity → Won → automatically created Project; associate the opportunity with an existing/newly created client. | “Create client -> create opportuntities” | Missing — clients can be added, but opportunity creation and lifecycle are absent. |
| R154 | Also allow direct project creation for already-won work without requiring an opportunity. Preserve client linkage. | “a user can create project without needing an opportunities” | Missing — no New project form. |
| R155 | Every data-table header sorts its field; toggle ascending/descending, show sort direction and expose accessible sort state. Includes project, client and opportunity listings. | “all headers should be sortable” | Missing — headers are static. |
| R156 | Record rows open detail views by row click, with an equivalent keyboard action and visible focus; nested controls must not trigger unintended navigation (implicit). | “for each row - click row to opend etails” | Missing — no general row interaction; clients only have Edit/linked-project buttons. |
| R157 | Remove redundant Open buttons/action column from the project register; the row itself opens the record. | “Not required” | Wrong — explicit Open button column remains. |
| R158 | All table records use one visual line per row: fields side by side, never stacked. Separate reference/name, member/team, milestone/date into their own columns or inline fields. | “do not stack them. side by side is fine” | Wrong — widespread stacked values and secondary labels. Mobile treatment requires Decision I. |
| R159 | Opportunities use a proper sortable table listing rather than the existing stacked cards/pipeline prose. | “Table form not like this” | Wrong — current page uses stacked project-style cards. |
| R160 | Clicking an opportunity opens its full record: client, stage/outcome, meetings, proposal, notes, follow-ups and resulting project link where won. | “I need to be able to see details.” | Missing — no opportunity detail view. |
| R161 | Projects contain Phases → Tasks → Subtasks. Show and manage this hierarchy in the project record and timeline. It is organisational containment, not a dependency graph. | “Project has Phases -> task -> sub task.” | Missing — flat task list only. |
| R162 | Assign members independently at task and subtask levels. Task owner is accountable overall while distinct subtask owners execute the lower-level work; do not overwrite parent ownership. | “user 1 is overall incharge”; “subtaks are being handled by user 2” | Missing — one display-only member per flat task. |
| R163 | Add an Admin area for team-member management, including adding new members and editing their details/team; retain the single-user app model. | “Create a admin portal”; “add new team members” | Missing — no Admin screen or editable member records. |
| R164 | Members managed in Admin populate task/subtask assignment choices consistently. Support Singapore and Hanoi teams without giving members login accounts (implicit). | “Assignment to team members are at task and subtaks elvel.” | Missing — hard-coded names, no roster/assignment controls. |
| R165 | Keep the global Add task button on every page for ad-hoc capture while reviewing. Screen-specific creation actions remain separate; task creation should preserve the current page (implicit). | “All pages need to have the add task button.” | Met — global header action opens the task form; New project is a separate register action. |
| R166 | Each opportunity has visible Add meeting and Add note entry points, including empty placeholders when no records exist. | “opportunities should also have a placeholder to add meetings and notes” | Met — detail sections and session-backed entry forms in the current mockup. |
| R167 | Add client uses a white background/outline style; global Add task remains the primary action. | “white background” | Met — Add client uses the shared outline button style. |

## Superseded instructions and interpretations

These are history, not extra features to implement. They must not be marked as failures in the final active checklist.

| Earlier version | Current controlling version | Reason / source |
|---|---|---|
| 8am–8pm as normal hours | Mon–Fri 8:45am–6pm; outside/weekends are overtime | “845am - 6pm Mon-Fri as normal workig time” |
| Automatically defer overflowing tasks | Ask user to choose overtime or another working day | “It should let me choose” |
| Meetings cannot move at all | User may manually move meetings; automatic replanning preserves them | “Fixed meeting can also be moved.” |
| Assistant misread: only replan on button click | Tasks automatically rearrange; client meeting times preserved by the planner | “nooooo.. i said the task for the day can be changed.” |
| Prompt for revised estimate on overrun | Keep estimates approximate and track actuals without such prompt | “I foresee there will be too many changes.” |
| Automatically pause when meeting starts | User chooses Pause task or Continue in overlap popup | “it is my responisbility”; “pause or continue” |
| Daily updates require hours / flag missing hours | Only missing deadlines flagged; optional future task estimates | “Just missing deadline.” |
| Team enters records directly | Only user uses app and pastes separate project Teams messages | “No. Only me”; “i will paste them sepeately” |
| Projects below timeline | Separate Projects tab inside My day | “Actually put projects as another tab within your day” |
| “To arrange” | “Unscheduled tasks”, with purpose explained | “can you rename to arrange?” |
| Project cards too sparse | Dense current-project overview with current work, delivery, milestone and follow-ups | “This is too sparse” |
| Weekly delivery includes task-age warning | Keep progress side by side; warnings under blockers/follow-ups | “This shold be under blockers / follow up” |
| Horizontal project selector and one big detail panel | Case-management listing → record; Overview timeline, separate Tasks and Meeting minutes | “traditional case management style” |
| Requirements HTML is the requested visual deliverable | Actual application HTML mockup | “nono i mean HTML mock up” |
| Manual opportunity conversion button | Won outcome automatically creates a linked project; direct project creation also available | “if opportunities are won then create project automatically” |
| Stacked fields and separate Open button in project listings | Single-line rows with fields alongside each other; click row to open | “keep everything to one row”; “Not required” |
| Flat project task model | Phases → tasks → subtasks with parent accountability and separate execution owners | “Project has Phases -> task -> sub task.” |
| Existing green style and inconsistent values | Latest navy/slate-zinc token system, both themes | “one primary accent (navy #1E3A6E)” |

## Current visual and interaction problems

Findings reference `docs/mockup.html` unless stated otherwise. File line locations refer to this baseline and will change when reformatted.

1. **Spacing/alignment:** accumulated CSS overrides in lines2–11 use many incompatible spacing values. Page headers, panel headings, actions and form controls do not share a layout component. Global toast spacing changes page composition. No content maximum width, so tables expand excessively on large screens.
2. **Typography:** sizes include10,11,13,15,18,19,27,28px, beyond the requested scale; essential data is frequently11–13px. Heading levels vary in visual weight. Tiny badges and helper text undermine scanability.
3. **Colour/contrast:** primary colour is green, not navy. Literal colours are scattered across CSS and generated styles. Text `#728179` on white is approximately4.1:1, below4.5:1 for normal text; `#839087` is worse. No dark palette or theme switch. Semantic health and activity category colours need separate, stable roles.
4. **Hierarchy/actions:** global Add task appears on Clients, Projects and Settings and can compete with local primary buttons. Project data is dense in some places and sparse in others. The desktop sidebar has awkward brand/badge wrapping and Unicode icons with inconsistent weight.
5. **Timeline fidelity:** “15-minute” rows grow with content; task estimates do not set block height. Meetings repeat as independent-looking cards in every occupied quarter-hour. The now-line is a fixed offset, unrelated to live clock. No overtime area or weekly view.
6. **Tables:** no sticky headers; numeric cells are left aligned; hover treatment differs across tables. Important text wraps unpredictably while some columns have oversized minima. A desktop overview is1120px minimum; register900px; timeline750px.
7. **Mobile:** horizontal-scroll wrappers remain on almost all data views; no card transformation. At768px the205px sidebar plus margins leaves insufficient content width. Mobile navigation becomes an unstructured cluster of buttons. Timeline labels/controls cannot fit well.
8. **Components:** repeated HTML string construction, inline styles and obsolete selector rules (`.project-switcher`, `.project-choice`) remain. Different tab implementations and badge styles look unrelated. Project cards12px radius conflict with the required6–8px; badges are not pills.
9. **Forms:** task date/priority controls look functional but their values are discarded. Several forms have no Save action. Required markers and inline validation missing. Deadline reason/date errors become a toast behind the modal. Saving/loading/duplicate-submit treatment absent.
10. **Empty/loading/error:** lists are hard-coded, with no loading/error recovery. Project search produces an empty table and count without helpful empty action. Client/timer/connector/document states have no coherent state system.
11. **Accessibility:** custom tablists have click handlers but no arrow-key/roving-focus pattern; many dialogs lack explicit accessible naming. Drag alternative auto-chooses a slot rather than offering the same scheduling choice. Focus treatment mostly covers buttons/links; other controls rely on defaults. Colour often accompanies labels, which should be preserved.
12. **Data trust:** report period changes totals but not project bars. Timeline task dates are unrelated to due dates. Deadline/email/Teams popups show generic content even for different projects. “Finish” does not finish the task. Sample times are mixed with “today” rather than using one consistent mock clock.
13. **Missing functional depth:** no recurrence, saved time sessions, dynamic overdue flags, accepted AI changes, Word download/upload, attachment viewers, version history, opportunity conversion or actual connectors.
14. **Documentation drift:** `docs/requirements.html` still says meetings are immovable and predates tabs, case-management navigation, clients, categories and this design system. It must not serve as the final source of truth.
15. **Verification gap:** previous work mostly checked syntax/HTML structure, not complete on-screen flows. Browser automation rejected the existing `file://` page under its URL policy; no browser workarounds were attempted. A permitted runtime/test route must be established during approved implementation; no unperformed viewport or contrast tests will be claimed.

## Decisions needed before redesign

These questions are the remaining ambiguities, not permission to add unrelated features. Recommended choices are proposals awaiting approval.

**A. What is the acceptance boundary for this mockup?**
- **Recommended: interactive local prototype.** All app workflows operate on persistent local demo records; settings/import/AI flows have clearly labelled simulated responses through separate adapter interfaces. Real Word files can be downloaded/imported locally. Production GitLab/Jira/cloud/Ollama connectivity, authentication and deployment remain explicitly unverified until configured. We retain those requirements with an honest scope note, rather than claiming a live integration is Met.
- **Alternative: working application now.** Actual connector requests, AI generation, durable server storage and deployment are required in this redesign. This needs service endpoints, authentication choices and hosting details, and is substantially more than a mockup.
- This choice resolves the apparent conflict between “mockup” and “Every requirement ... must be Met”. A visibly labelled simulation cannot be represented as production integration success.

**B. What counts as a task stretching beyond one week?**
- Recommended: more than7 calendar days since first In progress, while still open. Deadline overdue remains a separate flag. Alternatively, flag any incomplete commitment carried past its planned weekly cycle. Decide also whether a legitimately multiweek task should receive the age flag; recommendation is yes as informational, not automatically At risk.

**C. Task swapping and pinned blocks: what happens when durations differ or constraints collide?**
- Recommended: swap start times, retain each task's duration; allow valid splits for unpinned work. If a swap conflicts with another pinned block/meeting, show a preview of the conflict and let the user choose a valid time rather than silently moving a meeting. A task dragged from Unscheduled displaces the target back there. Do not swap meetings automatically unless explicitly requested.
- Recommended: pinned future blocks remain fixed; elapsed unfinished pinned work is offered for explicit rescheduling. Overtime is never silently accepted. Default priority order is overdue follow-ups, then user priority, then earliest deadline.

**D. Project health and colour: manual or automatic?**
- Recommended: user-selectable On track / Needs attention / At risk, with factual computed flags shown separately. The user asked to judge progress but did not authorise an unexplained health algorithm.
- Recommended category colours: client meetings blue, internal meetings purple, non-project tasks amber, project tasks green; navy is the primary UI accent, not every event colour.

**E. Default planning treatment for blocked tasks and team estimates?**
- Recommended: blocked tasks stay visible and are excluded from suggested scheduling until manually selected, without dependency links. Team estimates stay optional; no actual team hours inferred from messages. Use one accountable owner at each task/subtask level, with separate owners permitted for its children as now specified. Singapore has four sample developer records; Hanoi team size is configurable through the requested Admin area.

**F. Meeting inputs and recurrence defaults?**
- Recommended: retain both typed notes and paste/upload transcript alongside Word upload; the later Word request did not explicitly cancel transcript support. No audio recording/transcription feature was agreed, so omit it.
- Recommended: recurrence supports daily/weekly/monthly patterns, end date and single-occurrence/series edits. Meeting fields include start/end, attendees and project; planned time counts by default, with actual duration correction.

**G. Time reports and persistence?**
- Recommended: week, month, custom range, all time; project/client breakdowns, meeting/task totals, normal/overtime, estimate-vs-actual. When overlapping activity categories exceed the deduplicated total, label that distinction instead of distributing minutes arbitrarily. A project with multiple clients is counted once in overall totals.
- Recommended local prototype saves records and attachments across reloads on the same browser. Full offline editing and cross-device sync were offered earlier by the assistant but not agreed by the user; do not claim them as requirements met without a separate decision.

**H. Production choices, only if A requires live implementation now:** specify cloud provider/model, Ollama URL/model, GitLab/Jira URLs and access method, server OS, authentication approach, sync cadence and backup destination. Do not enter credentials in this document. For a mockup, editable connection settings and simulated tests are sufficient only if that scope is explicitly accepted.

**I. How should the latest single-line-table rule work at375px?**
- Desktop/tablet tables will have one line per record, individual sortable columns, row-click navigation and no separate Open button. This supersedes stacked secondary fields in the current prototype.
- Recommended: preserve your earlier mobile-card requirement at narrow widths. Cards are not tables; use side-by-side label/value pairs and open the full record for more fields. This also preserves the no-horizontal-scroll requirement. Full desktop columns cannot all remain readable on one375px line without hiding/truncating content or scrolling.
- Please confirm this mobile exception, or specify which earlier rule should change.

**J. Admin boundaries and hierarchy:**
- The requested Admin portal is a section inside the same single-user workspace, for team-member records. It does not introduce member logins, roles or a second independently hosted app unless requested.
- Recommended fields: member name (required), team/location (Singapore/Hanoi), optional email and active/inactive status. Inactivation preserves historical assignments. No payroll, permissions system or performance scoring.
- Task owner remains overall accountable when child subtasks have different owners. Hierarchy does not force task dependency scheduling. Timeline can expand/collapse phases and tasks; ownership appears in separate columns.
- Won is an opportunity outcome following the previously agreed lifecycle stages. It triggers project creation once and keeps the original opportunity/history linked; direct creation remains available for already-won work.

## Implementation and QA plan after approval

1. Preserve plain HTML technology; reorganise into shared tokens/components and domain data/functions as needed. Keep the existing usable flows while replacing inconsistent code.
2. Use one source of truth for tasks, meetings, sessions, clients, projects, updates, follow-ups and documents. No independent hard-coded reports.
3. Cover the required screens: My day Schedule/Projects; project register and Overview/Tasks/Meeting minutes/Follow-ups & PBC; Clients; Opportunities; Time dashboard; Connections/preferences; Admin team management; associated creation/edit/review dialogs. Opportunity and client record details and phase/task/subtask hierarchy are now included.
4. Check every screen and meaningful empty/loading/error state at1440,768,375px in light/dark. Verify keyboard, modal focus, drag alternatives and text contrast. Capture screenshots where permitted.
5. Keep stable R IDs; add final status/evidence-location columns without erasing the baseline. Superseded instructions remain history.
6. Spawn a separate reviewer with the full chat and the exact brief below, instructing it to build its own list before reading this file. It writes `REVIEW.md`; fix and re-review for at most three rounds.
7. Report only after PASS, or after three rounds with precise unresolved findings. Do not mark absent/unverified external services Met.

### Exact reviewer brief to pass verbatim in Step 5

> You are a strict QA reviewer. You did not build this mockup. Do not trust the builder's claims.
> 1. Re-read the full chat yourself and build your OWN requirements list before opening REQUIREMENTS.md. Then compare the two lists and flag anything the builder missed or misread.
> 2. Run the mockup. For every requirement, verify it on screen, not just in code. Mark each Pass / Fail with evidence (screen, element, screenshot or file:line).
> 3. Check the design system: hard-coded colours or spacing, off-scale font sizes, inconsistent components, contrast failures, missing empty/loading/error states, broken layouts at 375px, missing focus rings or labels.
> 4. Check for regressions: anything that worked before the redesign and is now broken or removed.
> 5. Output REVIEW.md: a table of findings with severity (Critical / High / Medium / Low), location, problem and the exact fix. End with a verdict: PASS or FAIL. Any Critical or High finding, or any unmet requirement, is a FAIL.

## Baseline integrity

SHA-256 before and after this audit (no changes):
- `docs/mockup.html`: `5e398c48ac9f4cf9ce94781c16c01436d171e40e44e377a8aaf74c869de5017b`
- `docs/requirements.html`: `49c36dcb25437d50084a49f7f64905a78a33d6206f5548635eee314dcc01df8e`

**Approval gate:** Review this checklist and Decisions A–J. Approve the recommended choices or specify changes before Step 2 begins. Independent final review is mandatory after implementation; this Step 1 document is not a completion claim for the redesign.


## Interim authorised change — project register interactions

The latest explicit user request authorised this narrow update before the broader redesign: project headers sort on click, and whole rows open project details. The full redesign scope/approval decision remains outstanding. Baseline statuses above are preserved as the original audit.

- Project register now has sortable Reference, Project, Clients, Health, Start date, End date, Next milestone and Milestone date headers with direction toggles and accessible sort state.
- Full project rows open details by click or Enter/Space; Open buttons removed from this listing.
- Register fields now occupy separate columns on a single line.
- R070, project-register portions of R155/R156, and R157/R158 are implemented in `docs/mockup.html`: `renderRegister`, `projectSortValue`, `.column-sort`, `.project-record-row`. Other tables and remaining redesign requirements are unchanged.
- JavaScript syntax and header/ID checks performed; scoped independent review requested. This is not completion of the full review/redesign.
- Earlier SHA-256 values are the original audit snapshot, not hashes of this subsequently edited file.


## Interim authorised change — Clients table

The user requested the Projects table design/behaviour for Clients. Clients now reuses the same table, sortable-header and interactive-row styling. Four headers (Client, Contact, Email, Linked projects) sort ascending/descending; search, single-line cells, row click and Enter/Space navigation are supported. Row details preserve Edit client and linked-project navigation. Separate Edit buttons were removed from list rows. R155/R156/R158 now have client-list implementations as well; broader redesign approval remains outstanding. Source: `docs/mockup.html`, `renderClients`, `clientSortValue`, `showClient`, shared `.register-table`, `.column-sort`, `.record-row`. JavaScript syntax and header/ID checks passed. Scoped independent review requested; UI verification remains limited by the existing browser policy.


## Interim authorised change — direct project creation

Projects now shows a contextual **New project** action. Its form captures project name, linked client(s), start/end dates, health, next milestone/date and description. It validates required fields, duplicate names, client selection and date ranges; then creates the record and client links, updates counts and opens the project. Blank task/minutes/history sections have empty messages. This implements the direct-creation portion of R062/R154 for the current mockup session; it does not implement opportunity-to-project conversion or persistent storage. The broader redesign remains pending approval. Scoped independent review requested.


## Latest correction — global Add task

Add task must remain in the header on every page for ad-hoc task capture. This supersedes the interim contextual replacement with New project. New project has its own outline button in the project register. Creating a personal task leaves the current screen open and confirms that it was added to My day → Unscheduled tasks. The global button is the page's primary action; local creation actions should be secondary/outline under the final design system. The previous visual-audit recommendation to replace the global Add task action is superseded.


## Interim authorised change — Opportunities table and Add client style

Add client now uses the white outline style, keeping the global Add task as the prominent action. Opportunities reuses the Projects table components: six sortable headers, search, single-line rows, hover/focus styles and click/Enter/Space to open the selected opportunity. Details show its client, stage, next action/date, meetings/notes, proposal and follow-up. Back restores focus to the row. The existing follow-up task action uses the selected record and avoids duplicate tasks. Handover remains explicitly a preview; automatic won-to-project conversion is still not implemented. Relevant IDs: R155, R156, R158, R159, R160. Structural/syntax checks passed; scoped independent review requested.


## Interim authorised change — create opportunities, meetings and notes

Opportunities now has a white New opportunity button. The form links an existing client and captures title, stage, next action/date, optional Singapore time and notes. Required/duplicate-name validation precedes session-only creation; the record opens after saving. Separate Meetings and Notes sections have Add meeting / Add note buttons and empty placeholders. Their basic forms retain dated content for this session. Calendar scheduling, document generation, AI, durable storage and automatic won conversion remain outside this narrow update and are not claimed complete. Global Add task remains available. Relevant existing requirements: R075, R099–R102, R153 and R160; new explicit placeholder requirement R166. Syntax/ID checks passed; independent scoped review requested.


## Interim authorised change — opportunity stage progression

Opportunity details now explains Contact → Schedule meeting → Call → Walkthrough → Proposal → Proposal follow-up → Won. Change stage supports forward/back/skip changes and next-action/date/time updates, with timestamped history and a required reason for date/time changes. Previous follow-up details remain in the history. Mark won opens a prefilled project setup; only successful creation saves Won, links the source client and records the handover. Repeating the action opens the existing project. The project Overview includes the linked opportunity meetings, notes, proposal, follow-ups and stage history. Direct project creation remains available, with no opportunity required. This supersedes earlier interim statements that handover is preview-only. Data remains session-only; the broader redesign is not complete. Source: `docs/mockup.html`, `renderOpportunityProgress`, stage-form handler, `newProject`, `renderProjectOpportunity`. Syntax validation and independent scoped review requested; on-screen browser verification remains unavailable under the existing policy restriction.


## Interim authorised redesign — opportunity detail page

The user explicitly requested redesign of the opportunity detail screenshot. This narrow page redesign uses a navy/slate token palette, a compact record header, seven numbered stages with only the current stage highlighted, separate Meetings and Notes cards, a next-action card, Proposal and Project handover cards, and expandable Stage history. Counts, contextual empty states, outline actions, keyboard focus rings and system light/dark styling are included. Global Add task and all existing opportunity actions remain available. Layout rules adapt the page to one column on narrow screens. Existing table/listing designs and the remaining full-app redesign are outside this change. Files: `docs/mockup.html` (`showOpportunity`, `renderOpportunityProgress`, opportunity detail markup) and `docs/opportunity-detail.css`. Static checks covered script syntax, unique IDs, linked CSS, retained control IDs and core text contrast. The existing browser access rejection prevents screenshots and on-screen verification; responsive rendering is source-reviewed, not visually certified. Independent scoped review: `docs/REVIEW-opportunity-design.md`.


## Latest visual correction — shared planner styling

The user approved the opportunity detail layout but requested the same design system as the other pages. The detail now uses the existing green accent, warm neutral surfaces, project-heading typography, white outline buttons, rounded cards and badge styling. Its separate navy shell, header, dialog and automatic dark-mode overrides were removed so these inherit the existing application styling. The improved stage tracker, card layout, responsive rules and all interactions remain. This supersedes the prior page-specific navy/dark visual direction; full-app design-system work remains separate. CSS-only change in `docs/opportunity-detail.css`.


## Latest interaction — clickable opportunity progress

The user requested direct stage selection from the progress tracker. Each step is now a native keyboard-accessible button; the separate Change stage button is removed. Clicking a stage prefills the existing follow-up editor; saving retains the audit history and date-change validation. Clicking Won opens project setup directly, with no stage mutation until project creation succeeds. For converted opportunities, Won opens the linked project and earlier steps are disabled, preserving the existing terminal-state behaviour. Current-stage selection edits the next follow-up. Existing green styling and responsive layout remain.


## Latest correction — handover on Won; direct next-action editing

Project handover is removed from the persistent opportunity sidebar. Selecting stage 7 (Won) opens the handover/setup dialog; saving creates the project and marks Won, while cancelling leaves the opportunity unchanged. A converted opportunity's Won button opens its linked project. The Next action card now has Edit next action (Add next action when empty), opening action/date/optional-time editing without changing the stage. Date-change reasons and history remain, including for won opportunities. The existing Add follow-up to my day action remains separate. This supersedes the earlier always-visible handover card.

## Internal meeting workspace prototype — current discussion build

The user clarified that this is an internal tool, with no client access/review workflow, and requested a concrete prototype to discuss. This build adds a full-page meeting workspace shared by opportunity and project records, using the existing green design language.

- Open any listed meeting, or use Add/New meeting, to reach the page (no meeting popup).
- Minutes include editable title, date/time, attendees, agenda, freeform discussion, internal Draft/Reviewed state, and separate decisions/scope requests/clarifications. Edits autosave to this page session. Editing reviewed content returns it to Draft.
- Actions & PBC is a shared list, with multiple actions, owner, due date/time, type, status, source meeting, dated follow-up notes and change history. Each action can be added separately to My day. The list appears in opportunity details, the meeting workspace, and Project → Follow-ups & PBC. Legacy sample follow-up details are retained in action history.
- Supporting files retain user-selected Word files/screenshots/reference documents as downloadable browser-session attachments. File content extraction and Word-template generation remain explicitly unconnected.
- Save version takes a read-only snapshot of meeting details, decisions and actions. It records attachment filenames; this is not durable document version storage.
- The follow-up draft is assembled from the notes and explicitly selected open actions, including previous-meeting commitments. It can be edited/downloaded; replacing edited draft content requires an explicit click. No email is sent and no Ollama call is made.
- Opportunity stage 7 now represents Outcome: Won or Lost. Won opens handover and creates/links the project on successful save. Lost records a reason and date, retains history and creates no project. Closing the outcome panel/setup does not change the stage. Earlier stages can reopen a lost opportunity; converted won opportunities continue to open their linked project.
- Won conversion carries the same meeting and action records into the new project; actions are not copied into disconnected duplicates.

Files: `docs/meeting-workspace.js`, `docs/meeting-workspace.css`, integration in `docs/mockup.html`. The new workspace uses sample data and session-only state; reloading resets it. This is a discussion prototype, not completion of the earlier full-app redesign, live connectors, AI, Word ingestion or persistent storage. Browser policy still blocks local-page verification; source/syntax and independent non-browser handler/integration checks are used, with limitations recorded in `docs/REVIEW-meeting-workspace.md`.

## Latest refinement — structured meeting attendees

The user requested more structured attendees. The meeting workspace now has individual attendee rows with Name, Organisation/team, Meeting role and Attendance, with inline add/edit/remove controls. Existing team names and client contacts can prefill a meeting entry; manual participants are supported. The picker does not change the contact directory. Exact duplicate names within the same organisation are rejected. Legacy attendee text is preserved as original notes and migrated into rows without inferring attendance. Header sorting and responsive cards are included. Meeting lists, follow-up drafts and saved versions read the structured attendees; snapshots deep-copy attendee records. Changes remain session-only and no invitations or client access are introduced.

## Latest interaction — add project phases, tasks and subtasks

Projects → project record → Overview now offers **Add phase**, with **+ Task** on each phase and **+ Subtask** on each task. The Tasks tab exposes the same hierarchy and creation controls. Click an item or task-list row to edit its name, dates, status and notes; tasks and subtasks also have independently selected owners and optional estimated hours. A task owner is overall accountable, while subtask assignees remain independent. Start/end date edits require a reason and retain timestamped before/after history. Parent date changes do not cascade; out-of-parent dates are flagged. Timeline positions use actual entered dates; missing legacy start dates are shown as due markers rather than fabricated durations. Groups can collapse; sortable task headers retain parent/child grouping. Empty projects guide users to Add phase. Global personal Add task remains separate and available.

Files: `docs/project-plan.js`, `docs/project-plan.css`, `docs/mockup.html` project Overview and Tasks integration. These are session-only prototype changes; reload resets them. Existing sample weekly team summaries do not recalculate from this editor. Full-app redesign remains outside this scoped change. Validation: JavaScript syntax, unique static IDs and asset references; independent handler review recorded in `docs/REVIEW-project-hierarchy.md`. Browser access remains blocked by the previously reported security restriction, so visual/responsive rendering is not certified.


## Timeline presentation correction — one line per item

The latest feedback overrides the stacked project timeline labels. Work item, owner and add control now occupy consistent side-by-side columns in a compact 48px row. Names/owners use explicit 13px text matching existing register cells; captions and buttons use 12px. Phase emphasis uses weight and row background, rather than extra badges or text lines. Hierarchy uses indentation; long names truncate with full titles and edit access. Date warnings remain inline and accessible. Milestones use the same column alignment. Timeline bars and markers have a reduced, consistent scale. Phase/task/subtask editing, sorting, date history and independent ownership remain unchanged. This is a presentation correction within the existing green design, not the pending full-app redesign. Browser rendering remains unverified under the existing access restriction.


## Phase creation and explicit phase editing

Following a reported Add phase failure, project work editing now opens an inline editor in the active Overview or Tasks panel, replacing the shared modal path. Every phase has a visible Edit button next to + Task; its name also opens editing. Name, start/end dates, status and notes can be changed. Date edits still require reasons and preserve history and child work. Save refreshes both timeline and task list; Cancel leaves stored work unchanged. Switching projects clears the old editor. The original browser failure could not be reproduced in integrated source-handler checks; this replacement interaction is checked independently in `docs/REVIEW-phase-editor.md`, without claiming live browser verification.

## Priority change — separate project Follow-ups and PBC

The combined project Follow-ups & PBC tab is replaced by two sibling tabs: Follow-ups and PBC. Follow-ups shows existing Action/Clarification records; PBC shows records explicitly classified as PBC. Each view has its own filtered totals, sorting, empty state and add control. Add PBC request defaults to PBC; Add follow-up defaults to Action. Existing owners, deadlines, meeting links and history remain on the same underlying records. Changing a record's Type moves it to the corresponding list, refreshing both views. Meeting workspaces and opportunities retain their existing combined action lists. Independent scoped review: `docs/REVIEW-followups-pbc.md`. Browser visual verification remains unavailable.

## Other authorised changes in this session

New project and opportunity forms use a shared searchable client dropdown. Projects retain multiple selection and won-opportunity handover retains its required source client; opportunity creation selects one existing client. Search matches client name, contact and email. Project record Health is an editable dropdown and updates health badges, row colours and health sorting in the project register and My day portfolio. Changes remain session-only.

## Latest project editor requirements — under-row editing, one calendar, multiple owners

The item editor now inserts immediately beneath its related phase/task/subtask row in Overview and beneath its table row in Tasks. Adding a child opens beneath its parent; adding a new phase uses the top insertion area. Phase names, phase Edit buttons and timeline bars all route to this local editor. The form is compact, with fields side by side on desktop and a single collapsible month calendar for selecting the start/end range. It supports cross-month, reversed and same-day ranges; saved date changes still require reasons and preserve history. All three hierarchy levels now support multiple owners, superseding single-owner/no-phase-owner restrictions. Legacy owners are retained; parent owner/date changes do not cascade. Independent source/structural-DOM checks: `docs/REVIEW-row-plan-editor.md`. The previously reported phase-edit failure was not reproduced in source tests, and real browser verification remains unavailable.

## Latest PBC requirements — inline rows and comments beside the table

PBC has exactly these columns: Request, Owner, Request date, Due date, Status, Comment. Clicking a row edits its first five fields in place; Save/Cancel controls remain in that row. Add PBC request inserts a draft row. Comment buttons open a free-text editor beside the table (below it on narrow screens), keeping the main table free of long comment text. Unsaved row/comment drafts do not mutate stored records. Existing request dates are left unknown rather than invented; new requests default to the Singapore date. Saved request/due date changes require a reason; prior comments and date changes remain in History in the side panel. Existing meeting links are retained. Independent scoped report: `docs/REVIEW-pbc-inline.md`. Data remains session-only.

## Latest refinements — task editor and PBC exchange

| ID | Requirement | Source | Status / implementation |
| --- | --- | --- | --- |
| PBC-01 | PBC ID visible and retained through Excel updates | “Create a PBC ID” | Met in scoped source checks: `docs/pbc-exchange.js`, seven-column PBC table. IDs are assigned once per record in this prototype session. |
| PBC-02 | Download Excel template and ingest uploaded requests | “create an excel template … upload … ingest” | Met in scoped source checks: Download Excel template exports current project requests/IDs; Upload Excel previews all fields before committing. Blank IDs create requests, matching IDs update them. Invalid/duplicate/foreign IDs block the import. `docs/pbc-table.js`, `docs/pbc-exchange.js`, `docs/templates/PBC-template.xlsx`. |
| PBC-03 | Comment preview without taller rows | “show a preview … [not] mess up the row height” | Met in source: a one-line ellipsised preview opens the side editor; full comment remains in title/editor. `docs/pbc-table.js`, `docs/pbc-table.css`. Actual rendered height is not browser-verified. Supersedes button-only comment display. |
| EDIT-01 | Name/status; dates/estimate; owners; notes | “Name and Status … date … estimated hours … Owner … notes” | Met in handler/source checks: `docs/project-plan.js` and `.css`; keyboard order matches visual order. |
| EDIT-02 | New task/subtask defaults today through one week later | “default today's date till 1 week” | Met in handler checks: Singapore calendar date plus seven days. Editing existing items preserves their stored dates. |

Existing PBC request/due-date edits via upload require a reason and preserve before/after history. Imported formulas and Excel errors are rejected. Downloaded text beginning with `=` remains text, not a formula. Uploads are limited to 1,000 records and 5 MB. The workbook includes instructions, date formats, a frozen header and a status dropdown. It is bundled locally; no network service receives uploaded documents. Reloading resets prototype data, including newly assigned IDs; persistent storage is still outside this mockup.

## Latest project tabs — agreed items and issue tracker

| ID | Requirement | Source | Status / implementation |
| --- | --- | --- | --- |
| AGR-01 | Separate Agreed items tab per project | “add 1 more tba for project - Agreed items” | Implemented in `docs/mockup.html` and `docs/project-registers.js`; records are stored on their project. |
| AGR-02 | Create/edit sections and subsections | “functionality [Section], screen1 [subsection]” | Implemented: sections can contain subsections; agreements choose a section and optional subsection. Renaming retains links. |
| AGR-03 | Agreement date, client contact, comment/description | “date and agreed with who within the client” | Implemented: required agreed date, client contact and agreement text; editable via row click. |
| ISS-01 | Project Issue tracker tab | “also a tab for issue tracker” | Implemented: issue register with ID, title, severity, status, owners, raised/due dates; editable descriptions, updates, resolution and change history. `docs/project-registers.js` and `.css`. |

Design choices for discussion: issues use Open / In progress / Blocked / Resolved / Closed, and Low / Medium / High / Critical severity. These are proposed defaults, not previously agreed business rules. Client agreement contacts and issue owners accept free text. Both tabs use the existing planner design, sortable compact table rows, keyboard row activation and mobile cards. The issue tracker is an internal manual register; it does not sync to GitLab/Jira. These scoped additions do not complete the pending full-app redesign or live integrations.

Issue-tracker refinement: search by ID, title or owner; filter all/open/specific statuses; overdue badges for active issues; drafts must be saved or cancelled before changing the view. The tracker uses a separate `issueRecords` collection so existing portfolio blocker summaries remain unchanged. Full inline startup and all three sample-project renders were checked with inert DOM mocks.

Independent scoped reviews completed: `docs/REVIEW-pbc-exchange.md` and `docs/REVIEW-project-registers.md` both PASS for source/logic checks, with no unresolved Critical/High/Medium findings. The reviewer identified and verified fixes for keyboard field order, incomplete import preview, and a tracker/portfolio data-name collision. Browser/pixel verification remains unavailable; these are not full-app visual PASS verdicts.

## Populated workbook upserts and issue drawer

- **PBC downloads:** the in-app Download Excel template action exports all saved PBC requests from the current project, including IDs, owners, dates, status and comments. UI text now explains this. Matching IDs update records, blank IDs add requests, and omission does not delete a request. The static bundled XLSX is only the base used to generate the populated in-app download.
- **Issue editor:** Add issue and row selection open a native right-side dialog, with a close control, Save/Cancel, Escape, focus restoration, scrolling, mobile sizing and reduced-motion support. This supersedes inline issue editing. Agreements remain inline.
- **Issue Excel exchange:** Download Excel template exports every saved issue in the selected project, independent of current search/status filters. Columns are Issue ID, Issue, Severity, Status, Owners, Raised date, Due date, Description, Notes and Resolution. A project reference accompanies the workbook to prevent accidental updates to another project's identically numbered issue.
- **Issue import:** preview all values before saving; matching IDs update, blank IDs create, unchanged rows are skipped and omitted rows remain. Duplicate/unknown IDs, invalid dates/status/severity, formulas and mixed invalid batches block import. Changed dates require a reason and retain before/after history. Cancel makes no changes. Imports are limited to 1,000 rows / 5 MB.

Implementation: `docs/issue-exchange.js`, `docs/issue-import.js`, `docs/project-registers.js`, `docs/project-registers.css`, configurable XLSX codec in `docs/pbc-exchange.js`, generated `docs/templates/Issue-template.xlsx` and bundled data assets. Source tests verify populated XLSX roundtrips and upserts, cross-project rejection, unchanged-repeat imports, drawer handlers and existing project/portfolio integration. Changes remain session-only; browser rendering is not certified under the existing access restriction.

Independent latest review: `docs/REVIEW-issue-upsert.md` reports PASS for scoped source/logic checks, including all-record exports, preview/cancel behaviour, same-numbered issue IDs across projects, upsert atomicity, date-history reasons and drawer focus handling. The codec preserves whitespace in comments/descriptions/notes/resolution. The dynamic in-app download is the populated deliverable; the bundled blank workbook is an internal base template.

## Agreed items — organisation integrated into the reading view

The latest request supersedes the separate Sections & subsections management panel and flat agreement table. Agreed items now appear beneath their section/subsection headings in a single grouped reading view. Sections have a distinct header; subsections are indented beneath them. Full agreement descriptions are visible, with date and client contact alongside, rather than truncated to a table cell.

Each heading has collapse/expand, Rename and + Item; section headings also offer + Subsection. Counts include the appropriate group’s agreements. Contextual + Item preselects its section/subsection, and forms open beneath the related heading/item. Global Add section and Add agreed item remain available. Item sorting operates within groups without flattening their hierarchy. Editing an agreement can move it to another section/subsection; saving reveals its destination and restores focus. Draft guards and validation remain in place, and existing records/IDs are preserved.

Implementation: `docs/project-registers.js`, `docs/project-registers.css`; supporting text in `docs/mockup.html`. Source/structural-DOM checks cover grouping, exact item counts, collapse, contextual creation, edit placement, moving items, and prior issue-editor behaviours. Browser rendering remains unverified under the existing access restriction. This is a session-only prototype change.

Independent review: `docs/REVIEW-agreed-groups.md` — PASS for scoped source/logic checks, with no unresolved findings. Reviewer independently checked group membership/counts, full descriptions, contextual editing, sorting, collapse/focus behaviour, moving items, draft guards and issue/import regressions. Pixel layout remains unverified.

## Named agreed items with separate discussion/comments

Agreed items now have a separate **Item name** and **Discussion / comment**, for example Front end → Screen 1 → No naming required, with explanatory discussion beneath the name. New items and edits require a name, discussion/comment, date and client contact. Existing descriptions stay in their existing field; older unnamed records display “Unnamed item” until named. Cancel preserves both fields. The grouped reading view shows the name in bold above the full discussion, with date/contact alongside. Item-name sorting is available within groups; discussion sorting remains available. Source: “Items should also be allowed to be named” and “a comment on what and how it was discusssed”. Implementation: `docs/project-registers.js` / `.css` and supporting text in `docs/mockup.html`.


## Starter sections, project documents and grouped project navigation

| ID | Requirement | Source | Status / implementation |
| --- | --- | --- | --- |
| AGR-DEFAULT-01 | Start empty projects with the eight agreed-item sections already discussed | “lets have this instead of starting from 0” | Met in source/logic checks: `docs/project-registers.js`. Defaults initialise once, start collapsed, and remain editable. Existing populated/custom structures are preserved. Empty leaf groups can be removed without reseeding. |
| DOC-01 | Upload project documents into a simple project repository | “upload project documents … just as a repository” | Met at session-prototype level: Documents tab, `docs/project-documents.js`. Multiple uploads, original-file download, search, sort, reference removal and project isolation; no ingestion. File objects are held in memory and cleared on reload, as disclosed on screen. Persistent storage is not implemented. |
| DOC-02 | Provide default sections for uploaded project documents | “for upload project documetn create sections for me” | Met in source/logic checks: Engagement & scope; Requirements & FSD; Design & technical; Client-provided documents; Meeting records; Testing & acceptance; Deployment & handover; Other documents. Add/rename sections, upload destination selector and contextual upload in each group. |
| NAV-01 | Organise the growing list of project sections | “Thisnk of a way to orgnaise thses section” | Met in scoped source/logic checks in `docs/mockup.html` / `docs/project-registers.css`: Delivery (Overview, Tasks, Issue tracker); Meetings & follow-ups (Meeting minutes, Follow-ups, PBC); Reference (Agreed items, Documents). Every destination stays visible. Existing IDs and panel routing are preserved; selected styling, roving keyboard focus, arrow/Home/End navigation and responsive wrapping are provided. Browser pixel layout remains unverified. |

Independent document/default review: `docs/REVIEW-project-documents.md` — PASS for scoped source and inert-DOM checks. Project-navigation review: `docs/REVIEW-project-navigation.md` — PASS for scoped source/logic checks, including all routes, arrow wrapping, Home/End and focus. This is an incremental prototype change, not a certification of the entire app or the earlier proposed full redesign.


## Project navigation — selected category with a second row

Latest screenshot supersedes NAV-01’s all-sections-visible layout. Keep the three categories, but show Delivery **3**, Meetings & follow-ups **3**, Reference **2** across the top with an underline on the active category. Show only that category’s section tabs on a soft second row; the selected section has a white surface. All eight existing destinations and panel IDs remain intact. Category switching remembers its last selected child, and direct section navigation selects the matching category. Keyboard arrows/Home/End operate separately within each tier, with visible focus and one tab stop per tier. Rows wrap on small viewports.

Implementation: `docs/mockup.html` (`setRecordTab`, `recordNavigationKey`, project navigation markup); `docs/project-registers.css` (`record-navigation`). Status: Met in scoped source/handler checks. Independent review: `docs/REVIEW-project-navigation.md` — PASS, no findings. Browser rendering remains unverified under the existing restriction.
