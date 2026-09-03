from django.contrib import admin
from accounts.models import User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ['email', 'name', 'role', 'department', 'created_at']
    list_filter = ['role', 'created_at']
    search_fields = ['email', 'name', 'enrollment_id']
    readonly_fields = ['id', 'created_at', 'updated_at']
    fieldsets = (
        ('Personal Information', {
            'fields': ('id', 'email', 'username', 'name', 'department')
        }),
        ('Account Details', {
            'fields': ('role', 'enrollment_id', 'is_active', 'is_staff', 'is_superuser')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
