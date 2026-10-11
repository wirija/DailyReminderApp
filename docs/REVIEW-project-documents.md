# Independent review — default groups and Documents repository

Scope: default Agreed items sections, the new project Documents tab and its default sections, file upload/download/list organisation. This review is independent and limited to the latest additions.

| Requirement / behavior | Result | Evidence |
| --- | --- | --- |
| Eight default agreed sections, initially collapsed | Pass | `docs/project-registers.js`, starterSections/initialization. Independent test verifies count, collapsed aria state and repeated-render idempotence. |
| Preserve existing custom sections and agreed items | Pass | Production initialization tested against a populated custom hierarchy; existing names, references and discussion remain unchanged. The previous named/grouped-item regression suite also passes. |
| Remove only empty agreed leaf sections; do not reseed | Pass | Actual handlers remove all eight defaults; reopening retains zero sections. Parent sections with children and sections/subsections with items have no Remove button; explicit handler calls also refuse removal. |
| Documents is a separate project tab | Pass | `docs/mockup.html` documents tab/panel/script and renderRecordExtras integration. Actual inline-app harness opens a project, selects Documents and verifies panel selection and rendered default groups. |
| Eight default document sections, editable and project-specific | Pass | `docs/project-documents.js`, starterSections. Tests verify defaults once, collapsed state, unique IDs across projects, custom existing sections retained, add/rename and duplicate/blank section-name validation. |
| Upload to selected section or its contextual Upload control | Pass | Inert handlers exercise destination selection and section Upload; multiple actual Node File objects retain their correct section ID and original object references. |
| Files displayed by group with sortable metadata and search | Pass | Name/size sort and extension search tested through production handlers; other headers use the same sort path. Original name/type/size/SGT upload metadata are rendered. |
| Duplicate handling | Pass | Same name, size and last-modified metadata in the same section is skipped with feedback. The same File can be filed under a different section. This is metadata-based duplicate detection, not content hashing. |
| Download the original file | Pass, handler logic | Stub Blob URL API receives the exact original File object; anchor uses its original filename and generated URL is revoked. No extraction, rewriting or ingestion occurs. |
| Remove repository reference without modifying original | Pass | Removal shrinks the project array only; original File identity/content-size remains unchanged. No filesystem or remote-delete operation exists. |
| Section rename preserves linked files and project isolation | Pass | Rename keeps section IDs and file association; switching projects keeps separate section/file arrays and returning restores prior records. |
| Protect unsaved section edits | Pass | Upload and search while editing are blocked; blank/duplicate names do not mutate sections; Cancel closes the editor without adding data. |
| Existing agreed item interactions preserved | Pass | Independently reran named-item/group hierarchy, counts, context creation, editor placement, move, rename, cancellation and sorting assertions. |

| Severity | Location | Problem | Exact fix |
| --- | --- | --- | --- |
| — | Reviewed scope | No unresolved Critical, High or Medium findings identified. | None required. |

Independent evidence: `/tmp/reviewer-project-documents.js` exercises default seeding, real File-object preservation and document actions with inert DOM/URL adapters; `/tmp/reviewer-documents-init.js` runs the actual inline app, opens a project and checks Documents routing/rendering; `/tmp/reviewer-agreed-names.js` verifies grouped agreement regressions. Reviewer did not edit production code.

The earlier explicit browser restriction was respected. No browser or alternate server/protocol workaround was attempted. These tests do not certify native file-picker/download behavior, pixel layout, responsive rendering or visual polish. Documents remain in memory for this page session and are cleared on reload; no durable storage or document ingestion is claimed.

Verdict: **PASS for this scoped source/logic review.**
