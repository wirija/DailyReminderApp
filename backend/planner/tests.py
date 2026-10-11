from datetime import datetime, timedelta
from tempfile import TemporaryDirectory
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as ModelValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import path, include
from django.utils import timezone
from rest_framework.test import APIClient

from . import models
from .audit import record_event
from .services import work_summary


urlpatterns = [path("api/", include("planner.urls"))]


@override_settings(ROOT_URLCONF=__name__, REST_FRAMEWORK={
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
})
class PlannerAPITests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="manager", password="test-manager-123")
        self.other = get_user_model().objects.create_user(username="other", password="test-other-123")
        self.api = APIClient()
        self.api.force_authenticate(self.user)
        self.client_record = models.Client.objects.create(workspace=self.user, name="Client A")
        self.project = models.Project.objects.create(workspace=self.user, name="Portal", start_date="2026-10-01", end_date="2026-11-01")
        self.project.clients.add(self.client_record)
        self.phase = models.Phase.objects.create(workspace=self.user, project=self.project, name="Delivery")

    def post(self, route, data):
        return self.api.post("/api/" + route + "/", data, format="json")

    def test_login_required_and_workspace_reads_isolated(self):
        models.Client.objects.create(workspace=self.other, name="Private")
        listing = self.api.get("/api/clients/").data
        self.assertEqual(len(listing.get("results", []) if isinstance(listing, dict) else listing), 1)
        self.api.force_authenticate(None)
        self.assertEqual(self.api.get("/api/clients/").status_code, 403)

    def test_cross_workspace_write_and_relation_are_rejected(self):
        other_client = models.Client.objects.create(workspace=self.other, name="Private")
        self.assertEqual(self.api.patch(f"/api/clients/{other_client.pk}/", {"name": "stolen"}).status_code, 404)
        response = self.post("opportunities", {"name": "Attempt", "client": str(other_client.pk)})
        self.assertEqual(response.status_code, 400, response.data)
        other_member = models.TeamMember.objects.create(workspace=self.other, name="Private person")
        response = self.post("phases", {"project": str(self.project.pk), "name": "Phase", "owners": [str(other_member.pk)]})
        self.assertEqual(response.status_code, 400, response.data)

    def test_project_supports_multiple_clients_and_seeds_sections(self):
        other_client = models.Client.objects.create(workspace=self.user, name="Client B")
        response = self.post("projects", {"name": "New", "clients": [str(self.client_record.pk), str(other_client.pk)]})
        self.assertEqual(response.status_code, 201, response.data)
        project = models.Project.objects.get(pk=response.data["id"])
        self.assertEqual(project.clients.count(), 2)
        self.assertEqual(project.agreed_sections.count(), 8)
        self.assertEqual(project.document_sections.count(), 8)

    def test_date_change_requires_reason_and_audits_before_after(self):
        url = f"/api/projects/{self.project.pk}/"
        self.assertEqual(self.api.patch(url, {"end_date": "2026-11-05"}, format="json").status_code, 400)
        response = self.api.patch(url, {"end_date": "2026-11-05", "change_reason": "Client moved UAT"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        event = models.AuditEvent.objects.get(target_id=str(self.project.pk))
        self.assertEqual(event.before["end_date"], "2026-11-01")
        self.assertEqual(event.after["end_date"], "2026-11-05")
        self.assertEqual(event.reason, "Client moved UAT")
        self.assertEqual(self.api.patch(url, {"start_date": "2027-01-01", "change_reason": "Invalid"}, format="json").status_code, 400)

    def test_audit_is_read_only_and_cannot_be_mutated(self):
        event = record_event(self.user, self.project, "created")
        event.reason = "Rewrite"
        with self.assertRaises(ModelValidationError):
            event.save()
        with self.assertRaises(ModelValidationError):
            models.AuditEvent.objects.filter(pk=event.pk).delete()
        self.assertEqual(self.api.delete(f"/api/audit-events/{event.pk}/").status_code, 405)
        self.assertEqual(self.api.post("/api/audit-events/", {}).status_code, 405)

    def test_win_is_atomic_and_idempotent_and_retains_context(self):
        opportunity = models.Opportunity.objects.create(workspace=self.user, client=self.client_record, name="Reporting", notes="Agreed context")
        meeting = models.Meeting.objects.create(workspace=self.user, opportunity=opportunity, title="Discovery", starts_at=timezone.now())
        url = f"/api/opportunities/{opportunity.pk}/win/"
        response = self.api.post(url, {"start_date": "2026-11-01", "end_date": "2026-10-01"}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(models.Project.objects.filter(opportunity=opportunity).exists())
        response = self.api.post(url, {"start_date": "2026-10-01", "end_date": "2026-11-01"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        second = self.api.post(url, {}, format="json")
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(response.data["id"], second.data["id"])
        project = models.Project.objects.get(opportunity=opportunity)
        self.assertEqual(project.notes, "Agreed context")
        self.assertTrue(project.clients.filter(pk=self.client_record.pk).exists())
        meeting.refresh_from_db()
        self.assertEqual(meeting.project_id, project.pk)
        opportunity.refresh_from_db()
        self.assertEqual(opportunity.stage, "Won")
        self.assertEqual(self.api.patch(f"/api/opportunities/{opportunity.pk}/", {"stage": "Lost"}).status_code, 400)

    def test_cannot_mark_won_without_handover(self):
        response = self.post("opportunities", {"client": str(self.client_record.pk), "name": "Skipped", "stage": "Won"})
        self.assertEqual(response.status_code, 400)

    def test_document_upload_uses_shared_twenty_mebibyte_limit(self):
        from .serializers import DocumentSerializer
        from rest_framework.exceptions import ValidationError
        upload=SimpleUploadedFile('large.txt',b'x')
        upload.size=20*1024*1024+1
        with self.assertRaises(ValidationError):
            DocumentSerializer().validate_file(upload)
        upload.size=20*1024*1024
        self.assertIs(DocumentSerializer().validate_file(upload),upload)
        with override_settings(MAX_DOCUMENT_SIZE=512):
            upload.size=513
            with self.assertRaises(ValidationError):
                DocumentSerializer().validate_file(upload)

    def test_hierarchy_validates_project_and_parent_and_keeps_owners_independent(self):
        lead = models.TeamMember.objects.create(workspace=self.user, name="Lead", team="Singapore")
        developer = models.TeamMember.objects.create(workspace=self.user, name="Developer", team="Hanoi")
        response = self.post("work-items", {"project": str(self.project.pk), "phase": str(self.phase.pk), "name": "API", "owners": [str(lead.pk)]})
        self.assertEqual(response.status_code, 201, response.data)
        parent = models.WorkItem.objects.get(pk=response.data["id"])
        sub = self.post("work-items", {"project": str(self.project.pk), "phase": str(self.phase.pk), "parent": str(parent.pk), "kind": "subtask", "name": "Authentication", "owners": [str(developer.pk)]})
        self.assertEqual(sub.status_code, 201, sub.data)
        self.assertEqual(list(parent.owners.all()), [lead])
        other_project = models.Project.objects.create(workspace=self.user, name="Other")
        invalid = self.post("work-items", {"project": str(other_project.pk), "phase": str(self.phase.pk), "name": "Cross project"})
        self.assertEqual(invalid.status_code, 400)
        invalid = self.post("work-items", {"project": str(self.project.pk), "phase": str(self.phase.pk), "parent": sub.data["id"], "kind": "subtask", "name": "Too deep"})
        self.assertEqual(invalid.status_code, 400)

    def test_explicit_imported_references_do_not_collide_with_generated_ids(self):
        models.Project.objects.create(workspace=self.user, name="Imported", reference="PRJ-090")
        new_project = models.Project.objects.create(workspace=self.user, name="New")
        self.assertEqual(new_project.reference, "PRJ-091")
        models.PBCRequest.objects.create(workspace=self.user, project=self.project, reference="PBC-015", request="Old")
        request = models.PBCRequest.objects.create(workspace=self.user, project=self.project, request="New")
        self.assertEqual(request.reference, "PBC-016")

    def test_pbc_request_and_comment_remain_separate_and_project_scoped(self):
        response = self.post("pbc", {"project": str(self.project.pk), "request": "Sample data", "comment": "Followed up; no reply", "request_date": "2026-10-01", "due_date": "2026-10-10"})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["reference"], "PBC-001")
        self.assertEqual(response.data["comment"], "Followed up; no reply")
        invalid = self.post("pbc", {"project": str(self.project.pk), "request": "Invalid", "request_date": "2026-10-10", "due_date": "2026-10-01"})
        self.assertEqual(invalid.status_code, 400)

    def test_task_and_meeting_can_overlap_but_two_running_tasks_cannot(self):
        task = models.Activity.objects.create(workspace=self.user, title="Review")
        other = models.Activity.objects.create(workspace=self.user, title="Another")
        meeting = models.Activity.objects.create(workspace=self.user, title="Client call", category="client_meeting")
        self.assertEqual(self.api.post(f"/api/activities/{task.pk}/start/").status_code, 200)
        self.assertEqual(self.api.post(f"/api/activities/{task.pk}/start/").status_code, 200)
        self.assertEqual(models.TimeSession.objects.filter(activity=task).count(), 1)
        self.assertEqual(self.api.post(f"/api/activities/{other.pk}/start/").status_code, 400)
        self.assertEqual(self.api.post(f"/api/activities/{meeting.pk}/start/").status_code, 200)
        self.assertEqual(models.TimeSession.objects.filter(ends_at__isnull=True).count(), 2)
        self.assertEqual(self.api.post(f"/api/activities/{task.pk}/pause/").status_code, 200)
        self.assertEqual(self.api.post(f"/api/activities/{task.pk}/start/").status_code, 200)
        self.assertEqual(self.api.post(f"/api/activities/{task.pk}/finish/").status_code, 200)
        self.assertEqual(models.TimeSession.objects.filter(activity=task).count(), 2)
        self.assertEqual(models.TimeSession.objects.filter(ends_at__isnull=True).count(), 1)

    def test_union_time_report_and_singapore_overtime(self):
        zone = ZoneInfo("Asia/Singapore")
        monday = datetime(2026,10,5,8,30,tzinfo=zone)
        activity = models.Activity.objects.create(workspace=self.user, title="Review")
        models.TimeSession.objects.create(workspace=self.user, activity=activity, starts_at=monday, ends_at=monday+timedelta(hours=2))
        models.Meeting.objects.create(workspace=self.user, title="Client call", starts_at=monday+timedelta(minutes=30), duration_minutes=60)
        saturday = datetime(2026,10,10,10,tzinfo=zone)
        models.TimeSession.objects.create(workspace=self.user, activity=activity, starts_at=saturday, ends_at=saturday+timedelta(hours=1))
        with patch("planner.services.timezone.now", return_value=datetime(2026,10,12,tzinfo=zone)):
            summary = work_summary(self.user,monday-timedelta(hours=1),saturday+timedelta(hours=2))
        self.assertEqual(summary["total_seconds"], 3*3600)
        self.assertEqual(summary["normal_seconds"], 105*60)
        self.assertEqual(summary["overtime_seconds"], 75*60)

    def test_meeting_timers_replace_estimate_and_correction_replaces_timer(self):
        zone = ZoneInfo("Asia/Singapore")
        start = datetime(2026,10,5,10,tzinfo=zone)
        meeting = models.Meeting.objects.create(workspace=self.user,title="Client call",starts_at=start,duration_minutes=60)
        activity = models.Activity.objects.create(workspace=self.user,title="Call",meeting=meeting,category="client_meeting")
        models.TimeSession.objects.create(workspace=self.user,activity=activity,starts_at=start,ends_at=start+timedelta(minutes=20))
        with patch("planner.services.timezone.now",return_value=start+timedelta(days=1)):
            summary=work_summary(self.user,start,start+timedelta(hours=2))
        self.assertEqual(summary['total_seconds'],20*60)
        meeting.actual_start=start
        meeting.actual_end=start+timedelta(minutes=30)
        meeting.save()
        with patch("planner.services.timezone.now",return_value=start+timedelta(days=1)):
            summary=work_summary(self.user,start,start+timedelta(hours=2))
        self.assertEqual(summary['total_seconds'],30*60)

    def test_meeting_creates_pinned_activity_and_unconfirmed_scope_followup(self):
        response = self.post("meetings", {"title": "Workshop", "project": str(self.project.pk), "starts_at": "2026-10-13T14:00:00+08:00", "duration_minutes": 60})
        self.assertEqual(response.status_code, 201, response.data)
        meeting = models.Meeting.objects.get(pk=response.data["id"])
        self.assertTrue(meeting.activity.blocks.get().pinned)
        decision = self.post("decisions", {"meeting": str(meeting.pk), "text": "Add dashboard", "is_scope_change": True})
        self.assertEqual(decision.status_code, 201, decision.data)
        self.assertEqual(meeting.follow_ups.get().kind, "Clarification")

    def test_daily_discrepancies_do_not_persist_to_next_day(self):
        today = timezone.localdate(timezone.now(),ZoneInfo("Asia/Singapore"))
        models.TeamUpdate.objects.create(workspace=self.user, project=self.project, source_text="Yesterday",update_date=today-timedelta(days=1),discrepancies=["Old mismatch"])
        models.TeamUpdate.objects.create(workspace=self.user, project=self.project, source_text="Today",update_date=today,discrepancies=["Current mismatch"])
        response = self.api.get(f"/api/projects/{self.project.pk}/attention/")
        discrepancies = [flag["detail"] for flag in response.data["flags"] if flag["kind"]=="daily_discrepancy"]
        self.assertEqual(discrepancies,["Current mismatch"])

    def test_private_document_download_and_version_retention(self):
        with TemporaryDirectory() as directory, override_settings(MEDIA_ROOT=directory):
            response = self.api.post("/api/documents/", {"project": str(self.project.pk), "file": SimpleUploadedFile("notes.txt", b"Private notes", content_type="text/plain")}, format="multipart")
            self.assertEqual(response.status_code, 201, response.data)
            self.assertNotIn("file", response.data)
            url = response.data["download_url"]
            download = self.api.get(url)
            self.assertEqual(b"".join(download.streaming_content), b"Private notes")
            self.assertEqual(download["Cache-Control"], "private, no-store")
            self.api.force_authenticate(self.other)
            self.assertEqual(self.api.get(url).status_code, 404)
            self.api.force_authenticate(self.user)
            invalid = self.api.patch(f"/api/documents/{response.data['id']}/", {"file": SimpleUploadedFile("overwrite.txt", b"Changed")},format="multipart")
            self.assertEqual(invalid.status_code, 400)
            newer = self.api.post("/api/documents/", {"project": str(self.project.pk), "previous_version": response.data["id"], "file": SimpleUploadedFile("notes.txt", b"Updated")},format="multipart")
            self.assertEqual(newer.status_code, 201,newer.data)
            self.assertEqual(newer.data["version"],2)
            self.assertEqual(models.Document.objects.count(),2)

    def test_calendar_swap_is_atomic_and_does_not_change_deadlines(self):
        start = timezone.now().replace(hour=8,minute=0,second=0,microsecond=0)
        a = models.Activity.objects.create(workspace=self.user,title="A",deadline="2026-11-01")
        b = models.Activity.objects.create(workspace=self.user,title="B",deadline="2026-11-02")
        block_a = models.ScheduleBlock.objects.create(workspace=self.user,activity=a,starts_at=start,ends_at=start+timedelta(minutes=30))
        block_b = models.ScheduleBlock.objects.create(workspace=self.user,activity=b,starts_at=start+timedelta(hours=2),ends_at=start+timedelta(hours=3))
        response = self.api.post(f"/api/schedule-blocks/{block_a.pk}/swap/", {"target":str(block_b.pk)},format="json")
        self.assertEqual(response.status_code,200,response.data)
        block_a.refresh_from_db()
        self.assertEqual(block_a.starts_at,start+timedelta(hours=2))
        self.assertTrue(block_a.pinned)
        a.refresh_from_db()
        self.assertEqual(str(a.deadline),"2026-11-01")
