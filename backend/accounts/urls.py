from django.urls import path, include
from rest_framework import routers
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from accounts.views import (
    UserRegistrationView, UserProfileView, UserListView,
    StaffStudentListView, StaffStudentDetailView, ChangePasswordView,
    NotificationListView, NotificationMarkReadView, NotificationCountView,
    AnnouncementListView, StaffAnnouncementListView, StaffAnnouncementDetailView,
    LeaderboardView, UserBadgesView, UserPointsHistoryView, StudentAnalyticsView
)


urlpatterns = [
    # Authentication
    path('register/', UserRegistrationView.as_view(), name='register'),
    path('login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # User Profile
    path('users/profile/', UserProfileView.as_view(), name='profile'),
    path('users/change-password/', ChangePasswordView.as_view(), name='change_password'),
    path('users/', UserListView.as_view(), name='user_list'),
    
    # Notifications
    path('notifications/', NotificationListView.as_view(), name='notification_list'),
    path('notifications/mark-read/', NotificationMarkReadView.as_view(), name='notification_mark_read'),
    path('notifications/count/', NotificationCountView.as_view(), name='notification_count'),
    
    # Announcements (student view)
    path('announcements/', AnnouncementListView.as_view(), name='announcement_list'),
    
    # Gamification
    path('leaderboard/', LeaderboardView.as_view(), name='leaderboard'),
    path('badges/', UserBadgesView.as_view(), name='user_badges'),
    path('points/', UserPointsHistoryView.as_view(), name='user_points'),
    path('analytics/', StudentAnalyticsView.as_view(), name='student_analytics'),
    
    # Staff Student Management
    path('staff/students/', StaffStudentListView.as_view(), name='staff_student_list'),
    path('staff/students/<uuid:id>/', StaffStudentDetailView.as_view(), name='staff_student_detail'),
    
    # Staff Announcements
    path('staff/announcements/', StaffAnnouncementListView.as_view(), name='staff_announcement_list'),
    path('staff/announcements/<uuid:id>/', StaffAnnouncementDetailView.as_view(), name='staff_announcement_detail'),
]

