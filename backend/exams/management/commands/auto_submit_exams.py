from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from exams.models import ExamAttempt
from utils.helpers import calculate_exam_result, get_attempt_end_time


class Command(BaseCommand):
    help = 'Auto-submit exams that have expired'

    def handle(self, *args, **options):
        now = timezone.now()
        
        # Get all in-progress attempts
        in_progress = ExamAttempt.objects.filter(status='in_progress')
        
        count = 0
        for attempt in in_progress:
            # Use exam.end_time as the universal deadline for all students
            end_time = get_attempt_end_time(attempt)
            
            if now > end_time:
                # Auto-submit
                attempt.status = 'auto_submitted'
                attempt.submit_time = end_time
                attempt.save()
                
                # Calculate result
                try:
                    calculate_exam_result(attempt)
                    count += 1
                    self.stdout.write(
                        self.style.SUCCESS(
                            f'Auto-submitted exam for {attempt.student.name}'
                        )
                    )
                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(
                            f'Error processing exam {attempt.id}: {e}'
                        )
                    )
        
        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully auto-submitted {count} exams'
            )
        )
