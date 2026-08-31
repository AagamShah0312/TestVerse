"""
API Tests for University Exam System
"""
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from exams.models import Exam, Question, ExamAttempt, Answer
from django.utils import timezone
from datetime import timedelta

User = get_user_model()


class UserRegistrationTestCase(APITestCase):
    """Test user registration"""
    
    def setUp(self):
        self.client = APIClient()
        self.register_url = '/api/v1/auth/register/'
    
    def test_register_student(self):
        """Test student registration"""
        data = {
            'email': 'student@example.com',
            'username': 'student',
            'name': 'John Student',
            'password': 'testpass123',
            'password_confirm': 'testpass123',
            'role': 'student',
            'department': 'Computer Science'
        }
        response = self.client.post(self.register_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('token', response.data)
    
    def test_register_staff(self):
        """Test staff registration"""
        data = {
            'email': 'staff@example.com',
            'username': 'staff',
            'name': 'Jane Staff',
            'password': 'testpass123',
            'password_confirm': 'testpass123',
            'role': 'staff',
            'department': 'Computer Science'
        }
        response = self.client.post(self.register_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


class ExamTestCase(APITestCase):
    """Test exam functionality"""
    
    def setUp(self):
        self.client = APIClient()
        
        # Create users
        self.student = User.objects.create_user(
            email='student@example.com',
            username='student',
            password='testpass123',
            role='student',
            name='John Student',
            department='CS'
        )
        
        self.staff = User.objects.create_user(
            email='staff@example.com',
            username='staff',
            password='testpass123',
            role='staff',
            name='Jane Staff'
        )
        
        # Create exam
        now = timezone.now()
        self.exam = Exam.objects.create(
            title='Python Basics',
            description='Basic Python Programming',
            exam_type='mixed',
            start_time=now + timedelta(minutes=10),
            end_time=now + timedelta(minutes=70),
            duration=60,
            total_marks=100,
            passing_marks=40,
            is_published=True,
            created_by=self.staff
        )
        
        # Create questions
        self.question = Question.objects.create(
            exam=self.exam,
            type='mcq',
            text='What is Python?',
            points=10,
            options=[
                {'id': 1, 'text': 'Programming Language', 'isCorrect': True},
                {'id': 2, 'text': 'Snake', 'isCorrect': False}
            ],
            order=1
        )
    
    def test_get_available_exams(self):
        """Test getting available exams for student"""
        self.client.force_authenticate(user=self.student)
        response = self.client.get('/api/v1/exams/available/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
    
    def test_create_exam_by_staff(self):
        """Test creating exam by staff"""
        self.client.force_authenticate(user=self.staff)
        now = timezone.now()
        data = {
            'title': 'Java Advanced',
            'description': 'Advanced Java Programming',
            'exam_type': 'mixed',
            'start_time': now + timedelta(days=1),
            'end_time': now + timedelta(days=1, hours=2),
            'duration': 120,
            'total_marks': 200,
            'passing_marks': 80,
            'instructions': 'Answer all questions'
        }
        response = self.client.post('/api/v1/staff/exams/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


class ExamAttemptTestCase(APITestCase):
    """Test exam attempt functionality"""
    
    def setUp(self):
        self.client = APIClient()
        
        # Create student
        self.student = User.objects.create_user(
            email='student@example.com',
            username='student',
            password='testpass123',
            role='student',
            name='John Student',
            department='CS'
        )
        
        # Create staff
        self.staff = User.objects.create_user(
            email='staff@example.com',
            username='staff',
            password='testpass123',
            role='staff',
            name='Jane Staff'
        )
        
        # Create exam
        now = timezone.now()
        self.exam = Exam.objects.create(
            title='Python Basics',
            description='Basic Python',
            exam_type='mixed',
            start_time=now - timedelta(minutes=5),
            end_time=now + timedelta(minutes=55),
            duration=60,
            total_marks=100,
            passing_marks=40,
            is_published=True,
            created_by=self.staff
        )
        
        # Create question
        self.question = Question.objects.create(
            exam=self.exam,
            type='mcq',
            text='What is Python?',
            points=100,
            options=[
                {'id': 1, 'text': 'Programming Language', 'isCorrect': True},
                {'id': 2, 'text': 'Snake', 'isCorrect': False}
            ],
            order=1
        )
    
    def test_start_exam(self):
        """Test starting exam attempt"""
        self.client.force_authenticate(user=self.student)
        response = self.client.post(f'/api/v1/exams/{self.exam.id}/attempt/')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('attemptId', response.data)
        self.assertIn('time_remaining_seconds', response.data)
    
    def test_cannot_attempt_twice(self):
        """Test that student cannot attempt same exam twice"""
        self.client.force_authenticate(user=self.student)
        
        # First attempt
        response1 = self.client.post(f'/api/v1/exams/{self.exam.id}/attempt/')
        self.assertEqual(response1.status_code, status.HTTP_201_CREATED)
        
        # Second attempt should fail
        response2 = self.client.post(f'/api/v1/exams/{self.exam.id}/attempt/')
        self.assertEqual(response2.status_code, status.HTTP_400_BAD_REQUEST)

class ExamTakingTestCase(APITestCase):
    """Test exam taking functionality (Save & Submit)"""
    
    def setUp(self):
        self.client = APIClient()
        
        # Create student
        self.student = User.objects.create_user(
            email='student_taking@example.com',
            username='student_taking',
            password='testpass123',
            role='student',
            name='Test Student'
        )
        
        # Create staff
        self.staff = User.objects.create_user(
            email='staff_taking@example.com',
            username='staff_taking',
            password='testpass123',
            role='staff',
            name='Test Staff'
        )
        
        # Create exam
        now = timezone.now()
        self.exam = Exam.objects.create(
            title='Test Exam',
            description='Testing Exam Taking',
            exam_type='mixed',
            start_time=now - timedelta(minutes=10),
            end_time=now + timedelta(minutes=50),
            duration=60,
            total_marks=10,
            passing_marks=4,
            is_published=True,
            created_by=self.staff
        )
        
        # Create question
        self.question = Question.objects.create(
            exam=self.exam,
            type='mcq',
            text='Test Question?',
            points=10,
            options=[
                {'id': 'opt1', 'text': 'Option 1', 'isCorrect': True},
                {'id': 'opt2', 'text': 'Option 2', 'isCorrect': False}
            ],
            order=1
        )
        
        # Start an attempt
        self.attempt = ExamAttempt.objects.create(
            exam=self.exam,
            student=self.student,
            start_time=timezone.now(),
            status='in_progress'
        )
        
        # Create initial empty answer
        self.answer = Answer.objects.create(
            attempt=self.attempt,
            question=self.question,
            answer={}
        )
        
    def test_save_answer(self):
        """Test saving an answer using exam_id in URL"""
        self.client.force_authenticate(user=self.student)
        
        url = f'/api/v1/exams/{self.exam.id}/attempt/save/'
        data = {
            'questionId': str(self.question.id),
            'answer': 'opt1'
        }
        
        response = self.client.put(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify answer was saved
        self.answer.refresh_from_db()
        self.assertEqual(self.answer.answer, 'opt1')

    def test_submit_exam(self):
        """Test submitting an exam using exam_id in URL"""
        self.client.force_authenticate(user=self.student)
        
        url = f'/api/v1/exams/{self.exam.id}/attempt/submit/'
        
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify attempt status
        self.attempt.refresh_from_db()
        self.assertEqual(self.attempt.status, 'submitted')
        self.assertIsNotNone(self.attempt.submit_time)

class StudentMyResultsTestCase(APITestCase):
    """Test student results functionality"""
    
    def setUp(self):
        self.client = APIClient()
        
        # Create student
        self.student = User.objects.create_user(
            email='student_results@example.com',
            username='student_results',
            password='testpass123',
            role='student',
            name='Test Student'
        )
        
        # Create staff
        self.staff = User.objects.create_user(
            email='staff_results@example.com',
            username='staff_results',
            password='testpass123',
            role='staff',
            name='Test Staff'
        )
        
        # Create exam
        now = timezone.now()
        self.exam = Exam.objects.create(
            title='Test Exam Results',
            description='Testing Results',
            exam_type='mixed',
            start_time=now - timedelta(hours=2),
            end_time=now - timedelta(hours=1),
            duration=60,
            total_marks=10,
            passing_marks=4,
            is_published=True,
            created_by=self.staff
        )
        
        # Create attempt
        self.attempt = ExamAttempt.objects.create(
            exam=self.exam,
            student=self.student,
            start_time=now - timedelta(hours=1, minutes=30),
            submit_time=now - timedelta(hours=1, minutes=10),
            status='submitted',
            total_score=10,
            obtained_score=8
        )
        
        # Create result (usually created by calculate_exam_result)
        from exams.models import Result
        self.result = Result.objects.create(
            attempt=self.attempt,
            exam=self.exam,
            student=self.student,
            total_marks=10,
            obtained_marks=8,
            percentage=80,
            status='pass',
            is_published=True,
            submitted_at=self.attempt.submit_time
        )
        
    def test_get_my_results(self):
        """Test getting student's results"""
        self.client.force_authenticate(user=self.student)
        response = self.client.get('/api/v1/exams/my-results/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.result.id))

    def test_get_unpublished_results(self):
        """Test that unpublished results are hidden from student"""
        self.result.is_published = False
        self.result.save()
        
        self.client.force_authenticate(user=self.student)
        response = self.client.get('/api/v1/exams/my-results/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 0)

class AutoSaveCodingTestCase(APITestCase):
    """Test auto-save for coding questions"""
    
    def setUp(self):
        self.client = APIClient()
        self.student = User.objects.create_user(
            email='student_coding@example.com',
            username='student_coding',
            password='testpass123',
            role='student',
            name='Test Student'
        )
        self.staff = User.objects.create_user(
            email='staff_coding@example.com',
            username='staff_coding',
            password='testpass123',
            role='staff',
            name='Test Staff'
        )
        now = timezone.now()
        self.exam = Exam.objects.create(
            title='Coding Exam',
            description='Test Coding',
            exam_type='coding',
            start_time=now - timedelta(minutes=10),
            end_time=now + timedelta(minutes=50),
            duration=60,
            total_marks=10,
            passing_marks=4,
            is_published=True,
            created_by=self.staff
        )
        self.question = Question.objects.create(
            exam=self.exam,
            type='coding',
            text='Write code',
            points=10,
            coding_language='python',
            order=1
        )
        self.attempt = ExamAttempt.objects.create(
            exam=self.exam,
            student=self.student,
            start_time=now,
            status='in_progress'
        )
        self.answer = Answer.objects.create(
            attempt=self.attempt,
            question=self.question,
            answer={}
        )
        
    def test_save_coding_answer(self):
        """Test saving a coding answer (answer field null/None)"""
        self.client.force_authenticate(user=self.student)
        url = f'/api/v1/exams/{self.exam.id}/attempt/save/'
        
        data = {
            'questionId': str(self.question.id),
            'answer': None,
            'code': 'print("Hello World")'
        }
        
        response = self.client.put(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.answer.refresh_from_db()
        self.assertEqual(self.answer.code, 'print("Hello World")')
        self.assertEqual(self.answer.answer, {})

class StaffResultsTestCase(APITestCase):
    """Test staff results viewing"""
    
    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(
            email='staff_res@example.com',
            username='staff_res',
            password='testpass123',
            role='staff',
            name='Test Staff'
        )
        self.student = User.objects.create_user(
            email='student_res@example.com',
            username='student_res',
            password='testpass123',
            role='student',
            name='Test Student'
        )
        now = timezone.now()
        self.exam = Exam.objects.create(
            title='Staff Results Exam',
            description='Testing Results',
            exam_type='mixed',
            start_time=now - timedelta(hours=2),
            end_time=now - timedelta(hours=1),
            duration=60,
            total_marks=10,
            passing_marks=4,
            is_published=True,
            created_by=self.staff
        )
        self.attempt = ExamAttempt.objects.create(
            exam=self.exam,
            student=self.student,
            start_time=now - timedelta(hours=1, minutes=30),
            submit_time=now - timedelta(hours=1, minutes=10),
            status='submitted',
            total_score=10,
            obtained_score=8
        )
        
        from exams.models import Result
        self.result = Result.objects.create(
            attempt=self.attempt,
            exam=self.exam,
            student=self.student,
            total_marks=10,
            obtained_marks=8,
            percentage=80,
            status='pass',
            grading_status='fully_graded',
            is_published=True,
            submitted_at=self.attempt.submit_time
        )
        
    def test_list_exam_results(self):
        """Test staff listing results for exam"""
        self.client.force_authenticate(user=self.staff)
        url = f'/api/v1/staff/exams/{self.exam.id}/results/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['student_name'], 'Test Student')
        self.assertEqual(response.data['results'][0]['exam_title'], 'Staff Results Exam')

    def test_get_submissions(self):
        """Test staff getting submissions"""
        self.client.force_authenticate(user=self.staff)
        url = f'/api/v1/staff/exams/{self.exam.id}/submissions/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['studentName'], 'Test Student')

    def test_publish_result(self):
        """Test staff publishing a result"""
        self.client.force_authenticate(user=self.staff)
        
        # Initially published (from setUp), let's unpublish first
        self.result.is_published = False
        self.result.save()
        
        url = f'/api/v1/staff/results/{self.result.id}/publish/'
        data = {'action': 'publish'}
        
        response = self.client.put(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_published'])
        
        self.result.refresh_from_db()
        self.assertTrue(self.result.is_published)
        
        # Test unpublish
        data = {'action': 'unpublish'}
        response = self.client.put(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['is_published'])
        
        self.result.refresh_from_db()
        self.assertFalse(self.result.is_published)

    def test_staff_evaluate_recalculation(self):
        """Test that evaluating an answer updates the result total score"""
        self.client.force_authenticate(user=self.staff)
        
        # Create a question and answer for this exam
        question = Question.objects.create(
            exam=self.exam,
            type='descriptive',
            text='Explain logic',
            points=10,
            order=2
        )
        
        # Create answer with 0 score initially
        answer = Answer.objects.create(
            attempt=self.attempt,
            question=question,
            answer={'text': 'This is logic'},
            score=0
        )
        
        # Evaluate answer
        url = f'/api/v1/staff/submissions/{self.attempt.id}/evaluate/'
        data = {
            'questionId': str(question.id),
            'score': 5,
            'feedback': 'Good'
        }
        
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify result updated
        # calculate_exam_result sums ALL answers. 
        # Existing setup has NO answers. New answer has 5.
        # So obtained_marks should be 5.
        self.result.refresh_from_db()
        self.assertEqual(self.result.obtained_marks, 5)

    def test_bulk_publish_results(self):
        """Test staff bulk publishing results"""
        self.client.force_authenticate(user=self.staff)
        
        # Verify initial state
        self.assertTrue(self.result.is_published)
        
        # Unpublish all
        url = f'/api/v1/staff/exams/{self.exam.id}/publish-results/'
        data = {'action': 'unpublish'}
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.result.refresh_from_db()
        self.assertFalse(self.result.is_published)
        
        # Publish all
        data = {'action': 'publish'}
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.result.refresh_from_db()
        self.assertTrue(self.result.is_published)

    def test_exam_analytics(self):
        """Test exam analytics (verify 500 fix)"""
        self.client.force_authenticate(user=self.staff)
        
        url = f'/api/v1/staff/exams/{self.exam.id}/analytics/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('average_score', response.data)
        self.assertIn('highest_score', response.data)
        self.assertIn('lowest_score', response.data)
