from rest_framework import viewsets, status, generics, permissions, filters
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.http import Http404
from django.core.exceptions import PermissionDenied
from django.db.models import Q, Avg, Max, Min
from exams.models import Exam, Question, ExamAttempt, Answer, Result, ExamTimeExtension, CodePlagiarismReport
from exams.serializers import (
    ExamListSerializer, ExamDetailSerializer, ExamCreateUpdateSerializer,
    QuestionSerializer, ExamAttemptSerializer, AnswerSaveSerializer,
    ResultDetailSerializer, ResultListSerializer, ExamStaffSerializer,
    SubmissionDetailSerializer, QuestionEvaluationSerializer, AnswerDetailSerializer,
    ExamAnalyticsSerializer, ExamTimeExtensionSerializer, ExamTimeExtensionCreateSerializer,
    BulkFeedbackSerializer, CodePlagiarismReportSerializer, BulkResultsFilterSerializer
)
from utils.permissions import IsStudent, IsStaff, IsExamCreator, IsExamNotStarted, CanAttemptExam
from utils.helpers import (
    check_exam_eligibility, get_attempt_remaining_time, get_attempt_end_time,
    calculate_exam_result, auto_evaluate_mcq, is_department_allowed
)
from datetime import timedelta
from decimal import Decimal


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100


# ============ HEALTH CHECK VIEW ============

@api_view(['GET'])
def health_check(request):
    """Health check endpoint for Render deployment"""
    return Response({
        'status': 'healthy',
        'message': 'TestVerse backend is running successfully!',
        'timestamp': timezone.now()
    })


# ============ STUDENT VIEWS ============

class StudentExamListView(generics.ListAPIView):
    """List available exams for students"""
    serializer_class = ExamListSerializer
    permission_classes = [permissions.IsAuthenticated, IsStudent]
    pagination_class = StandardResultsSetPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['title', 'description']
    ordering_fields = ['start_time', 'end_time', 'created_at']
    ordering = ['-created_at']
    
    def get_queryset(self):
        now = timezone.now()
        user = self.request.user
        
        # Get exams that are published
        exams = Exam.objects.filter(is_published=True)
        
        # Department filtering (robust, case-insensitive, supports aliases).
        # Python filtering keeps SQLite compatibility for JSON fields.
        filtered_exams = [
            exam.id for exam in exams
            if is_department_allowed(user.department, exam.allowed_departments)
        ]
        
        exams = exams.filter(id__in=filtered_exams) if filtered_exams else Exam.objects.none()
        
        # Filter by status if provided
        status_filter = self.request.query_params.get('status')
        if status_filter == 'upcoming':
            exams = exams.filter(start_time__gt=now)
        elif status_filter == 'ongoing':
            exams = exams.filter(start_time__lte=now, end_time__gte=now)
        elif status_filter == 'completed':
            exams = exams.filter(end_time__lt=now)
        
        return exams.distinct()


class StudentExamDetailView(generics.RetrieveAPIView):
    """Get exam details for student - includes upcoming exams"""
    serializer_class = ExamDetailSerializer
    permission_classes = [permissions.IsAuthenticated, IsStudent]
    lookup_field = 'id'
    
    def get_queryset(self):
        now = timezone.now()
        user = self.request.user
        
        # Show published exams that haven't ended and are allowed for the student.
        exams = Exam.objects.filter(
            is_published=True,
            end_time__gte=now
        )

        allowed_ids = [
            exam.id for exam in exams
            if is_department_allowed(user.department, exam.allowed_departments)
        ]
        return exams.filter(id__in=allowed_ids) if allowed_ids else Exam.objects.none()


class StudentStartExamView(generics.CreateAPIView):
    """Start or resume exam attempt for student"""
    permission_classes = [permissions.IsAuthenticated, IsStudent]
    
    def get_serializer_class(self):
        from exams.serializers import ExamAttemptSerializer
        return ExamAttemptSerializer
    
    def _build_questions_with_answers(self, exam, attempt, request):
        """Build questions list including saved student answers for resume"""
        questions_data = []
        for question in exam.questions.all().order_by('order'):
            q_data = QuestionSerializer(question, context={'request': request}).data
            try:
                answer = Answer.objects.get(attempt=attempt, question=question)
                saved_answer = answer.answer
                if saved_answer and saved_answer != {}:
                    q_data['student_answer'] = saved_answer
                else:
                    q_data['student_answer'] = None
                q_data['student_code'] = answer.code
            except Answer.DoesNotExist:
                q_data['student_answer'] = None
                q_data['student_code'] = None
            questions_data.append(q_data)
        return questions_data
    
    def create(self, request, *args, **kwargs):
        exam_id = kwargs.get('exam_id')
        try:
            exam = Exam.objects.get(id=exam_id)
        except Exam.DoesNotExist:
            return Response({'error': 'Exam not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Check for existing in-progress attempt (resume on page refresh/re-entry)
        existing_attempt = ExamAttempt.objects.filter(
            exam=exam,
            student=request.user,
            status='in_progress'
        ).first()
        
        if existing_attempt:
            # Check if attempt time has expired
            remaining_time = get_attempt_remaining_time(existing_attempt)
            
            if remaining_time <= 0 or timezone.now() > exam.end_time:
                # Time expired, auto-submit
                existing_attempt.submit_time = timezone.now()
                existing_attempt.status = 'auto_submitted'
                existing_attempt.save()
                calculate_exam_result(existing_attempt)
                return Response({
                    'error': 'Exam time has expired. Your exam has been auto-submitted.'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Resume existing attempt with saved answers
            questions_data = self._build_questions_with_answers(exam, existing_attempt, request)
            
            return Response({
                'message': 'Exam resumed',
                'attemptId': str(existing_attempt.id),
                'startTime': existing_attempt.start_time,
                'endTime': exam.end_time,
                'time_remaining_seconds': remaining_time,
                'questions': questions_data
            }, status=status.HTTP_200_OK)
        
        # Check if already submitted (not in-progress)
        submitted_attempt = ExamAttempt.objects.filter(
            exam=exam,
            student=request.user,
            status__in=['submitted', 'auto_submitted']
        ).first()
        
        if submitted_attempt:
            return Response({
                'error': 'You have already submitted this exam.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check eligibility for new attempt
        eligible, message = check_exam_eligibility(request.user, exam)
        if not eligible:
            return Response({'error': message}, status=status.HTTP_400_BAD_REQUEST)
        
        # Create attempt
        start_time = timezone.now()
        # Remaining time = time until exam.end_time (same deadline for all students)
        actual_remaining = max(0, int((exam.end_time - start_time).total_seconds()))
        
        attempt = ExamAttempt.objects.create(
            exam=exam,
            student=request.user,
            start_time=start_time,
        )
        
        # Create answer records for all questions
        for question in exam.questions.all():
            Answer.objects.create(
                attempt=attempt,
                question=question,
                answer={}
            )
        
        serializer = ExamAttemptSerializer(attempt, context={'request': request})
        return Response({
            'message': 'Exam attempt started',
            'attemptId': str(attempt.id),
            'startTime': attempt.start_time,
            'endTime': exam.end_time,
            'time_remaining_seconds': actual_remaining,
            'questions': serializer.data['questions']
        }, status=status.HTTP_201_CREATED)


def _payload_answer_items(payload):
    """Normalize incoming payload into a list of answer dicts."""
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    if isinstance(payload, dict):
        answers = payload.get('answers')
        if isinstance(answers, list):
            return [item for item in answers if isinstance(item, dict)]
        if any(k in payload for k in ('question', 'questionId', 'question_id', 'answer', 'code')):
            return [payload]
        return []

    return []


def _persist_attempt_answers(attempt, payload):
    """
    Persist answer payloads for an attempt.
    Supports both legacy single-answer payloads and batch payloads:
      {question, answer, code}
      {answers: [{question_id, answer, code}, ...]}
    """
    saved_count = 0
    for item in _payload_answer_items(payload):
        question_id = item.get('question_id') or item.get('questionId') or item.get('question')
        if not question_id:
            continue

        try:
            answer = Answer.objects.get(attempt=attempt, question_id=question_id)
        except Answer.DoesNotExist:
            continue

        update_fields = []
        has_answer_field = 'answer' in item
        has_code_field = 'code' in item

        if has_answer_field:
            answer.answer = item.get('answer')
            update_fields.append('answer')

        if has_code_field:
            answer.code = item.get('code')
            update_fields.append('code')
        elif (
            answer.question.type == 'coding'
            and has_answer_field
            and isinstance(item.get('answer'), str)
        ):
            # Frontend may send coding content in "answer" only.
            answer.code = item.get('answer')
            update_fields.append('code')

        if update_fields:
            update_fields.append('updated_at')
            answer.save(update_fields=update_fields)
            saved_count += 1

    return saved_count


class StudentSaveAnswerView(generics.UpdateAPIView):
    """Save answer during exam"""
    permission_classes = [permissions.IsAuthenticated, IsStudent]
    serializer_class = AnswerSaveSerializer
    lookup_field = 'id'
    
    def get_queryset(self):
        return ExamAttempt.objects.filter(student=self.request.user)

    def post(self, request, *args, **kwargs):
        # Backward compatibility: frontend save endpoint currently uses POST.
        return self.update(request, *args, **kwargs)
    
    def update(self, request, *args, **kwargs):
        exam_id = kwargs.get('exam_id')
        try:
            # Find the active attempt for this exam
            attempt = ExamAttempt.objects.get(
                exam_id=exam_id, 
                student=request.user,
                status='in_progress'
            )
        except ExamAttempt.DoesNotExist:
            return Response({'error': 'Active attempt not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Check if exam is still ongoing using exam.end_time (same for all students)
        # Add 30-second grace period so last-second saves aren't rejected
        end_time = get_attempt_end_time(attempt)
        grace_period = timedelta(seconds=30)
        if timezone.now() > end_time + grace_period:
            return Response({'error': 'Exam time has expired'}, status=status.HTTP_400_BAD_REQUEST)

        payload_items = _payload_answer_items(request.data)
        if not payload_items:
            return Response({'error': 'Invalid answer payload'}, status=status.HTTP_400_BAD_REQUEST)

        saved_count = _persist_attempt_answers(attempt, request.data)
        
        return Response({
            'success': True,
            'saved_count': saved_count,
            'savedAt': timezone.now()
        }, status=status.HTTP_200_OK)


class StudentSubmitExamView(generics.CreateAPIView):
    """Submit exam - always allows submit for in-progress attempts"""
    permission_classes = [permissions.IsAuthenticated, IsStudent]
    
    def get_serializer_class(self):
        from rest_framework import serializers
        return serializers.Serializer  # No input data needed
    
    def create(self, request, *args, **kwargs):
        exam_id = kwargs.get('exam_id')
        
        # First try to find an in-progress attempt
        attempt = ExamAttempt.objects.filter(
            exam_id=exam_id, 
            student=request.user,
            status='in_progress'
        ).first()
        
        if attempt:
            # Persist latest client answers before finalizing submission.
            _persist_attempt_answers(attempt, request.data)

            # Mark as submitted
            attempt.submit_time = timezone.now()
            attempt.status = 'submitted'
            attempt.save()
            
            # Calculate result (auto-grades MCQs, leaves descriptive/coding pending)
            result = calculate_exam_result(attempt)
            
            return Response({
                'success': True,
                'message': 'Exam submitted successfully. Results will be published after teacher review.',
                'submittedAt': attempt.submit_time,
            }, status=status.HTTP_200_OK)
        
        # Check if already submitted (handle race condition / double submit)
        already_submitted = ExamAttempt.objects.filter(
            exam_id=exam_id,
            student=request.user,
            status__in=['submitted', 'auto_submitted']
        ).first()
        
        if already_submitted:
            return Response({
                'success': True,
                'message': 'Exam was already submitted.',
                'submittedAt': already_submitted.submit_time,
            }, status=status.HTTP_200_OK)
        
        return Response({'error': 'No exam attempt found'}, status=status.HTTP_404_NOT_FOUND)


class StudentExamResultView(generics.RetrieveAPIView):
    """Get student's exam result"""
    permission_classes = [permissions.IsAuthenticated, IsStudent]
    serializer_class = ResultDetailSerializer
    lookup_field = 'exam_id'
    
    def get_queryset(self):
        return Result.objects.filter(student=self.request.user)
    
    def get_object(self):
        exam_id = self.kwargs.get('exam_id')
        try:
            result = Result.objects.get(exam_id=exam_id, student=self.request.user)
            return result
        except Result.DoesNotExist:
            raise Http404('Result not found')


class StudentMyResultsView(generics.ListAPIView):
    """Get list of all results for the student"""
    permission_classes = [permissions.IsAuthenticated, IsStudent]
    serializer_class = ResultListSerializer
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        # Filter is_published=True - students only see published results
        return Result.objects.filter(student=self.request.user, is_published=True).order_by('-created_at')


class StudentExamAttemptsView(generics.ListAPIView):
    """Get list of all exam attempts for the student (exams taken)"""
    permission_classes = [permissions.IsAuthenticated, IsStudent]
    serializer_class = ExamAttemptSerializer
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        # Get all attempts (submitted or auto_submitted) for the student
        return ExamAttempt.objects.filter(
            student=self.request.user,
            status__in=['submitted', 'auto_submitted']
        ).select_related('exam').order_by('-submit_time')


# ============ STAFF VIEWS ============

class StaffExamViewSet(viewsets.ModelViewSet):
    """Staff exam management"""
    permission_classes = [permissions.IsAuthenticated, IsStaff]
    pagination_class = StandardResultsSetPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['title', 'description']
    ordering_fields = ['start_time', 'end_time', 'created_at']
    ordering = ['-created_at']
    
    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return ExamCreateUpdateSerializer
        return ExamStaffSerializer
    
    def get_queryset(self):
        user = self.request.user
        if user.role == 'admin':
            return Exam.objects.all()
        return Exam.objects.filter(created_by=user)
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        exam = serializer.save(created_by=request.user)
        return Response(
            ExamStaffSerializer(exam).data,
            status=status.HTTP_201_CREATED
        )
    
    def update(self, request, *args, **kwargs):
        exam = self.get_object()
        # Check if exam has not started
        if exam.start_time <= timezone.now():
            return Response(
                {'error': 'Cannot modify exam after it has started'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().update(request, *args, **kwargs)
    
    def destroy(self, request, *args, **kwargs):
        exam = self.get_object()
        # Check if exam has not started
        if exam.start_time <= timezone.now():
            return Response(
                {'error': 'Cannot delete exam after it has started'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)
    
    @action(detail=True, methods=['post'], url_path='publish')
    def publish_exam(self, request, pk=None):
        exam = self.get_object()
        
        # Validate: exam must have at least 1 question
        questions = exam.questions.all()
        if not questions.exists():
            return Response(
                {'error': 'Cannot publish exam without any questions. Please add at least one question.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate: sum of question points must match exam total_marks
        from django.db.models import Sum
        questions_total = questions.aggregate(total=Sum('points'))['total'] or 0
        if questions_total != exam.total_marks:
            return Response({
                'error': f'Cannot publish: Total question marks ({float(questions_total)}) do not match exam total marks ({float(exam.total_marks)}). Please adjust questions or exam total marks.',
                'questions_total_marks': float(questions_total),
                'exam_total_marks': float(exam.total_marks)
            }, status=status.HTTP_400_BAD_REQUEST)
        
        exam.is_published = True
        exam.save()
        return Response({'message': 'Exam published successfully'})
    
    @action(detail=True, methods=['post'], url_path='unpublish')
    def unpublish_exam(self, request, pk=None):
        exam = self.get_object()
        
        # Cannot unpublish if exam has already started
        if exam.start_time <= timezone.now():
            return Response(
                {'error': 'Cannot unpublish an exam that has already started.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        exam.is_published = False
        exam.save()
        return Response({'message': 'Exam unpublished successfully'})
    
    @action(detail=True, methods=['get'], url_path='submissions')
    def get_submissions(self, request, pk=None):
        exam = self.get_object()
        attempts = exam.attempts.filter(status__in=['submitted', 'auto_submitted'])
        page = self.paginate_queryset(attempts)
        
        if page is not None:
            data = [{
                'attemptId': str(attempt.id),
                'studentName': attempt.student.name,
                'enrollmentId': attempt.student.enrollment_id,
                'startTime': attempt.start_time,
                'submitTime': attempt.submit_time,
                'totalScore': float(attempt.total_score) if attempt.total_score else 0,
                'obtainedScore': float(attempt.obtained_score) if attempt.obtained_score else 0,
                'status': attempt.status,
            } for attempt in page]
            return self.get_paginated_response(data)
        
        return Response([])
    
    @action(detail=True, methods=['post'], url_path='finalize-results')
    def finalize_results(self, request, pk=None):
        """Auto-grade MCQs and create pending results for all submitted attempts"""
        exam = self.get_object()
        
        # Cannot generate results while exam is still running
        if exam.end_time > timezone.now():
            active_count = exam.attempts.filter(status='in_progress').count()
            if active_count > 0:
                return Response({
                    'error': f'Cannot generate results: exam is still running with {active_count} active student(s). Wait until the exam ends.',
                    'active_count': active_count
                }, status=status.HTTP_400_BAD_REQUEST)
        
        # Find submitted attempts that don't have a result yet
        submitted_attempts = exam.attempts.filter(
            status__in=['submitted', 'auto_submitted']
        )
        
        new_results = 0
        updated_results = 0
        for attempt in submitted_attempts:
            had_result = hasattr(attempt, 'result') and Result.objects.filter(attempt=attempt).exists()
            calculate_exam_result(attempt)
            if had_result:
                updated_results += 1
            else:
                new_results += 1
        
        # Gather summary stats
        results = exam.results.all()
        total = results.count()
        needs_grading = results.exclude(grading_status='fully_graded').count()
        fully_graded = results.filter(grading_status='fully_graded').count()
        
        return Response({
            'success': True,
            'message': f'MCQs auto-graded. {new_results} new results created, {updated_results} updated.',
            'totalStudents': total,
            'newResults': new_results,
            'updatedResults': updated_results,
            'needsGrading': needs_grading,
            'fullyGraded': fully_graded,
        })
    
    @action(detail=True, methods=['get'], url_path='statistics')
    def exam_statistics(self, request, pk=None):
        exam = self.get_object()
        results = exam.results.all()
        
        if not results.exists():
            return Response({'error': 'No results yet'}, status=status.HTTP_404_NOT_FOUND)
        
        total_attempts = exam.attempts.count()
        avg_score = float(results.aggregate(
            avg=Avg('obtained_marks')
        )['avg'] or 0)
        highest = float(results.aggregate(
            max=Max('obtained_marks')
        )['max'] or 0)
        lowest = float(results.aggregate(
            min=Min('obtained_marks')
        )['min'] or 0)
        pass_percentage = (results.filter(status='pass').count() / total_attempts * 100) if total_attempts > 0 else 0
        
        return Response({
            'totalAttempts': total_attempts,
            'averageScore': avg_score,
            'highestScore': highest,
            'lowestScore': lowest,
            'passPercentage': pass_percentage,
        })


class StaffQuestionViewSet(viewsets.ModelViewSet):
    """Staff question management"""
    permission_classes = [permissions.IsAuthenticated, IsStaff]
    serializer_class = QuestionSerializer
    lookup_field = 'id'
    
    def get_queryset(self):
        exam_id = self.kwargs.get('exam_id')
        if exam_id:
            return Question.objects.filter(exam_id=exam_id)
        return Question.objects.all()
    
    def create(self, request, *args, **kwargs):
        exam_id = kwargs.get('exam_id')
        exam = Exam.objects.get(id=exam_id)
        
        # Check permissions
        if exam.created_by != request.user and request.user.role != 'admin':
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        
        # Check if exam has started
        if exam.start_time <= timezone.now():
            return Response(
                {'error': 'Cannot add questions after exam has started'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate marks overflow: new question marks must not cause total to exceed exam total_marks
        new_points = Decimal(str(request.data.get('points', 0)))
        from django.db.models import Sum
        current_total = exam.questions.aggregate(total=Sum('points'))['total'] or Decimal('0')
        if current_total + new_points > exam.total_marks:
            remaining = exam.total_marks - current_total
            return Response({
                'error': f'Cannot add question: marks ({float(new_points)}) would exceed exam total marks ({float(exam.total_marks)}). Current questions total: {float(current_total)}, remaining: {float(remaining)}.',
                'current_total': float(current_total),
                'exam_total_marks': float(exam.total_marks),
                'remaining': float(remaining)
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Auto-assign order based on existing questions count
        existing_count = exam.questions.count()
        
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(exam=exam, order=existing_count + 1)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        question = self.get_object()
        
        # Check if exam has started
        if question.exam.start_time <= timezone.now():
            return Response(
                {'error': 'Cannot modify question after exam has started'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        return super().update(request, *args, **kwargs)
    
    def destroy(self, request, *args, **kwargs):
        question = self.get_object()
        
        # Check if exam has started
        if question.exam.start_time <= timezone.now():
            return Response(
                {'error': 'Cannot delete question after exam has started'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        return super().destroy(request, *args, **kwargs)


class StaffSubmissionDetailView(generics.RetrieveAPIView):
    """Get submission details for evaluation"""
    permission_classes = [permissions.IsAuthenticated, IsStaff]
    lookup_field = 'attempt_id'
    
    def get_serializer_class(self):
        from exams.serializers import SubmissionDetailSerializer
        return SubmissionDetailSerializer
    
    def get_queryset(self):
        return ExamAttempt.objects.all()
    
    def retrieve(self, request, *args, **kwargs):
        attempt_id = kwargs.get('attempt_id')
        try:
            attempt = ExamAttempt.objects.get(id=attempt_id)
        except ExamAttempt.DoesNotExist:
            return Response({'error': 'Attempt not found'}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = SubmissionDetailSerializer(attempt)
        return Response(serializer.data)


class StaffEvaluateAnswerView(generics.CreateAPIView):
    """Evaluate descriptive/coding answers"""
    permission_classes = [permissions.IsAuthenticated, IsStaff]
    
    def get_serializer_class(self):
        from exams.serializers import QuestionEvaluationSerializer
        return QuestionEvaluationSerializer
    
    def create(self, request, *args, **kwargs):
        attempt_id = kwargs.get('attempt_id')
        question_id = request.data.get('questionId')
        score = request.data.get('score')
        feedback = request.data.get('feedback', '')
        
        try:
            answer = Answer.objects.get(
                attempt_id=attempt_id,
                question_id=question_id
            )
        except Answer.DoesNotExist:
            return Response({'error': 'Answer not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Validate score doesn't exceed question max points
        score_decimal = Decimal(str(score))
        if score_decimal < 0:
            return Response({'error': 'Score cannot be negative'}, status=status.HTTP_400_BAD_REQUEST)
        if score_decimal > answer.question.points:
            return Response(
                {'error': f'Score ({float(score_decimal)}) cannot exceed question max points ({float(answer.question.points)})'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Update answer with score and feedback
        answer.score = score_decimal
        answer.feedback = feedback
        answer.evaluated_by = request.user
        answer.save()
        
        # Recalculate result
        calculate_exam_result(answer.attempt)
        
        return Response({
            'success': True,
            'message': 'Answer evaluated successfully'
        }, status=status.HTTP_200_OK)


class StaffResultListView(generics.ListAPIView):
    """List all results for an exam"""
    permission_classes = [permissions.IsAuthenticated, IsStaff]
    serializer_class = ResultListSerializer
    pagination_class = StandardResultsSetPagination
    lookup_field = 'exam_id'
    
    def get_queryset(self):
        exam_id = self.kwargs.get('exam_id')
        return Result.objects.filter(exam_id=exam_id)


class StaffQuestionEvaluateView(generics.CreateAPIView):
    """Evaluate a specific question for a student"""
    permission_classes = [permissions.IsAuthenticated, IsStaff]
    
    def get_serializer_class(self):
        from exams.serializers import QuestionEvaluationSerializer
        return QuestionEvaluationSerializer
    
    def create(self, request, *args, **kwargs):
        exam_id = kwargs.get('exam_id')
        question_id = kwargs.get('question_id')
        
        # Validate exam exists and user has permission
        try:
            exam = Exam.objects.get(id=exam_id)
        except Exam.DoesNotExist:
            return Response({'error': 'Exam not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Check staff permission
        if exam.created_by != request.user and request.user.role != 'admin':
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        
        # Validate question exists
        try:
            question = Question.objects.get(id=question_id, exam=exam)
        except Question.DoesNotExist:
            return Response({'error': 'Question not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Get request data
        serializer = QuestionEvaluationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        score = serializer.validated_data['score']
        feedback = serializer.validated_data.get('feedback', '')
        
        # Validate score doesn't exceed max points
        if score > question.points:
            return Response(
                {'error': f'Score cannot exceed {question.points} points'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Update all answers for this question that don't have a score yet
        attempt_id = request.data.get('attempt_id')
        if attempt_id:
            try:
                answer = Answer.objects.get(
                    attempt_id=attempt_id,
                    question_id=question_id
                )
                answer.score = score
                answer.feedback = feedback
                answer.evaluated_by = request.user
                answer.save()
                
                # Recalculate result
                calculate_exam_result(answer.attempt)
                
                return Response({
                    'success': True,
                    'message': 'Question evaluated successfully',
                    'answer_id': str(answer.id),
                    'score': float(score),
                    'feedback': feedback
                }, status=status.HTTP_200_OK)
            except Answer.DoesNotExist:
                return Response({'error': 'Answer not found'}, status=status.HTTP_404_NOT_FOUND)
        else:
            return Response(
                {'error': 'attempt_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )


class StaffResultAnswersView(generics.RetrieveAPIView):
    """Get all answers for a specific result"""
    permission_classes = [permissions.IsAuthenticated, IsStaff]
    lookup_field = 'result_id'
    
    def get_serializer_class(self):
        from exams.serializers import SubmissionDetailSerializer
        return SubmissionDetailSerializer
    
    def get_queryset(self):
        return Result.objects.all()
    
    def retrieve(self, request, *args, **kwargs):
        result_id = kwargs.get('result_id')
        
        try:
            result = Result.objects.get(id=result_id)
        except Result.DoesNotExist:
            return Response({'error': 'Result not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Check staff permission
        exam = result.exam
        if exam.created_by != request.user and request.user.role != 'admin':
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        
        # Get all answers for this result
        answers = result.attempt.answers.all()
        
        response_data = {
            'result_id': str(result.id),
            'attempt_id': str(result.attempt_id),
            'exam_title': result.exam.title,
            'student_name': result.student.name,
            'student_enrollment_id': result.student.enrollment_id,
            'total_marks': float(result.total_marks),
            'obtained_marks': float(result.obtained_marks),
            'percentage': float(result.percentage),
            'status': result.status,
            'grading_status': result.grading_status,
            'submitted_at': result.submitted_at,
            'answers': AnswerDetailSerializer(answers, many=True, context=self.get_serializer_context()).data
        }
        
        return Response(response_data)


class StaffResultPublishView(generics.UpdateAPIView):
    """Publish/Unpublish individual result"""
    permission_classes = [permissions.IsAuthenticated, IsStaff]
    queryset = Result.objects.all()
    serializer_class = ResultDetailSerializer
    lookup_field = 'id'

    def update(self, request, *args, **kwargs):
        result = self.get_object()
        
        # Check permissions
        if result.exam.created_by != request.user and request.user.role != 'admin':
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
            
        action = request.data.get('action')
        if action == 'publish':
            result.is_published = True
            message = 'Result published'
        elif action == 'unpublish':
            result.is_published = False
            message = 'Result unpublished'
        else:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
            
        result.save()
        return Response({'success': True, 'message': message, 'is_published': result.is_published})


class StaffBulkPublishResultsView(generics.CreateAPIView):
    """Publish/Unpublish ALL results for an exam"""
    permission_classes = [permissions.IsAuthenticated, IsStaff]
    
    def get_serializer_class(self):
        from exams.serializers import BulkPublishResultsSerializer
        return BulkPublishResultsSerializer
    
    def create(self, request, *args, **kwargs):
        exam_id = kwargs.get('exam_id')
        action = request.data.get('action') # 'publish' or 'unpublish'
        
        try:
            exam = Exam.objects.get(id=exam_id)
        except Exam.DoesNotExist:
            return Response({'error': 'Exam not found'}, status=status.HTTP_404_NOT_FOUND)
            
        # Check staff permission
        if exam.created_by != request.user and request.user.role != 'admin':
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
            
        if action == 'publish':
            # Check if all results are fully graded before publishing
            results = exam.results.all()
            not_graded = results.exclude(grading_status='fully_graded').count()
            if not_graded > 0:
                return Response({
                    'error': f'Cannot publish: {not_graded} student(s) still need grading. Please grade all students before publishing.',
                    'ungraded_count': not_graded
                }, status=status.HTTP_400_BAD_REQUEST)
            results.update(is_published=True)
            message = 'All results published successfully'
        elif action == 'unpublish':
            exam.results.update(is_published=False)
            message = 'All results unpublished successfully'
        else:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
            
        return Response({'success': True, 'message': message})


class StaffExamAnalyticsView(generics.RetrieveAPIView):
    """Get detailed analytics for an exam"""
    permission_classes = [permissions.IsAuthenticated, IsStaff]
    lookup_field = 'exam_id'
    
    def get_serializer_class(self):
        from exams.serializers import ExamAnalyticsSerializer
        return ExamAnalyticsSerializer
    
    def get_queryset(self):
        return Exam.objects.all()
    
    def retrieve(self, request, *args, **kwargs):
        exam_id = kwargs.get('exam_id')
        
        try:
            exam = Exam.objects.get(id=exam_id)
        except Exam.DoesNotExist:
            return Response({'error': 'Exam not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Check staff permission
        if exam.created_by != request.user and request.user.role != 'admin':
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        
        # Calculate analytics
        results = exam.results.all()
        attempts = exam.attempts.all()
        
        total_attempts = attempts.count()
        submitted_attempts = attempts.filter(status__in=['submitted', 'auto_submitted']).count()
        
        if results.exists():
            average_score = results.aggregate(Avg('obtained_marks'))['obtained_marks__avg'] or Decimal('0')
            highest_score = results.aggregate(Max('obtained_marks'))['obtained_marks__max'] or Decimal('0')
            lowest_score = results.aggregate(Min('obtained_marks'))['obtained_marks__min'] or Decimal('0')
            pass_count = results.filter(status='pass').count()
            fail_count = results.filter(status='fail').count()
        else:
            average_score = Decimal('0')
            highest_score = Decimal('0')
            lowest_score = Decimal('0')
            pass_count = 0
            fail_count = 0
        
        pass_percentage = (pass_count / total_attempts * 100) if total_attempts > 0 else Decimal('0')
        
        # Question-wise statistics
        question_stats = []
        for question in exam.questions.all():
            answers = Answer.objects.filter(question=question, attempt__exam=exam)
            
            if answers.exists():
                avg_score = answers.aggregate(Avg('score'))['score__avg'] or Decimal('0')
                correct_count = 0
                
                if question.type == 'mcq':
                    # Count MCQ correct answers
                    correct_count = answers.filter(answer__contains='true').count()
                
                stats = {
                    'question_id': str(question.id),
                    'question_text': question.text[:100],
                    'question_type': question.type,
                    'max_points': float(question.points),
                    'total_answers': answers.count(),
                    'average_score': float(avg_score),
                    'correct_count': correct_count if question.type == 'mcq' else None,
                }
            else:
                stats = {
                    'question_id': str(question.id),
                    'question_text': question.text[:100],
                    'question_type': question.type,
                    'max_points': float(question.points),
                    'total_answers': 0,
                    'average_score': 0,
                    'correct_count': None,
                }
            
            question_stats.append(stats)
        
        analytics_data = {
            'exam_title': exam.title,
            'exam_id': str(exam.id),
            'total_attempts': total_attempts,
            'submitted_attempts': submitted_attempts,
            'average_score': float(average_score),
            'highest_score': float(highest_score),
            'lowest_score': float(lowest_score),
            'pass_count': pass_count,
            'fail_count': fail_count,
            'pass_percentage': float(pass_percentage),
            'question_statistics': question_stats,
            'generated_at': timezone.now()
        }
        
        return Response(analytics_data)


class StaffExamTimeExtensionView(generics.CreateAPIView):
    """Request exam time extension for a student"""
    permission_classes = [permissions.IsAuthenticated, IsStaff]
    serializer_class = ExamTimeExtensionCreateSerializer
    
    def create(self, request, *args, **kwargs):
        exam_id = kwargs.get('exam_id')
        
        try:
            exam = Exam.objects.get(id=exam_id)
        except Exam.DoesNotExist:
            raise Http404('Exam not found')
        
        # Check staff permission
        if exam.created_by != request.user and request.user.role != 'admin':
            raise PermissionDenied('Permission denied')
        
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Create or update extension
        extension, created = ExamTimeExtension.objects.update_or_create(
            exam=exam,
            student_id=serializer.validated_data['student'].id,
            defaults={
                'additional_minutes': serializer.validated_data['additional_minutes'],
                'reason': serializer.validated_data['reason'],
                'approved_by': request.user,
                'approved_at': timezone.now()
            }
        )
        
        return Response(
            ExamTimeExtensionSerializer(extension).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )


class StaffExamTimeExtensionListView(generics.ListAPIView):
    """List all time extensions for an exam"""
    permission_classes = [permissions.IsAuthenticated, IsStaff]
    serializer_class = ExamTimeExtensionSerializer
    pagination_class = StandardResultsSetPagination
    lookup_field = 'exam_id'
    
    def get_queryset(self):
        exam_id = self.kwargs.get('exam_id')
        return ExamTimeExtension.objects.filter(exam_id=exam_id)


class StaffBulkFeedbackView(generics.CreateAPIView):
    """Assign feedback/score to multiple results"""
    permission_classes = [permissions.IsAuthenticated, IsStaff]
    
    def get_serializer_class(self):
        from exams.serializers import BulkFeedbackSerializer
        return BulkFeedbackSerializer
    
    def create(self, request, *args, **kwargs):
        exam_id = kwargs.get('exam_id')
        
        try:
            exam = Exam.objects.get(id=exam_id)
        except Exam.DoesNotExist:
            return Response({'error': 'Exam not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Check staff permission
        if exam.created_by != request.user and request.user.role != 'admin':
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        
        serializer = BulkFeedbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        result_ids = serializer.validated_data['result_ids']
        feedback_template = serializer.validated_data.get('feedback_template', '')
        
        # Update answers for selected results
        updated_count = 0
        results = Result.objects.filter(exam=exam, id__in=result_ids)
        
        for result in results:
            answers = Answer.objects.filter(
                attempt=result.attempt,
                question__type__in=['descriptive', 'coding'],
                score__isnull=True  # Only unevaluated answers
            )
            
            for answer in answers:
                if feedback_template:
                    answer.feedback = feedback_template
                    answer.evaluated_by = request.user
                    answer.save()
                    updated_count += 1
        
        return Response({
            'success': True,
            'message': f'Feedback assigned to {updated_count} answers',
            'results_updated': results.count(),
            'answers_updated': updated_count
        }, status=status.HTTP_200_OK)


class StaffBulkResultsView(generics.ListAPIView):
    """Get bulk results with filtering"""
    permission_classes = [permissions.IsAuthenticated, IsStaff]
    serializer_class = ResultListSerializer
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        exam_id = self.kwargs.get('exam_id')
        
        try:
            exam = Exam.objects.get(id=exam_id)
        except Exam.DoesNotExist:
            return Response({'error': 'Exam not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Check staff permission
        if exam.created_by != self.request.user and self.request.user.role != 'admin':
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        
        queryset = Result.objects.filter(exam=exam)
        
        # Apply filters
        min_percentage = self.request.query_params.get('min_percentage')
        max_percentage = self.request.query_params.get('max_percentage')
        result_status = self.request.query_params.get('status')
        department = self.request.query_params.get('department')
        
        if min_percentage:
            queryset = queryset.filter(percentage__gte=Decimal(min_percentage))
        
        if max_percentage:
            queryset = queryset.filter(percentage__lte=Decimal(max_percentage))
        
        if result_status:
            queryset = queryset.filter(status=result_status)
        
        if department:
            queryset = queryset.filter(student__department=department)
        
        return queryset.order_by('-percentage')
    
    def list(self, request, *args, **kwargs):
        # Get filtered results
        queryset = self.filter_queryset(self.get_queryset())
        
        # Get limit from params
        limit = request.query_params.get('limit', 100)
        try:
            limit = int(limit)
            if limit > 1000:
                limit = 1000
        except ValueError:
            limit = 100
        
        queryset = queryset[:limit]
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class StaffCodePlagiarismCheckView(generics.ListAPIView):
    """Check for code plagiarism in coding questions"""
    permission_classes = [permissions.IsAuthenticated, IsStaff]
    serializer_class = CodePlagiarismReportSerializer
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        exam_id = self.kwargs.get('exam_id')
        
        try:
            exam = Exam.objects.get(id=exam_id)
        except Exam.DoesNotExist:
            raise Http404('Exam not found')
        
        # Check staff permission
        if exam.created_by != self.request.user and self.request.user.role != 'admin':
            raise PermissionDenied('Permission denied')
        
        return CodePlagiarismReport.objects.filter(exam=exam).order_by('-similarity_score')
    
    def list(self, request, *args, **kwargs):
        exam_id = kwargs.get('exam_id')
        
        try:
            exam = Exam.objects.get(id=exam_id)
        except Exam.DoesNotExist:
            raise Http404('Exam not found')
        
        # Check staff permission
        if exam.created_by != request.user and request.user.role != 'admin':
            raise PermissionDenied('Permission denied')
        
        # Get existing reports
        reports = CodePlagiarismReport.objects.filter(exam=exam)
        
        # Get coding questions for this exam
        coding_questions = exam.questions.filter(type='coding')
        
        # Simple similarity check using line count and basic string comparison
        for question in coding_questions:
            answers = Answer.objects.filter(question=question, attempt__exam=exam).exclude(code__isnull=True)
            
            for i, answer1 in enumerate(answers):
                for answer2 in answers[i+1:]:
                    # Calculate basic similarity (simplified approach)
                    code1_lines = set(answer1.code.split('\n')) if answer1.code else set()
                    code2_lines = set(answer2.code.split('\n')) if answer2.code else set()
                    
                    if not code1_lines or not code2_lines:
                        continue
                    
                    intersection = len(code1_lines & code2_lines)
                    union = len(code1_lines | code2_lines)
                    similarity = (intersection / union * 100) if union > 0 else 0
                    
                    # Only report if similarity is significant (>60%)
                    if similarity > 60:
                        # Determine risk level
                        if similarity >= 90:
                            risk_level = 'high'
                        elif similarity >= 70:
                            risk_level = 'medium'
                        else:
                            risk_level = 'low'
                        
                        # Create or update report
                        CodePlagiarismReport.objects.update_or_create(
                            answer1=answer1,
                            answer2=answer2,
                            defaults={
                                'exam': exam,
                                'similarity_score': Decimal(str(similarity)),
                                'risk_level': risk_level,
                                'report': f'Similarity: {similarity:.2f}% between students'
                            }
                        )
        
        # Return all reports
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class StaffExamLiveMonitorView(generics.GenericAPIView):
    """Monitor live exam progress for staff - see students taking exam in real-time"""
    permission_classes = [permissions.IsAuthenticated, IsStaff]
    
    def get_serializer_class(self):
        from rest_framework import serializers
        return serializers.Serializer  # No input data needed
    
    def get(self, request, exam_id, *args, **kwargs):
        try:
            exam = Exam.objects.get(id=exam_id, created_by=request.user)
        except Exam.DoesNotExist:
            return Response({'error': 'Exam not found'}, status=status.HTTP_404_NOT_FOUND)
        
        now = timezone.now()
        
        # Get all attempts for this exam
        attempts = ExamAttempt.objects.filter(exam=exam).select_related('student')
        
        # Active attempts (in progress)
        active_attempts = attempts.filter(status='in_progress')
        
        # Completed attempts (submitted or auto-submitted)
        completed_attempts = attempts.filter(status__in=['submitted', 'auto_submitted'])
        
        # Build progress data for each active attempt
        live_data = []
        for attempt in active_attempts:
            # Count answers submitted (non-empty answers)
            answers_count = Answer.objects.filter(attempt=attempt).exclude(answer={}).exclude(answer__isnull=True).count()
            total_questions = exam.questions.count()
            
            # Calculate remaining time
            time_elapsed = (now - attempt.start_time).total_seconds() / 60  # in minutes
            time_remaining = max(0, exam.duration - time_elapsed)
            
            # Calculate progress percentage
            progress = round((answers_count / total_questions * 100) if total_questions > 0 else 0)
            
            live_data.append({
                'attempt_id': str(attempt.id),
                'student_id': str(attempt.student.id),
                'student_name': attempt.student.name,
                'student_email': attempt.student.email,
                'department': attempt.student.department or 'Unassigned',
                'started_at': attempt.start_time.isoformat(),
                'answers_submitted': answers_count,
                'total_questions': total_questions,
                'progress_percent': progress,
                'time_remaining_minutes': round(time_remaining, 1),
                'is_struggling': progress < 30 and time_remaining < (exam.duration * 0.3)
            })
        
        # Sort by progress (struggling students first)
        live_data.sort(key=lambda x: (x['is_struggling'], -x['progress_percent']), reverse=True)
        
        return Response({
            'exam_id': str(exam.id),
            'exam_title': exam.title,
            'total_students_registered': attempts.count(),
            'active_count': active_attempts.count(),
            'completed_count': completed_attempts.count(),
            'not_started_count': 0,  # Students without an attempt are not tracked here
            'total_questions': exam.questions.count(),
            'exam_duration': exam.duration,
            'is_live': exam.start_time <= now <= exam.end_time,
            'live_attempts': live_data
        })
