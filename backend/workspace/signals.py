"""Invalidate stale browser snapshots when any canonical record changes."""
from contextvars import ContextVar
from django.db.models import F
from django.db.models.signals import post_save, post_delete, m2m_changed
from django.dispatch import receiver
from .models import WorkspaceState

aggregating = ContextVar('aggregating', default=False)


def bump(user_id):
    if aggregating.get() or not user_id:
        return
    state, _ = WorkspaceState.objects.get_or_create(user_id=user_id)
    WorkspaceState.objects.filter(pk=state.pk).update(revision=F('revision') + 1)


@receiver(post_save)
@receiver(post_delete)
def record_changed(sender, instance, **kwargs):
    if sender._meta.app_label == 'planner' and sender._meta.model_name not in {'auditevent', 'referencesequence'}:
        bump(getattr(instance, 'workspace_id', None))


@receiver(m2m_changed)
def relation_changed(sender, instance, action, **kwargs):
    if action.startswith('post_') and instance._meta.app_label == 'planner':
        bump(getattr(instance, 'workspace_id', None))
