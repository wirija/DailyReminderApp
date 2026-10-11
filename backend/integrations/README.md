# Integration services

These authenticated endpoints are mounted under `/api/integrations/`. They use the
same workspace ownership and session authentication as the planner. Project,
meeting and document references accept UUIDs; project and meeting routes also
accept their existing frontend `client_key` (projects additionally accept `PRJ-*`).

## Documents and templates

| Request | Behaviour |
| --- | --- |
| `POST files/` | Multipart `file`, optional `project`, `meeting`, `section`, `previous_version`, `description`; returns the private download URL. Frontend aliases `context=project:PRJ-001`, `meetingId`, `sectionId` are supported. Opportunity context is retained in metadata. |
| `GET files/{id}/download/` | Owner-authorized attachment download with `private, no-store` headers. Upload folders must never be mounted as a public static directory. |
| `GET meetings/template.docx?project=…&meeting=…` | Actual Word template with metadata, structured attendees, discussion, decisions, actions, PBC, scope changes and supporting screenshots. |
| `POST meetings/import/` | Multipart Word `file` or JSON `file_id` for an already uploaded DOCX; default is extraction preview. `commit=true` retains the original DOCX and writes source transcript. A new meeting also requires `title` and ISO `starts_at`. Attendees are returned as suggestions; decisions/actions are never silently accepted. |
| `GET projects/{project}/{pbc|issues}/template.xlsx` | Populated current records, stable IDs, hidden project identity, date formatting, choice validation and instructions. |
| `POST projects/{project}/{pbc|issues}/import/` | Multipart `file`, default preview. `commit=true` performs an atomic upsert. Existing IDs update only within this project; blank IDs create records. Missing rows never delete records. Date changes require `change_reason`; audit records retain before/after/reason. |

All mutating document/import endpoints accept `expected_revision` and return
`previous_revision` / `workspace_revision`. A stale revision gets HTTP 409 before
mutation. For a safe frontend merge, advance the local revision only when the
returned previous revision equals its own. The existing frontend's Excel exchange
can also persist its reviewed changes through the aggregate workspace API.

Office documents are limited to 20 MB compressed, 80 MB expanded and 5,000 ZIP
entries. Excel imports accept 1,000 rows, reject formulas/errors, duplicate or
foreign IDs and invalid dates. Text resembling a formula is exported as a string.
Images remain in the original Word document; screenshot OCR is not performed.

## Board connections

Create any number of `connections/` for a project. Fields are `name`, `provider`
(`gitlab` or `jira`), `project`, `base_url`, `resource`, `username`, `token`,
`enabled`. GitLab `resource` is a numeric project ID or repository path; Jira
`resource` is a numeric board ID. Jira Cloud uses account email in `username` plus
an API token; omit username for bearer-token deployments.

Tokens are encrypted with Fernet and are write-only. Set a stable
`CONNECTOR_ENCRYPTION_KEY` (a Fernet key) or retain the Django `SECRET_KEY`, from
which the default key is derived. Back up the key with the database using a secure
separate location. Changing the server/provider/account clears the old credential
unless a new token is supplied.

`POST connections/{id}/sync/` queues a GET-only pull. `GET jobs/{id}/` reports
`queued`, `running`, `completed` or `failed`. `GET remote-issues/?project=…`
provides imported FYI records without creating tasks in My day.
`GET remote-issues/{id}/history/` retains change snapshots; `changed_today` only
reflects snapshots captured on the current Singapore date. These change markers
are separate from `discrepancies_today`, which compares explicit board keys/statuses
in accepted daily team updates against the imported board. Common synonyms such
as Done/Closed are equivalent. A later update from the same team supersedes its
earlier claim. Yesterday's claims produce no flags today, while their original
records remain. Where multiple GitLab repositories have the same `#12`, qualify
the reported key as `group/repository#12` to avoid an ambiguous match.
GitLab's opened/closed state only supports a completed-versus-unfinished
comparison: an opened issue reported as in progress, blocked or in review is not
flagged. Jira's richer workflow statuses are compared after synonym normalization.

All remote requests prohibit redirects, so credentials cannot be forwarded to a
redirected host. Failed pulls preserve the previous imported records; only a
successful full pull marks absent items inactive. Connections use the configured
server's TLS trust; install the company CA in the container when required.

## Ollama drafts

The default server/model come from `OLLAMA_BASE_URL` and `OLLAMA_MODEL`. The model
must already be installed in that Ollama service. `POST ai/drafts/` accepts
`kind=summary|team_update|meeting|email`, `source_text`, optional `project` and
`meeting`, and returns `{job, draft, review_required:true}`. `provider` defaults
to `ollama`. An optional OpenAI-compatible cloud service is configured through
`CLOUD_AI_BASE_URL` (including `/v1` where required), `CLOUD_AI_MODEL` and
`CLOUD_AI_API_KEY`; it is used only when the request explicitly selects
`provider=cloud`. An Ollama error never triggers cloud fallback.
`GET ai/capabilities/` returns available configuration flags without credentials.

Poll `jobs/{job}/`; after completion, read `ai/drafts/{draft}/` for `content` and
`structured`. Meeting extraction requests structured JSON; discussion remains
unconfirmed unless the supplied evidence explicitly confirms agreement. The
source is treated as evidence, not model instructions. There are no email-sending
or remote-mutation tools. `POST ai/drafts/{id}/review/` records
`decision=accepted|rejected` and optional edited `content`; applying actions or
decisions remains an explicit planner edit.

Run the configured Huey consumer for background work. Production uses the
installed Huey 3.4 PostgreSQL queue; local development can use SQLite. Failure to
enqueue returns HTTP 503; service failures remain visible on the job record.

## Verification

`python backend/manage.py test integrations.tests` uses an in-process Django test
client, temporary document storage, and HTTP mock transports. It checks scoped
access, atomic Excel upserts, history, literal formula export, GET-only connector
pagination, credential protection, source retention and draft-only AI behaviour.
It does not contact a live Jira, GitLab or Ollama server.

Provider references: [GitLab issues API](https://docs.gitlab.com/api/issues/),
[Jira board API](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/),
[Ollama chat API](https://docs.ollama.com/api/chat).
