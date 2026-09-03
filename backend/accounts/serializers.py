from rest_framework import serializers
from accounts.models import User


class UserRegistrationSerializer(serializers.ModelSerializer):
    """Serializer for user registration"""
    password = serializers.CharField(
        write_only=True,
        min_length=6,
        style={'input_type': 'password'}
    )
    password_confirm = serializers.CharField(
        write_only=True,
        min_length=6,
        style={'input_type': 'password'}
    )
    
    class Meta:
        model = User
        fields = [
            'email',
            'username',
            'name',
            'password',
            'password_confirm',
            'role',
            'department',
            'enrollment_id'
        ]
        extra_kwargs = {
            'email': {'required': True},
            'username': {'required': True},
            'name': {'required': True},
            'role': {'required': True},
            'department': {'required': False, 'allow_blank': True},
            'enrollment_id': {'required': False, 'allow_blank': True},
        }
    
    def validate_role(self, value):
        """Validate role is student or staff"""
        if value not in ['student', 'staff']:
            raise serializers.ValidationError('Role must be either "student" or "staff"')
        return value
    
    def validate(self, attrs):
        """Validate password match"""
        password = attrs.get('password')
        password_confirm = attrs.get('password_confirm')
        
        if password != password_confirm:
            raise serializers.ValidationError({
                'password_confirm': 'Passwords do not match'
            })
        
        return attrs
    
    def create(self, validated_data):
        """Create user with hashed password"""
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        
        user = User.objects.create_user(
            email=validated_data['email'],
            username=validated_data['username'],
            name=validated_data['name'],
            password=password,
            role=validated_data.get('role', 'student'),
            department=validated_data.get('department', ''),
            enrollment_id=validated_data.get('enrollment_id') or None
        )
        return user


class UserProfileSerializer(serializers.ModelSerializer):
    """Serializer for user profile"""
    class Meta:
        model = User
        fields = ['id', 'email', 'username', 'name', 'role', 'department', 'enrollment_id', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'email', 'role']


class UserDetailSerializer(serializers.ModelSerializer):
    """Serializer for detailed user information"""
    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'role', 'department', 'enrollment_id', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class StudentListSerializer(serializers.ModelSerializer):
    """Serializer for listing students and staff (staff view)"""
    class Meta:
        model = User
        fields = ['id', 'email', 'username', 'name', 'role', 'department', 'enrollment_id', 'is_active', 'created_at']
        read_only_fields = ['id', 'email', 'username', 'name', 'created_at']


class StudentUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating student info (staff can assign department and change roles)"""
    class Meta:
        model = User
        fields = ['id', 'email', 'username', 'name', 'role', 'department', 'enrollment_id', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'email', 'username', 'name', 'created_at', 'updated_at']
    
    def validate_role(self, value):
        """Validate role is student or staff"""
        if value not in ['student', 'staff']:
            raise serializers.ValidationError('Role must be either "student" or "staff"')
        return value
    
    def update(self, instance, validated_data):
        """Custom update logic to handle role changes"""
        new_role = validated_data.get('role')
        
        # If role is changing to staff, set is_staff to True
        if new_role == 'staff':
            validated_data['is_staff'] = True
        # If role is changing to student, set is_staff to False
        elif new_role == 'student':
            validated_data['is_staff'] = False
        
        return super().update(instance, validated_data)


class NotificationSerializer(serializers.ModelSerializer):
    """Serializer for notifications"""
    class Meta:
        from accounts.models import Notification
        model = Notification
        fields = ['id', 'type', 'title', 'message', 'link', 'is_read', 'created_at']
        read_only_fields = ['id', 'type', 'title', 'message', 'link', 'created_at']


class AnnouncementSerializer(serializers.ModelSerializer):
    """Serializer for announcements"""
    created_by_name = serializers.CharField(source='created_by.name', read_only=True)
    
    class Meta:
        from accounts.models import Announcement
        model = Announcement
        fields = ['id', 'title', 'content', 'target_departments', 'created_by', 'created_by_name', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_by', 'created_by_name', 'created_at']


class AnnouncementCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating announcements (staff)"""
    class Meta:
        from accounts.models import Announcement
        model = Announcement
        fields = ['id', 'title', 'content', 'target_departments', 'is_active']


class BadgeSerializer(serializers.ModelSerializer):
    """Serializer for badges"""
    class Meta:
        from accounts.models import Badge
        model = Badge
        fields = ['id', 'name', 'badge_type', 'description', 'icon', 'points_value']


class UserBadgeSerializer(serializers.ModelSerializer):
    """Serializer for user badges"""
    badge = BadgeSerializer(read_only=True)
    
    class Meta:
        from accounts.models import UserBadge
        model = UserBadge
        fields = ['id', 'badge', 'earned_at']


class UserPointsSerializer(serializers.ModelSerializer):
    """Serializer for user points"""
    class Meta:
        from accounts.models import UserPoints
        model = UserPoints
        fields = ['id', 'points', 'point_type', 'description', 'created_at']


class LeaderboardSerializer(serializers.Serializer):
    """Serializer for leaderboard entries"""
    user_id = serializers.UUIDField()
    name = serializers.CharField()
    department = serializers.CharField(allow_null=True)
    total_points = serializers.IntegerField()
    badge_count = serializers.IntegerField()
    rank = serializers.IntegerField()


class NotificationMarkReadSerializer(serializers.Serializer):
    """Serializer for marking notifications as read"""
    notification_ids = serializers.ListField(
        child=serializers.UUIDField(), 
        required=False,
        allow_empty=True
    )
    mark_all = serializers.BooleanField(default=False)
    
    def validate(self, attrs):
        if not attrs.get('mark_all') and not attrs.get('notification_ids'):
            raise serializers.ValidationError('Either notification_ids or mark_all must be provided')
        return attrs


class StudentAnalyticsSerializer(serializers.Serializer):
    """Serializer for student analytics data"""
    total_exams_taken = serializers.IntegerField()
    average_score = serializers.DecimalField(max_digits=5, decimal_places=2)
    total_points = serializers.IntegerField()
    badge_count = serializers.IntegerField()
    pass_rate = serializers.DecimalField(max_digits=5, decimal_places=2)
