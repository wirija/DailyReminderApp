"""Append-only application audit events, including deleted record snapshots."""
import json
from django.core.serializers.json import DjangoJSONEncoder
from .models import AuditEvent


def json_value(value):
    return json.loads(json.dumps(value, cls=DjangoJSONEncoder))


def snapshot(instance):
    values = {}
    for field in instance._meta.fields:
        if field.name in ("workspace",):
            continue
        value = getattr(instance, field.attname)
        if field.get_internal_type() == "FileField":
            value = value.name
        values[field.name] = value
    if not instance._state.adding:
        for field in instance._meta.many_to_many:
            values[field.name] = [str(pk) for pk in getattr(instance, field.name).values_list("pk", flat=True)]
    return json_value(values)


def record_event(workspace, instance, action, before=None, after=None, reason="", actor=None):
    return AuditEvent.objects.create(
        workspace=workspace, actor=actor or workspace,
        target_type=instance._meta.label_lower, target_id=str(instance.pk), action=action,
        before=json_value(before or {}), after=json_value(after if after is not None else snapshot(instance)), reason=reason,
    )
