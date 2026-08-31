from celery import shared_task
from django.utils import timezone
from django.core.mail import send_mail
from exams.models import ExamAttempt
from utils.helpers import calculate_exam_result, get_attempt_end_time
from datetime import timedelta


@shared_task
def auto_submit_expired_exams():
    """Auto-submit exams that have expired"""
    now = timezone.now()
    
    # Get all in-progress attempts where time has expired
    expired_attempts = ExamAttempt.objects.filter(
        status='in_progress'
    )
    
    count = 0
    for attempt in expired_attempts:
        # Use exam.end_time as the universal deadline for all students
        end_time = get_attempt_end_time(attempt)
        
        if now > end_time:
            attempt.status = 'auto_submitted'
            attempt.submit_time = end_time
            attempt.save()
            
            # Calculate result
            calculate_exam_result(attempt)
            count += 1
    
    return f"Auto-submitted {count} exams"


@shared_task
def send_exam_reminder(student_id, exam_id):
    """Send exam reminder to student"""
    from accounts.models import User
    from exams.models import Exam
    
    try:
        student = User.objects.get(id=student_id)
        exam = Exam.objects.get(id=exam_id)
        
        subject = f"Exam Reminder: {exam.title}"
        message = f"""
        Hi {student.name},
        
        This is a reminder that the exam "{exam.title}" is starting soon.
        
        Start Time: {exam.start_time}
        Duration: {exam.duration} minutes
        
        Please login to the exam portal to take the exam.
        
        Best regards,
        Exam Management System
        """
        
        send_mail(subject, message, 'noreply@examsystem.com', [student.email])
    except Exception as e:
        print(f"Error sending reminder: {e}")


@shared_task
def send_result_email(student_id, exam_id):
    """Send exam result to student"""
    from accounts.models import User
    from exams.models import Exam
    from exams.models import Result
    
    try:
        student = User.objects.get(id=student_id)
        exam = Exam.objects.get(id=exam_id)
        result = Result.objects.get(exam=exam, student=student)
        
        subject = f"Exam Result: {exam.title}"
        message = f"""
        Hi {student.name},
        
        Your exam results for "{exam.title}" are now available.
        
        Total Marks: {result.total_marks}
        Obtained Marks: {result.obtained_marks}
        Percentage: {result.percentage}%
        Status: {result.status.upper()}
        
        Login to your account to view detailed results.
        
        Best regards,
        Exam Management System
        """
        
        send_mail(subject, message, 'noreply@examsystem.com', [student.email])
    except Exception as e:
        print(f"Error sending result email: {e}")
