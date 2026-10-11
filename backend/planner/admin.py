from django.contrib import admin
from django.contrib.auth import get_user_model
from django.db import transaction
from . import models


class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ("id", "workspace", "created_at", "updated_at")
    list_filter = ("workspace",)
    readonly_fields = ("id", "created_at", "updated_at")

    def lock_changes(self, request, object_id=None):
        if request.method != 'POST':
            return
        ids = {request.user.pk}
        if object_id:
            obj = self.get_object(request, object_id)
            if obj:
                ids.add(obj.workspace_id)
        else:
            selected = request.POST.getlist('_selected_action')
            if selected:
                ids.update(self.get_queryset(request).filter(pk__in=selected).values_list('workspace_id', flat=True))
        for user_id in sorted(ids, key=str):
            get_user_model().objects.select_for_update().get(pk=user_id)

    @transaction.atomic
    def changeform_view(self, request, object_id=None, form_url='', extra_context=None):
        self.lock_changes(request, object_id)
        return super().changeform_view(request, object_id, form_url, extra_context)

    @transaction.atomic
    def delete_view(self, request, object_id, extra_context=None):
        self.lock_changes(request, object_id)
        return super().delete_view(request, object_id, extra_context)

    @transaction.atomic
    def changelist_view(self, request, extra_context=None):
        self.lock_changes(request)
        return super().changelist_view(request, extra_context)

    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        return queryset if request.user.is_superuser else queryset.filter(workspace=request.user)

    def has_module_permission(self, request):
        return request.user.is_superuser

    def has_view_permission(self, request, obj=None):
        return request.user.is_superuser

    def has_add_permission(self, request):
        return request.user.is_superuser

    def has_change_permission(self, request, obj=None):
        return request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser

    def save_model(self, request, obj, form, change):
        from .audit import record_event, snapshot
        get_user_model().objects.select_for_update().get(pk=obj.workspace_id)
        before = snapshot(type(obj).objects.get(pk=obj.pk)) if change else {}
        super().save_model(request, obj, form, change)
        record_event(obj.workspace, obj, "admin_updated" if change else "admin_created", before, actor=request.user, reason="Changed through administration.")

    def delete_model(self, request, obj):
        from .audit import record_event, snapshot
        record_event(obj.workspace, obj, 'admin_deleted', snapshot(obj), after={}, actor=request.user, reason='Removed through administration.')
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            self.delete_model(request, obj)


for model in (models.Client, models.Opportunity, models.Project, models.Phase, models.WorkItem,
              models.Milestone, models.Meeting, models.Attendee, models.Decision, models.NextAction, models.FollowUp,
              models.PBCRequest, models.Issue, models.AgreedSection, models.AgreedItem, models.DocumentSection,
              models.Document, models.Activity, models.ScheduleBlock, models.TimeSession, models.TeamUpdate):
    admin.site.register(model, WorkspaceAdmin)


@admin.register(models.TeamMember)
class TeamMemberAdmin(WorkspaceAdmin):
    list_display = ('name', 'team', 'email', 'role', 'active')
    list_filter = ('team', 'active')
    search_fields = ('name', 'team', 'email', 'role')
    fields = ('name', 'team', 'email', 'role', 'active')

    def save_model(self, request, obj, form, change):
        if not change:
            obj.workspace = request.user
        super().save_model(request, obj, form, change)


@admin.register(models.AuditEvent)
class AuditAdmin(admin.ModelAdmin):
    list_display = ("created_at", "workspace", "target_type", "action", "reason")
    readonly_fields = [field.name for field in models.AuditEvent._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
