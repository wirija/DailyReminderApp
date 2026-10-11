from django.urls import path
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
for route, view in [
    ("clients", views.ClientViewSet), ("team-members", views.TeamMemberViewSet),
    ("opportunities", views.OpportunityViewSet), ("next-actions", views.NextActionViewSet),
    ("projects", views.ProjectViewSet), ("phases", views.PhaseViewSet), ("work-items", views.WorkItemViewSet),
    ("milestones", views.MilestoneViewSet), ("meetings", views.MeetingViewSet), ("attendees", views.AttendeeViewSet),
    ("decisions", views.DecisionViewSet), ("follow-ups", views.FollowUpViewSet), ("pbc", views.PBCRequestViewSet),
    ("issues", views.IssueViewSet), ("agreed-sections", views.AgreedSectionViewSet), ("agreed-items", views.AgreedItemViewSet),
    ("document-sections", views.DocumentSectionViewSet), ("documents", views.DocumentViewSet),
    ("activities", views.ActivityViewSet), ("schedule-blocks", views.ScheduleBlockViewSet),
    ("time-sessions", views.TimeSessionViewSet), ("team-updates", views.TeamUpdateViewSet), ("audit-events", views.AuditEventViewSet),
]:
    router.register(route, view, basename=route)
urlpatterns = [path("time-report/", views.time_report)] + router.urls
