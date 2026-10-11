from pathlib import Path
from uuid import UUID

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Q
from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from planner.models import Document, DocumentSection, Meeting, Opportunity, Project, TeamUpdate
from planner.audit import record_event

from .ai import KINDS, capabilities
from .connectors import validate_base_url
from .exchange import MAX_UPLOAD, apply_import, parse_workbook, plan_import, public_plan, safe_office_bytes, workbook_bytes
from .models import AIDraft, Connection, IntegrationJob, RemoteIssue
from .tasks import create_draft, sync_connection
from .word import extract_meeting, meeting_template


def owned(model, workspace, value):
    if not value:
        raise serializers.ValidationError("Select a record.")
    field_names = {field.name for field in model._meta.fields}
    query = Q()
    if "client_key" in field_names:
        query |= Q(client_key=str(value))
    if "reference" in field_names:
        query |= Q(reference=str(value))
    try:
        query |= Q(pk=UUID(str(value)))
    except ValueError:
        if not query:
            raise serializers.ValidationError("Invalid record ID.")
    return get_object_or_404(model.objects.filter(workspace=workspace), query)


def committed(request):
    return request.data.get("commit") in (True, "true", "1", 1)


def no_store(response):
    response["Cache-Control"] = "private, no-store"
    return response


def upload_context(request):
    project_value = request.data.get("project")
    context = str(request.data.get("context", ""))
    opportunity = None
    if context.startswith("project:"):
        project_value = project_value or context.split(":", 1)[1]
    elif context.startswith("opportunity:"):
        opportunity = owned(Opportunity, request.user, context.split(":", 1)[1])
    project = owned(Project, request.user, project_value) if project_value else None
    meeting_value = request.data.get("meeting") or request.data.get("meetingId")
    meeting = owned(Meeting, request.user, meeting_value) if meeting_value else None
    if meeting and project and meeting.project_id != project.pk:
        raise serializers.ValidationError("The meeting must belong to this project.")
    if meeting and opportunity and meeting.opportunity_id != opportunity.pk:
        raise serializers.ValidationError("The meeting must belong to this opportunity.")
    return project or (meeting.project if meeting else None), meeting, opportunity


def workspace_write_state(request):
    from workspace.models import WorkspaceState
    get_user_model().objects.select_for_update().get(pk=request.user.pk)
    state, _ = WorkspaceState.objects.select_for_update().get_or_create(user=request.user)
    expected = request.data.get("expected_revision")
    if expected is not None:
        try:
            expected = int(expected)
        except (TypeError, ValueError):
            return state, Response({"detail": "Provide the current workspace revision."}, status=400)
        if expected != state.revision:
            return state, Response({"detail": "This workspace changed elsewhere. Reload before uploading.", "revision": state.revision}, status=409)
    return state, None


class ConnectionSerializer(serializers.ModelSerializer):
    token = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=5000)
    has_credential = serializers.SerializerMethodField()
    project = serializers.CharField()
    project_reference = serializers.CharField(source="project.reference", read_only=True)

    class Meta:
        model = Connection
        fields = ["id", "project", "project_reference", "name", "provider", "base_url", "resource", "username", "token", "has_credential", "enabled", "last_synced_at", "created_at"]
        read_only_fields = ["id", "last_synced_at", "created_at"]

    def get_has_credential(self, obj):
        return bool(obj.encrypted_token)

    def validate_project(self, value):
        return owned(Project, self.context["request"].user, value)

    def validate_base_url(self, value):
        try:
            return validate_base_url(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate(self, data):
        provider = data.get("provider", getattr(self.instance, "provider", ""))
        resource = data.get("resource", getattr(self.instance, "resource", ""))
        if provider == "jira" and not str(resource).isdigit():
            raise serializers.ValidationError({"resource": "Use the numeric Jira board ID."})
        return data

    def create(self, data):
        token = data.pop("token", "")
        instance = Connection(**data, workspace=self.context["request"].user)
        instance.set_token(token)
        instance.save()
        return instance

    def update(self, instance, data):
        token = data.pop("token", None)
        # Never send a stored token to a newly configured server without re-entry.
        server_changed = any(key in data and data[key] != getattr(instance, key) for key in ("base_url", "provider", "username"))
        if server_changed and token is None:
            instance.set_token("")
        if token is not None:
            instance.set_token(token)
        source_changed = server_changed or ("resource" in data and data["resource"] != instance.resource)
        for key, value in data.items():
            setattr(instance, key, value)
        instance.save()
        if source_changed:
            instance.issues.update(active=False)
        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["project"] = str(instance.project_id)
        return data


class ConnectionViewSet(viewsets.ModelViewSet):
    serializer_class = ConnectionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        items = Connection.objects.filter(workspace=self.request.user).order_by("name")
        if self.request.query_params.get("project"):
            items = items.filter(project=owned(Project, self.request.user, self.request.query_params["project"]))
        return items

    @action(detail=True, methods=["post"])
    def sync(self, request, pk=None):
        connection = self.get_object()
        if not connection.enabled:
            return Response({"detail": "Enable this connection first."}, status=400)
        if not connection.encrypted_token:
            return Response({"detail": "Enter a read-only credential first."}, status=400)
        job = IntegrationJob.objects.create(workspace=request.user, connection=connection, project=connection.project, kind="board_sync")
        try:
            sync_connection(str(job.pk))
        except Exception:
            job.status, job.error = "failed", "The background worker queue is unavailable. Try again after it restarts."
            job.save(update_fields=["status", "error"])
            return Response({"job": str(job.pk), "detail": job.error}, status=503)
        return Response({"job": str(job.pk), "status": "queued"}, status=202)


class JobSerializer(serializers.ModelSerializer):
    class Meta:
        model = IntegrationJob
        fields = ["id", "kind", "status", "result", "error", "created_at", "finished_at"]


class JobViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = JobSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return IntegrationJob.objects.filter(workspace=self.request.user).order_by("-created_at")


class RemoteIssueSerializer(serializers.ModelSerializer):
    provider = serializers.CharField(source="connection.provider")
    project = serializers.UUIDField(source="connection.project_id")
    changed_today = serializers.SerializerMethodField()
    discrepancies_today = serializers.SerializerMethodField()

    class Meta:
        model = RemoteIssue
        fields = ["id", "connection", "provider", "project", "external_id", "key", "title", "status", "assignees", "due_date", "url", "imported_at", "changed_today", "discrepancies_today"]

    def get_changed_today(self, obj):
        return obj.snapshots.filter(captured_at__date=timezone.localdate()).exists()

    def get_discrepancies_today(self, obj):
        cache = self.context.setdefault("daily_status_claims", {})
        project_id = obj.connection.project_id
        if project_id not in cache:
            updates = TeamUpdate.objects.filter(workspace=obj.connection.workspace, project_id=project_id, accepted=True, kind="daily", update_date=timezone.localdate()).order_by("created_at")
            claims = {}
            for update in updates:
                for claim in update.proposed_changes:
                    if isinstance(claim, dict) and isinstance(claim.get("key"), str) and isinstance(claim.get("status"), str) and claim["key"].strip() and claim["status"].strip():
                        # A later accepted update from the same team replaces its earlier claim today.
                        claims[(claim["key"].strip().casefold(), update.team)] = {"update_id": str(update.pk), "team": update.team, "reported_status": claim["status"].strip(), "date": update.update_date.isoformat()}
            cache[project_id] = claims
        aliases = {f"{obj.connection.resource}{obj.key}".casefold()}
        duplicates = self.context.setdefault("duplicate_remote_keys", {})
        identity = (project_id, obj.key)
        if identity not in duplicates:
            duplicates[identity] = RemoteIssue.objects.filter(connection__project_id=project_id, connection__workspace=obj.connection.workspace, active=True, key=obj.key).count() > 1
        if not duplicates[identity]:
            aliases.add(obj.key.casefold())
        return [dict(claim, board_status=obj.status) for (key, _), claim in cache[project_id].items() if key in aliases and statuses_disagree(obj.connection.provider, obj.status, claim["reported_status"])]


def normalized_status(value):
    value = " ".join(str(value).casefold().replace("_", " ").split())
    groups = {"done": {"done", "completed", "complete", "closed", "resolved"}, "open": {"open", "opened", "todo", "to do", "not started"}, "in progress": {"in progress", "doing", "started"}, "review": {"review", "in review", "awaiting my review"}}
    return next((key for key, values in groups.items() if value in values), value)


def statuses_disagree(provider, board_status, reported_status):
    board, reported = normalized_status(board_status), normalized_status(reported_status)
    if provider == "gitlab":
        # GitLab's issue state is only opened/closed. An opened issue can still
        # be in progress, blocked, or in review; those are not contradictions.
        return (board == "done") != (reported == "done")
    return board != reported


class RemoteIssueViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = RemoteIssueSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        items = RemoteIssue.objects.filter(connection__workspace=self.request.user, active=True).select_related("connection").prefetch_related("snapshots")
        if self.request.query_params.get("project"):
            items = items.filter(connection__project=owned(Project, self.request.user, self.request.query_params["project"]))
        return items

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        issue = self.get_object()
        return Response(list(issue.snapshots.order_by("-captured_at").values("captured_at", "data")[:100]))


class DraftSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIDraft
        fields = ["id", "project", "meeting", "kind", "provider", "source_text", "content", "structured", "status", "created_at"]
        read_only_fields = fields


class DraftViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = DraftSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return AIDraft.objects.filter(workspace=self.request.user).order_by("-created_at")

    def create(self, request):
        kind, source = request.data.get("kind", "summary"), request.data.get("source_text", "")
        if kind not in KINDS or not isinstance(source, str) or not source.strip() or len(source) > 120000:
            return Response({"detail": "Choose a supported draft kind and provide 1–120,000 characters of source text."}, status=400)
        provider = request.data.get("provider", "ollama")
        available = {entry["id"]: entry["configured"] for entry in capabilities()["providers"]}
        if provider not in available or not available[provider]:
            return Response({"detail": "The selected AI provider is not configured. Set it up on the server before requesting a draft."}, status=400)
        project = owned(Project, request.user, request.data["project"]) if request.data.get("project") else None
        meeting = owned(Meeting, request.user, request.data["meeting"]) if request.data.get("meeting") else None
        if meeting and project and meeting.project_id != project.pk:
            return Response({"detail": "The meeting must belong to this project."}, status=400)
        draft = AIDraft.objects.create(workspace=request.user, project=project or (meeting.project if meeting else None), meeting=meeting, kind=kind, provider=provider, source_text=source)
        job = IntegrationJob.objects.create(workspace=request.user, project=draft.project, kind="ai_draft")
        try:
            create_draft(str(job.pk), str(draft.pk))
        except Exception:
            job.status, job.error = "failed", "The background worker queue is unavailable. Retry after it restarts."
            job.save(update_fields=["status", "error"])
            return Response({"job": str(job.pk), "detail": job.error}, status=503)
        return Response({"job": str(job.pk), "draft": str(draft.pk), "review_required": True}, status=202)

    @action(detail=True, methods=["post"])
    def review(self, request, pk=None):
        draft = self.get_object()
        decision = request.data.get("decision")
        if decision not in ("accepted", "rejected"):
            return Response({"detail": "Choose accepted or rejected."}, status=400)
        if not draft.content:
            return Response({"detail": "Wait for the draft to finish before reviewing it."}, status=400)
        content = request.data.get("content", draft.content)
        if not isinstance(content, str) or len(content) > 250000:
            return Response({"detail": "Draft content must be text under 250,000 characters."}, status=400)
        draft.content, draft.status = content, decision
        draft.save(update_fields=["content", "status"])
        # Accepting a draft records review only. Record edits remain explicit in the normal forms.
        return Response(DraftSerializer(draft).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ai_capabilities(request):
    return no_store(Response(capabilities()))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def excel_template(request, project, kind):
    project = owned(Project, request.user, project)
    try:
        content = workbook_bytes(kind, project)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)
    response = HttpResponse(content, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    response["Content-Disposition"] = f'attachment; filename="{project.reference}-{kind}.xlsx"'
    return no_store(response)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@transaction.atomic
def excel_import(request, project, kind):
    project = owned(Project, request.user, project)
    upload = request.FILES.get("file")
    if not upload:
        return Response({"detail": "Choose an Excel file."}, status=400)
    try:
        content = safe_office_bytes(upload, ".xlsx")
        rows = parse_workbook(kind, project, content)
        preview = plan_import(kind, project, rows)
        if not committed(request):
            return Response({"rows": public_plan(preview), "can_import": all(not row["errors"] for row in preview), "date_reason_required": any(row["date_changed"] for row in preview)})
        state, conflict = workspace_write_state(request)
        if conflict is not None:
            return conflict
        previous_revision = state.revision
        changes = apply_import(kind, project, rows, str(request.data.get("change_reason", "")))
        state.refresh_from_db()
        return Response({"changed": len(changes), "records": changes, "previous_revision": previous_revision, "workspace_revision": state.revision})
    except (ValueError, DjangoValidationError) as exc:
        return Response({"detail": str(exc)}, status=400)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def word_template(request):
    project = owned(Project, request.user, request.query_params["project"]) if request.query_params.get("project") else None
    meeting = owned(Meeting, request.user, request.query_params["meeting"]) if request.query_params.get("meeting") else None
    if meeting and project and meeting.project_id != project.pk:
        return Response({"detail": "The meeting must belong to this project."}, status=400)
    response = HttpResponse(meeting_template(meeting, project or (meeting.project if meeting else None)), content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    response["Content-Disposition"] = 'attachment; filename="Meeting-minutes-template.docx"'
    return no_store(response)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@transaction.atomic
def word_import(request):
    upload = request.FILES.get("file")
    source_document = owned(Document, request.user, request.data["file_id"]) if request.data.get("file_id") else None
    if source_document:
        try:
            upload = ContentFile(source_document.file.read(), name=source_document.original_name)
        except (OSError, ValueError):
            return Response({"detail": "The original document is missing from storage."}, status=404)
    if not upload:
        return Response({"detail": "Choose a Word document."}, status=400)
    project, meeting, opportunity = upload_context(request)
    try:
        content = safe_office_bytes(upload, ".docx")
        extracted = extract_meeting(content)
        if not committed(request):
            return Response(extracted)
        state, conflict = workspace_write_state(request)
        if conflict is not None:
            return conflict
        previous_revision = state.revision
        if not meeting:
            title = str(request.data.get("title") or extracted["metadata"].get("Meeting title") or "").strip()
            starts_at = parse_datetime(str(request.data.get("starts_at", "")))
            if not title or not starts_at:
                return Response({"detail": "Enter a meeting title and ISO date/time before importing."}, status=400)
            if timezone.is_naive(starts_at):
                starts_at = timezone.make_aware(starts_at)
            meeting = Meeting(workspace=request.user, project=project, opportunity=opportunity, title=title, starts_at=starts_at)
        with transaction.atomic():
            meeting.transcript = extracted["text"]
            meeting.extra = {**meeting.extra, "last_import": {"filename": Path(upload.name).name, "sections": extracted["sections"], "attendee_suggestions": extracted["attendees"], "image_count": extracted["image_count"]}}
            meeting.full_clean()
            meeting.save()
            document = Document(workspace=request.user, project=meeting.project, meeting=meeting, original_name=Path(upload.name).name, content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", size=len(content), description="Original meeting record with supporting screenshots")
            document.file.save(Path(upload.name).name, ContentFile(content), save=False)
            try:
                document.full_clean()
                document.save()
                record_event(request.user, meeting, "word_import", {}, {"document": str(document.pk), "filename": document.original_name}, "Uploaded source record retained")
            except Exception:
                document.file.delete(save=False)
                raise
        state.refresh_from_db()
        return Response({"meeting": str(meeting.pk), "document": str(document.pk), "extracted": extracted, "previous_revision": previous_revision, "workspace_revision": state.revision}, status=201)
    except (ValueError, DjangoValidationError) as exc:
        return Response({"detail": str(exc)}, status=400)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@transaction.atomic
def file_upload(request):
    upload = request.FILES.get("file")
    if not upload:
        return Response({"detail": "Choose a file to upload."}, status=400)
    if upload.size > getattr(settings, "MAX_DOCUMENT_SIZE", MAX_UPLOAD):
        return Response({"detail": "This file exceeds the document upload limit."}, status=400)
    project, meeting, opportunity = upload_context(request)
    section_value = request.data.get("section") or request.data.get("sectionId")
    section = owned(DocumentSection, request.user, section_value) if section_value else None
    previous = owned(Document, request.user, request.data["previous_version"]) if request.data.get("previous_version") else None
    state, conflict = workspace_write_state(request)
    if conflict is not None:
        return conflict
    previous_revision = state.revision
    document = Document(workspace=request.user, project=project, meeting=meeting, section=section, previous_version=previous, version=previous.version + 1 if previous else 1, original_name=Path(upload.name).name, size=upload.size, content_type=upload.content_type or "application/octet-stream", description=str(request.data.get("description", "")), metadata={"opportunity": str(opportunity.pk)} if opportunity else {})
    document.file = upload
    try:
        document.full_clean()
        document.save()
    except DjangoValidationError as exc:
        return Response({"detail": exc.message_dict}, status=400)
    download_url = f"/api/integrations/files/{document.pk}/download/"
    state.refresh_from_db()
    return Response({"id": str(document.pk), "name": document.original_name, "size": document.size, "version": document.version, "url": download_url, "download_url": download_url, "previous_revision": previous_revision, "workspace_revision": state.revision}, status=201)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def file_download(request, document):
    document = owned(Document, request.user, document)
    try:
        response = FileResponse(document.file.open("rb"), as_attachment=True, filename=document.original_name, content_type="application/octet-stream")
    except (OSError, ValueError):
        return Response({"detail": "This file is missing from document storage. Restore it from backup or upload a new version."}, status=404)
    response["X-Content-Type-Options"] = "nosniff"
    return no_store(response)
