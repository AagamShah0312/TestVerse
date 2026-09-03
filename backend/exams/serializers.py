from rest_framework import serializers
from accounts.models import User
from exams.models import Exam, Question, ExamAttempt, Answer, Result, ExamTimeExtension, CodePlagiarismReport
from datetime import datetime
from django.utils import timezone


class QuestionSerializer(serializers.ModelSerializer):
    """Serializer for Question"""
    class Meta:
        model = Question
        fields = ['id', 'type', 'text', 'points', 'options', 'correct_answers', 
                  'coding_language', 'test_cases', 'sample_input', 'sample_output', 
                  'sample_answer', 'order']
    
    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Don't include correct answers in student view
        request = self.context.get('request')
        if request and request.user.role == 'student':
            data.pop('correct_answers', None)
        return data


class ExamListSerializer(serializers.ModelSerializer):
    """Serializer for Exam list view"""
    status = serializers.SerializerMethodField()
    has_attempted = serializers.SerializerMethodField()
    
    class Meta:
        model = Exam
        fields = ['id', 'title', 'description', 'start_time', 'end_time', 
                  'duration', 'total_marks', 'is_published', 'status', 'has_attempted']
    
    def get_status(self, obj):
        now = timezone.now()
        if now < obj.start_time:
            return 'upcoming'
        elif now > obj.end_time:
            return 'completed'
        else:
            return 'ongoing'
    
    def get_has_attempted(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return ExamAttempt.objects.filter(exam=obj, student=request.user).exists()
        return False


class ExamDetailSerializer(serializers.ModelSerializer):
    """Serializer for Exam detail view"""
    questions = QuestionSerializer(many=True, read_only=True)
    status = serializers.SerializerMethodField()
    remaining_time = serializers.SerializerMethodField()
    
    class Meta:
        model = Exam
        fields = ['id', 'title', 'description', 'exam_type', 'start_time', 'end_time',
                  'duration', 'total_marks', 'passing_marks', 'is_published', 'instructions',
                  'status', 'remaining_time', 'questions']
    
    def get_status(self, obj):
        now = timezone.now()
        if now < obj.start_time:
            return 'upcoming'
        elif now > obj.end_time:
            return 'completed'
        else:
            return 'ongoing'
    
    def get_remaining_time(self, obj):
        now = timezone.now()
        if now < obj.start_time:
            return None
        elif now > obj.end_time:
            return 0
        else:
            delta = obj.end_time - now
            return int(delta.total_seconds())


class ExamCreateUpdateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating Exam"""
    class Meta:
        model = Exam
        fields = ['title', 'description', 'exam_type', 'start_time', 'end_time',
                  'duration', 'total_marks', 'passing_marks', 'instructions', 'allowed_departments']
    
    def validate(self, attrs):
        if attrs.get('start_time') >= attrs.get('end_time'):
            raise serializers.ValidationError('End time must be after start time')
        return attrs


class ExamAttemptSerializer(serializers.ModelSerializer):
    """Serializer for Exam Attempt"""
    exam = serializers.SerializerMethodField()
    questions = serializers.SerializerMethodField()
    
    class Meta:
        model = ExamAttempt
        fields = ['id', 'start_time', 'submit_time', 'status', 'total_score', 
                  'obtained_score', 'exam', 'questions']
    
    def get_exam(self, obj):
        # Return basic exam info
        exam = obj.exam
        return {
            'id': str(exam.id),
            'title': exam.title,
            'total_marks': float(exam.total_marks),
            'passing_marks': float(exam.passing_marks),
            'duration': exam.duration
        }
    
    def get_questions(self, obj):
        questions = obj.exam.questions.all()
        return QuestionSerializer(questions, many=True, context=self.context).data


class AnswerSerializer(serializers.ModelSerializer):
    """Serializer for Answer"""
    class Meta:
        model = Answer
        fields = ['id', 'question', 'answer', 'code', 'score', 'feedback']
    
    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Don't show feedback until result is published
        request = self.context.get('request')
        if request and request.user.role == 'student':
            data.pop('feedback', None)
        return data


class AnswerSaveSerializer(serializers.ModelSerializer):
    """Serializer for saving answers"""
    class Meta:
        model = Answer
        fields = ['question', 'answer', 'code']


class ResultDetailSerializer(serializers.ModelSerializer):
    """Serializer for Result details"""
    exam_title = serializers.CharField(source='exam.title', read_only=True)
    answers = serializers.SerializerMethodField()
    
    class Meta:
        model = Result
        fields = ['id', 'exam', 'exam_title', 'total_marks', 'obtained_marks', 'percentage',
                  'status', 'grading_status', 'submitted_at', 'is_published', 'answers']
    
    def get_answers(self, obj):
        answers = obj.attempt.answers.all()
        result_data = []
        for answer in answers:
            question = answer.question
            data = {
                'question_id': str(question.id),
                'question_text': question.text,
                'question_type': question.type,
                'max_points': float(question.points),
                'student_answer': answer.answer,
                'score_obtained': float(answer.score) if answer.score else 0,
                'feedback': answer.feedback,
            }
            if question.type in ['mcq', 'multiple_mcq']:
                # Get correct answer from options
                if question.type == 'mcq':
                    for option in question.options:
                        if option.get('isCorrect'):
                            data['correct_answer'] = option.get('text')
                            break
                else:
                    data['correct_answer'] = question.correct_answers
            result_data.append(data)
        return result_data


class ResultListSerializer(serializers.ModelSerializer):
    """Serializer for Result list"""
    student_name = serializers.CharField(source='student.name', read_only=True)
    enrollment_id = serializers.CharField(source='student.enrollment_id', read_only=True)
    exam_title = serializers.CharField(source='exam.title', read_only=True)
    exam_id = serializers.UUIDField(source='exam.id', read_only=True)
    attempt_id = serializers.UUIDField(source='attempt.id', read_only=True)
    
    class Meta:
        model = Result
        fields = ['id', 'student_name', 'enrollment_id', 'exam_title', 'exam_id', 'attempt_id',
                  'total_marks', 'obtained_marks', 'percentage', 'status',
                  'grading_status', 'is_published', 'submitted_at']
        # feedback is not a field on Result model - it's on individual Answer models


class ExamStaffSerializer(serializers.ModelSerializer):
    """Serializer for staff exam management"""
    questions = QuestionSerializer(many=True, read_only=True)
    total_attempts = serializers.SerializerMethodField()
    submitted_count = serializers.SerializerMethodField()
    question_count = serializers.SerializerMethodField()
    questions_total_marks = serializers.SerializerMethodField()
    
    class Meta:
        model = Exam
        fields = ['id', 'title', 'description', 'exam_type', 'start_time', 'end_time',
                  'duration', 'total_marks', 'passing_marks', 'is_published', 'instructions',
                  'allowed_departments', 'questions', 'question_count', 'questions_total_marks',
                  'total_attempts', 'submitted_count', 'created_at']
    
    def get_total_attempts(self, obj):
        return obj.attempts.count()
    
    def get_submitted_count(self, obj):
        return obj.attempts.filter(status__in=['submitted', 'auto_submitted']).count()
    
    def get_question_count(self, obj):
        return obj.questions.count()
    
    def get_questions_total_marks(self, obj):
        from django.db.models import Sum
        total = obj.questions.aggregate(total=Sum('points'))['total']
        return float(total) if total else 0


class SubmissionDetailSerializer(serializers.Serializer):
    """Serializer for submission details"""
    student_info = serializers.SerializerMethodField()
    exam_info = serializers.SerializerMethodField()
    answers = serializers.SerializerMethodField()
    
    def get_student_info(self, obj):
        student = obj.student
        return {
            'id': str(student.id),
            'name': student.name,
            'enrollment_id': student.enrollment_id,
            'department': student.department,
        }
    
    def get_exam_info(self, obj):
        return {
            'title': obj.exam.title,
            'total_marks': float(obj.exam.total_marks),
            'duration': obj.exam.duration,
        }
    
    def get_answers(self, obj):
        answers = obj.answers.all()
        result_data = []
        for answer in answers:
            question = answer.question
            needs_evaluation = question.type in ['descriptive', 'coding']
            
            data = {
                'question_id': str(question.id),
                'question_text': question.text,
                'question_type': question.type,
                'max_points': float(question.points),
                'student_answer': answer.answer if not needs_evaluation else answer.code,
                'score': float(answer.score) if answer.score else None,
                'needs_manual_evaluation': needs_evaluation and answer.score is None,
                'feedback': answer.feedback,
            }
            
            if question.type == 'mcq':
                for option in question.options:
                    if option.get('isCorrect'):
                        data['correct_answer'] = option.get('text')
                        break
            
            result_data.append(data)
        return result_data


class QuestionEvaluationSerializer(serializers.Serializer):
    """Serializer for question evaluation by staff"""
    score = serializers.DecimalField(max_digits=10, decimal_places=2)
    feedback = serializers.CharField(required=False, allow_blank=True)
    
    def validate_score(self, value):
        if value < 0:
            raise serializers.ValidationError('Score cannot be negative')
        return value


class AnswerDetailSerializer(serializers.ModelSerializer):
    """Serializer for detailed answer view"""
    question_text = serializers.CharField(source='question.text', read_only=True)
    question_type = serializers.CharField(source='question.type', read_only=True)
    max_points = serializers.DecimalField(
        source='question.points', 
        read_only=True,
        max_digits=10, 
        decimal_places=2
    )
    correct_answer = serializers.SerializerMethodField()
    is_correct = serializers.SerializerMethodField()
    
    class Meta:
        model = Answer
        fields = ['id', 'question', 'question_text', 'question_type', 'max_points',
                  'answer', 'code', 'score', 'is_correct', 'feedback',
                  'correct_answer', 'created_at']
    
    def get_correct_answer(self, obj):
        question = obj.question
        if question.type == 'mcq':
            for option in question.options:
                if option.get('isCorrect'):
                    return option.get('text')
        elif question.type == 'multiple_mcq':
            return question.correct_answers
        elif question.type == 'descriptive':
            return question.sample_answer
        return None

    def get_is_correct(self, obj):
        question = obj.question
        if question.type not in ('mcq', 'multiple_mcq'):
            return None
        if obj.score is None:
            return None
        try:
            return float(obj.score) >= float(question.points)
        except (TypeError, ValueError):
            return None


class ExamAnalyticsSerializer(serializers.Serializer):
    """Serializer for exam analytics"""
    total_attempts = serializers.IntegerField()
    submitted_attempts = serializers.IntegerField()
    average_score = serializers.DecimalField(max_digits=10, decimal_places=2)
    highest_score = serializers.DecimalField(max_digits=10, decimal_places=2)
    lowest_score = serializers.DecimalField(max_digits=10, decimal_places=2)
    pass_count = serializers.IntegerField()
    fail_count = serializers.IntegerField()
    pass_percentage = serializers.DecimalField(max_digits=5, decimal_places=2)
    question_statistics = serializers.ListField()


class ExamTimeExtensionSerializer(serializers.ModelSerializer):
    """Serializer for exam time extensions"""
    student_name = serializers.CharField(source='student.name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.name', read_only=True, allow_null=True)
    
    class Meta:
        model = ExamTimeExtension
        fields = ['id', 'student', 'student_name', 'additional_minutes', 'reason', 
                  'approved_by', 'approved_by_name', 'approved_at', 'created_at']
        read_only_fields = ['id', 'approved_by', 'approved_at', 'created_at']


class ExamTimeExtensionCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating exam time extensions"""
    class Meta:
        model = ExamTimeExtension
        fields = ['student', 'additional_minutes', 'reason']
    
    def validate_additional_minutes(self, value):
        if value <= 0:
            raise serializers.ValidationError('Additional minutes must be greater than 0')
        return value


class BulkFeedbackSerializer(serializers.Serializer):
    """Serializer for bulk feedback assignment"""
    result_ids = serializers.ListField(child=serializers.UUIDField())
    feedback_template = serializers.CharField(required=False, allow_blank=True)
    default_score = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)


class CodePlagiarismReportSerializer(serializers.ModelSerializer):
    """Serializer for plagiarism reports"""
    student1_name = serializers.CharField(source='answer1.attempt.student.name', read_only=True)
    student2_name = serializers.CharField(source='answer2.attempt.student.name', read_only=True)
    question_text = serializers.CharField(source='answer1.question.text', read_only=True)
    
    class Meta:
        model = CodePlagiarismReport
        fields = ['id', 'student1_name', 'student2_name', 'question_text', 
                  'similarity_score', 'risk_level', 'report', 'created_at']
        read_only_fields = ['id', 'created_at']


class BulkResultsFilterSerializer(serializers.Serializer):
    """Serializer for filtering bulk results"""
    min_percentage = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    max_percentage = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    status = serializers.ChoiceField(choices=['pass', 'fail'], required=False, allow_blank=True)
    department = serializers.CharField(required=False, allow_blank=True)
    limit = serializers.IntegerField(default=100, min_value=1, max_value=1000)


class BulkPublishResultsSerializer(serializers.Serializer):
    """Serializer for bulk publishing results"""
    publish = serializers.BooleanField(required=True)
    filter_params = BulkResultsFilterSerializer(required=False)
