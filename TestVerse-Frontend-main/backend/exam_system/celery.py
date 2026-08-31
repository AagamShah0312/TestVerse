from celery import Celery
import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'exam_system.settings')

app = Celery('exam_system')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()


@app.task(bind=True)
def debug_task(self):
    print(f'Request: {self.request!r}')
