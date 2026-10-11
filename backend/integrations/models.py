import uuid

from django.conf import settings
from django.db import models

from .secrets import decrypt, encrypt


class Connection(models.Model):
    class Provider(models.TextChoices):
        GITLAB = "gitlab", "GitLab"
        JIRA = "jira", "Jira"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    project = models.ForeignKey("planner.Project", on_delete=models.CASCADE, related_name="connections")
    name = models.CharField(max_length=150)
    provider = models.CharField(max_length=16, choices=Provider.choices)
    base_url = models.URLField(max_length=500)
    resource = models.CharField(max_length=300, help_text="GitLab repository path/ID or Jira board ID")
    username = models.CharField(max_length=254, blank=True, help_text="Jira Cloud account email; blank for bearer auth")
    encrypted_token = models.TextField(blank=True)
    enabled = models.BooleanField(default=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def set_token(self, value):
        self.encrypted_token = encrypt(value)

    def get_token(self):
        return decrypt(self.encrypted_token)


class RemoteIssue(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    connection = models.ForeignKey(Connection, on_delete=models.CASCADE, related_name="issues")
    external_id = models.CharField(max_length=100)
    key = models.CharField(max_length=100)
    title = models.CharField(max_length=1000)
    status = models.CharField(max_length=150)
    assignees = models.JSONField(default=list)
    due_date = models.DateField(null=True, blank=True)
    url = models.URLField(max_length=1000, blank=True)
    source_updated_at = models.CharField(max_length=100, blank=True)
    imported_at = models.DateTimeField(auto_now=True)
    raw = models.JSONField(default=dict)
    active = models.BooleanField(default=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["connection", "external_id"], name="unique_connection_remote_issue")]
        ordering = ["key"]


class RemoteSnapshot(models.Model):
    """Immutable evidence of changes; flags themselves are limited to the current day."""
    issue = models.ForeignKey(RemoteIssue, on_delete=models.CASCADE, related_name="snapshots")
    captured_at = models.DateTimeField(auto_now_add=True)
    data = models.JSONField(default=dict)


class IntegrationJob(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    connection = models.ForeignKey(Connection, null=True, blank=True, on_delete=models.SET_NULL)
    project = models.ForeignKey("planner.Project", null=True, blank=True, on_delete=models.SET_NULL)
    kind = models.CharField(max_length=30)
    status = models.CharField(max_length=20, default="queued", choices=[(s, s) for s in ["queued", "running", "completed", "failed"]])
    result = models.JSONField(default=dict)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)


class AIDraft(models.Model):
    """AI output is a separate draft and cannot silently change project records."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    project = models.ForeignKey("planner.Project", null=True, blank=True, on_delete=models.SET_NULL)
    meeting = models.ForeignKey("planner.Meeting", null=True, blank=True, on_delete=models.SET_NULL)
    kind = models.CharField(max_length=30)
    provider = models.CharField(max_length=16, choices=[("ollama", "Ollama"), ("cloud", "Cloud")], default="ollama")
    source_text = models.TextField()
    content = models.TextField(blank=True)
    structured = models.JSONField(default=dict)
    status = models.CharField(max_length=20, default="draft", choices=[("draft", "Draft"), ("accepted", "Accepted"), ("rejected", "Rejected")])
    created_at = models.DateTimeField(auto_now_add=True)
