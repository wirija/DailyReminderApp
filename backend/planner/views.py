from datetime import datetime, timedelta
from pathlib import PurePath
from zoneinfo import ZoneInfo

from django.core.exceptions import ValidationError as ModelValidationError
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.http import FileResponse
from django.utils import timezone
from rest_framework import filters, permissions, serializers as drf_serializers, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from . import models, serializers
from .audit import record_event, snapshot
from .services import seed_project, timer_action, win_opportunity, work_summary, ensure_scope_followup


class OwnedViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    ordering = ["-created_at"]
    search_fields = []
    ordering_fields = ["created_at", "updated_at"]

    def lock_workspace(self):
        get_user_model().objects.select_for_update().get(pk=self.request.user.pk)

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        self.lock_workspace()
        return super().create(request, *args, **kwargs)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        self.lock_workspace()
        return super().update(request, *args, **kwargs)

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        self.lock_workspace()
        return super().destroy(request, *args, **kwargs)

    def get_queryset(self):
        model = self.serializer_class.Meta.model
        queryset = model.objects.filter(workspace=self.request.user)
        fields = {field.name: field for field in model._meta.fields}
        for key in ("project", "opportunity", "meeting", "phase", "parent", "activity", "status", "stage", "health", "client_key", "team", "kind"):
            value = self.request.query_params.get(key)
            if key in fields and value is not None:
                if value == "null" and fields[key].null:
                    queryset = queryset.filter(**{key + "__isnull": True})
                else:
                    try:
                        parsed = fields[key].target_field.to_python(value) if fields[key].is_relation else value
                    except (ValueError, ModelValidationError):
                        raise ValidationError({key: "Enter a valid record ID."})
                    queryset = queryset.filter(**{key: parsed})
        return queryset

    @transaction.atomic
    def perform_create(self, serializer):
        try:
            instance = serializer.save(workspace=self.request.user)
        except IntegrityError:
            raise ValidationError({"detail": "This record conflicts with an existing record. Refresh and try again."})
        record_event(self.request.user, instance, "created")

    @transaction.atomic
    def perform_update(self, serializer):
        before = snapshot(serializer.instance)
        reason = serializer.validated_data.get("change_reason", "")
        try:
            instance = serializer.save()
        except IntegrityError:
            raise ValidationError({"detail": "This record conflicts with an existing record. Refresh and try again."})
        record_event(self.request.user, instance, "updated", before, reason=reason)

    @transaction.atomic
    def perform_destroy(self, instance):
        if isinstance(instance, models.Activity) and instance.time_sessions.filter(ends_at__isnull=True).exists():
            raise ValidationError({"detail": "Pause the task before deleting it."})
        before = snapshot(instance)
        record_event(self.request.user, instance, "deleted", before, after={})
        try:
            instance.delete()
        except ProtectedError:
            raise ValidationError({"detail": "This record is still linked to other records. Move or archive those records first."})

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        instance = self.get_object()
        events = models.AuditEvent.objects.filter(workspace=request.user, target_type=instance._meta.label_lower, target_id=str(instance.pk))
        page = self.paginate_queryset(events)
        data = serializers.AuditEventSerializer(page if page is not None else events, many=True).data
        return self.get_paginated_response(data) if page is not None else Response(data)


def viewset_for(serializer_class):
    model = serializer_class.Meta.model
    fields = {field.name for field in model._meta.fields}
    return type(model.__name__ + "ViewSet", (OwnedViewSet,), {
        "serializer_class": serializer_class,
        "search_fields": [name for name in ("name", "title", "reference", "email", "contact_name", "request", "notes", "description", "owner_name") if name in fields],
        "ordering_fields": [name for name in ("name", "title", "reference", "created_at", "updated_at", "due_date", "end_date", "start_date", "health", "status", "stage", "position", "starts_at", "milestone_date") if name in fields],
    })


ClientViewSet = viewset_for(serializers.ClientSerializer)
TeamMemberViewSet = viewset_for(serializers.TeamMemberSerializer)
PhaseViewSet = viewset_for(serializers.PhaseSerializer)
WorkItemViewSet = viewset_for(serializers.WorkItemSerializer)
MilestoneViewSet = viewset_for(serializers.MilestoneSerializer)
NextActionViewSet = viewset_for(serializers.NextActionSerializer)
AttendeeViewSet = viewset_for(serializers.AttendeeSerializer)
FollowUpViewSet = viewset_for(serializers.FollowUpSerializer)
PBCRequestViewSet = viewset_for(serializers.PBCRequestSerializer)
IssueViewSet = viewset_for(serializers.IssueSerializer)
AgreedSectionViewSet = viewset_for(serializers.AgreedSectionSerializer)
AgreedItemViewSet = viewset_for(serializers.AgreedItemSerializer)
DocumentSectionViewSet = viewset_for(serializers.DocumentSectionSerializer)
TimeSessionViewSet = viewset_for(serializers.TimeSessionSerializer)
TeamUpdateViewSet = viewset_for(serializers.TeamUpdateSerializer)


class ProjectViewSet(viewset_for(serializers.ProjectSerializer)):
    @transaction.atomic
    def perform_create(self, serializer):
        super().perform_create(serializer)
        seed_project(serializer.instance)

    @action(detail=True, methods=["get"])
    def attention(self, request, pk=None):
        project = self.get_object()
        today = timezone.localdate(timezone.now(), ZoneInfo("Asia/Singapore"))
        flags = []
        for item in project.work_items.exclude(status="Done"):
            if not item.end_date:
                flags.append({"kind": "missing_deadline", "id": str(item.pk), "title": item.name})
            elif item.end_date < today:
                flags.append({"kind": "overdue", "id": str(item.pk), "title": item.name, "due_date": str(item.end_date)})
            if item.start_date and (today-item.start_date).days > 7:
                flags.append({"kind": "beyond_week", "id": str(item.pk), "title": item.name})
        for update in project.team_updates.filter(update_date=today):
            for discrepancy in update.discrepancies:
                flags.append({"kind": "daily_discrepancy", "date": str(today), "detail": discrepancy})
        return Response({"date": str(today), "flags": flags})


class OpportunityViewSet(viewset_for(serializers.OpportunitySerializer)):
    @action(detail=True, methods=["post"])
    def win(self, request, pk=None):
        opportunity = self.get_object()
        allowed = {key: value for key, value in request.data.items() if key in ("name", "description", "start_date", "end_date", "milestone_date", "next_milestone")}
        # Typed date parsing precedes model clean and the transaction.
        for key in ("start_date", "end_date", "milestone_date"):
            if key in allowed:
                allowed[key] = drf_serializers.DateField(allow_null=True).run_validation(allowed[key])
        try:
            project, created = win_opportunity(opportunity, allowed)
        except ModelValidationError as exc:
            raise ValidationError(exc.message_dict)
        return Response(serializers.ProjectSerializer(project, context={"request": request}).data,
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class MeetingViewSet(viewset_for(serializers.MeetingSerializer)):
    def synchronize_activity(self, meeting):
        activity, created = models.Activity.objects.get_or_create(workspace=meeting.workspace, meeting=meeting,
            defaults={"title": meeting.title, "project": meeting.project, "opportunity": meeting.opportunity,
                      "category": "client_meeting" if meeting.kind == "client" else "internal_meeting",
                      "estimated_minutes": meeting.duration_minutes})
        if not created:
            activity.title = meeting.title
            activity.project = meeting.project
            activity.opportunity = meeting.opportunity
            activity.category = "client_meeting" if meeting.kind == "client" else "internal_meeting"
            activity.estimated_minutes = meeting.duration_minutes
            activity.save()
        block = activity.blocks.first()
        if block:
            block.starts_at, block.ends_at, block.pinned = meeting.starts_at, meeting.starts_at + timedelta(minutes=meeting.duration_minutes), True
            block.save()
        else:
            models.ScheduleBlock.objects.create(workspace=meeting.workspace, activity=activity, starts_at=meeting.starts_at,
                                               ends_at=meeting.starts_at+timedelta(minutes=meeting.duration_minutes), pinned=True)

    @transaction.atomic
    def perform_create(self, serializer):
        super().perform_create(serializer)
        self.synchronize_activity(serializer.instance)

    @transaction.atomic
    def perform_update(self, serializer):
        super().perform_update(serializer)
        self.synchronize_activity(serializer.instance)


class DecisionViewSet(viewset_for(serializers.DecisionSerializer)):
    def synchronize_confirmation(self, decision):
        ensure_scope_followup(decision)

    @transaction.atomic
    def perform_create(self, serializer):
        super().perform_create(serializer)
        self.synchronize_confirmation(serializer.instance)

    @transaction.atomic
    def perform_update(self, serializer):
        super().perform_update(serializer)
        self.synchronize_confirmation(serializer.instance)


class DocumentViewSet(viewset_for(serializers.DocumentSerializer)):
    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        document = self.get_object()
        try:
            file = document.file.open("rb")
        except (FileNotFoundError, OSError):
            return Response({"detail": "The file is unavailable. Restore it from backup or upload a new version."}, status=404)
        response = FileResponse(file, as_attachment=True, filename=PurePath(document.original_name).name,
                                content_type="application/octet-stream")
        response["X-Content-Type-Options"] = "nosniff"
        response["Cache-Control"] = "private, no-store"
        return response


class ActivityViewSet(viewset_for(serializers.ActivitySerializer)):
    def do_timer(self, request, action_name):
        activity = timer_action(self.get_object(), action_name)
        return Response(self.get_serializer(activity).data)

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        return self.do_timer(request, "start")

    @action(detail=True, methods=["post"])
    def pause(self, request, pk=None):
        return self.do_timer(request, "pause")

    @action(detail=True, methods=["post"])
    def finish(self, request, pk=None):
        return self.do_timer(request, "finish")


class ScheduleBlockViewSet(viewset_for(serializers.ScheduleBlockSerializer)):
    @action(detail=True, methods=["post"])
    @transaction.atomic
    def swap(self, request, pk=None):
        self.lock_workspace()
        source = self.get_object()
        try:
            target = models.ScheduleBlock.objects.filter(workspace=request.user).get(pk=request.data.get("target"))
        except (models.ScheduleBlock.DoesNotExist, ModelValidationError, ValueError):
            raise ValidationError({"target": "Select another scheduled block."})
        if source.pk == target.pk:
            return Response(self.get_serializer(source).data)
        source_duration, target_duration = source.ends_at-source.starts_at, target.ends_at-target.starts_at
        source_before, target_before = snapshot(source), snapshot(target)
        source.starts_at, target.starts_at = target.starts_at, source.starts_at
        source.ends_at, target.ends_at = source.starts_at+source_duration, target.starts_at+target_duration
        if source.starts_at < target.ends_at and target.starts_at < source.ends_at:
            raise ValidationError({"detail": "These durations do not fit when swapped. Choose a larger free span."})
        others = models.ScheduleBlock.objects.filter(workspace=request.user).exclude(pk__in=[source.pk,target.pk])
        if any(others.filter(starts_at__lt=block.ends_at, ends_at__gt=block.starts_at).exists() for block in (source,target)):
            raise ValidationError({"detail": "The swap would overlap another block. No times were changed."})
        for block, before in ((source,source_before),(target,target_before)):
            block.pinned = True
            block.save()
            if block.activity.meeting_id:
                meeting = block.activity.meeting
                meeting_before = snapshot(meeting)
                meeting.starts_at = block.starts_at
                meeting.save()
                record_event(request.user, meeting, "rescheduled", meeting_before, reason="User swapped calendar blocks.")
            record_event(request.user, block, "swapped", before, reason="User swapped calendar blocks; deadlines unchanged.")
        return Response(self.get_serializer([source,target], many=True).data)


class AuditEventViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = serializers.AuditEventSerializer

    def get_queryset(self):
        queryset = models.AuditEvent.objects.filter(workspace=self.request.user)
        for key in ("target_id", "target_type"):
            if self.request.query_params.get(key):
                queryset = queryset.filter(**{key: self.request.query_params[key]})
        return queryset


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def time_report(request):
    zone = ZoneInfo("Asia/Singapore")
    today = timezone.localdate(timezone.now(), zone)
    try:
        start_date = drf_serializers.DateField().run_validation(request.query_params.get("start", str(today-timedelta(days=today.weekday()))))
        end_date = drf_serializers.DateField().run_validation(request.query_params.get("end", str(today)))
    except drf_serializers.ValidationError:
        raise ValidationError({"detail": "Use dates in YYYY-MM-DD format."})
    if end_date < start_date:
        raise ValidationError({"end": "End date must be on or after start date."})
    start = datetime.combine(start_date, datetime.min.time(), zone)
    end = datetime.combine(end_date+timedelta(days=1), datetime.min.time(), zone)
    return Response({"start": str(start_date), "end": str(end_date), **work_summary(request.user,start,end)})
