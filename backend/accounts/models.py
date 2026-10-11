import uuid
from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    deleted_at = models.DateTimeField(null=True, blank=True, editable=False)
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

class ExternalIdentity(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    tenant_id = models.UUIDField()
    object_id = models.UUIDField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['tenant_id', 'object_id'], name='accounts_external_identity_unique')]
