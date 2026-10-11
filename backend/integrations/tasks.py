import httpx
from django.db import transaction
from django.utils import timezone
from huey.contrib.djhuey import db_task

from .ai import generate_draft
from .connectors import ConnectorError, fetch_issues
from .models import AIDraft, Connection, IntegrationJob, RemoteIssue, RemoteSnapshot


def fail_job(job, exc):
    job.status = "failed"
    # Remote exception bodies can include credentials or private responses. Persist only safe messages.
    job.error = str(exc) if isinstance(exc, (ConnectorError, ValueError)) else "The service could not be reached or processing failed. Check the connection and retry."
    job.finished_at = timezone.now()
    job.save(update_fields=["status", "error", "finished_at"])


def perform_sync(job_id, transport=None):
    job = IntegrationJob.objects.select_related("connection").get(pk=job_id)
    job.status = "running"
    job.save(update_fields=["status"])
    try:
        connection = job.connection
        if not connection or not connection.enabled:
            raise ValueError("This connection is disabled or no longer exists.")
        configuration = tuple(getattr(connection, field) for field in ["provider", "base_url", "resource", "username", "encrypted_token", "project_id"])
        records = fetch_issues(connection, transport=transport)
        with transaction.atomic():
            current = Connection.objects.select_for_update().get(pk=connection.pk)
            if not current.enabled or configuration != tuple(getattr(current, field) for field in ["provider", "base_url", "resource", "username", "encrypted_token", "project_id"]):
                raise ValueError("This connection changed while the pull was running. Pull again using its current settings.")
            ids = []
            for values in records:
                external_id = values.pop("external_id")
                previous = RemoteIssue.objects.filter(connection=connection, external_id=external_id).first()
                changed = not previous or previous.raw != values["raw"]
                issue, _ = RemoteIssue.objects.update_or_create(connection=connection, external_id=external_id, defaults={**values, "active": True})
                ids.append(issue.pk)
                if changed:
                    RemoteSnapshot.objects.create(issue=issue, data=values["raw"])
            RemoteIssue.objects.filter(connection=connection).exclude(pk__in=ids).update(active=False)
            connection.last_synced_at = timezone.now()
            connection.save(update_fields=["last_synced_at"])
            job.result = {"count": len(ids), "read_only": True}
            job.status, job.finished_at = "completed", timezone.now()
            job.save(update_fields=["result", "status", "finished_at"])
    except Exception as exc:
        fail_job(job, exc)
    return str(job.pk)


@db_task()
def sync_connection(job_id):
    return perform_sync(job_id)


def perform_draft(job_id, draft_id, transport=None):
    job = IntegrationJob.objects.get(pk=job_id)
    job.status = "running"
    job.save(update_fields=["status"])
    try:
        draft = AIDraft.objects.get(pk=draft_id, workspace=job.workspace)
        result = generate_draft(draft.kind, draft.source_text, transport=transport, provider=draft.provider)
        draft.content, draft.structured = result["content"], result["structured"]
        draft.save(update_fields=["content", "structured"])
        job.result = {"draft_id": str(draft.pk), "review_required": True}
        job.status, job.finished_at = "completed", timezone.now()
        job.save(update_fields=["result", "status", "finished_at"])
    except Exception as exc:
        fail_job(job, exc)
    return str(job.pk)


@db_task()
def create_draft(job_id, draft_id):
    return perform_draft(job_id, draft_id)
