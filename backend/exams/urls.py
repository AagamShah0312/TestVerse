from django.urls import path, include
from rest_framework.routers import DefaultRouter
from exams.views import (
    StudentExamListView, StudentExamDetailView, StudentStartExamView,
    StudentSaveAnswerView, StudentSubmitExamView, StudentExamResultView,
    StudentMyResultsView, StudentExamAttemptsView,
    StaffExamViewSet, StaffQuestionViewSet, StaffSubmissionDetailView,
    StaffEvaluateAnswerView, StaffResultListView, StaffQuestionEvaluateView,
    StaffResultAnswersView, StaffResultPublishView, StaffExamAnalyticsView, StaffExamTimeExtensionView,
    StaffExamTimeExtensionListView, StaffBulkFeedbackView, StaffBulkResultsView,
    StaffCodePlagiarismCheckView, StaffExamLiveMonitorView, StaffExamAnalyticsView,
    StaffBulkPublishResultsView
)
from django.http import JsonResponse

# Health check endpoint
def health_check(request):
    return JsonResponse({'status': 'healthy', 'service': 'exam-system-api'})

router = DefaultRouter()
router.register(r'staff/exams', StaffExamViewSet, basename='staff-exams')

urlpatterns = [
    path('health/', health_check, name='health-check'),
    path('', include(router.urls)),
    
    # Student endpoints
    path('exams/my-results/', StudentMyResultsView.as_view(), name='my-results'),
    path('exams/available/', StudentExamListView.as_view(), name='available-exams'),
    path('exams/<uuid:id>/', StudentExamDetailView.as_view(), name='exam-detail'),
    path('exams/<uuid:exam_id>/attempt/', StudentStartExamView.as_view(), name='start-exam'),
    path('exams/<uuid:exam_id>/attempt/save/', StudentSaveAnswerView.as_view(), name='save-answer'),
    path('exams/<uuid:exam_id>/attempt/submit/', StudentSubmitExamView.as_view(), name='submit-exam'),
    path('exams/<uuid:exam_id>/result/', StudentExamResultView.as_view(), name='exam-result'),
    path('exams/my-attempts/', StudentExamAttemptsView.as_view(), name='my-exam-attempts'),
    
    # Staff endpoints - Questions
    path('staff/exams/<uuid:exam_id>/questions/', StaffQuestionViewSet.as_view({
        'get': 'list',
        'post': 'create'
    }), name='exam-questions'),
    path('staff/questions/<uuid:id>/', StaffQuestionViewSet.as_view({
        'get': 'retrieve',
        'put': 'update',
        'patch': 'partial_update',
        'delete': 'destroy'
    }), name='question-detail'),
    
    # Staff endpoints - Submissions
    path('staff/submissions/<uuid:attempt_id>/', StaffSubmissionDetailView.as_view(), name='submission-detail'),
    path('staff/submissions/<uuid:attempt_id>/evaluate/', StaffEvaluateAnswerView.as_view(), name='evaluate-answer'),
    
    # Staff endpoints - Results
    path('staff/exams/<uuid:exam_id>/results/', StaffResultListView.as_view(), name='exam-results'),
    
    # 1. Evaluate specific question for a student
    path('staff/exams/<uuid:exam_id>/questions/<uuid:question_id>/evaluate/', 
          StaffQuestionEvaluateView.as_view(), name='evaluate-question'),

    path('staff/results/<uuid:id>/publish/', StaffResultPublishView.as_view(), name='result-publish'),
    path('staff/results/<uuid:result_id>/answers/', 
          StaffResultAnswersView.as_view(), name='result-answers'),
    
    # 3. Get detailed analytics for an exam
    path('staff/exams/<uuid:exam_id>/analytics/', 
          StaffExamAnalyticsView.as_view(), name='exam-analytics'),
    
    # NEW ENDPOINTS - Exam Scheduling & Moderation
    # 4. Create/extend exam time for a student
    path('staff/exams/<uuid:exam_id>/extend-time/', 
          StaffExamTimeExtensionView.as_view(), name='extend-exam-time'),
    
    # 5. List all time extensions for an exam
    path('staff/exams/<uuid:exam_id>/extensions/', 
          StaffExamTimeExtensionListView.as_view(), name='exam-extensions-list'),
    
    # NEW ENDPOINTS - Bulk Operations
    # 6. Bulk feedback assignment
    path('staff/exams/<uuid:exam_id>/bulk-feedback/', 
          StaffBulkFeedbackView.as_view(), name='bulk-feedback'),
    
    # 7. Get bulk results with filtering
    path('staff/exams/<uuid:exam_id>/bulk-results/', 
          StaffBulkResultsView.as_view(), name='bulk-results'),
    
    # 7b. Bulk publish results
    path('staff/exams/<uuid:exam_id>/publish-results/', 
          StaffBulkPublishResultsView.as_view(), name='bulk-publish-results'),
          
    # NEW ENDPOINTS - Plagiarism Detection
    # 8. Check for code plagiarism
    path('staff/exams/<uuid:exam_id>/plagiarism-check/', 
          StaffCodePlagiarismCheckView.as_view(), name='plagiarism-check'),
    
    # 9. Live exam monitoring
    path('staff/exams/<uuid:exam_id>/live-monitor/', 
          StaffExamLiveMonitorView.as_view(), name='exam-live-monitor'),
]
