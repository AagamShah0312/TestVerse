"""
URL configuration for exam_system project.
"""

from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.utils import timezone
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView

def health_check(request):
    return JsonResponse({'status': 'healthy', 'service': 'exam-system-api'})


def cron_health_check(request):
    """Public, read-only endpoint intended for an external keep-alive cron job."""
    return JsonResponse({
        'status': 'healthy',
        'service': 'exam-system-api',
        'purpose': 'cron-keepalive',
        'timestamp': timezone.now().isoformat(),
    })

api_patterns = [
    path('auth/', include('accounts.urls')),
    path('', include('exams.urls')),
]

urlpatterns = [
    path('admin/', admin.site.urls),
    path('health/', health_check, name='health-check'),
    path('api/v1/cron/health/', cron_health_check, name='cron-health-check'),
    
    # API endpoints
    path('api/v1/', include(api_patterns)),
    
    # API Documentation
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]
