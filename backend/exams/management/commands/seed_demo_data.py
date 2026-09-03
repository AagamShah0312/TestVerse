"""Create idempotent demo data for presentations and first-run environments."""
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from exams.models import Answer, Exam, ExamAttempt, Question, Result


PASSWORD = 'TestVerse@123'
ACCOUNTS = (
    ('staff1@testverse.local', 'staff1', 'Dr. Ananya Sharma', 'staff', True, None),
    ('staff2@testverse.local', 'staff2', 'Prof. Rahul Mehta', 'staff', True, None),
    ('student1@testverse.local', 'student1', 'Aarav Patel', 'student', False, 'STU001'),
    ('student2@testverse.local', 'student2', 'Diya Singh', 'student', False, 'STU002'),
    ('student3@testverse.local', 'student3', 'Kabir Verma', 'student', False, 'STU003'),
    ('student4@testverse.local', 'student4', 'Meera Nair', 'student', False, 'STU004'),
    ('student5@testverse.local', 'student5', 'Vivaan Gupta', 'student', False, 'STU005'),
)


class Command(BaseCommand):
    help = 'Create demo users, exams, an attempted exam, answers, and a result.'

    @transaction.atomic
    def handle(self, *args, **options):
        users = {}
        for email, username, name, role, is_staff, enrollment_id in ACCOUNTS:
            user, _ = User.objects.update_or_create(
                email=email,
                defaults={'username': username, 'name': name, 'role': role,
                          'is_staff': is_staff, 'is_active': True,
                          'enrollment_id': enrollment_id},
            )
            user.set_password(PASSWORD)
            user.save(update_fields=['password'])
            users[email] = user

        now = timezone.now()
        staff = users['staff1@testverse.local']
        live_exam = self._exam(staff, 'Demo: Web Development Fundamentals',
                               'A currently available MCQ exam for testing.',
                               now - timedelta(minutes=15), now + timedelta(minutes=45), 60)
        self._question(live_exam, 'Which HTTP method is normally used to create a resource?', 1)

        upcoming_exam = self._exam(staff, 'Demo: Database Systems',
                                   'An upcoming exam visible in the student dashboard.',
                                   now + timedelta(days=2), now + timedelta(days=2, hours=1), 60)
        self._question(upcoming_exam, 'Which SQL clause filters grouped records?', 1)

        completed_exam = self._exam(staff, 'Demo: Python Basics (Completed)',
                                    'A completed exam with a published result.',
                                    now - timedelta(days=3, hours=1), now - timedelta(days=3), 60)
        question = self._question(completed_exam, 'What is the result of len([1, 2, 3])?', 1)
        attempt, _ = ExamAttempt.objects.update_or_create(
            exam=completed_exam, student=users['student1@testverse.local'],
            defaults={'start_time': now - timedelta(days=3, hours=1),
                      'submit_time': now - timedelta(days=3), 'status': 'submitted',
                      'total_score': Decimal('10.00'), 'obtained_score': Decimal('9.00')},
        )
        Answer.objects.update_or_create(
            attempt=attempt, question=question,
            defaults={'answer': {'selected': '3'}, 'score': Decimal('9.00'), 'feedback': 'Good work.'},
        )
        Result.objects.update_or_create(
            attempt=attempt,
            defaults={'exam': completed_exam, 'student': users['student1@testverse.local'],
                      'total_marks': Decimal('10.00'), 'obtained_marks': Decimal('9.00'),
                      'percentage': Decimal('90.00'), 'status': 'pass',
                      'grading_status': 'fully_graded', 'is_published': True,
                      'submitted_at': attempt.submit_time},
        )
        self.stdout.write(self.style.SUCCESS('Demo users and exam data are ready.'))

    @staticmethod
    def _exam(staff, title, description, start_time, end_time, duration):
        return Exam.objects.update_or_create(
            title=title, created_by=staff,
            defaults={'description': description, 'exam_type': 'mcq', 'start_time': start_time,
                      'end_time': end_time, 'duration': duration, 'total_marks': Decimal('10.00'),
                      'passing_marks': Decimal('4.00'), 'is_published': True,
                      'instructions': 'This is presentation demo data. Select an answer and submit.'},
        )[0]

    @staticmethod
    def _question(exam, text, order):
        return Question.objects.update_or_create(
            exam=exam, order=order,
            defaults={'type': 'mcq', 'text': text, 'points': Decimal('10.00'),
                      'options': [{'id': 'a', 'text': 'GET', 'isCorrect': False},
                                  {'id': 'b', 'text': 'POST', 'isCorrect': True},
                                  {'id': 'c', 'text': 'DELETE', 'isCorrect': False},
                                  {'id': 'd', 'text': 'PATCH', 'isCorrect': False}]},
        )[0]
