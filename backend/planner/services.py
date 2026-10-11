from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from . import models
from .audit import record_event, snapshot


DEFAULT_AGREED_SECTIONS = ["Scope & deliverables", "Functionality", "Screens & user experience", "Data & integrations", "Access & permissions", "Testing & acceptance", "Deployment & handover", "Responsibilities & dependencies"]
DEFAULT_DOCUMENT_SECTIONS = ["Engagement & scope", "Requirements & FSD", "Design & technical", "Client-provided documents", "Meeting records", "Testing & acceptance", "Deployment & handover", "Other documents"]


def ensure_scope_followup(decision):
    """Discussion alone is not client confirmation; keep one actionable reminder."""
    if decision.status != 'discussed' or not decision.is_scope_change:
        return None
    followup, created = models.FollowUp.objects.get_or_create(workspace=decision.workspace, decision=decision,
        defaults={'meeting': decision.meeting, 'project': decision.meeting.project,
                  'opportunity': decision.meeting.opportunity, 'title': 'Confirm scope change: ' + decision.text[:150],
                  'kind': 'Clarification', 'client_key': 'scope-' + decision.client_key})
    if created:
        record_event(decision.workspace, followup, 'created', reason='Scope change awaits explicit confirmation.')
    return followup


def seed_project(project):
    if not project.agreed_sections.exists():
        models.AgreedSection.objects.bulk_create([models.AgreedSection(workspace=project.workspace, project=project, name=name, position=i) for i, name in enumerate(DEFAULT_AGREED_SECTIONS)])
    if not project.document_sections.exists():
        models.DocumentSection.objects.bulk_create([models.DocumentSection(workspace=project.workspace, project=project, name=name, position=i) for i, name in enumerate(DEFAULT_DOCUMENT_SECTIONS)])


@transaction.atomic
def win_opportunity(opportunity, project_data=None):
    from django.contrib.auth import get_user_model
    get_user_model().objects.select_for_update().get(pk=opportunity.workspace_id)
    opportunity = models.Opportunity.objects.select_for_update().get(pk=opportunity.pk, workspace=opportunity.workspace)
    existing = models.Project.objects.filter(opportunity=opportunity).first()
    if existing:
        return existing, False
    values = project_data or {}
    project = models.Project(workspace=opportunity.workspace, opportunity=opportunity,
                             name=values.get("name") or opportunity.name,
                             description=values.get("description", opportunity.description),
                             start_date=values.get("start_date"), end_date=values.get("end_date"),
                             milestone_date=values.get("milestone_date"), next_milestone=values.get("next_milestone", ""),
                             notes=opportunity.notes)
    project.full_clean(validate_unique=False, validate_constraints=False)
    project.save()
    project.clients.add(opportunity.client)
    seed_project(project)
    before = snapshot(opportunity)
    opportunity.stage = "Won"
    opportunity.save()
    # Records remain linked to their original opportunity while joining delivery.
    models.Meeting.objects.filter(opportunity=opportunity, project__isnull=True).update(project=project)
    models.FollowUp.objects.filter(opportunity=opportunity, project__isnull=True).update(project=project)
    record_event(opportunity.workspace, opportunity, "won", before, reason="Opportunity won; project created.")
    record_event(opportunity.workspace, project, "created", reason="Created from won opportunity.")
    return project, True


@transaction.atomic
def timer_action(activity, action):
    # Serialize timer changes for a workspace, not merely for one activity.
    from django.contrib.auth import get_user_model
    get_user_model().objects.select_for_update().get(pk=activity.workspace_id)
    activity = models.Activity.objects.select_for_update().get(pk=activity.pk)
    running = models.TimeSession.objects.filter(workspace=activity.workspace, activity=activity, ends_at__isnull=True).first()
    now = timezone.now()
    before = snapshot(activity)
    if action == "start":
        if activity.status == "done":
            raise ValidationError({"detail": "Reopen the completed task before starting it."})
        if activity.category not in ("client_meeting", "internal_meeting"):
            another_task = models.TimeSession.objects.filter(workspace=activity.workspace, ends_at__isnull=True).exclude(activity=activity).exclude(activity__category__in=["client_meeting", "internal_meeting"]).first()
            if another_task:
                raise ValidationError({"detail": "Pause the current task before starting another.", "running_activity": str(another_task.activity_id)})
        if not running:
            running = models.TimeSession.objects.create(workspace=activity.workspace, activity=activity, starts_at=now)
            record_event(activity.workspace, running, "started")
        activity.status = "running"
    else:
        if running and running.activity_id == activity.pk:
            session_before = snapshot(running)
            running.ends_at = now
            running.save()
            record_event(activity.workspace, running, action, session_before)
        activity.status = "done" if action == "finish" else ("done" if activity.status == "done" else "paused")
    activity.save()
    record_event(activity.workspace, activity, action, before)
    return activity


def merged_intervals(intervals):
    merged = []
    for start, end in sorted(intervals):
        if end <= start:
            continue
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
        else:
            merged.append((start, end))
    return merged


def work_summary(user, start, end):
    """Union task and meeting intervals, then intersect with Singapore normal hours."""
    now = timezone.now()
    end = min(end, now)
    intervals = []
    by_activity = []
    sessions = models.TimeSession.objects.filter(workspace=user, starts_at__lt=end).filter(models.Q(ends_at__gte=start) | models.Q(ends_at__isnull=True))
    for session in sessions.select_related("activity__meeting"):
        if session.activity.meeting_id and session.activity.meeting.actual_start and session.activity.meeting.actual_end:
            continue  # An explicit correction replaces that meeting's timer intervals.
        lo, hi = max(start, session.starts_at), min(end, session.ends_at or now)
        if hi > lo:
            intervals.append((lo, hi))
            by_activity.append({"id": str(session.activity_id), "title": session.activity.title, "seconds": int((hi-lo).total_seconds()), "source": "recorded_session"})
    for meeting in models.Meeting.objects.filter(workspace=user).filter(models.Q(starts_at__lt=end) | models.Q(actual_start__lt=end)):
        corrected = meeting.actual_start is not None and meeting.actual_end is not None
        if not corrected:
            if models.TimeSession.objects.filter(workspace=user, activity__meeting=meeting).exists():
                continue  # Recorded meeting sessions replace its scheduled estimate.
            if meeting.metadata.get('time') == '':
                continue  # A minutes draft without a time is not a scheduled call.
        lo = meeting.actual_start or meeting.starts_at
        hi = meeting.actual_end or lo + timedelta(minutes=meeting.duration_minutes)
        lo, hi = max(start, lo), min(end, hi)
        if hi > lo:
            intervals.append((lo, hi))
            by_activity.append({"meeting_id": str(meeting.pk), "title": meeting.title, "seconds": int((hi-lo).total_seconds()),
                                "source": "corrected_meeting" if meeting.actual_start and meeting.actual_end else "scheduled_meeting_estimate"})
    intervals = merged_intervals(intervals)
    total = sum((hi-lo).total_seconds() for lo, hi in intervals)
    zone = ZoneInfo("Asia/Singapore")
    regular = 0
    for lo, hi in intervals:
        day = lo.astimezone(zone).date()
        last = hi.astimezone(zone).date()
        while day <= last:
            if day.weekday() < 5:
                normal_start = datetime.combine(day, time(8,45), zone)
                normal_end = datetime.combine(day, time(18), zone)
                regular += max(0, (min(hi,normal_end)-max(lo,normal_start)).total_seconds())
            day += timedelta(days=1)
    return {"total_seconds": int(total), "normal_seconds": int(regular), "overtime_seconds": int(total-regular), "entries": by_activity,
            "timezone": "Asia/Singapore", "overlap_policy": "Overlapping work is counted once in totals."}
