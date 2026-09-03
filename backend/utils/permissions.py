from rest_framework import permissions
from django.utils import timezone


class IsStudent(permissions.BasePermission):
    """Permission for students only"""
    def has_permission(self, request, view):
        return request.user and request.user.role == 'student'


class IsStaff(permissions.BasePermission):
    """Permission for staff/admin only"""
    def has_permission(self, request, view):
        return request.user and request.user.role in ['staff', 'admin']


class IsAdmin(permissions.BasePermission):
    """Permission for admin only"""
    def has_permission(self, request, view):
        return request.user and request.user.role == 'admin'


class IsExamCreator(permissions.BasePermission):
    """Permission to check if user is exam creator"""
    def has_object_permission(self, request, view, obj):
        return obj.created_by == request.user


class IsExamNotStarted(permissions.BasePermission):
    """Permission to check if exam has not started yet"""
    def has_object_permission(self, request, view, obj):
        return obj.start_time > timezone.now()


class CanAttemptExam(permissions.BasePermission):
    """Permission to attempt exam"""
    def has_permission(self, request, view):
        if not request.user.role == 'student':
            return False
        return True
