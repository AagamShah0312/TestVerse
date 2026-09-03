# TestVerse Backend — API Reference

> **Base URL:** `http://localhost:8000/api/v1`
> **Auth:** JWT Bearer Token — add `Authorization: Bearer <access_token>` to every protected request.
> **Content-Type:** `application/json`
> **Swagger Docs:** `GET /api/docs/`
> **Health Check:** `GET /health/`

---

## 1. Authentication

### Register
**POST** `/api/v1/auth/register/` 🔓 Public

**Request Body:**
```json
{
  "email": "student@example.com",
  "username": "john_doe",
  "name": "John Doe",
  "password": "secret123",
  "password_confirm": "secret123",
  "role": "student",
  "department": "Computer Science",
  "enrollment_id": "CS2021001"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| email | string | ✅ | Must be unique |
| username | string | ✅ | Must be unique |
| name | string | ✅ | Full name |
| password | string | ✅ | Min 6 chars |
| password_confirm | string | ✅ | Must match password |
| role | string | ✅ | `"student"` or `"staff"` |
| department | string | ❌ | Optional |
| enrollment_id | string | ❌ | Unique student ID |

**Response `201`:**
```json
{
  "message": "User registered successfully",
  "user": { "id": "uuid", "email": "...", "role": "student" }
}
```

---

### Login
**POST** `/api/v1/auth/login/` 🔓 Public

```json
{ "email": "student@example.com", "password": "secret123" }
```

**Response `200`:**
```json
{ "access": "<JWT_ACCESS_TOKEN>", "refresh": "<JWT_REFRESH_TOKEN>" }
```
> `access` token valid 24h; `refresh` token valid 7 days.

---

### Refresh Token
**POST** `/api/v1/auth/refresh/`

```json
{ "refresh": "<JWT_REFRESH_TOKEN>" }
```
Response: `{ "access": "<NEW_ACCESS_TOKEN>" }`

---

## 2. User Profile

| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/api/v1/auth/users/profile/` | Get current user's profile |
| PATCH | `/api/v1/auth/users/profile/` | Update username, name, department |
| POST | `/api/v1/auth/users/change-password/` | Body: `{old_password, new_password, new_password_confirm}` |
| GET | `/api/v1/auth/users/` | List all users (Staff only) |

**Profile Response:**
```json
{
  "id": "uuid", "email": "...", "username": "...", "name": "...",
  "role": "student", "department": "CS", "enrollment_id": "CS001",
  "created_at": "...", "updated_at": "..."
}
```

---

## 3. Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/auth/notifications/` | List all notifications |
| POST | `/api/v1/auth/notifications/mark-read/` | Mark read (body: `{notification_ids: [...]}` or `{mark_all: true}`) |
| GET | `/api/v1/auth/notifications/count/` | Returns `{"unread_count": 5}` |

**Notification types:** `exam_published`, `exam_reminder`, `result_published`, `announcement`, `branch_assigned`

---

## 4. Announcements

| Method | Endpoint | Role |
|--------|----------|------|
| GET | `/api/v1/auth/announcements/` | Student — filtered by department |
| GET | `/api/v1/auth/staff/announcements/` | Staff |
| POST | `/api/v1/auth/staff/announcements/` | Staff — create |
| PATCH/DELETE | `/api/v1/auth/staff/announcements/{id}/` | Staff |

**Create Announcement Body:**
```json
{
  "title": "Exam Schedule Update",
  "content": "Exams rescheduled to next week.",
  "target_departments": ["CS", "IT"],
  "is_active": true
}
```
> `target_departments: []` = visible to all departments.

---

## 5. Gamification — Leaderboard, Badges & Points

| Method | Endpoint | Returns |
|--------|----------|---------|
| GET | `/api/v1/auth/leaderboard/` | `[{user_id, name, department, total_points, badge_count, rank}]` |
| GET | `/api/v1/auth/badges/` | User's earned badges with badge details |
| GET | `/api/v1/auth/points/` | Points history `[{points, point_type, description, created_at}]` |

**Badge types:** `first_exam`, `perfect_score`, `streak_3`, `streak_5`, `top_scorer`, `speed_demon`, `consistent`, `improver`

**Point types:** `exam_complete`, `exam_passed`, `perfect_score`, `badge_earned`, `streak_bonus`

---

## 6. Student Analytics

**GET** `/api/v1/auth/analytics/`

```json
{
  "total_exams_taken": 10,
  "average_score": "78.50",
  "total_points": 320,
  "badge_count": 4,
  "pass_rate": "90.00"
}
```

---

## 7. Staff — Student Management

| Method | Endpoint |
|--------|----------|
| GET | `/api/v1/auth/staff/students/` |
| GET/PATCH/DELETE | `/api/v1/auth/staff/students/{id}/` |

**PATCH Body** (assign department/role):
```json
{ "department": "CS", "role": "student", "is_active": true }
```

---

## 8. Student — Exams

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/exams/available/` | List published exams for student's department |
| GET | `/api/v1/exams/{id}/` | Get exam detail |

**Exam types:** `mcq`, `mixed`, `coding`, `descriptive`

---

## 9. Student — Exam Attempt

### Start Exam
**POST** `/api/v1/exams/{exam_id}/attempt/` 🔐

Response includes questions **without** `isCorrect` field:
```json
{
  "attempt_id": "uuid",
  "start_time": "...",
  "time_limit_minutes": 60,
  "questions": [
    {
      "id": "uuid", "type": "mcq", "text": "...", "points": "5.00",
      "options": [{"id": 1, "text": "Option A"}, ...],
      "order": 1
    }
  ]
}
```

### Save Answer (Auto-save)
**POST** `/api/v1/exams/{exam_id}/attempt/save/`

```json
// MCQ
{ "question_id": "uuid", "answer":  }

// Descriptive
{ "question_id": "uuid", "answer": "Normalization is..." }

// Coding
{ "question_id": "uuid", "answer": "def solve(): pass", "code": "def solve(): pass" }
```

### Submit Exam
**POST** `/api/v1/exams/{exam_id}/attempt/submit/` — body: `{}`

---

## 10. Student — Results

| Method | Endpoint |
|--------|----------|
| GET | `/api/v1/exams/my-results/` |
| GET | `/api/v1/exams/{exam_id}/result/` |
| GET | `/api/v1/exams/my-attempts/` |

**Result object:**
```json
{
  "id": "uuid",
  "exam": {"id": "uuid", "title": "DBMS Unit Test"},
  "total_marks": "100.00", "obtained_marks": "82.00", "percentage": "82.00",
  "status": "pass",
  "grading_status": "fully_graded",
  "is_published": true
}
```
**Status values:** `pending`, `pass`, `fail`
**Grading status:** `pending`, `partially_graded`, `fully_graded`

---

## 11. Staff — Exam CRUD (ViewSet)

| Method | URL | Action |
|--------|-----|--------|
| GET | `/api/v1/staff/exams/` | List all exams |
| POST | `/api/v1/staff/exams/` | Create exam |
| GET/PUT/PATCH | `/api/v1/staff/exams/{id}/` | Read/Update |
| DELETE | `/api/v1/staff/exams/{id}/` | Delete |

**Create Exam Body:**
```json
{
  "title": "DBMS Unit Test",
  "description": "Chapters 1-3",
  "exam_type": "mixed",
  "start_time": "2024-02-20T10:00:00Z",
  "end_time": "2024-02-20T11:00:00Z",
  "duration": 60,
  "total_marks": 100,
  "passing_marks": 40,
  "is_published": false,
  "instructions": "Read carefully.",
  "allowed_departments": ["CS", "IT"]
}
```

---

## 12. Staff — Question Management

| Method | URL |
|--------|-----|
| GET/POST | `/api/v1/staff/exams/{exam_id}/questions/` |
| GET/PUT/PATCH/DELETE | `/api/v1/staff/questions/{id}/` |

**Question bodies by type:**

```json
// MCQ
{
  "type": "mcq", "text": "What is a primary key?", "points": 5,
  "options": [{"id": 1, "text": "Unique identifier", "isCorrect": true}, ...],
  "order": 1
}

// Multiple MCQ
{
  "type": "multiple_mcq", "text": "Which are ACID properties?", "points": 5,
  "options": [...], "correct_answers": , "order": 2
}

// Coding
{
  "type": "coding", "text": "Reverse a string.", "points": 20,
  "coding_language": "python",
  "test_cases": [{"input": "hello", "expected_output": "olleh"}],
  "sample_input": "hello", "sample_output": "olleh", "order": 3
}

// Descriptive
{
  "type": "descriptive", "text": "Explain normalization.", "points": 15,
  "sample_answer": "Normalization is...", "order": 4
}
```

**Coding languages:** `python`, `java`, `javascript`, `cpp`

---

## 13. Staff — Submissions & Evaluation

| Method | Endpoint |
|--------|----------|
| GET | `/api/v1/staff/submissions/{attempt_id}/` |
| POST | `/api/v1/staff/submissions/{attempt_id}/evaluate/` |
| POST | `/api/v1/staff/exams/{exam_id}/questions/{question_id}/evaluate/` |

**Evaluate body:**
```json
{ "question_id": "uuid", "score": 12, "feedback": "Good, but missed index coverage." }
```

---

## 14. Staff — Results Management

| Method | Endpoint |
|--------|----------|
| GET | `/api/v1/staff/exams/{exam_id}/results/` |
| GET | `/api/v1/staff/results/{result_id}/answers/` |
| POST | `/api/v1/staff/results/{id}/publish/` |

---

## 15. Staff — Analytics & Monitoring

| Method | Endpoint |
|--------|----------|
| GET | `/api/v1/staff/exams/{exam_id}/analytics/` |
| GET | `/api/v1/staff/exams/{exam_id}/live-monitor/` |

**Analytics response:**
```json
{
  "total_students": 50, "submitted_count": 48,
  "average_score": "72.50", "pass_count": 40,
  "fail_count": 8, "pass_rate": "83.33",
  "highest_score": "98.00", "lowest_score": "22.00"
}
```

---

## 16. Staff — Time Extensions

| Method | Endpoint |
|--------|----------|
| POST | `/api/v1/staff/exams/{exam_id}/extend-time/` |
| GET | `/api/v1/staff/exams/{exam_id}/extensions/` |

**Extend body:**
```json
{ "student_id": "uuid", "additional_minutes": 15, "reason": "Technical issue" }
```

---

## 17. Staff — Bulk Operations

| Method | Endpoint |
|--------|----------|
| POST | `/api/v1/staff/exams/{exam_id}/bulk-feedback/` |
| GET | `/api/v1/staff/exams/{exam_id}/bulk-results/` (query: `?status=pass&department=CS`) |
| POST | `/api/v1/staff/exams/{exam_id}/publish-results/` |

**Bulk publish body:**
```json
{ "result_ids": ["uuid1", "uuid2"], "publish_all": false }
```

---

## 18. Staff — Plagiarism Detection

**POST** `/api/v1/staff/exams/{exam_id}/plagiarism-check/` — body: `{}`

**Response:**
```json
{
  "reports": [{
    "student1": {"id": "uuid", "name": "John"},
    "student2": {"id": "uuid", "name": "Jane"},
    "similarity_score": "85.50",
    "risk_level": "high",
    "report": "Detailed diff..."
  }]
}
```
**Risk levels:** `low`, `medium`, `high`

---

## 19. Error Responses

```json
{ "error": "Human readable message", "details": {} }
```

| Status | Meaning |
|--------|---------|
| 400 | Validation error |
| 401 | Invalid/missing JWT |
| 403 | Wrong role (student vs staff) |
| 404 | Not found |
| 409 | Conflict (e.g. already attempted exam) |

---

## 20. AI Integration Guide

### AI Question Generator
```
POST /api/v1/staff/exams/{exam_id}/questions/
→ Generates and saves questions (MCQ, coding, descriptive)
```

### AI Auto-Evaluation (Descriptive/Coding)
```
POST /api/v1/staff/submissions/{attempt_id}/evaluate/
Body: { question_id, score, feedback }
```

### AI Plagiarism Trigger
```
POST /api/v1/staff/exams/{exam_id}/plagiarism-check/
```

### Data Endpoints for AI Insights
```
GET /api/v1/staff/exams/{exam_id}/analytics/    → Exam-level stats
GET /api/v1/auth/analytics/                     → Student-level stats
GET /api/v1/auth/leaderboard/                   → Rankings
GET /api/v1/staff/exams/{exam_id}/bulk-results/ → Per-student results
```