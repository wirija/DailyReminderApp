from copy import copy
from django.conf import settings
from django.core.exceptions import ValidationError as ModelValidationError
from django.db import models as db_models
from rest_framework import serializers
from . import models


class OwnedSerializer(serializers.ModelSerializer):
    change_reason = serializers.CharField(write_only=True, required=False, allow_blank=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        user = getattr(self.context.get("request"), "user", None)
        for field in self.fields.values():
            relation = field.child_relation if isinstance(field, serializers.ManyRelatedField) else field
            if isinstance(relation, serializers.PrimaryKeyRelatedField) and relation.queryset is not None:
                if hasattr(relation.queryset.model, "workspace"):
                    relation.queryset = relation.queryset.filter(workspace=user) if user and user.is_authenticated else relation.queryset.none()

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = copy(self.instance) if self.instance else self.Meta.model()
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            instance.workspace = request.user
        reason = attrs.get("change_reason", "").strip()
        changed_dates = []
        for field in self.Meta.model._meta.fields:
            if field.name in attrs:
                if self.instance and field.name in ("start_date", "end_date", "due_date", "deadline", "milestone_date", "request_date", "raised_date", "agreed_on") and getattr(self.instance, field.name) != attrs[field.name]:
                    changed_dates.append(field.name)
                setattr(instance, field.name, attrs[field.name])
        if changed_dates and not reason:
            raise serializers.ValidationError({"change_reason": "Explain the date change so the original agreement remains accountable."})
        try:
            instance.full_clean(validate_unique=False, validate_constraints=False, exclude=["file"] if isinstance(instance, models.Document) and not instance.file else [])
        except ModelValidationError as exc:
            raise serializers.ValidationError(exc.message_dict if hasattr(exc, "message_dict") else {"detail": exc.messages})
        # Validate context even when two references belong to the same user.
        project = getattr(instance, "project", None)
        meeting = getattr(instance, "meeting", None)
        if project and meeting and meeting.project_id and meeting.project_id != project.pk:
            raise serializers.ValidationError({"meeting": "The meeting belongs to another project."})
        return attrs

    def create(self, validated_data):
        validated_data.pop("change_reason", None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("change_reason", None)
        return super().update(instance, validated_data)


def serializer_for(model):
    return type(model.__name__ + "Serializer", (OwnedSerializer,), {
        "Meta": type("Meta", (), {"model": model, "fields": "__all__", "read_only_fields": ("id", "workspace", "created_at", "updated_at", "reference")})
    })


ClientSerializer = serializer_for(models.Client)
TeamMemberSerializer = serializer_for(models.TeamMember)
class ProjectSerializer(serializer_for(models.Project)):
    class Meta(serializer_for(models.Project).Meta):
        read_only_fields = serializer_for(models.Project).Meta.read_only_fields + ("opportunity",)

PhaseSerializer = serializer_for(models.Phase)
WorkItemSerializer = serializer_for(models.WorkItem)
MilestoneSerializer = serializer_for(models.Milestone)
NextActionSerializer = serializer_for(models.NextAction)
MeetingSerializer = serializer_for(models.Meeting)
AttendeeSerializer = serializer_for(models.Attendee)
DecisionSerializer = serializer_for(models.Decision)
FollowUpSerializer = serializer_for(models.FollowUp)
PBCRequestSerializer = serializer_for(models.PBCRequest)
IssueSerializer = serializer_for(models.Issue)
AgreedSectionSerializer = serializer_for(models.AgreedSection)
AgreedItemSerializer = serializer_for(models.AgreedItem)
DocumentSectionSerializer = serializer_for(models.DocumentSection)
ScheduleBlockSerializer = serializer_for(models.ScheduleBlock)
TeamUpdateSerializer = serializer_for(models.TeamUpdate)


class OpportunitySerializer(serializer_for(models.Opportunity)):
    project_id = serializers.UUIDField(source="project.id", read_only=True, default=None)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if attrs.get("stage") == "Won" and (not self.instance or self.instance.stage != "Won"):
            raise serializers.ValidationError({"stage": "Use the win action to create the project and retain the handover."})
        if self.instance and hasattr(self.instance, "project") and attrs.get("stage", "Won") != "Won":
            raise serializers.ValidationError({"stage": "This opportunity has already become a project."})
        return attrs


class ActivitySerializer(serializer_for(models.Activity)):
    def validate(self, attrs):
        attrs = super().validate(attrs)
        if "status" in attrs and attrs["status"] == "running" and (not self.instance or self.instance.status != "running"):
            raise serializers.ValidationError({"status": "Use Start to create an accountable time session."})
        if self.instance and self.instance.status == "running" and "status" in attrs and attrs["status"] != "running":
            raise serializers.ValidationError({"status": "Use Pause or Finish to close the running time session."})
        return attrs


class TimeSessionSerializer(serializer_for(models.TimeSession)):
    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not attrs.get("ends_at", self.instance.ends_at if self.instance else None):
            raise serializers.ValidationError({"ends_at": "Manual time entries need an end. Use Start for a running timer."})
        return attrs


class DocumentSerializer(serializer_for(models.Document)):
    download_url = serializers.SerializerMethodField()

    def get_download_url(self, obj):
        return f"/api/documents/{obj.pk}/download/"

    def get_fields(self):
        fields = super().get_fields()
        fields["file"].write_only = True
        fields["size"].read_only = True
        fields["content_type"].read_only = True
        fields["original_name"].required = False
        return fields

    def validate_file(self, value):
        if value.size > getattr(settings, "MAX_DOCUMENT_SIZE", 20 * 1024 * 1024):
            raise serializers.ValidationError("This file exceeds the document upload limit (20 MiB by default).")
        if not value.size:
            raise serializers.ValidationError("The uploaded file is empty.")
        if self.instance:
            raise serializers.ValidationError("Upload a new version to preserve the original evidence.")
        return value

    def validate(self, attrs):
        file = attrs.get("file")
        if file:
            from pathlib import PurePath
            attrs["original_name"] = PurePath(file.name).name[:255]
            attrs["content_type"] = getattr(file, "content_type", "application/octet-stream")[:150]
            attrs["size"] = file.size
            previous = attrs.get("previous_version")
            if previous:
                attrs["version"] = previous.version + 1
        return super().validate(attrs)


class AuditEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.AuditEvent
        fields = "__all__"
        read_only_fields = [field.name for field in models.AuditEvent._meta.fields]
