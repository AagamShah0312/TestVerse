from django.db import models
from rest_framework import viewsets, status, generics, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView
from accounts.models import User
from accounts.serializers import (
    UserRegistrationSerializer, UserProfileSerializer, UserDetailSerializer
)


class UserRegistrationView(generics.CreateAPIView):
    """User registration endpoint"""
    queryset = User.objects.all()
    serializer_class = UserRegistrationSerializer
    permission_classes = [permissions.AllowAny]
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        
        # Generate tokens
        refresh = RefreshToken.for_user(user)
        
        return Response({
            'success': True,
            'message': 'User registered successfully',
            'token': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserDetailSerializer(user).data
        }, status=status.HTTP_201_CREATED)


class UserProfileView(generics.RetrieveUpdateAPIView):
    """Get and update user profile"""
    serializer_class = UserProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_object(self):
        return self.request.user


class UserListView(generics.ListAPIView):
    """List all users (admin only)"""
    queryset = User.objects.all()
    serializer_class = UserDetailSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        # Only admin can view all users
        if self.request.user.role != 'admin':
            return User.objects.filter(id=self.request.user.id)
        return User.objects.all()


class StaffStudentListView(generics.ListAPIView):
    """List all students and staff for staff to manage"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get_serializer_class(self):
        from accounts.serializers import StudentListSerializer
        return StudentListSerializer
    
    def get_queryset(self):
        # Only staff can view users
        if self.request.user.role != 'staff':
            return User.objects.none()
        
        queryset = User.objects.filter(role__in=['student', 'staff']).order_by('-created_at')
        
        # Search by name or email
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                models.Q(name__icontains=search) |
                models.Q(email__icontains=search) |
                models.Q(enrollment_id__icontains=search)
            )
        
        # Filter by department
        department = self.request.query_params.get('department')
        if department:
            if department == 'unassigned':
                queryset = queryset.filter(models.Q(department__isnull=True) | models.Q(department=''))
            else:
                queryset = queryset.filter(department=department)
        
        return queryset


class StaffStudentDetailView(generics.RetrieveUpdateAPIView):
    """Get and update a student (staff can assign department and change roles)"""
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = 'id'
    
    def get_serializer_class(self):
        from accounts.serializers import StudentUpdateSerializer
        return StudentUpdateSerializer
    
    def get_queryset(self):
        # Only staff can manage students
        if self.request.user.role != 'staff':
            return User.objects.none()
        return User.objects.all()  # Allow managing both students and staff
    
    def update(self, request, *args, **kwargs):
        # Only staff can update user info
        if request.user.role != 'staff':
            return Response({'error': 'Staff access required'}, status=status.HTTP_403_FORBIDDEN)
        
        return super().update(request, *args, **kwargs)


class ChangePasswordView(generics.GenericAPIView):
    """Change user password"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get_serializer_class(self):
        from accounts.serializers import ChangePasswordSerializer
        return ChangePasswordSerializer
    
    def post(self, request, *args, **kwargs):
        user = request.user
        old_password = request.data.get('old_password')
        new_password = request.data.get('new_password')
        confirm_password = request.data.get('confirm_password')
        
        # Validate inputs
        if not old_password or not new_password or not confirm_password:
            return Response({
                'error': 'All fields are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check old password
        if not user.check_password(old_password):
            return Response({
                'error': 'Current password is incorrect'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check new password match
        if new_password != confirm_password:
            return Response({
                'error': 'New passwords do not match'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check password length
        if len(new_password) < 6:
            return Response({
                'error': 'Password must be at least 6 characters'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Change password
        user.set_password(new_password)
        user.save()
        
        return Response({
            'success': True,
            'message': 'Password changed successfully'
        }, status=status.HTTP_200_OK)


class NotificationListView(generics.ListAPIView):
    """List notifications for authenticated user"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get_serializer_class(self):
        from accounts.serializers import NotificationSerializer
        return NotificationSerializer
    
    def get_queryset(self):
        from accounts.models import Notification
        queryset = Notification.objects.filter(user=self.request.user)
        
        # Filter by read status
        is_read = self.request.query_params.get('is_read')
        if is_read is not None:
            queryset = queryset.filter(is_read=is_read.lower() == 'true')
        
        return queryset[:50]  # Limit to 50 notifications


class NotificationMarkReadView(generics.GenericAPIView):
    """Mark notifications as read"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get_serializer_class(self):
        from accounts.serializers import NotificationMarkReadSerializer
        return NotificationMarkReadSerializer
    
    def post(self, request, *args, **kwargs):
        from accounts.models import Notification
        
        notification_ids = request.data.get('notification_ids', [])
        mark_all = request.data.get('mark_all', False)
        
        if mark_all:
            Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
            return Response({'message': 'All notifications marked as read'})
        
        if notification_ids:
            Notification.objects.filter(
                id__in=notification_ids,
                user=request.user
            ).update(is_read=True)
        
        return Response({'message': 'Notifications marked as read'})


class NotificationCountView(generics.GenericAPIView):
    """Get unread notification count"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get_serializer_class(self):
        from rest_framework import serializers
        return serializers.Serializer  # No input data needed
    
    def get(self, request, *args, **kwargs):
        from accounts.models import Notification
        count = Notification.objects.filter(user=request.user, is_read=False).count()
        return Response({'unread_count': count})


class AnnouncementListView(generics.ListAPIView):
    """List announcements for students"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get_serializer_class(self):
        from accounts.serializers import AnnouncementSerializer
        return AnnouncementSerializer
    
    def get_queryset(self):
        from accounts.models import Announcement
        user = self.request.user
        queryset = Announcement.objects.filter(is_active=True)
        
        # Filter by user's department
        if user.department:
            queryset = queryset.filter(
                models.Q(target_departments=[]) |
                models.Q(target_departments__contains=[user.department])
            )
        
        return queryset


class StaffAnnouncementListView(generics.ListCreateAPIView):
    """List and create announcements (staff only)"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get_serializer_class(self):
        if self.request.method == 'POST':
            from accounts.serializers import AnnouncementCreateSerializer
            return AnnouncementCreateSerializer
        from accounts.serializers import AnnouncementSerializer
        return AnnouncementSerializer
    
    def get_queryset(self):
        from accounts.models import Announcement
        if self.request.user.role != 'staff':
            return Announcement.objects.none()
        return Announcement.objects.all()
    
    def perform_create(self, serializer):
        from accounts.models import Notification
        if self.request.user.role != 'staff':
            return Response({'error': 'Staff only'}, status=status.HTTP_403_FORBIDDEN)
        
        announcement = serializer.save(created_by=self.request.user)
        
        # Create notifications for targeted users
        target_depts = announcement.target_departments
        users = User.objects.filter(role='student')
        
        if target_depts:
            users = users.filter(department__in=target_depts)
        
        notifications = [
            Notification(
                user=user,
                type='announcement',
                title=announcement.title,
                message=announcement.content[:200],
                link=f'/pages/student/notifications.html'
            )
            for user in users
        ]
        Notification.objects.bulk_create(notifications)


class StaffAnnouncementDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Get, update, delete announcement (staff only)"""
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = 'id'
    
    def get_serializer_class(self):
        from accounts.serializers import AnnouncementSerializer
        return AnnouncementSerializer
    
    def get_queryset(self):
        from accounts.models import Announcement
        if self.request.user.role != 'staff':
            return Announcement.objects.none()
        return Announcement.objects.all()


class LeaderboardView(generics.GenericAPIView):
    """Get leaderboard with top students by points"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get_serializer_class(self):
        from accounts.serializers import LeaderboardSerializer
        return LeaderboardSerializer
    
    def get(self, request, *args, **kwargs):
        from accounts.models import User, UserPoints, UserBadge
        from django.db.models import Sum, Count
        
        # Get top 50 students by total points
        leaderboard = User.objects.filter(role='student').annotate(
            total_points=Sum('user_points__points'),
            badge_count=Count('user_badges')
        ).filter(total_points__gt=0).order_by('-total_points')[:50]
        
        # Format response with rank
        result = []
        for rank, user in enumerate(leaderboard, 1):
            result.append({
                'rank': rank,
                'user_id': str(user.id),
                'name': user.name,
                'department': user.department,
                'total_points': user.total_points or 0,
                'badge_count': user.badge_count
            })
        
        # Find current user's rank if not in top 50
        user_in_list = any(u['user_id'] == str(request.user.id) for u in result)
        current_user_rank = None
        
        if not user_in_list:
            user_points = UserPoints.objects.filter(user=request.user).aggregate(total=Sum('points'))['total'] or 0
            users_ahead = User.objects.filter(role='student').annotate(
                total_points=Sum('user_points__points')
            ).filter(total_points__gt=user_points).count()
            current_user_rank = users_ahead + 1
        
        return Response({
            'leaderboard': result,
            'current_user_rank': current_user_rank
        })


class UserBadgesView(generics.ListAPIView):
    """List badges for authenticated user"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get_serializer_class(self):
        from accounts.serializers import UserBadgeSerializer
        return UserBadgeSerializer
    
    def get_queryset(self):
        from accounts.models import UserBadge
        return UserBadge.objects.filter(user=self.request.user)


class UserPointsHistoryView(generics.ListAPIView):
    """List points history for authenticated user"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get_serializer_class(self):
        from accounts.serializers import UserPointsSerializer
        return UserPointsSerializer
    
    def get_queryset(self):
        from accounts.models import UserPoints
        return UserPoints.objects.filter(user=self.request.user)[:50]


class StudentAnalyticsView(generics.GenericAPIView):
    """Get student analytics: performance trends, stats"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get_serializer_class(self):
        from accounts.serializers import StudentAnalyticsSerializer
        return StudentAnalyticsSerializer
    
    def get(self, request, *args, **kwargs):
        from exams.models import Result
        from accounts.models import UserPoints, UserBadge
        from django.db.models import Avg, Sum
        
        user = request.user
        
        # Use fields that actually exist on Result to avoid 500s.
        results = Result.objects.filter(student=user).select_related('exam').order_by('submitted_at', 'created_at')
        
        # Calculate stats
        total_exams = results.count()
        passed_exams = results.filter(status='pass').count()
        failed_exams = results.filter(status='fail').count()
        avg_score = results.aggregate(avg=Avg('percentage'))['avg'] or 0
        
        # Total points
        total_points = UserPoints.objects.filter(user=user).aggregate(total=Sum('points'))['total'] or 0
        
        # Badge count
        badge_count = UserBadge.objects.filter(user=user).count()
        
        # Performance trend (last 10 exams), oldest first for chart rendering.
        latest_results = list(results.order_by('-submitted_at', '-created_at')[:10])
        recent_results = [
            {
                'exam_title': row.exam.title if row.exam else '',
                'percentage': float(row.percentage or 0),
                'status': row.status,
                'submitted_at': row.submitted_at,
            }
            for row in reversed(latest_results)
        ]
        
        # Calculate improvement (compare recent 5 vs older 5)
        recent_scores = [float(r.percentage) for r in latest_results[:5] if r.percentage is not None]
        older_scores = [float(r.percentage) for r in latest_results[5:10] if r.percentage is not None]
        recent_avg = (sum(recent_scores) / len(recent_scores)) if recent_scores else 0
        older_avg = (sum(older_scores) / len(older_scores)) if older_scores else 0
        improvement = recent_avg - older_avg if older_avg else 0
        
        return Response({
            # Canonical keys used across student pages
            'total_exams': total_exams,
            'passed_exams': passed_exams,
            'failed_exams': failed_exams,
            'pass_rate': round((passed_exams / total_exams * 100) if total_exams else 0, 1),
            'average_score': round(float(avg_score), 1),
            'total_points': total_points,
            'badge_count': badge_count,
            'improvement': round(improvement, 1),
            'recent_results': recent_results,
            # Backward-compatible aliases used by older frontend variants
            'total_exams_taken': total_exams,
            'pass_count': passed_exams,
            'fail_count': failed_exams,
            'avg_score': round(float(avg_score), 1),
        })
