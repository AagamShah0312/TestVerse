from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
import uuid


class UserManager(BaseUserManager):
    """Custom user manager for authentication"""
    
    def create_user(self, email, username, name, password=None, **extra_fields):
        """Create and save a regular user"""
        if not email:
            raise ValueError('Email is required')
        if not username:
            raise ValueError('Username is required')
        if not name:
            raise ValueError('Name is required')
        
        email = self.normalize_email(email)
        user = self.model(
            email=email,
            username=username,
            name=name,
            **extra_fields
        )
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, username, name, password=None, **extra_fields):
        """Create and save a superuser"""
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'staff')
        
        if not extra_fields.get('is_staff'):
            raise ValueError('Superuser must have is_staff=True')
        if not extra_fields.get('is_superuser'):
            raise ValueError('Superuser must have is_superuser=True')
        
        return self.create_user(email, username, name, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Custom User model with role-based access"""
    ROLE_CHOICES = [
        ('student', 'Student'),
        ('staff', 'Staff'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, db_index=True)
    username = models.CharField(max_length=150, unique=True, db_index=True)
    name = models.CharField(max_length=255)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='student')
    department = models.CharField(max_length=100, blank=True, null=True)
    enrollment_id = models.CharField(max_length=100, blank=True, null=True, unique=True)
    
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    objects = UserManager()
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username', 'name']
    
    class Meta:
        db_table = 'users'
        verbose_name = 'User'
        verbose_name_plural = 'Users'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.name} ({self.email})"


class Notification(models.Model):
    """User notifications for exam alerts, results, etc."""
    TYPE_CHOICES = [
        ('exam_published', 'New Exam Published'),
        ('exam_reminder', 'Exam Reminder'),
        ('result_published', 'Result Published'),
        ('announcement', 'Announcement'),
        ('branch_assigned', 'Branch Assigned'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    type = models.CharField(max_length=50, choices=TYPE_CHOICES)
    title = models.CharField(max_length=255)
    message = models.TextField()
    link = models.CharField(max_length=500, blank=True, null=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.title} - {self.user.name}"


class Announcement(models.Model):
    """System-wide announcements from staff"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    content = models.TextField()
    target_departments = models.JSONField(default=list, blank=True)  # Empty = all
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='announcements')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'announcements'
        ordering = ['-created_at']
    
    def __str__(self):
        return self.title


class Badge(models.Model):
    """Achievement badges for gamification"""
    BADGE_TYPES = [
        ('first_exam', 'First Exam'),
        ('perfect_score', 'Perfect Score'),
        ('streak_3', '3 Exam Streak'),
        ('streak_5', '5 Exam Streak'),
        ('top_scorer', 'Top Scorer'),
        ('speed_demon', 'Speed Demon'),
        ('consistent', 'Consistent Performer'),
        ('improver', 'Most Improved'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    badge_type = models.CharField(max_length=50, choices=BADGE_TYPES, unique=True)
    description = models.TextField()
    icon = models.CharField(max_length=50, default='🏆')
    points_value = models.IntegerField(default=10)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'badges'
        ordering = ['name']
    
    def __str__(self):
        return self.name


class UserBadge(models.Model):
    """Badges earned by users"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='user_badges')
    badge = models.ForeignKey(Badge, on_delete=models.CASCADE, related_name='user_badges')
    earned_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'user_badges'
        unique_together = ['user', 'badge']
        ordering = ['-earned_at']
    
    def __str__(self):
        return f"{self.user.name} - {self.badge.name}"


class UserPoints(models.Model):
    """Points earned by users for various activities"""
    POINT_TYPES = [
        ('exam_complete', 'Exam Completed'),
        ('exam_passed', 'Exam Passed'),
        ('perfect_score', 'Perfect Score'),
        ('badge_earned', 'Badge Earned'),
        ('streak_bonus', 'Streak Bonus'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='user_points')
    points = models.IntegerField(default=0)
    point_type = models.CharField(max_length=50, choices=POINT_TYPES)
    description = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'user_points'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.user.name}: +{self.points} ({self.point_type})"
