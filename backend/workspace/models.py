from django.conf import settings
from django.db import models


class WorkspaceState(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, primary_key=True)
    revision = models.PositiveBigIntegerField(default=0)
    preferences = models.JSONField(default=dict)
