from django.contrib import admin
from exams.models import Exam, Question, ExamAttempt, Answer, Result


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = ['title', 'exam_type', 'start_time', 'is_published', 'created_by']
    list_filter = ['exam_type', 'is_published', 'created_at']
    search_fields = ['title', 'description']
    readonly_fields = ['id', 'created_at', 'updated_at']


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ['text', 'type', 'exam', 'points', 'order']
    list_filter = ['type', 'exam']
    search_fields = ['text']
    readonly_fields = ['id', 'created_at', 'updated_at']


@admin.register(ExamAttempt)
class ExamAttemptAdmin(admin.ModelAdmin):
    list_display = ['student', 'exam', 'start_time', 'status', 'obtained_score']
    list_filter = ['status', 'created_at']
    search_fields = ['student__name', 'exam__title']
    readonly_fields = ['id', 'created_at', 'updated_at']


@admin.register(Answer)
class AnswerAdmin(admin.ModelAdmin):
    list_display = ['attempt', 'question', 'score', 'evaluated_by']
    list_filter = ['created_at']
    search_fields = ['attempt__student__name']
    readonly_fields = ['id', 'created_at', 'updated_at']


@admin.register(Result)
class ResultAdmin(admin.ModelAdmin):
    list_display = ['student', 'exam', 'obtained_marks', 'status']
    list_filter = ['status', 'created_at']
    search_fields = ['student__name', 'exam__title']
    readonly_fields = ['id', 'created_at', 'updated_at']
