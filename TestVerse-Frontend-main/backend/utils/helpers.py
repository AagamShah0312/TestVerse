from django.utils import timezone
from exams.models import ExamAttempt, Answer, Result
from decimal import Decimal
import re


def _is_true(val):
    return val is True or val == 1 or str(val).lower() == 'true'


def _norm_token(val):
    return str(val).strip().lower()


def _norm_department(value):
    if value is None:
        return ''
    text = re.sub(r'[^a-z0-9]+', ' ', str(value).strip().lower())
    return re.sub(r'\s+', ' ', text).strip()


_DEPARTMENT_ALIASES = {
    'cs': 'computer science',
    'cse': 'computer science',
    'computer science engineering': 'computer science',
    'it': 'information technology',
    'ece': 'electronics communication',
    'ee': 'electrical engineering',
    'mech': 'mechanical engineering',
    'civil': 'civil engineering',
}


def _expand_department_tokens(value):
    norm = _norm_department(value)
    if not norm:
        return set()

    tokens = {norm}
    for short, full in _DEPARTMENT_ALIASES.items():
        if norm == short:
            tokens.add(full)
        if norm == full:
            tokens.add(short)
    return tokens


def is_department_allowed(user_department, allowed_departments):
    """
    Match department restrictions robustly:
    - supports empty/None (open to all)
    - trims/case-normalizes values
    - supports common aliases (e.g. CSE <-> Computer Science)
    - supports wildcard markers like 'all'
    """
    if not allowed_departments:
        return True

    if isinstance(allowed_departments, str):
        raw = allowed_departments.strip()
        if raw.startswith('[') and raw.endswith(']'):
            raw = raw[1:-1]
        allowed_list = [p.strip().strip('"').strip("'") for p in raw.split(',')]
    elif isinstance(allowed_departments, (list, tuple, set)):
        allowed_list = list(allowed_departments)
    else:
        return True

    allowed_tokens = set()
    for dept in allowed_list:
        norm = _norm_department(dept)
        if not norm:
            continue
        if norm in {'all', 'any', 'everyone', '*'}:
            return True
        allowed_tokens.update(_expand_department_tokens(norm))

    if not allowed_tokens:
        return True

    user_tokens = _expand_department_tokens(user_department)
    if not user_tokens:
        return False

    if user_tokens & allowed_tokens:
        return True

    # Relaxed fallback for near-matches like "computer science engineering"
    for u in user_tokens:
        for a in allowed_tokens:
            if u in a or a in u:
                return True

    return False


def _tokens_from_answer(student_answer):
    """Normalize answer payload into comparable token set."""
    if student_answer is None:
        return set()

    if isinstance(student_answer, list):
        raw = student_answer
    elif isinstance(student_answer, dict):
        # Prefer explicit selected arrays used by some clients.
        selected = (
            student_answer.get('selected_options')
            or student_answer.get('selected')
            or student_answer.get('options')
            or student_answer.get('answers')
        )
        if isinstance(selected, list):
            raw = selected
        elif isinstance(selected, str):
            raw = [part.strip() for part in selected.split(',') if part.strip()]
        else:
            # Support object-style boolean maps: {"A": true, "B": false}
            truthy_keys = [k for k, v in student_answer.items() if _is_true(v)]
            if truthy_keys:
                raw = truthy_keys
            else:
                # Accept scalar payload styles; avoid falling back to all values.
                scalar_keys = ('id', 'value', 'text', 'answer', 'option', 'option_id')
                raw = [student_answer.get(k) for k in scalar_keys if student_answer.get(k) is not None]
    else:
        raw = [student_answer]

    out = set()
    for item in raw:
        if item is None:
            continue
        if isinstance(item, dict):
            for key in ('id', 'value', 'text', 'answer'):
                if item.get(key) is not None:
                    out.add(_norm_token(item.get(key)))
            continue
        out.add(_norm_token(item))
    return out


def _extract_correct_tokens_from_options(question):
    """
    Build a robust token set for correct choices.
    Supports both isCorrect and is_correct + with/without option ids.
    """
    correct = set()
    options = question.options or []

    for idx, option in enumerate(options):
        if not isinstance(option, dict):
            continue

        is_correct = _is_true(option.get('isCorrect')) or _is_true(option.get('is_correct'))
        if not is_correct:
            continue

        # Accept multiple representations from frontend/backends.
        tokens = [
            option.get('id'),
            option.get('value'),
            option.get('text'),
            idx,           # 0-based index
            idx + 1,       # 1-based index
            chr(65 + idx), # A/B/C...
        ]
        for t in tokens:
            if t is not None and str(t).strip() != '':
                correct.add(_norm_token(t))

    return correct


def auto_evaluate_mcq(attempt, question, student_answer):
    """Auto-evaluate MCQ questions"""
    if question.type == 'mcq':
        correct_tokens = _extract_correct_tokens_from_options(question)
        student_tokens = _tokens_from_answer(student_answer)
        if correct_tokens and (correct_tokens & student_tokens):
            return question.points
    elif question.type == 'multiple_mcq':
        # Prefer explicit correct_answers, fallback to options flags.
        explicit = set(_norm_token(a) for a in (question.correct_answers or []) if str(a).strip() != '')
        correct_answers = explicit if explicit else _extract_correct_tokens_from_options(question)
        student_answers = _tokens_from_answer(student_answer)
        if correct_answers and correct_answers == student_answers:
            return question.points
    return Decimal('0')


def _compute_grading_status(answers):
    """
    Determine grading status based on which answers need manual grading.
    Returns one of: 'pending', 'partially_graded', 'fully_graded'
    """
    manual_answers = [a for a in answers if a.question.type in ('descriptive', 'coding')]
    
    if not manual_answers:
        # Pure MCQ exam — all auto-graded
        return 'fully_graded'
    
    graded_count = sum(1 for a in manual_answers if a.score is not None)
    
    if graded_count == 0:
        return 'pending'
    elif graded_count < len(manual_answers):
        return 'partially_graded'
    else:
        return 'fully_graded'


def calculate_exam_result(attempt):
    """
    Calculate exam result for student.
    - Auto-grades MCQ/multiple_mcq answers
    - Leaves descriptive/coding answers ungraded (score=None) unless already graded
    - Sets grading_status based on how many manual answers are graded
    - Only determines pass/fail when fully graded; otherwise status='pending'
    """
    total_marks = attempt.exam.total_marks
    obtained_marks = Decimal('0')
    
    answers = list(attempt.answers.select_related('question').all())
    
    for answer in answers:
        question = answer.question
        
        # Auto-evaluate MCQ types
        if question.type in ['mcq', 'multiple_mcq']:
            score = auto_evaluate_mcq(attempt, question, answer.answer)
            answer.score = score
            answer.save()
        # Descriptive/coding: don't touch score if it's already been set by teacher
        # If not yet graded, score stays None
    
    # Sum up only graded answers
    for answer in answers:
        if answer.score is not None:
            obtained_marks += answer.score
    
    attempt.total_score = total_marks
    attempt.obtained_score = obtained_marks
    attempt.save()
    
    # Determine grading status
    grading_status = _compute_grading_status(answers)
    
    # Determine pass/fail only when fully graded
    percentage = (obtained_marks / total_marks * 100) if total_marks > 0 else 0
    if grading_status == 'fully_graded':
        result_status = 'pass' if obtained_marks >= attempt.exam.passing_marks else 'fail'
    else:
        result_status = 'pending'
    
    # Create or update result
    result, created = Result.objects.update_or_create(
        attempt=attempt,
        defaults={
            'exam': attempt.exam,
            'student': attempt.student,
            'total_marks': total_marks,
            'obtained_marks': obtained_marks,
            'percentage': percentage,
            'status': result_status,
            'grading_status': grading_status,
            'submitted_at': attempt.submit_time or timezone.now(),
        }
    )
    
    return result


def check_exam_eligibility(user, exam):
    """Check if student is eligible to attempt exam"""
    now = timezone.now()
    
    # Check if exam is published
    if not exam.is_published:
        return False, "Exam is not published yet"
    
    # Check if exam has started
    if now < exam.start_time:
        return False, "Exam has not started yet"
    
    # Check if exam has ended
    if now > exam.end_time:
        return False, "Exam has ended"
    
    # Check department restrictions
    if not is_department_allowed(user.department, exam.allowed_departments):
        return False, "You are not allowed to attempt this exam"
    
    # Check if already attempted
    if ExamAttempt.objects.filter(exam=exam, student=user).exists():
        return False, "You have already attempted this exam"
    
    return True, "Eligible to attempt"


def get_attempt_end_time(attempt):
    """Get the actual end time for an attempt.
    Uses exam.end_time as the universal deadline — same for all students.
    Everyone finishes at the same time regardless of when they started.
    """
    return attempt.exam.end_time


def get_attempt_remaining_time(attempt):
    """Get remaining time for exam attempt in seconds.
    Enforces exam.end_time as the hard deadline for all students.
    """
    end_time = get_attempt_end_time(attempt)
    now = timezone.now()
    
    if now > end_time:
        return 0
    
    remaining = end_time - now
    return int(remaining.total_seconds())


def execute_code(code, language, test_cases):
    """Execute code against test cases (stub for now)"""
    # This would integrate with a code execution service
    # For now, returning placeholder response
    results = []
    for test_case in test_cases:
        results.append({
            'testCase': test_case,
            'passed': False,
            'actualOutput': '',
            'error': 'Code execution service not configured'
        })
    return results
