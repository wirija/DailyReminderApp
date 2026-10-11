"""Workspace-owned planner records; identity is independent of display names."""
import uuid
import re
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models, transaction
from django.db.models import Q
from django.utils import timezone


WORK_STATES = [(x, x) for x in ("Not started", "In progress", "Blocked", "Awaiting my review", "Awaiting client", "Done")]
ACTION_STATES = [(x, x) for x in ("Open", "In progress", "Waiting", "Done")]
HEALTH_STATES = [(x, x) for x in ("On track", "Needs attention", "At risk", "On hold", "Completed")]
OPPORTUNITY_STAGES = [(x, x) for x in ("Contact", "Schedule meeting", "Call", "Walkthrough", "Proposal", "Proposal follow-up", "Won", "Lost")]


class OwnedRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    client_key = models.CharField(max_length=120, blank=True, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self.client_key:
            if self._meta.model_name in ("client", "opportunity"):
                candidate = str(self.pk.int % (2**48))
                while type(self).objects.filter(workspace_id=self.workspace_id, client_key=candidate).exclude(pk=self.pk).exists():
                    candidate = str(uuid.uuid4().int % (2**48))
                self.client_key = candidate
            else:
                self.client_key = str(self.pk)
            if kwargs.get("update_fields") is not None:
                kwargs["update_fields"] = set(kwargs["update_fields"]) | {"client_key"}
        return super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        errors = {}
        for field in self._meta.fields:
            if isinstance(field, models.ForeignKey) and field.name != "workspace" and getattr(self, field.attname, None):
                related = getattr(self, field.name)
                if hasattr(related, "workspace_id") and related.workspace_id != self.workspace_id:
                    errors[field.name] = "Select a record in your workspace."
        if errors:
            raise ValidationError(errors)


class ReferenceSequence(models.Model):
    workspace = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    kind = models.CharField(max_length=16)
    namespace = models.CharField(max_length=40, default="")
    value = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["workspace", "kind", "namespace"], name="planner_sequence_unique")]


def next_reference(workspace_id, prefix, namespace=""):
    # Lock an existing row, including when the sequence is being created for the first time.
    from django.contrib.auth import get_user_model
    with transaction.atomic():
        get_user_model().objects.select_for_update().get(pk=workspace_id)
        sequence, _ = ReferenceSequence.objects.get_or_create(workspace_id=workspace_id, kind=prefix, namespace=str(namespace))
        sequence.value += 1
        sequence.save(update_fields=["value"])
        return f"{prefix}-{sequence.value:03d}"


class ReferencedRecord(OwnedRecord):
    reference = models.CharField(max_length=40, blank=True)
    reference_prefix = "REC"

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        namespace = (getattr(self, "project_id", "") or getattr(self, "opportunity_id", "") or "") if self.reference_prefix in ("PBC", "ISS") else ""
        if not self.reference:
            self.reference = next_reference(self.workspace_id, self.reference_prefix, namespace)
        else:
            match = re.fullmatch(re.escape(self.reference_prefix) + r"-(\d+)", self.reference)
            if match:
                from django.contrib.auth import get_user_model
                with transaction.atomic():
                    get_user_model().objects.select_for_update().get(pk=self.workspace_id)
                    sequence, _ = ReferenceSequence.objects.get_or_create(workspace_id=self.workspace_id, kind=self.reference_prefix, namespace=str(namespace))
                    if sequence.value < int(match.group(1)):
                        sequence.value = int(match.group(1))
                        sequence.save(update_fields=["value"])
        return super().save(*args, **kwargs)


def date_range(start, end, field="end_date"):
    if start and end and end < start:
        raise ValidationError({field: "End date must be on or after start date."})


class Client(OwnedRecord):
    name = models.CharField(max_length=200)
    contact_name = models.CharField(max_length=160, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=80, blank=True)
    notes = models.TextField(blank=True)
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class TeamMember(OwnedRecord):
    name = models.CharField(max_length=160)
    team = models.CharField(max_length=100, blank=True)
    email = models.EmailField(blank=True)
    role = models.CharField(max_length=100, blank=True)
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class Opportunity(ReferencedRecord):
    reference_prefix = "OPP"
    client = models.ForeignKey(Client, on_delete=models.PROTECT, related_name="opportunities")
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    stage = models.CharField(max_length=32, choices=OPPORTUNITY_STAGES, default="Contact")
    proposal = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    lost_reason = models.TextField(blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["workspace", "reference"], name="planner_opportunity_reference")]


class Project(ReferencedRecord):
    reference_prefix = "PRJ"
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    clients = models.ManyToManyField(Client, related_name="projects", blank=True)
    opportunity = models.OneToOneField(Opportunity, on_delete=models.PROTECT, related_name="project", null=True, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    health = models.CharField(max_length=32, choices=HEALTH_STATES, default="On track")
    status = models.CharField(max_length=32, choices=WORK_STATES, default="Not started")
    notes = models.TextField(blank=True)
    next_milestone = models.CharField(max_length=200, blank=True)
    milestone_date = models.DateField(null=True, blank=True)
    teams_channel = models.CharField(max_length=500, blank=True)
    archived = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["workspace", "reference"], name="planner_project_reference")]

    def clean(self):
        super().clean()
        date_range(self.start_date, self.end_date)

    def __str__(self):
        return self.name


class Milestone(OwnedRecord):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="milestones")
    name = models.CharField(max_length=200)
    due_date = models.DateField()
    completed = models.BooleanField(default=False)
    notes = models.TextField(blank=True)


class Phase(OwnedRecord):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="phases")
    name = models.CharField(max_length=200)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=32, choices=WORK_STATES, default="Not started")
    owners = models.ManyToManyField(TeamMember, blank=True, related_name="phases")
    notes = models.TextField(blank=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "created_at"]

    def clean(self):
        super().clean()
        date_range(self.start_date, self.end_date)
        if not self._state.adding and self.work_items.exclude(project_id=self.project_id).exists():
            raise ValidationError({"project": "A phase containing work cannot be moved to another project."})


class WorkItem(OwnedRecord):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="work_items")
    phase = models.ForeignKey(Phase, on_delete=models.CASCADE, related_name="work_items")
    parent = models.ForeignKey("self", on_delete=models.CASCADE, null=True, blank=True, related_name="subtasks")
    kind = models.CharField(max_length=12, choices=[("task", "Task"), ("subtask", "Subtask")], default="task")
    name = models.CharField(max_length=200)
    status = models.CharField(max_length=32, choices=WORK_STATES, default="Not started")
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    estimated_hours = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(Decimal("0.25"))])
    owners = models.ManyToManyField(TeamMember, blank=True, related_name="work_items")
    notes = models.TextField(blank=True)
    position = models.PositiveIntegerField(default=0)
    progress = models.PositiveSmallIntegerField(default=0, validators=[MaxValueValidator(100)])

    class Meta:
        ordering = ["position", "created_at"]

    def clean(self):
        super().clean()
        date_range(self.start_date, self.end_date)
        if self.phase_id and self.phase.project_id != self.project_id:
            raise ValidationError({"phase": "The phase must belong to this project."})
        if self.kind == "subtask" and not self.parent_id:
            raise ValidationError({"parent": "Select the task responsible for this subtask."})
        if self.parent_id:
            if self.parent_id == self.pk or self.parent.parent_id or self.parent.kind != "task":
                raise ValidationError({"parent": "Subtasks must belong directly to a task."})
            if self.kind != "subtask" or self.parent.project_id != self.project_id or self.parent.phase_id != self.phase_id:
                raise ValidationError({"parent": "Select a parent task in the same project and phase."})
        if self.pk and not self._state.adding:
            if self.subtasks.exists() and (self.kind != "task" or self.parent_id):
                raise ValidationError({"kind": "A task with subtasks must remain a parent task."})
            if self.subtasks.exclude(phase_id=self.phase_id, project_id=self.project_id).exists():
                raise ValidationError({"phase": "Move or remove the subtasks before moving their parent task."})


class Meeting(OwnedRecord):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, null=True, blank=True, related_name="meetings")
    opportunity = models.ForeignKey(Opportunity, on_delete=models.CASCADE, null=True, blank=True, related_name="meetings")
    title = models.CharField(max_length=200)
    starts_at = models.DateTimeField()
    duration_minutes = models.PositiveIntegerField(default=60, validators=[MinValueValidator(1), MaxValueValidator(1440)])
    actual_start = models.DateTimeField(null=True, blank=True)
    actual_end = models.DateTimeField(null=True, blank=True)
    kind = models.CharField(max_length=16, choices=[("client", "Client meeting"), ("internal", "Internal meeting")], default="client")
    location = models.CharField(max_length=300, blank=True)
    notes = models.TextField(blank=True)
    transcript = models.TextField(blank=True)
    summary = models.TextField(blank=True)
    draft_summary = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=[("draft", "Draft"), ("final", "Final")], default="draft")
    extra = models.JSONField(default=dict, blank=True)

    def clean(self):
        super().clean()
        date_range(self.actual_start, self.actual_end, "actual_end")
        if self.actual_end and not self.actual_start:
            raise ValidationError({"actual_start": "Enter the actual start alongside the actual end."})


class Attendee(OwnedRecord):
    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name="attendees")
    name = models.CharField(max_length=160)
    organisation = models.CharField(max_length=160, blank=True)
    role = models.CharField(max_length=100, blank=True)
    email = models.EmailField(blank=True)
    attendance = models.CharField(max_length=24, choices=[(x, x) for x in ("Not recorded", "Expected", "Invited", "Attended", "Absent", "Optional")], default="Not recorded")
    team_member = models.ForeignKey(TeamMember, null=True, blank=True, on_delete=models.SET_NULL)


class Decision(OwnedRecord):
    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name="decisions")
    text = models.TextField()
    status = models.CharField(max_length=24, choices=[("discussed", "Discussed / unconfirmed"), ("confirmed", "Confirmed")], default="discussed")
    agreed_with = models.CharField(max_length=200, blank=True)
    decided_on = models.DateField(null=True, blank=True)
    evidence = models.JSONField(default=dict, blank=True)
    is_scope_change = models.BooleanField(default=False)


class NextAction(OwnedRecord):
    opportunity = models.ForeignKey(Opportunity, on_delete=models.CASCADE, related_name="next_actions")
    title = models.CharField(max_length=200)
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=24, choices=ACTION_STATES, default="Open")
    owner_name = models.CharField(max_length=160, blank=True)
    notes = models.TextField(blank=True)
    email_draft = models.TextField(blank=True)


class FollowUp(OwnedRecord):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, null=True, blank=True, related_name="follow_ups")
    opportunity = models.ForeignKey(Opportunity, on_delete=models.CASCADE, null=True, blank=True, related_name="follow_ups")
    meeting = models.ForeignKey(Meeting, on_delete=models.SET_NULL, null=True, blank=True, related_name="follow_ups")
    decision = models.ForeignKey(Decision, on_delete=models.SET_NULL, null=True, blank=True, related_name="follow_ups")
    title = models.CharField(max_length=200)
    kind = models.CharField(max_length=24, choices=[("Action", "Action"), ("Clarification", "Clarification")], default="Action")
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=24, choices=ACTION_STATES, default="Open")
    owner_name = models.CharField(max_length=160, blank=True)
    notes = models.TextField(blank=True)
    email_draft = models.TextField(blank=True)
    last_followed_up_at = models.DateTimeField(null=True, blank=True)


class PBCRequest(ReferencedRecord):
    reference_prefix = "PBC"
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="pbc_requests", null=True, blank=True)
    opportunity = models.ForeignKey(Opportunity, on_delete=models.CASCADE, related_name="pbc_requests", null=True, blank=True)
    meeting = models.ForeignKey(Meeting, on_delete=models.SET_NULL, null=True, blank=True, related_name="pbc_requests")
    request = models.CharField(max_length=500)
    owner_name = models.CharField(max_length=160, blank=True)
    request_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=24, choices=ACTION_STATES, default="Open")
    comment = models.TextField(blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["project", "reference"], name="planner_pbc_reference"),
                       models.UniqueConstraint(fields=["opportunity", "reference"], condition=Q(project__isnull=True), name="planner_opportunity_pbc_reference")]

    def clean(self):
        super().clean()
        if not self.project_id and not self.opportunity_id:
            raise ValidationError({"project": "Choose a project or opportunity for this request."})
        date_range(self.request_date, self.due_date, "due_date")


class Issue(ReferencedRecord):
    reference_prefix = "ISS"
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="issues")
    title = models.CharField(max_length=200)
    severity = models.CharField(max_length=16, choices=[(x, x) for x in ("Low", "Medium", "High", "Critical")], default="Medium")
    status = models.CharField(max_length=24, choices=[(x, x) for x in ("Open", "In progress", "Blocked", "Resolved", "Closed")], default="Open")
    owners = models.ManyToManyField(TeamMember, blank=True, related_name="issues")
    owner_text = models.CharField(max_length=500, blank=True)
    raised_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    description = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    resolution = models.TextField(blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["project", "reference"], name="planner_issue_reference")]

    def clean(self):
        super().clean()
        date_range(self.raised_date, self.due_date, "due_date")


class AgreedSection(OwnedRecord):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="agreed_sections")
    parent = models.ForeignKey("self", on_delete=models.PROTECT, null=True, blank=True, related_name="subsections")
    name = models.CharField(max_length=160)
    position = models.PositiveIntegerField(default=0)

    def clean(self):
        super().clean()
        if self.parent_id and (self.parent_id == self.pk or self.parent.parent_id or self.parent.project_id != self.project_id):
            raise ValidationError({"parent": "Choose a top-level section in this project."})
        if self.parent_id and not self._state.adding and self.subsections.exists():
            raise ValidationError({"parent": "A section with subsections must remain top-level."})


class AgreedItem(OwnedRecord):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="agreed_items")
    section = models.ForeignKey(AgreedSection, on_delete=models.PROTECT, related_name="items")
    name = models.CharField(max_length=200)
    description = models.TextField()
    agreed_on = models.DateField()
    agreed_with = models.CharField(max_length=200)
    meeting = models.ForeignKey(Meeting, on_delete=models.SET_NULL, null=True, blank=True, related_name="agreed_items")
    confirmed = models.BooleanField(default=True)

    def clean(self):
        super().clean()
        if self.section_id and self.section.project_id != self.project_id:
            raise ValidationError({"section": "Choose a section in this project."})


class DocumentSection(OwnedRecord):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="document_sections")
    name = models.CharField(max_length=160)
    position = models.PositiveIntegerField(default=0)


def document_path(instance, filename):
    # Never trust a supplied path; storage names are opaque and private.
    suffix = Path(filename).suffix.lower()[:12]
    return f"workspaces/{instance.workspace_id}/{instance.id}/{uuid.uuid4().hex}{suffix}"


class Document(OwnedRecord):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, null=True, blank=True, related_name="documents")
    meeting = models.ForeignKey(Meeting, on_delete=models.SET_NULL, null=True, blank=True, related_name="documents")
    section = models.ForeignKey(DocumentSection, on_delete=models.PROTECT, null=True, blank=True, related_name="documents")
    file = models.FileField(upload_to=document_path)
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=150, blank=True)
    size = models.PositiveBigIntegerField(default=0)
    version = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    previous_version = models.ForeignKey("self", on_delete=models.PROTECT, null=True, blank=True, related_name="versions")
    description = models.TextField(blank=True)

    def clean(self):
        super().clean()
        if self.section_id and self.section.project_id != self.project_id:
            raise ValidationError({"section": "Choose a document section in this project."})
        if self.previous_version_id and (self.previous_version_id == self.pk or self.previous_version.project_id != self.project_id):
            raise ValidationError({"previous_version": "Select an earlier document in the same project."})


class Activity(OwnedRecord):
    title = models.CharField(max_length=200)
    project = models.ForeignKey(Project, on_delete=models.SET_NULL, null=True, blank=True, related_name="activities")
    opportunity = models.ForeignKey(Opportunity, on_delete=models.SET_NULL, null=True, blank=True, related_name="activities")
    work_item = models.ForeignKey(WorkItem, on_delete=models.SET_NULL, null=True, blank=True, related_name="activities")
    meeting = models.OneToOneField(Meeting, on_delete=models.CASCADE, null=True, blank=True, related_name="activity")
    follow_up = models.ForeignKey(FollowUp, on_delete=models.SET_NULL, null=True, blank=True, related_name="activities")
    pbc = models.ForeignKey(PBCRequest, on_delete=models.SET_NULL, null=True, blank=True, related_name="activities")
    category = models.CharField(max_length=24, choices=[("client_meeting", "Client meeting"), ("internal_meeting", "Internal project meeting"), ("project_task", "Project task"), ("personal_task", "Non-project task")], default="personal_task")
    priority = models.CharField(max_length=16, choices=[("high", "High"), ("medium", "Medium"), ("low", "Low")], default="medium")
    estimated_minutes = models.PositiveIntegerField(default=30, validators=[MinValueValidator(1), MaxValueValidator(10080)])
    deadline = models.DateField(null=True, blank=True)
    planned_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=[("open", "Open"), ("running", "Running"), ("paused", "Paused"), ("done", "Done")], default="open")
    recurrence = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True)


class ScheduleBlock(OwnedRecord):
    activity = models.ForeignKey(Activity, on_delete=models.CASCADE, related_name="blocks")
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    pinned = models.BooleanField(default=False)

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(ends_at__gt=models.F("starts_at")), name="planner_block_positive")]

    def clean(self):
        super().clean()
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValidationError({"ends_at": "End must be after start."})


class TimeSession(OwnedRecord):
    activity = models.ForeignKey(Activity, on_delete=models.CASCADE, related_name="time_sessions")
    starts_at = models.DateTimeField(default=timezone.now)
    ends_at = models.DateTimeField(null=True, blank=True)
    note = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(ends_at__isnull=True) | Q(ends_at__gte=models.F("starts_at")), name="planner_session_positive"),
            models.UniqueConstraint(fields=["activity"], condition=Q(ends_at__isnull=True), name="planner_one_running_activity"),
        ]

    def clean(self):
        super().clean()
        date_range(self.starts_at, self.ends_at, "ends_at")


class TeamUpdate(OwnedRecord):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="team_updates")
    kind = models.CharField(max_length=16, choices=[("daily", "Daily update"), ("weekly", "Weekly plan")], default="daily")
    team = models.CharField(max_length=100, blank=True)
    update_date = models.DateField()
    source_text = models.TextField()
    yesterday = models.TextField(blank=True)
    today = models.TextField(blank=True)
    blockers = models.TextField(blank=True)
    summary = models.TextField(blank=True)
    proposed_changes = models.JSONField(default=list, blank=True)
    accepted = models.BooleanField(default=False)
    discrepancies = models.JSONField(default=list, blank=True)


class ImmutableAuditQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise ValidationError("Audit history cannot be changed.")

    def delete(self):
        raise ValidationError("Audit history cannot be deleted.")


class AuditEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="planner_audit_actions", null=True)
    target_type = models.CharField(max_length=100)
    target_id = models.CharField(max_length=120)
    action = models.CharField(max_length=40)
    before = models.JSONField(default=dict)
    after = models.JSONField(default=dict)
    reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    objects = ImmutableAuditQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Audit history cannot be changed.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Audit history cannot be deleted.")
