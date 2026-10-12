"""Translate the existing browser workspace into canonical, queryable records.

The browser never owns the database: writes are revision-checked transactions and
reads reconstruct current records, including changes made by imports and admin.
Metadata retains UI-specific descriptions/history without becoming a second store
for the authoritative dates, assignments, relations, files or work status.
"""
from datetime import date, datetime, time, timedelta, timezone as dt_timezone
from decimal import Decimal
from zoneinfo import ZoneInfo
from django.core.exceptions import ValidationError
from django.db.models import Q
from django.utils import timezone
from planner import models as m
from planner.audit import snapshot, record_event
from planner.services import ensure_scope_followup
from .signals import aggregating

ZONE = ZoneInfo('Asia/Singapore')
HEALTH = {'healthy': 'On track', 'attention': 'Needs attention', 'risk': 'At risk'}
TASK_STATUS = {'Ready': 'open', 'In progress': 'running', 'Paused': 'paused', 'Completed': 'done'}


def parsedate(value):
    if not value:
        return None
    if isinstance(value, date):
        return value
    for fmt in ('%Y-%m-%d', '%d %b %Y', '%d %B %Y'):
        try:
            return datetime.strptime(str(value), fmt).date()
        except ValueError:
            pass
    raise ValidationError(f'Invalid date: {value}. Use YYYY-MM-DD.')


def iso(value):
    return value.isoformat() if value else ''


def pretty(value):
    return value.strftime('%d %b %Y') if value else ''


def visible_documents(queryset):
    # JSON key absence is SQL NULL, so exclude(archived=True) alone also hides
    # freshly uploaded records that have no archived key yet.
    return queryset.filter(Q(metadata__archived=False) | Q(metadata__archived__isnull=True))


def at(day, clock='09:00'):
    return datetime.combine(parsedate(day) or timezone.localdate(), time.fromisoformat(clock or '09:00'), ZONE)


def parsedatetime(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except (ValueError, TypeError):
        raise ValidationError('Enter a valid timestamp with its time zone.')
    if timezone.is_naive(parsed):
        raise ValidationError('Time entries must include their time zone.')
    return parsed


def key(row, numeric=False):
    value = row.metadata.get('id', row.client_key or str(row.pk))
    if numeric:
        try:
            return int(value)
        except (ValueError, TypeError):
            return row.pk.int % (2 ** 48)
    return str(value)


def base(row, numeric=False):
    return {**row.metadata, 'id': key(row, numeric), 'serverId': str(row.pk)}


def entries(data, name):
    items = data.get(name, [])
    if not isinstance(items, list) or any(not isinstance(item, dict) for item in items):
        raise ValidationError(f'{name} must be a list of records.')
    ids = [str(item.get('id') or item.get('reference')) for item in items if item.get('id') or item.get('reference')]
    if len(ids) != len(set(ids)):
        raise ValidationError(f'{name} contains a repeated record ID.')
    return items


class Writer:
    def __init__(self, user):
        self.user = user
        self.clients = {}
        self.projects = {}
        self.opportunities = {}
        self.meetings = {}
        self.activities = {}
        self.changed_meeting_times = set()

    def put(self, model, item, values, scope=None, many=None, identity=None):
        scope = scope or {}
        lookup = model.objects.filter(workspace=self.user, **scope)
        row = None
        adopted_before = None
        if item.get('serverId'):
            row = lookup.filter(pk=item['serverId']).first()
            opportunity = scope.get('opportunity')
            if row is None and opportunity and model in (m.Meeting, m.FollowUp, m.PBCRequest):
                # After handover, imports/API edits can target the delivery project.
                # The frontend shares that evidence with the original opportunity.
                linked = m.Project.objects.filter(workspace=self.user, opportunity=opportunity).first()
                if linked:
                    row = model.objects.filter(workspace=self.user, project=linked, opportunity__isnull=True, pk=item['serverId']).first()
                    if row:
                        adopted_before = snapshot(row)
                        row.opportunity = opportunity
            if row is None:
                raise ValidationError('A record no longer exists in this workspace. Reload before saving.')
        ident = str(identity if identity is not None else item.get('id') or item.get('reference') or '')
        if not row and ident:
            row = lookup.filter(client_key=ident).first()
        if not row and 'reference' in values and values['reference']:
            row = lookup.filter(reference=values['reference']).first()
        fresh = row is None
        row = row or model(workspace=self.user, **scope)
        before = adopted_before or ({} if fresh else snapshot(row))
        history = item.get('history') or item.get('revisions') or []
        history = [entry for entry in history if not isinstance(entry, dict) or not entry.get('serverAuditId')]
        reason = item.get('change_reason', '')
        if not reason and history:
            last = history[-1]
            reason = last.get('text', last.get('reason', '')) if isinstance(last, dict) else str(last)
            if not fresh and history == before.get('metadata', {}).get('history', before.get('metadata', {}).get('revisions', [])):
                reason = ''
        deadline_fields = {'start_date', 'end_date', 'due_date', 'deadline', 'milestone_date', 'request_date', 'raised_date', 'agreed_on'}
        changed_dates = [name for name, value in values.items() if name in deadline_fields and name in before and (before[name] or '') != iso(value)]
        if not fresh and changed_dates and not reason:
            # The browser's field editors collect date-change reasons; external API writes
            # must not bypass that accountability by using the aggregate route.
            raise ValidationError({'change_reason': 'Enter a reason for changing dates.'})
        for name, value in values.items():
            setattr(row, name, value)
        row.client_key = row.client_key or ident
        # Child collections are serialized from their own tables, never replayed from metadata.
        exclude = {'serverId', 'children', 'plan', 'actionItems', 'meetingRecords', 'attendeeRecords',
                   'agreedSections', 'agreedItems', 'issueRecords', 'repositoryFiles', 'repositorySections', 'files'}
        row.metadata = {k: v for k, v in item.items() if k not in exclude}
        for history_field in ('history', 'revisions'):
            if isinstance(row.metadata.get(history_field), list):
                row.metadata[history_field] = [entry for entry in row.metadata[history_field]
                    if not isinstance(entry, dict) or not entry.get('serverAuditId')]
        row.full_clean(validate_unique=False, validate_constraints=False)
        # Avoid updating every timestamp/audit on each autosave.
        proposed = snapshot(row)
        changed = fresh or any(before.get(field.name) != proposed.get(field.name)
                               for field in row._meta.fields if field.name not in {'updated_at', 'created_at'})
        if changed:
            row.save()
        for field, records in (many or {}).items():
            old_ids = set(getattr(row, field).values_list('pk', flat=True))
            if old_ids != {record.pk for record in records}:
                getattr(row, field).set(records)
                changed = True
        if changed:
            record_event(self.user, row, 'created' if fresh else 'updated', before, reason=reason or 'Saved from planner workspace.')
        return row

    def remove_missing(self, queryset, keep):
        for row in queryset.exclude(pk__in=keep):
            record_event(self.user, row, 'deleted', snapshot(row), after={}, reason='Removed from planner workspace.')
            row.delete()

    def owners(self, item):
        names = item.get('owners') or ([item['owner']] if item.get('owner') else [])
        if isinstance(names, str):
            names = [name.strip() for name in names.split(',') if name.strip()]
        result = []
        for name in names:
            if not isinstance(name, str) or not name.strip():
                continue
            person = m.TeamMember.objects.filter(workspace=self.user, name=name).first()
            if not person:
                person = self.put(m.TeamMember, {'name': name}, {'name': name, 'team': item.get('team', '')})
            result.append(person)
        return result

    def write(self, data):
        for name in ('clients', 'projects', 'opportunities', 'planner'):
            if name not in data:
                raise ValidationError(f'Missing workspace field: {name}.')
        project_names = [item.get('name', '').strip().casefold() for item in entries(data, 'projects')]
        if len(project_names) != len(set(project_names)):
            raise ValidationError('Use a distinct name for each project so calendar and client links stay unambiguous.')
        for item in entries(data, 'clients'):
            row = self.put(m.Client, item, {'name': item['name'], 'contact_name': item.get('contact', ''),
                'email': item.get('email', ''), 'phone': item.get('phone', ''), 'notes': item.get('notes', '')})
            self.clients[str(item['id'])] = row
        for item in entries(data, 'teamMembers'):
            self.put(m.TeamMember, item, {'name': item['name'], 'team': item.get('team', item.get('organisation', '')),
                'email': item.get('email', ''), 'role': item.get('role', ''), 'active': item.get('active', True)})
        for item in entries(data, 'opportunities'):
            client = self.clients.get(str(item.get('clientId')))
            if not client:
                raise ValidationError('Select a client for every opportunity.')
            row = self.put(m.Opportunity, item, {'reference': item.get('reference', ''), 'client': client,
                'name': item['name'], 'description': item.get('summary', ''), 'stage': item.get('stage', 'Contact'),
                'proposal': item.get('proposal', ''), 'lost_reason': item.get('lostReason', '')})
            self.opportunities[str(item['id'])] = row
        for item in entries(data, 'projects'):
            linked = [self.clients[str(c['id'])] for c in data['clients'] if item['name'] in c.get('projects', [])]
            source = self.opportunities.get(str(item.get('sourceOpportunityId')))
            if source and source.client not in linked:
                linked.append(source.client)
            row = self.put(m.Project, item, {'reference': item.get('reference', ''), 'name': item['name'],
                'description': item.get('description', ''), 'start_date': parsedate(item.get('start')),
                'end_date': parsedate(item.get('end')), 'health': item.get('health') or HEALTH.get(item.get('healthKey'), 'On track'),
                'next_milestone': item.get('milestone', ''), 'milestone_date': parsedate(item.get('milestoneDate')),
                'opportunity': source, 'teams_channel': item.get('teamsChannel', '')}, many={'clients': linked})
            self.projects[item['name']] = row
            if source and source.stage != 'Won':
                source.stage = 'Won'
                source.save()
        for item in entries(data, 'opportunities'):
            row = self.opportunities[str(item['id'])]
            if row.stage == 'Won' and not m.Project.objects.filter(opportunity=row).exists():
                raise ValidationError('A won opportunity needs its project handover before saving.')
            self.meeting_records(item, opportunity=row)
            self.actions(item, opportunity=row)
        for item in entries(data, 'projects'):
            row = self.projects[item['name']]
            self.plan(item, row)
            if not row.opportunity_id:
                self.meeting_records(item, project=row)
                self.actions(item, project=row)
            else:
                # Shared opportunity/project evidence is a single record, not duplicated.
                for model in (m.Meeting, m.FollowUp, m.PBCRequest):
                    model.objects.filter(workspace=self.user, opportunity=row.opportunity).update(project=row)
            self.agreements(item, row)
            self.issues(item, row)
            self.documents(item, row)
            self.team_updates(item, row)
        self.planner(data['planner'])
        for decision in m.Decision.objects.filter(workspace=self.user, status='discussed', is_scope_change=True).select_related('meeting'):
            ensure_scope_followup(decision)
        # Deletion of a whole project/client is intentionally via the explicit REST API,
        # rather than inferred from a partial or filtered browser snapshot.

    def plan(self, item, project):
        if 'plan' not in item:
            return
        phases, work = [], []
        for pos, phase in enumerate(entries(item, 'plan')):
            values = {'name': phase['name'], 'start_date': parsedate(phase.get('start')), 'end_date': parsedate(phase.get('end')),
                      'status': phase.get('status', 'Not started'), 'notes': phase.get('description', ''), 'position': pos}
            row = self.put(m.Phase, phase, values, {'project': project}, {'owners': self.owners(phase)})
            phases.append(row.pk)
            for index, task in enumerate(entries(phase, 'children')):
                task_row = self.work(task, project, row, index)
                work.append(task_row.pk)
                for subpos, sub in enumerate(entries(task, 'children')):
                    work.append(self.work(sub, project, row, subpos, task_row).pk)
        self.remove_missing(project.work_items.filter(parent__isnull=False), work)
        self.remove_missing(project.work_items.filter(parent__isnull=True), work)
        self.remove_missing(project.phases.all(), phases)

    def work(self, item, project, phase, position, parent=None):
        return self.put(m.WorkItem, item, {'phase': phase, 'parent': parent, 'kind': 'subtask' if parent else 'task',
            'name': item['name'], 'start_date': parsedate(item.get('start')), 'end_date': parsedate(item.get('end')),
            'status': item.get('status', 'Not started'), 'estimated_hours': Decimal(str(item['estimate'])) if item.get('estimate') else None,
            'notes': item.get('description', ''), 'position': position}, {'project': project}, {'owners': self.owners(item)})

    def meeting_records(self, item, project=None, opportunity=None):
        if 'meetingRecords' not in item:
            return
        scope = {'opportunity': opportunity} if opportunity else {'project': project, 'opportunity': None}
        keep = []
        for meeting in entries(item, 'meetingRecords'):
            old = m.Meeting.objects.filter(workspace=self.user, client_key=str(meeting['id'])).first()
            starts_at = at(meeting.get('date'), meeting.get('time'))
            row = self.put(m.Meeting, meeting, {'title': meeting['title'], 'starts_at': at(meeting.get('date'), meeting.get('time')),
                'notes': meeting.get('notes', ''), 'draft_summary': meeting.get('draft', ''),
                'status': 'final' if meeting.get('status') == 'Reviewed' else 'draft',
                'kind': meeting.get('kind', 'client'), 'duration_minutes': int(meeting.get('durationMinutes') or 60)}, scope)
            self.meetings[str(meeting['id'])] = row
            if old and old.starts_at != starts_at:
                self.changed_meeting_times.add(row.pk)
            keep.append(row.pk)
            attendees = []
            for attendee in entries(meeting, 'attendeeRecords'):
                attendance = {'Present': 'Attended', 'Apologies': 'Absent'}.get(attendee.get('attendance'), attendee.get('attendance', 'Not recorded'))
                person = self.put(m.Attendee, attendee, {'name': attendee.get('name', ''),
                    'organisation': attendee.get('organisation', ''), 'role': attendee.get('role', ''),
                    'email': attendee.get('email', ''), 'attendance': attendance}, {'meeting': row})
                attendees.append(person.pk)
            self.remove_missing(row.attendees.all(), attendees)
            decisions = []
            for decision in entries(meeting, 'decisions'):
                obj = self.put(m.Decision, decision, {'text': decision.get('text', ''),
                    'status': 'confirmed' if decision.get('status', '').lower() == 'confirmed' else 'discussed',
                    'is_scope_change': 'scope' in decision.get('kind', '').lower()}, {'meeting': row})
                decisions.append(obj.pk)
            self.remove_missing(row.decisions.all(), decisions)
            if 'files' in meeting:
                self.file_records(row.documents.all(), entries(meeting, 'files'))
        # Only explicit, workspace-scoped deletion requests remove meeting evidence.
        deleted_ids = item.get('deletedMeetingIds', [])
        if not isinstance(deleted_ids, list) or any(not isinstance(value, str) for value in deleted_ids):
            raise ValidationError('Invalid meeting deletion request.')
        for row in m.Meeting.objects.filter(workspace=self.user, **scope, client_key__in=deleted_ids):
            if row.pk in keep:
                raise ValidationError('A meeting cannot be saved and deleted together.')
            record_event(self.user, row, 'deleted', snapshot(row), after={}, reason='User confirmed deletion in meeting minutes.')
            row.delete()

    def actions(self, item, project=None, opportunity=None):
        if 'actionItems' not in item:
            return
        scope = {'opportunity': opportunity} if opportunity else {'project': project, 'opportunity': None}
        followups, pbc, next_actions = [], [], []
        for action in entries(item, 'actionItems'):
            meeting = self.meetings.get(str(action.get('meetingId')))
            common = {'owner_name': action.get('owner', ''), 'due_date': parsedate(action.get('due')),
                      'status': action.get('status', 'Open'), 'meeting': meeting}
            if opportunity and action.get('recordType') == 'next_action':
                row = self.put(m.NextAction, action, {k:v for k,v in {**common, 'title': action['title'],
                    'notes': action.get('notes', ''), 'email_draft': action.get('emailDraft', '')}.items() if k != 'meeting'}, {'opportunity': opportunity})
                next_actions.append(row.pk)
            elif action.get('kind') == 'PBC':
                row = self.put(m.PBCRequest, action, {**common, 'reference': action.get('pbcId', ''), 'request': action['title'],
                    'request_date': parsedate(action.get('requestDate')), 'comment': action.get('comment', '')}, scope)
                pbc.append(row.pk)
            else:
                decision = None
                if action.get('decisionId'):
                    decision = m.Decision.objects.filter(workspace=self.user, client_key=str(action['decisionId']), meeting=meeting).first()
                    if not decision:
                        raise ValidationError('The scope request for this follow-up is unavailable.')
                row = self.put(m.FollowUp, action, {**common, 'title': action['title'], 'kind': action.get('kind', 'Action'),
                    'notes': action.get('notes', ''), 'email_draft': action.get('emailDraft', ''), 'decision': decision}, scope)
                followups.append(row.pk)
        self.remove_missing(m.FollowUp.objects.filter(workspace=self.user, decision__isnull=True, **scope), followups)
        self.remove_missing(m.PBCRequest.objects.filter(workspace=self.user, **scope), pbc)
        if opportunity:
            self.remove_missing(opportunity.next_actions.all(), next_actions)

    def agreements(self, item, project):
        if 'agreedSections' not in item:
            return
        sections = {}
        for child in (False, True):
            for section in entries(item, 'agreedSections'):
                if bool(section.get('parentId')) != child:
                    continue
                parent = sections.get(str(section.get('parentId'))) if child else None
                if child and not parent:
                    raise ValidationError('Choose a valid parent section.')
                sections[str(section['id'])] = self.put(m.AgreedSection, section, {'name': section['name'], 'parent': parent}, {'project': project})
        keep = []
        for agreement in entries(item, 'agreedItems'):
            section = sections.get(str(agreement.get('subsectionId') or agreement.get('sectionId')))
            if not section:
                raise ValidationError('Choose a section for each agreed item.')
            row = self.put(m.AgreedItem, agreement, {'section': section, 'name': agreement.get('name') or 'Agreed item',
                'description': agreement.get('description', ''), 'agreed_on': parsedate(agreement.get('date')),
                'agreed_with': agreement.get('agreedWith', ''), 'confirmed': agreement.get('confirmed', True)}, {'project': project})
            keep.append(row.pk)
        self.remove_missing(project.agreed_items.all(), keep)
        self.remove_missing(project.agreed_sections.filter(parent__isnull=False), [s.pk for s in sections.values()])
        self.remove_missing(project.agreed_sections.filter(parent__isnull=True), [s.pk for s in sections.values()])

    def issues(self, item, project):
        if 'issueRecords' not in item:
            return
        keep = []
        for issue in entries(item, 'issueRecords'):
            owners = issue.get('owners') or ''
            owner_text = owners if isinstance(owners, str) else ', '.join(owners)
            row = self.put(m.Issue, issue, {'reference': issue.get('reference', ''), 'title': issue['title'],
                'description': issue.get('description', ''), 'severity': issue.get('severity', 'Medium'),
                'status': issue.get('status', 'Open'), 'raised_date': parsedate(issue.get('raised')), 'due_date': parsedate(issue.get('due')),
                'resolution': issue.get('resolution', ''), 'notes': issue.get('notes', ''), 'owner_text': owner_text},
                {'project': project}, {'owners': self.owners(issue)})
            keep.append(row.pk)
        self.remove_missing(project.issues.all(), keep)

    def documents(self, item, project):
        sections = {}
        if 'repositorySections' in item:
            for section in entries(item, 'repositorySections'):
                row = self.put(m.DocumentSection, section, {'name': section['name']}, {'project': project})
                sections[str(section['id'])] = row
        if 'repositoryFiles' in item:
            self.file_records(project.documents.filter(meeting__isnull=True), entries(item, 'repositoryFiles'), sections)
        if 'repositorySections' in item:
            for removed in project.document_sections.exclude(pk__in=[s.pk for s in sections.values()]):
                if visible_documents(removed.documents).exists():
                    raise ValidationError('Move the files before removing their document section.')
                removed.documents.update(section=None)
                self.remove_missing(project.document_sections.filter(pk=removed.pk), [])

    def file_records(self, queryset, files, sections=None):
        """A removed attachment is hidden, retaining its original bytes for Undo/audit."""
        queryset = queryset.filter(workspace=self.user)
        keep = []
        for file in files:
            row = queryset.filter(Q(client_key=str(file.get('id'))) | Q(metadata__id=str(file.get('id')))).first()
            if not row:
                try:
                    row = queryset.filter(pk=file.get('serverId') or file.get('id')).first()
                except ValidationError:
                    row = None
            if not row:
                raise ValidationError('An attachment is unavailable in this record. Upload it before saving.')
            before = snapshot(row)
            row.metadata = {**row.metadata, 'archived': False}
            if sections is not None:
                destination = str(file.get('sectionId') or '')
                if destination and destination not in sections:
                    raise ValidationError('Choose a valid section for the document.')
                row.section = sections.get(destination)
            if before != snapshot(row):
                row.save()
                record_event(self.user, row, 'attachment_updated', before, reason='Document restored or reorganised.')
            keep.append(row.pk)
        for row in visible_documents(queryset.exclude(pk__in=keep)):
            before = snapshot(row)
            row.metadata = {**row.metadata, 'archived': True}
            row.save()
            record_event(self.user, row, 'attachment_removed', before, reason='Removed attachment; original retained for history and Undo.')

    def team_updates(self, item, project):
        if 'teamUpdates' not in item:
            return
        for update in entries(item, 'teamUpdates'):
            self.put(m.TeamUpdate, update, {'kind': update.get('kind', 'daily'),
                'update_date': parsedate(update.get('date')) or timezone.localdate(), 'team': update.get('team', ''),
                'source_text': update.get('source', ''), 'summary': update.get('summary', ''),
                'yesterday': update.get('yesterday', ''), 'today': update.get('today', ''), 'blockers': update.get('blockers', ''),
                'proposed_changes': update.get('taskUpdates', []), 'accepted': update.get('accepted', True)}, {'project': project})
        # Daily and weekly evidence is retained even when the UI filters its history.

    def planner(self, model):
        if not isinstance(model, dict):
            raise ValidationError('Planner must be an object.')
        day = parsedate(model.get('day')) or timezone.localdate()
        # Older browser snapshots used 08:00 as slot zero. Only interpret the
        # incoming coordinates here; canonical database timestamps never move
        # when the browser migrates to midnight-relative slots.
        origin = model.get('slotOrigin', 480)
        if type(origin) not in (int, float) or not 0 <= origin < 1440 or origin % 15:
            raise ValidationError('The planner slot origin must be a 15-minute offset within the day.')

        def slot_start(item):
            return at(item.get('date') or iso(day), '00:00') + timedelta(minutes=origin + int(item.get('slot') or 0) * 15)

        for item in entries(model, 'tasks') + entries(model, 'meetings'):
            is_meeting = item in model.get('meetings', [])
            project = self.projects.get(item.get('project'))
            scope = {}
            meeting = None
            if is_meeting:
                meeting = self.meetings.get(str(item.get('meetingId')))
                if not meeting and item.get('meetingId'):
                    meeting = m.Meeting.objects.filter(workspace=self.user, client_key=str(item['meetingId'])).first()
                    if not meeting:
                        try:
                            meeting = m.Meeting.objects.filter(workspace=self.user, pk=item['meetingId']).first()
                        except ValidationError:
                            pass
                    if not meeting:
                        raise ValidationError('This meeting no longer exists. Reload before saving.')
                start = parsedatetime(item.get('scheduledStart')) or slot_start(item)
                if not meeting:
                    meeting = self.put(m.Meeting, {**item, 'id': 'day-' + str(item['id']), 'serverId': None},
                        {'title': item['name'], 'starts_at': start, 'duration_minutes': int(item.get('estimateMinutes') or int(item.get('length') or 4) * 15),
                         'project': project, 'kind': item.get('kind', 'client')})
                elif meeting.pk not in self.changed_meeting_times and meeting.starts_at != start:
                    before = snapshot(meeting)
                    meeting.starts_at = start
                    meeting.duration_minutes = int(item.get('estimateMinutes') or int(item.get('length') or 4) * 15)
                    local_start = timezone.localtime(start, ZONE)
                    meeting.metadata['date'] = iso(local_start.date())
                    meeting.metadata['time'] = local_start.strftime('%H:%M')
                    meeting.save()
                    record_event(self.user, meeting, 'rescheduled', before, reason='Moved manually in My day.')
                if 'actualStart' in item or 'actualEnd' in item:
                    before = snapshot(meeting)
                    meeting.actual_start = parsedatetime(item.get('actualStart'))
                    meeting.actual_end = parsedatetime(item.get('actualEnd'))
                    meeting.full_clean(validate_unique=False, validate_constraints=False)
                    if snapshot(meeting) != before:
                        meeting.save()
                        record_event(self.user, meeting, 'actual_time_corrected', before, reason='User corrected actual meeting time.')
                self.meetings[str(item['id'])] = meeting
            duration = meeting.duration_minutes if meeting else int(item.get('estimateMinutes') or (int(item.get('length') or 2) * 15))
            row = self.put(m.Activity, item, {'title': meeting.title if meeting else item['name'], 'project': meeting.project if meeting else project, 'meeting': meeting,
                'category': ('internal_meeting' if item.get('kind') == 'internal' else 'client_meeting') if is_meeting else ('project_task' if project else 'personal_task'),
                'priority': {'High': 'high', 'Normal': 'medium', 'Low': 'low'}.get(item.get('priority'), 'medium'),
                'estimated_minutes': duration, 'planned_date': parsedate(item.get('date')) or day,
                'deadline': parsedate(item.get('due')), 'status': TASK_STATUS.get(item.get('status'), 'open'),
                'notes': item.get('notes', '')}, scope)
            self.activities[str(item['id'])] = row
            if item.get('slot') is not None and row.status != 'done':
                start = meeting.starts_at if meeting else slot_start(item)
                self.put(m.ScheduleBlock, {'id': 'schedule-' + str(item['id'])}, {'starts_at': start,
                    'ends_at': start + timedelta(minutes=duration), 'pinned': bool(item.get('pinned') or is_meeting)}, {'activity': row})
            else:
                self.remove_missing(row.blocks.all(), [])
        # Close existing sessions first so the one-running-session constraint can be
        # respected when a browser starts another item in the same transaction.
        sessions = entries(model, 'sessions')
        for session in sorted(sessions, key=lambda s: s.get('end') is None):
            activity = self.activities.get(str(session.get('itemId')))
            if not activity:
                raise ValidationError('A time entry must reference an existing task or meeting.')
            self.put(m.TimeSession, session, {'activity': activity,
                'starts_at': datetime.fromtimestamp(float(session['start']) / 1000, dt_timezone.utc),
                'ends_at': datetime.fromtimestamp(float(session['end']) / 1000, dt_timezone.utc) if session.get('end') is not None else None})
        running_tasks = m.TimeSession.objects.filter(workspace=self.user, ends_at__isnull=True).exclude(activity__category__in=['client_meeting', 'internal_meeting']).count()
        if running_tasks > 1:
            raise ValidationError('Pause the current task before starting another task.')


def save_workspace(user, state, data):
    token = aggregating.set(True)
    try:
        Writer(user).write(data)
        # Only view preferences live in this row; business records live above.
        planner = data['planner']
        state.preferences = {'planner': {k: v for k, v in planner.items() if k not in {'tasks', 'meetings', 'sessions'}}}
        state.revision += 1
        state.save()
    finally:
        aggregating.reset(token)


def work_json(row, kind):
    owners = list(row.owners.values_list('name', flat=True))
    result = {**base(row), 'kind': kind, 'name': row.name, 'start': iso(row.start_date), 'end': iso(row.end_date),
              'status': row.status, 'owners': owners, 'owner': ', '.join(owners),
              'team': ', '.join(dict.fromkeys(row.owners.exclude(team='').values_list('team', flat=True))),
              'description': row.notes, 'estimate': str(getattr(row, 'estimated_hours', '') or ''),
              'history': history_json(row), 'children': []}
    if kind == 'phase':
        result['children'] = [work_json(t, 'task') for t in row.work_items.filter(parent__isnull=True)]
    elif kind == 'task':
        result['children'] = [work_json(t, 'subtask') for t in row.subtasks.all()]
    return result


def history_json(row, field='history'):
    """Show canonical external date history without replaying it as browser edits."""
    history = list(row.metadata.get(field, []))
    date_fields = {'start_date', 'end_date', 'due_date', 'deadline', 'milestone_date', 'request_date', 'raised_date', 'agreed_on'}
    events = m.AuditEvent.objects.filter(workspace=row.workspace, target_type=row._meta.label_lower, target_id=str(row.pk)).order_by('created_at')
    for event in events:
        if event.before.get('metadata') != event.after.get('metadata'):
            continue
        changes = [f"{name.replace('_', ' ')}: {event.before.get(name) or 'not set'} → {event.after.get(name) or 'not set'}"
                   for name in sorted(date_fields) if name in event.before and name in event.after and event.before[name] != event.after[name]]
        if changes:
            history.append({'serverAuditId': str(event.pk), 'at': timezone.localtime(event.created_at, ZONE).strftime('%d/%m/%Y, %H:%M SGT'),
                            'text': '; '.join(changes) + ('. ' + event.reason if event.reason else '')})
    return history


def file_json(row):
    return {**base(row), 'name': row.original_name, 'size': row.size, 'type': row.content_type,
            'sectionId': key(row.section) if row.section_id else '', 'addedAt': row.created_at.isoformat(),
            'url': f'/api/integrations/files/{row.pk}/download/', 'download_url': f'/api/integrations/files/{row.pk}/download/'}


def meeting_json(row):
    start = timezone.localtime(row.starts_at, ZONE)
    return {**base(row), 'title': row.title, 'date': iso(start.date()), 'time': '' if row.metadata.get('time') == '' else start.strftime('%H:%M'),
            'kind': row.kind, 'durationMinutes': row.duration_minutes, 'agenda': row.metadata.get('agenda', ''),
            'actualStart': iso(row.actual_start) or None, 'actualEnd': iso(row.actual_end) or None,
            'notes': row.notes, 'summary': row.summary, 'status': 'Reviewed' if row.status == 'final' else 'Draft', 'draft': row.draft_summary,
            'attendeeRecords': [{**base(a), 'name': a.name, 'organisation': a.organisation, 'role': a.role,
                                 'email': a.email, 'attendance': {'Invited':'Expected', 'Optional':'Expected'}.get(a.attendance,a.attendance)} for a in row.attendees.all()],
            'attendees': ', '.join(row.attendees.values_list('name', flat=True)),
            'decisions': [{**base(d), 'text': d.text, 'kind': d.metadata.get('kind', 'Scope change' if d.is_scope_change else 'Decision'),
                           'status': 'Agreed in discussion' if d.status == 'confirmed' else d.metadata.get('status', 'Proposed')} for d in row.decisions.all()],
            'files': [file_json(f) for f in visible_documents(row.documents)], 'versions': row.metadata.get('versions', [])}


def actions_json(owner):
    actions = []
    for row in owner.follow_ups.all():
        actions.append({**base(row), 'title': row.title, 'kind': row.kind, 'owner': row.owner_name,
            'due': iso(row.due_date), 'status': row.status, 'notes': row.notes, 'emailDraft': row.email_draft,
            'meetingId': key(row.meeting) if row.meeting_id else '', 'decisionId': key(row.decision) if row.decision_id else '', 'history': history_json(row)})
    for row in owner.pbc_requests.all():
        actions.append({**base(row), 'title': row.request, 'kind': 'PBC', 'pbcId': row.reference, 'owner': row.owner_name,
            'requestDate': iso(row.request_date), 'due': iso(row.due_date), 'status': row.status, 'comment': row.comment,
            'meetingId': key(row.meeting) if row.meeting_id else '', 'history': history_json(row)})
    return actions


def read_workspace(user, state):
    clients = [{**base(c, True), 'name': c.name, 'contact': c.contact_name, 'email': c.email, 'phone': c.phone,
                'notes': c.notes, 'projects': list(c.projects.values_list('name', flat=True))}
               for c in m.Client.objects.filter(workspace=user, active=True).order_by('created_at')]
    opportunities = []
    for o in m.Opportunity.objects.filter(workspace=user).select_related('client').order_by('created_at'):
        actions = actions_json(o)
        linked_project = m.Project.objects.filter(opportunity=o).first()
        meeting_rows = list(o.meetings.all())
        if linked_project:
            known = {entry['serverId'] for entry in actions}
            actions += [entry for entry in actions_json(linked_project) if entry['serverId'] not in known]
            known_meetings = {meeting.pk for meeting in meeting_rows}
            meeting_rows += [meeting for meeting in linked_project.meetings.all() if meeting.pk not in known_meetings]
        for n in o.next_actions.all():
            actions.append({**base(n), 'title': n.title, 'due': iso(n.due_date), 'status': n.status, 'owner': n.owner_name,
                            'kind': 'Action', 'recordType': 'next_action', 'notes': n.notes, 'emailDraft': n.email_draft, 'history': n.metadata.get('history', [])})
        next_action = next(iter(sorted((a for a in actions if a['status'] != 'Done'), key=lambda a: a['due'] or '9999')), {})
        opportunities.append({**base(o, True), 'reference': o.reference, 'name': o.name, 'clientId': key(o.client, True),
            'summary': o.description, 'stage': o.stage, 'proposal': o.proposal, 'lostReason': o.lost_reason,
            'notes': o.metadata.get('notes', []), 'stageHistory': o.metadata.get('stageHistory', []),
            'nextAction': next_action.get('title', 'No open actions'), 'nextDate': next_action.get('due', ''),
            'nextTime': next_action.get('time', ''), 'followup': o.metadata.get('followup', ''),
            'projectName': linked_project.name if linked_project else '', 'meetings': [],
            'meetingRecords': [meeting_json(meeting) for meeting in meeting_rows], 'actionItems': actions})
    projects = []
    for p in m.Project.objects.filter(workspace=user, archived=False).order_by('created_at'):
        health_key = next((key for key, value in HEALTH.items() if value == p.health), 'attention')
        projects.append({**base(p), 'reference': p.reference, 'name': p.name, 'description': p.description,
            'start': pretty(p.start_date), 'end': pretty(p.end_date), 'health': p.health, 'healthKey': health_key,
            'rank': {'risk': 0, 'attention': 1, 'healthy': 2}[health_key], 'milestone': p.next_milestone,
            'milestoneDate': iso(p.milestone_date), 'milestoneLabel': pretty(p.milestone_date), 'teamsChannel': p.teams_channel,
            'sourceOpportunityId': key(p.opportunity, True) if p.opportunity_id else None,
            'plan': [work_json(phase, 'phase') for phase in p.phases.all()],
            'tasks': [[t.name, ', '.join(dict.fromkeys(t.owners.values_list('team', flat=True))), t.status,
                       pretty(t.end_date) or 'Missing', t.notes, ', '.join(t.owners.values_list('name', flat=True))]
                      for t in p.work_items.filter(parent__isnull=True)],
            'meetingRecords': [meeting_json(meeting) for meeting in p.meetings.all()], 'minutes': [],
            'actionItems': actions_json(p), 'history': history_json(p),
            'agreedSections': [{**base(s), 'name': s.name, 'parentId': key(s.parent) if s.parent_id else ''}
                               for s in p.agreed_sections.order_by('position', 'created_at')],
            'agreedItems': [{**base(a), 'name': a.name, 'sectionId': key(a.section.parent or a.section),
                'subsectionId': key(a.section) if a.section.parent_id else '', 'date': iso(a.agreed_on),
                'agreedWith': a.agreed_with, 'description': a.description, 'revisions': history_json(a, 'revisions')}
                            for a in p.agreed_items.select_related('section__parent')],
            'issueRecords': [{**base(i), 'reference': i.reference, 'title': i.title, 'description': i.description,
                'owners': i.owner_text or ', '.join(i.owners.values_list('name', flat=True)), 'notes': i.notes,
                'status': i.status, 'severity': i.severity, 'raised': iso(i.raised_date), 'due': iso(i.due_date),
                'resolution': i.resolution, 'history': history_json(i)} for i in p.issues.all()],
            'repositorySections': [{**base(s), 'name': s.name} for s in p.document_sections.order_by('position', 'created_at')],
            'repositoryFiles': [file_json(f) for f in visible_documents(p.documents.filter(meeting__isnull=True))]})
        projects[-1]['teamUpdates'] = [{**base(update), 'kind': update.kind, 'date': iso(update.update_date),
            'team': update.team, 'source': update.source_text, 'summary': update.summary,
            'yesterday': update.yesterday, 'today': update.today, 'blockers': update.blockers,
            'taskUpdates': update.proposed_changes, 'accepted': update.accepted}
            for update in p.team_updates.order_by('update_date', 'created_at')]
    prefs = state.preferences.get('planner', {})
    today = iso(timezone.localdate())
    day = prefs.get('day') or today
    tasks, meetings, sessions = [], [], []
    seen_meetings = set()
    for a in m.Activity.objects.filter(workspace=user).select_related('project', 'meeting'):
        blocks = list(a.blocks.order_by('starts_at'))
        block = next((b for b in blocks if timezone.localtime(b.starts_at, ZONE).date() == a.planned_date), blocks[0] if blocks else None)
        activity_date = iso(timezone.localtime(block.starts_at, ZONE).date()) if block else iso(a.planned_date) or day
        slot = int((timezone.localtime(block.starts_at, ZONE) - at(activity_date, '00:00')).total_seconds() / 900) if block else None
        common = {**base(a), 'name': a.title, 'project': a.project.name if a.project_id else 'General',
                  'estimateMinutes': a.estimated_minutes, 'slot': slot, 'notes': a.notes,
                  'createdAt': int(a.created_at.timestamp() * 1000)}
        if a.meeting_id:
            seen_meetings.add(a.meeting_id)
            start = timezone.localtime(a.meeting.starts_at, ZONE)
            meetings.append({**common, 'meetingId': key(a.meeting), 'date': iso(start.date()),
                'slot': int((start - at(iso(start.date()), '00:00')).total_seconds() / 900),
                'length': max(1, (a.meeting.duration_minutes + 14) // 15), 'kind': a.meeting.kind,
                'scheduledStart': iso(a.meeting.starts_at),
                'actualStart': iso(a.meeting.actual_start) or None, 'actualEnd': iso(a.meeting.actual_end) or None})
        else:
            tasks.append({**common, 'date': activity_date, 'duration': str(a.estimated_minutes) + 'm', 'due': iso(a.deadline),
                'priority': {'high': 'High', 'medium': 'Normal', 'low': 'Low'}[a.priority],
                'pinned': block.pinned if block else False, 'status': {v: k for k, v in TASK_STATUS.items()}[a.status]})
        for s in a.time_sessions.all():
            sessions.append({**base(s), 'itemId': key(a), 'kind': 'meeting' if a.meeting_id else 'task',
                'name': a.title, 'project': a.project.name if a.project_id else 'General',
                'start': int(s.starts_at.timestamp() * 1000), 'end': int(s.ends_at.timestamp() * 1000) if s.ends_at else None})
    for meeting in m.Meeting.objects.filter(workspace=user).exclude(pk__in=seen_meetings).select_related('project'):
        if meeting.metadata.get('time') == '':
            continue  # A minutes draft without a time is not a 09:00 calendar appointment.
        start = timezone.localtime(meeting.starts_at, ZONE)
        meetings.append({'id': 'calendar-' + key(meeting), 'meetingId': key(meeting), 'name': meeting.title,
            'project': meeting.project.name if meeting.project_id else 'General', 'date': iso(start.date()),
            'slot': int((start - at(iso(start.date()), '00:00')).total_seconds()/900),
            'length': max(1,(meeting.duration_minutes+14)//15), 'estimateMinutes': meeting.duration_minutes,
            'scheduledStart': iso(meeting.starts_at),
            'kind': meeting.kind, 'actualStart': iso(meeting.actual_start) or None, 'actualEnd': iso(meeting.actual_end) or None})
    planner = {**prefs, 'slotOrigin': 0, 'day': day, 'serial': prefs.get('serial', 100), 'tasks': tasks, 'meetings': meetings,
               'sessions': sessions, 'currentTaskId': prefs.get('currentTaskId')}
    members = [{**base(t), 'name': t.name, 'team': t.team, 'email': t.email, 'role': t.role, 'active': t.active}
               for t in m.TeamMember.objects.filter(workspace=user, active=True).order_by('name')]
    return {'workspaceId': str(user.pk), 'revision': state.revision, 'clients': clients, 'projects': projects, 'opportunities': opportunities,
            'planner': planner, 'teamMembers': members, 'members': members}
