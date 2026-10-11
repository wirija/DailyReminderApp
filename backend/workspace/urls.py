from django.urls import path
from .views import workspace, revision

urlpatterns = [path('workspace/', workspace), path('workspace/revision/', revision)]
