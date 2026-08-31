from django.db import models
from django.contrib.auth import get_user_model
import uuid

User = get_user_model()


class Exam(models.Model):
    """Exam model"""
    EXAM_TYPE_CHOICES = [
        ('mcq', 'MCQ'),
        ('mixed', 'Mixed'),
        ('coding', 'Coding'),
        ('descriptive', 'Descriptive'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    description = models.TextField()
    exam_type = models.CharField(max_length=20, choices=EXAM_TYPE_CHOICES, default='mixed')
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    duration = models.IntegerField()  # in minutes
    total_marks = models.DecimalField(max_digits=10, decimal_places=2)
    passing_marks = models.DecimalField(max_digits=10, decimal_places=2)
    is_published = models.BooleanField(default=False)
    instructions = models.TextField(blank=True, null=True)
    allowed_departments = models.JSONField(default=list, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_exams')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'exams'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['start_time']),
            models.Index(fields=['end_time']),
            models.Index(fields=['is_published']),
            models.Index(fields=['created_by']),
            models.Index(fields=['start_time', 'end_time']),
            models.Index(fields=['is_published', 'start_time']),
        ]
    
    def __str__(self):
        return self.title


class Question(models.Model):
    """Question model"""
    QUESTION_TYPE_CHOICES = [
        ('mcq', 'MCQ'),
        ('multiple_mcq', 'Multiple Choice MCQ'),
        ('descriptive', 'Descriptive'),
        ('coding', 'Coding'),
    ]
    
    LANGUAGE_CHOICES = [
        ('python', 'Python'),
        ('java', 'Java'),
        ('javascript', 'JavaScript'),
        ('cpp', 'C++'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='questions')
    type = models.CharField(max_length=20, choices=QUESTION_TYPE_CHOICES)
    text = models.TextField()
    points = models.DecimalField(max_digits=10, decimal_places=2)
    options = models.JSONField(default=list, blank=True)  # For MCQ: [{"id": 1, "text": "Option A", "isCorrect": true}]
    correct_answers = models.JSONField(default=list, blank=True)  # For multiple MCQ
    coding_language = models.CharField(max_length=20, choices=LANGUAGE_CHOICES, blank=True, null=True)
    test_cases = models.JSONField(default=list, blank=True)  # For coding questions
    sample_input = models.TextField(blank=True, null=True)
    sample_output = models.TextField(blank=True, null=True)
    sample_answer = models.TextField(blank=True, null=True)  # For descriptive
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'questions'
        unique_together = ['exam', 'order']
        ordering = ['order']
    
    def __str__(self):
        return f"{self.exam.title} - Q{self.order}"


class ExamAttempt(models.Model):
    """Student's exam attempt"""
    STATUS_CHOICES = [
        ('in_progress', 'In Progress'),
        ('submitted', 'Submitted'),
        ('auto_submitted', 'Auto Submitted'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='attempts')
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='exam_attempts')
    start_time = models.DateTimeField()
    submit_time = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='in_progress')
    total_score = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    obtained_score = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'exam_attempts'
        unique_together = ['exam', 'student']
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['exam', 'student']),
            models.Index(fields=['student', 'exam']),
            models.Index(fields=['status']),
            models.Index(fields=['start_time']),
            models.Index(fields=['submit_time']),
            models.Index(fields=['status', 'exam']),
            models.Index(fields=['student', 'status']),
        ]
    
    def __str__(self):
        return f"{self.student.name} - {self.exam.title}"


class Answer(models.Model):
    """Student's answer to a question"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    attempt = models.ForeignKey(ExamAttempt, on_delete=models.CASCADE, related_name='answers')
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name='answers')
    answer = models.JSONField()  # Can be string, array, or code
    code = models.TextField(blank=True, null=True)  # For coding questions
    score = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    evaluated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='evaluated_answers')
    feedback = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'answers'
        unique_together = ['attempt', 'question']
        ordering = ['created_at']
    
    def __str__(self):
        return f"{self.attempt.student.name} - {self.question.text[:50]}"


class Result(models.Model):
    """Student's result/performance in an exam"""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('pass', 'Pass'),
        ('fail', 'Fail'),
    ]
    GRADING_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('partially_graded', 'Partially Graded'),
        ('fully_graded', 'Fully Graded'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    attempt = models.OneToOneField(ExamAttempt, on_delete=models.CASCADE, related_name='result')
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='results')
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='results')
    total_marks = models.DecimalField(max_digits=10, decimal_places=2)
    obtained_marks = models.DecimalField(max_digits=10, decimal_places=2)
    percentage = models.DecimalField(max_digits=5, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    grading_status = models.CharField(max_length=20, choices=GRADING_STATUS_CHOICES, default='pending')
    is_published = models.BooleanField(default=False)
    submitted_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'results'
        unique_together = ['exam', 'student']
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.student.name} - {self.exam.title} - {self.status}"


class ExamTimeExtension(models.Model):
    """Model for extending exam time for specific students"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='time_extensions')
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='exam_extensions')
    additional_minutes = models.IntegerField()  # Additional time in minutes
    reason = models.TextField()
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_extensions')
    approved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'exam_time_extensions'
        unique_together = ['exam', 'student']
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.student.name} - {self.exam.title} - {self.additional_minutes} mins"


class CodePlagiarismReport(models.Model):
    """Model for storing plagiarism detection reports"""
    RISK_LEVELS = [
        ('low', 'Low Risk'),
        ('medium', 'Medium Risk'),
        ('high', 'High Risk'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='plagiarism_reports')
    answer1 = models.ForeignKey(Answer, on_delete=models.CASCADE, related_name='plagiarism_source')
    answer2 = models.ForeignKey(Answer, on_delete=models.CASCADE, related_name='plagiarism_target')
    similarity_score = models.DecimalField(max_digits=5, decimal_places=2)  # 0-100
    risk_level = models.CharField(max_length=20, choices=RISK_LEVELS)
    report = models.TextField()  # Detailed comparison
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'code_plagiarism_reports'
        ordering = ['-similarity_score']
    
    def __str__(self):
        return f"Plagiarism Report - {self.similarity_score}% match"
