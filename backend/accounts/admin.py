from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, ExternalIdentity
admin.site.register(User, UserAdmin)

@admin.register(ExternalIdentity)
class ExternalIdentityAdmin(admin.ModelAdmin):
    list_display = ('user', 'tenant_id', 'object_id', 'created_at')
    readonly_fields = ('user', 'tenant_id', 'object_id', 'created_at')
    def has_add_permission(self, request):
        return False
