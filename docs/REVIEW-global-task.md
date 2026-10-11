# Independent interim review: global Add task

Scope: latest separation of global task creation from project creation. Browser local-file policy prevents on-screen verification; review is limited to source and syntax. No bypass attempted.

| Check | Evidence in `docs/mockup.html` | Result |
|---|---|---|
| Global header consistently offers Add task | Header markup and `view()` retain `+ Add task`; `$('new').onclick` always opens the personal-task form. | Source checked |
| Project creation remains available | One `#create-project` button exists in the project-register header, bound to `newProject`. | Source checked |
| Saving a task preserves the current page | Save handler appends the task, rerenders schedule/backlog, closes the modal, and announces its location. It does not call `view()`. | Source checked |
| Existing task destination retained | New task remains `project:'General'`, `slot:null`, so it enters Unscheduled tasks. | Source checked |
| Syntax | Complete inline script passed bundled Node `--check`. | Checked |

No new regression identified in this narrow correction. Existing task-form limitations and the broader redesign were not reassessed; no overall PASS is asserted.
