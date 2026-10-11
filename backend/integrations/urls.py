from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("connections", views.ConnectionViewSet, basename="connection")
router.register("jobs", views.JobViewSet, basename="integration-job")
router.register("remote-issues", views.RemoteIssueViewSet, basename="remote-issue")
router.register("ai/drafts", views.DraftViewSet, basename="ai-draft")

urlpatterns = [
    path("ai/capabilities/", views.ai_capabilities),
    path("", include(router.urls)),
    path("projects/<str:project>/<str:kind>/template.xlsx", views.excel_template),
    path("projects/<str:project>/<str:kind>/import/", views.excel_import),
    path("meetings/template.docx", views.word_template),
    path("meetings/import/", views.word_import),
    path("files/", views.file_upload),
    path("files/<str:document>/download/", views.file_download),
]
