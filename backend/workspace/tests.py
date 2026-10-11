import copy
import json
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from io import BytesIO
from django.core.files.uploadedfile import SimpleUploadedFile

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from planner import models as m
from .models import WorkspaceState


class WorkspaceIntegrationTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='workspace-manager', password='test-manager-123')
        self.other = get_user_model().objects.create_user(username='workspace-other', password='test-other-123')
        self.api = APIClient()
        self.api.force_authenticate(self.user)
        self.fixture = json.loads((Path(__file__).parent/'fixtures/frontend_state.json').read_text())
        self.fixture['revision'] = 0

    def read(self):
        response = self.api.get('/api/workspace/')
        self.assertEqual(response.status_code,200,response.data)
        return response.data

    def save(self, data, expected=200):
        response = self.api.put('/api/workspace/',data,format='json')
        self.assertEqual(response.status_code,expected,response.data)
        return response

    def rich_fixture(self):
        data=copy.deepcopy(self.fixture)
        project=data['projects'][0]
        meeting=project['meetingRecords'][0]
        meeting['attendeeRecords']=[{'id':'person-1','name':'Minh Nguyen','organisation':'Hanoi','role':'Presenter','attendance':'Not recorded'},
                                    {'id':'person-2','name':'Alex','organisation':'Client A','role':'Participant','attendance':'Expected'}]
        meeting['decisions']=[{'id':'decision-1','kind':'Scope request','status':'Needs clarification','text':'Add monthly export'},
                              {'id':'decision-2','kind':'Decision','status':'Agreed in discussion','text':'Review scope Friday'}]
        # The actual frontend shares these arrays after opportunity handover.
        data['opportunities'][0]['meetingRecords']=copy.deepcopy(project['meetingRecords'])
        project['actionItems'].append({'id':'pbc-1','pbcId':'PBC-001','kind':'PBC','title':'Sample data','owner':'Alex','requestDate':'2026-10-12','due':'2026-10-20','status':'Open','comment':'  First line\n\n Second line  ','history':[]})
        data['opportunities'][0]['actionItems']=copy.deepcopy(project['actionItems'])
        phase=project['plan'][0]
        phase['owners']=['Sarah Lim','Minh Nguyen']
        phase['children']=[{'id':'task-delivery','name':'Authentication','start':'2026-10-12','end':'2026-10-20','owners':['Sarah Lim'], 'status':'In progress','estimate':'16','description':'Review API','history':[],
                            'children':[{'id':'subtask-delivery','name':'Token tests','start':'2026-10-12','end':'2026-10-18','owners':['Minh Nguyen'], 'status':'Not started','estimate':'4','description':'Validate tokens','history':[],'children':[]}]}]
        project['issueRecords']=[{'id':'issue-1','reference':'ISS-001','title':'Token validation','owners':'Minh Nguyen, Sarah Lim','severity':'High','status':'Blocked','raised':'2026-10-12','due':'2026-10-20','description':'Details','notes':'  Preserve notes\n ','resolution':'','history':[]}]
        project['agreedSections'].append({'id':'screen-1','name':'Screen 1','parentId':project['agreedSections'][1]['id']})
        project['agreedItems']=[{'id':'agreement-1','name':'No naming required','sectionId':project['agreedSections'][1]['id'],'subsectionId':'screen-1','date':'2026-10-12','agreedWith':'Alex','description':'What we agreed','revisions':[]}]
        data['teamMembers']=[{'id':'minh','name':'Minh Nguyen','team':'Hanoi','active':True},{'id':'sarah','name':'Sarah Lim','team':'Singapore','active':True}]
        return data

    def test_actual_frontend_handler_snapshot_roundtrips(self):
        self.save(self.fixture)
        read=self.read()
        self.assertEqual(read['clients'][0]['id'],self.fixture['clients'][0]['id'])
        self.assertEqual(read['projects'][0]['name'],'New engagement')
        self.assertEqual(read['opportunities'][0]['stage'],'Won')
        self.assertEqual(read['planner']['tasks'][0]['status'],'Paused')
        self.assertEqual(read['projects'][0]['meetingRecords'][0]['time'],'')
        self.assertEqual(len(read['planner']['sessions']),1)
        self.save(read)
        self.assertEqual(m.Project.objects.count(),1)
        self.assertEqual(m.Meeting.objects.count(),1)
        self.assertEqual(m.Activity.objects.count(),1)
        self.assertEqual(m.TimeSession.objects.count(),1)

    def test_all_registered_nested_records_roundtrip_without_losing_fields(self):
        self.save(self.rich_fixture())
        read=self.read()
        p=read['projects'][0]
        self.assertEqual(p['issueRecords'][0]['owners'],'Minh Nguyen, Sarah Lim')
        self.assertEqual(p['issueRecords'][0]['notes'],'  Preserve notes\n ')
        self.assertEqual(p['meetingRecords'][0]['attendeeRecords'][0]['attendance'],'Not recorded')
        self.assertEqual(p['meetingRecords'][0]['decisions'][0]['status'],'Needs clarification')
        self.assertEqual(p['meetingRecords'][0]['decisions'][1]['status'],'Agreed in discussion')
        self.assertEqual(p['plan'][0]['children'][0]['children'][0]['owners'],['Minh Nguyen'])
        self.assertEqual(p['agreedItems'][0]['subsectionId'],'screen-1')
        self.assertEqual(next(a for a in p['actionItems'] if a['kind']=='PBC')['comment'],'  First line\n\n Second line  ')
        self.save(read)
        self.assertEqual(m.TeamMember.objects.count(),2)
        self.assertEqual(m.WorkItem.objects.count(),2)
        self.assertEqual(m.Decision.objects.count(),2)

    def test_api_updates_advance_revision_and_cannot_be_overwritten(self):
        self.save(self.fixture)
        old=self.read()
        project=m.Project.objects.get()
        response=self.api.patch(f'/api/projects/{project.pk}/',{'health':'At risk'},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.save(old,409)
        updated=self.read()
        self.assertGreater(updated['revision'],old['revision'])
        self.assertEqual(updated['projects'][0]['health'],'At risk')
        self.save(updated)
        project.refresh_from_db()
        self.assertEqual(project.health,'At risk')

    def test_imported_records_are_visible_and_not_lost_on_next_autosave(self):
        self.save(self.fixture)
        project=m.Project.objects.get()
        opportunity=m.Opportunity.objects.get()
        # REST/import-created next actions use a separate canonical table.
        action=m.NextAction.objects.create(workspace=self.user,opportunity=opportunity,title='API action',due_date='2026-10-19')
        read=self.read()
        self.assertTrue(any(a['title']=='API action' for a in read['opportunities'][0]['actionItems']))
        self.save(read)
        self.assertEqual(m.NextAction.objects.get(pk=action.pk).title,'API action')
        self.assertFalse(m.FollowUp.objects.filter(title='API action').exists())
        # An Excel/API PBC request created under a won project also stays visible
        # in its linked opportunity, because the browser shares their action list.
        pbc=m.PBCRequest.objects.create(workspace=self.user,project=project,request='Imported after win',status='Open')
        read=self.read()
        self.assertTrue(any(a['title']=='Imported after win' for a in read['opportunities'][0]['actionItems']))
        self.save(read)
        pbc.refresh_from_db()
        self.assertEqual(pbc.opportunity_id,opportunity.pk)

    def test_cross_workspace_identifier_rejected_atomically(self):
        alien=m.Client.objects.create(workspace=self.other,name='Confidential')
        data=self.fixture
        data['clients'][0]['serverId']=str(alien.pk)
        self.save(data,400)
        self.assertFalse(m.Client.objects.filter(workspace=self.user).exists())
        self.assertEqual(m.Client.objects.get(pk=alien.pk).name,'Confidential')
        self.assertEqual(self.read()['clients'],[])

    def test_duplicate_ids_and_malformed_shape_rejected_atomically(self):
        data=copy.deepcopy(self.fixture)
        data['clients'].append(copy.deepcopy(data['clients'][0]))
        self.save(data,400)
        self.assertFalse(m.Client.objects.filter(workspace=self.user).exists())
        data=copy.deepcopy(self.fixture)
        data['projects'][0]['plan']='broken'
        self.save(data,400)
        self.assertFalse(m.Client.objects.filter(workspace=self.user).exists())

    def test_handover_without_project_rejected_without_partial_records(self):
        data=copy.deepcopy(self.fixture)
        data['projects']=[]
        self.save(data,400)
        self.assertFalse(m.Opportunity.objects.exists())

    def test_date_change_requires_reason_and_preserves_history(self):
        self.save(self.fixture)
        data=self.read()
        data['projects'][0]['end']='20 Nov 2026'
        self.save(data,400)
        data['projects'][0]['history']=[{'at':'12 October','text':'Client requested extra UAT time'}]
        self.save(data)
        self.assertTrue(m.AuditEvent.objects.filter(reason='Client requested extra UAT time').exists())

    def test_timer_history_survives_day_change(self):
        self.save(self.fixture)
        data=self.read()
        data['planner']['day']='2026-10-13'
        data['planner']['tasks'][0]['status']='In progress'
        data['planner']['sessions'].append({'id':'new-running','itemId':'task-101','start':1791856800000,'end':None,'kind':'task'})
        self.save(data)
        data=self.read()
        self.assertEqual(len(data['planner']['sessions']),2)
        self.assertEqual(data['planner']['sessions'][0]['start'],1791770400000)
        self.assertEqual(m.TimeSession.objects.filter(ends_at__isnull=True).count(),1)

    def test_manual_calendar_move_updates_same_meeting(self):
        data=copy.deepcopy(self.fixture)
        data['planner']['meetings']=[{'id':'call-1','name':'Call','kind':'client','project':'General','slot':24,'length':4,'estimateMinutes':60,'date':'2026-10-12'}]
        self.save(data)
        data=self.read()
        data['planner']['meetings'][0]['slot']=28
        data['planner']['meetings'][0].pop('scheduledStart',None)
        self.save(data)
        read=self.read()
        self.assertEqual(read['planner']['meetings'][0]['slot'],28)
        self.assertEqual(m.Activity.objects.filter(meeting__isnull=False).count(),1)

    def test_meeting_minutes_time_and_actual_correction_reach_calendar(self):
        data=copy.deepcopy(self.fixture)
        for owner in [data['projects'][0],data['opportunities'][0]]:
            owner['meetingRecords'][0]['time']='14:10'
            owner['meetingRecords'][0]['durationMinutes']=50
        self.save(data)
        data=self.read()
        self.assertEqual(len(data['planner']['meetings']),1)
        calendar=data['planner']['meetings'][0]
        self.assertEqual(calendar['scheduledStart'],'2026-10-12T06:10:00+00:00')
        self.assertEqual(calendar['estimateMinutes'],50)
        calendar['actualStart']='2026-10-12T06:15:00+00:00'
        calendar['actualEnd']='2026-10-12T06:45:00+00:00'
        self.save(data)
        self.assertEqual(m.Meeting.objects.count(),1)
        meeting=m.Meeting.objects.get()
        self.assertEqual(meeting.actual_end-meeting.actual_start,timedelta(minutes=30))
        updated=self.read()
        self.assertEqual(updated['planner']['meetings'][0]['estimateMinutes'],50)
        self.assertEqual(updated['projects'][0]['meetingRecords'][0]['actualStart'],calendar['actualStart'])
        self.assertEqual(updated['projects'][0]['meetingRecords'][0]['actualEnd'],calendar['actualEnd'])

    def test_account_switch_guard_rejects_new_unsaved_records(self):
        data=copy.deepcopy(self.fixture)
        data['workspaceId']=str(self.other.pk)
        self.save(data,409)
        self.assertFalse(m.Client.objects.filter(workspace=self.user).exists())
        self.assertEqual(self.read()['workspaceId'],str(self.user.pk))

    def test_scope_request_produces_one_followup_with_stable_frontend_identity(self):
        data=self.rich_fixture()
        self.save(data)
        decision=m.Decision.objects.get(client_key='decision-1')
        followup=m.FollowUp.objects.get(decision=decision)
        self.assertEqual(followup.client_key,'scope-decision-1')
        self.assertEqual(followup.kind,'Clarification')
        read=self.read()
        action=next(a for a in read['projects'][0]['actionItems'] if a.get('decisionId')=='decision-1')
        self.assertEqual(action['meetingId'],read['projects'][0]['meetingRecords'][0]['id'])
        # Older tab payloads that have not seen the derived reminder cannot erase it.
        data['revision']=read['revision']
        self.save(data)
        self.assertEqual(m.FollowUp.objects.filter(decision=decision).count(),1)
        read=self.read()
        for owner in [read['opportunities'][0],read['projects'][0]]:
            next(a for a in owner['actionItems'] if a.get('decisionId')=='decision-1')['status']='Done'
        self.save(read)
        followup.refresh_from_db()
        self.assertEqual(followup.status,'Done')
        self.assertEqual(m.FollowUp.objects.filter(decision=decision).count(),1)

    def test_normalized_admin_created_client_has_stable_frontend_identity(self):
        client=m.Client.objects.create(workspace=self.user,name='Admin client')
        state=WorkspaceState.objects.get(user=self.user)
        self.assertGreater(state.revision,0)
        data=self.read()
        self.assertIsInstance(data['clients'][0]['id'],int)
        self.assertEqual(data['clients'][0]['serverId'],str(client.pk))

    def test_actual_session_auth_workspace_and_crud(self):
        self.api.force_authenticate(None)
        self.assertTrue(self.api.login(username='workspace-manager',password='test-manager-123'))
        self.save(self.fixture)
        read=self.read()
        self.assertEqual(read['clients'][0]['name'],'Live client')
        response=self.api.patch('/api/clients/'+read['clients'][0]['serverId']+'/',{'contact_name':'Edited through session'},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(self.read()['clients'][0]['contact'],'Edited through session')

    def test_daily_weekly_team_updates_preserve_source_and_reviewed_changes(self):
        data=self.rich_fixture()
        data['projects'][0]['teamUpdates']=[{'id':'update-1','kind':'daily','date':'2026-10-12','team':'Hanoi',
            'source':'Original Teams message\nBlocked on API','summary':'API blocker','yesterday':'Built tests','today':'Review auth','blockers':'API auth',
            'taskUpdates':[{'key':'org/repo#12','status':'Blocked'}],'accepted':True,'savedAt':'12 October'}]
        self.save(data)
        update=m.TeamUpdate.objects.get()
        self.assertTrue(update.accepted)
        self.assertEqual(update.proposed_changes,[{'key':'org/repo#12','status':'Blocked'}])
        self.assertEqual(self.read()['projects'][0]['teamUpdates'][0]['source'],'Original Teams message\nBlocked on API')
        data=self.read()
        data['projects'][0]['teamUpdates'].append({'id':'weekly-1','kind':'weekly','date':'2026-10-12','team':'Hanoi',
            'source':'Weekly plan','today':'Complete API','summary':'API this week','taskUpdates':[]})
        self.save(data)
        self.assertEqual(m.TeamUpdate.objects.count(),2)

    def test_populated_excel_upsert_appears_in_workspace_and_date_history(self):
        from integrations.exchange import workbook_bytes, parse_workbook, apply_import
        from openpyxl import load_workbook
        self.save(self.rich_fixture())
        stale=self.read()
        project=m.Project.objects.get()
        workbook=load_workbook(BytesIO(workbook_bytes('pbc',project)))
        workbook['PBC']['E2']='2026-10-25'
        workbook['PBC']['G2']='  Updated comment\nKeep spacing  '
        buffer=BytesIO()
        workbook.save(buffer)
        rows=parse_workbook('pbc',project,buffer.getvalue())
        apply_import('pbc',project,rows,'Client requested an extension')
        self.save(stale,409)
        read=self.read()
        pbc=next(a for a in read['projects'][0]['actionItems'] if a['kind']=='PBC')
        self.assertEqual(pbc['due'],'2026-10-25')
        self.assertEqual(pbc['comment'],'  Updated comment\nKeep spacing  ')
        self.assertTrue(any('Client requested an extension' in h.get('text','') for h in pbc['history']))
        self.save(read)
        self.assertEqual(m.PBCRequest.objects.count(),1)
        read=self.read()
        pbc=next(a for a in read['projects'][0]['actionItems'] if a['kind']=='PBC')
        self.assertEqual(len([h for h in pbc['history'] if h.get('serverAuditId')]),1)

    def test_attachment_remove_undo_and_section_assignment_persist(self):
        self.save(self.fixture)
        project=m.Project.objects.get()
        with TemporaryDirectory() as directory, override_settings(MEDIA_ROOT=directory):
            document=m.Document.objects.create(workspace=self.user,project=project,original_name='evidence.txt',
                file=SimpleUploadedFile('evidence.txt',b'Original evidence'),size=17)
            data=self.read()
            self.assertEqual(len(data['projects'][0]['repositoryFiles']),1)
            file=data['projects'][0]['repositoryFiles'][0]
            file['sectionId']=data['projects'][0]['repositorySections'][0]['id']
            self.save(data)
            data=self.read()
            retained=copy.deepcopy(data['projects'][0]['repositoryFiles'][0])
            data['projects'][0]['repositoryFiles']=[]
            self.save(data)
            document.refresh_from_db()
            self.assertTrue(document.metadata['archived'])
            self.assertTrue(document.file.storage.exists(document.file.name))
            data=self.read()
            self.assertEqual(data['projects'][0]['repositoryFiles'],[])
            data['projects'][0]['repositoryFiles']=[retained]
            self.save(data)
            self.assertEqual(len(self.read()['projects'][0]['repositoryFiles']),1)

    def test_admin_team_member_add_needs_no_workspace_uuid(self):
        self.user.is_staff=True
        self.user.is_superuser=True
        self.user.save()
        self.client.force_login(self.user)
        response=self.client.post('/admin/planner/teammember/add/',{'name':'New developer','team':'Hanoi','email':'new@example.com','role':'Developer','active':'on','_save':'Save'})
        self.assertEqual(response.status_code,302)
        member=m.TeamMember.objects.get(name='New developer')
        self.assertEqual(member.workspace_id,self.user.pk)

    def test_explicit_meeting_delete_retains_pbc_and_files_and_is_scoped(self):
        self.save(self.fixture)
        meeting=m.Meeting.objects.filter(workspace=self.user).first()
        request=m.PBCRequest.objects.create(workspace=self.user, project=meeting.project,
            opportunity=meeting.opportunity, meeting=meeting, request='Retain client request')
        document=m.Document.objects.create(workspace=self.user, project=meeting.project,
            meeting=meeting, file='retained/notes.docx', original_name='notes.docx')
        other_meeting=m.Meeting.objects.create(workspace=self.other,title='Other workspace',
            starts_at=timezone.now(),client_key='other-meeting')
        data=self.read()
        key=meeting.client_key
        activity_ids={str(a['id']) for a in data['planner']['meetings'] if str(a.get('meetingId'))==key}
        for owner in data['projects']+data['opportunities']:
            owner['meetingRecords']=[r for r in owner['meetingRecords'] if str(r['id'])!=key]
            owner['deletedMeetingIds']=[key,'other-meeting']
            for action in owner['actionItems']:
                if str(action.get('meetingId'))==key: action['meetingId']=''
        data['planner']['meetings']=[a for a in data['planner']['meetings'] if str(a['id']) not in activity_ids]
        data['planner']['sessions']=[s for s in data['planner']['sessions'] if str(s['itemId']) not in activity_ids]
        self.save(data)
        self.assertFalse(m.Meeting.objects.filter(pk=meeting.pk).exists())
        self.assertTrue(m.Meeting.objects.filter(pk=other_meeting.pk).exists())
        request.refresh_from_db();document.refresh_from_db()
        self.assertIsNone(request.meeting_id)
        self.assertIsNone(document.meeting_id)
        self.assertTrue(m.AuditEvent.objects.filter(workspace=self.user,action='deleted').exists())
        reread=self.read()
        self.assertFalse(any(str(r['id'])==key for o in reread['projects']+reread['opportunities'] for r in o['meetingRecords']))
        self.save(reread)

    def test_calendar_navigation_preserves_other_day_task_blocks(self):
        self.save(self.fixture)
        data=self.read();task=data['planner']['tasks'][0]
        task['date']='2026-10-20';task['slot']=8
        self.save(data)
        data=self.read();data['planner']['day']='2026-11-02';self.save(data)
        result=self.read();retained=next(t for t in result['planner']['tasks'] if t['id']==task['id'])
        self.assertEqual(retained['date'],'2026-10-20');self.assertEqual(retained['slot'],8)
