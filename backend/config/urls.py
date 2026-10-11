from django.contrib import admin
from django.urls import include, path, re_path
from django.views.generic import RedirectView
from accounts import views

urlpatterns = [
    path('', RedirectView.as_view(url='/app/', permanent=False)),
    path('health/', views.health, name='health'),
    path('administration/users/', views.user_administration, name='user-administration'),
    path('admin/', admin.site.urls),
    path('accounts/login/', views.PlannerLoginView.as_view(), name='login'),
    path('accounts/logout/', views.PlannerLogoutView.as_view(), name='logout'),
    path('accounts/', include('allauth.urls')),
    path('api/auth/session/', views.session, name='session'),
    path('api/', include('planner.urls')),
    path('api/', include('workspace.urls')),
    path('api/integrations/', include('integrations.urls')),
    re_path(r'^app/(?P<asset>.*)$', views.app_asset, name='app'),
]
