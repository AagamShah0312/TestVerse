# TestVerse Exam Platform API Documentation

## Overview

This API provides a comprehensive backend system for managing online examinations with role-based access control. The system supports two primary roles: **Students** and **Staff/Administrators**, each with distinct permissions and capabilities.

## Technology Stack

- **Framework**: Django 4.2.8 with Django REST Framework 3.14.0
- **Authentication**: JWT (JSON Web Tokens) using SimpleJWT
- **Database**: PostgreSQL (production) / SQLite (development)
- **API Documentation**: Swagger UI and Redoc with drf-spectacular
- **Deployment**: Render.com with automatic scaling
- **Security**: CORS protection, rate limiting, and permission-based access control

## Key Features

- Real-time exam monitoring and progress tracking
- Automatic and manual answer evaluation
- Code plagiarism detection for programming questions
- Department-based exam access control
- Bulk operations for result management
- Time extension management for special cases
- Comprehensive analytics and reporting

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Authentication](#authentication)
3. [API Endpoints](#api-endpoints)
   - [Authentication Endpoints](#authentication-endpoints)
   - [User Profile Endpoints](#user-profile-endpoints)
   - [Student Exam Endpoints](#student-exam-endpoints)
   - [Staff Exam Management](#staff-exam-management)
   - [Question Management](#question-management)
   - [Exam Attempt Endpoints](#exam-attempt-endpoints)
   - [Results Management](#results-management)
   - [Advanced Staff Features](#advanced-staff-features)
4. [Data Models](#data-models)
5. [Error Handling](#error-handling)
6. [Request/Response Examples](#requestresponse-examples)

---

## System Architecture

### Roles and Permissions

#### Student Role
- View published exams within the allowed time window
- Attempt exams during the scheduled exam time
- Automatic submission when exam time ends
- View personal profile information
- View exam results and performance metrics

#### Staff/Admin Role
- Create, edit, and delete exams (before exam start time)
- Add questions to exams (MCQ, Multiple Choice, Descriptive, Coding)
- Publish and unpublish exams
- Evaluate descriptive and coding questions
- Auto-evaluate MCQ questions
- Generate and manage exam results
- View detailed analytics and performance metrics
- Grant exam time extensions to students
- Bulk assign feedback to multiple results
- Export and filter results with advanced criteria
- Detect code plagiarism in coding questions

---

## Authentication

### JWT (JSON Web Token)

The API uses **JWT** for authentication. Include the token in the `Authorization` header for all protected endpoints:

```
Authorization: Bearer <jwt_token>
```

### Token Structure
- **Issued at**: Login endpoint
- **Validity**: Configurable (typically 24-48 hours)
- **Payload**: User ID, role, email, permissions

---

## API Endpoints

### Authentication Endpoints

#### Register User
```
POST /api/auth/register
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "username": "johndoe",
  "name": "John Doe",
  "password": "secure_password",
  "role": "student",  // or "staff"
  "department": "Computer Science"  // optional
}
```

**Response (201 Created):**
```json
{
  "id": "user_123",
  "email": "user@example.com",
  "username": "johndoe",
  "name": "John Doe",
  "role": "student",
  "department": "Computer Science",
  "created_at": "2024-01-15T10:30:00Z"
}
```

---

#### Login
```
POST /api/auth/login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "secure_password"
}
```

**Response (200 OK):**
```json
{
  "access": "eyJhbGciOiJIUzI1NiIs...",
  "refresh": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "username": "johndoe",
    "name": "John Doe",
    "role": "student",
    "department": "Computer Science"
  }
}
```

---

### User Profile Endpoints

#### Get User Profile
```
GET /api/users/profile
```

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (200 OK):**
```json
{
  "id": "user_123",
  "email": "user@example.com",
  "username": "johndoe",
  "name": "John Doe",
  "role": "student",
  "department": "Computer Science",
  "phone": "+1234567890",
  "date_joined": "2024-01-15T10:30:00Z",
  "last_login": "2024-01-20T14:45:00Z"
}
```

---

### Student Exam Endpoints

#### Get Available Exams
```
GET /api/exams/available/
```

**Query Parameters:**
- `page` (optional): Pagination page number (default: 1)
- `page_size` (optional): Items per page (default: 10)
- `search` (optional): Search by exam title
- `status` (optional): Filter by status (upcoming, ongoing, completed)

**Response (200 OK):**
```json
{
  "count": 5,
  "next": "/api/exams/available/?page=2",
  "previous": null,
  "results": [
    {
      "id": "exam_001",
      "title": "Data Structures Mid-Term",
      "description": "Comprehensive exam covering arrays, linked lists, trees",
      "exam_type": "mixed",
      "duration": 120,
      "total_marks": "100.00",
      "passing_marks": "40.00",
      "start_time": "2024-02-05T10:00:00Z",
      "end_time": "2024-02-05T12:00:00Z",
      "is_published": true,
      "question_count": 50,
      "status": "upcoming",
      "instructions": "Read all questions carefully...",
      "allowed_departments": ["Computer Science", "Information Technology"]
    }
  ]
}
```

---

#### Get Exam Details
```
GET /api/exams/:exam_id/
```

**Response (200 OK):**
```json
{
  "id": "exam_001",
  "title": "Data Structures Mid-Term",
  "description": "Comprehensive exam covering arrays, linked lists, trees",
  "exam_type": "mixed",
  "duration": 120,
  "total_marks": "100.00",
  "passing_marks": "40.00",
  "start_time": "2024-02-05T10:00:00Z",
  "end_time": "2024-02-05T12:00:00Z",
  "is_published": true,
  "instructions": "Read all questions carefully...",
  "question_count": 50,
  "allowed_departments": ["Computer Science", "Information Technology"]
}
```

---

#### Start Exam Attempt
```
POST /api/exams/:exam_id/attempt/
```

**Response (200 OK or 201 Created):**
```json
{
  "message": "Exam started/resumed",
  "attemptId": "attempt_789",
  "startTime": "2024-02-05T10:00:00Z",
  "endTime": "2024-02-05T12:00:00Z",
  "time_remaining_seconds": 7200,
  "questions": [
    {
      "id": "q_001",
      "type": "mcq",
      "text": "What is a data structure?",
      "marks": "2.00",
      "order": 1,
      "options": [
        {"id": "opt_1", "text": "A way to organize data"},
        {"id": "opt_2", "text": "A programming language"},
        {"id": "opt_3", "text": "A software framework"},
        {"id": "opt_4", "text": "A database"}
      ],
      "student_answer": null
    }
  ]
}
```

---

#### Save Answer
```
POST /api/exams/:exam_id/attempt/save/
```

**Request Body:**
```json
{
  "question_id": "q_001",
  "answer": "opt_2"
}
```

**Response (200 OK):**
```json
{
  "message": "Answer saved successfully",
  "saved_at": "2024-02-05T10:15:00Z"
}
```

---

### Staff Exam Management

#### List All Exams (Staff)
```
GET /api/staff/exams/
```

**Query Parameters:**
- `page` (optional): Pagination page number
- `page_size` (optional): Items per page
- `status` (optional): Filter by status (draft, published, completed)
- `search` (optional): Search by title

**Response (200 OK):**
```json
{
  "count": 10,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": "exam_001",
      "title": "Data Structures Mid-Term",
      "exam_type": "mixed",
      "is_published": true,
      "question_count": 50,
      "total_marks": "100.00",
      "start_time": "2024-02-05T10:00:00Z",
      "end_time": "2024-02-05T12:00:00Z",
      "duration": 120,
      "student_attempts": 145,
      "created_by": "staff_123",
      "created_at": "2024-01-20T10:00:00Z",
      "updated_at": "2024-02-03T10:00:00Z"
    }
  ]
}
```

---

#### Create Exam
```
POST /api/staff/exams/
```

**Request Body:**
```json
{
  "title": "Advanced Algorithms",
  "description": "Comprehensive exam on sorting, searching, and optimization",
  "exam_type": "mixed",
  "duration": 180,
  "total_marks": "100.00",
  "passing_marks": "40.00",
  "start_time": "2024-03-15T10:00:00Z",
  "end_time": "2024-03-15T13:00:00Z",
  "instructions": "Read all questions carefully...",
  "is_published": false,
  "allowed_departments": ["Computer Science", "Information Technology"]
}
```

**Response (201 Created):**
```json
{
  "id": "exam_002",
  "title": "Advanced Algorithms",
  "description": "Comprehensive exam on sorting, searching, and optimization",
  "exam_type": "mixed",
  "duration": 180,
  "total_marks": "100.00",
  "passing_marks": "40.00",
  "start_time": "2024-03-15T10:00:00Z",
  "end_time": "2024-03-15T13:00:00Z",
  "instructions": "Read all questions carefully...",
  "is_published": false,
  "allowed_departments": ["Computer Science", "Information Technology"],
  "created_at": "2024-02-03T10:00:00Z",
  "updated_at": "2024-02-03T10:00:00Z"
}
```

---

#### Get Exam Details (Staff)
```
GET /api/staff/exams/:exam_id/
```

**Response (200 OK):**
```json
{
  "id": "exam_001",
  "title": "Data Structures Mid-Term",
  "description": "Comprehensive exam covering arrays, linked lists, trees",
  "exam_type": "mixed",
  "duration": 120,
  "total_marks": "100.00",
  "passing_marks": "40.00",
  "start_time": "2024-02-05T10:00:00Z",
  "end_time": "2024-02-05T12:00:00Z",
  "is_published": true,
  "instructions": "Read all questions carefully...",
  "question_count": 50,
  "student_attempts": 145,
  "allowed_departments": ["Computer Science", "Information Technology"],
  "created_at": "2024-01-20T10:00:00Z",
  "updated_at": "2024-02-03T10:00:00Z"
}
```

---

#### Update Exam
```
PUT /api/staff/exams/:exam_id/
```

**Restrictions:** Only modifiable before exam start time

**Request Body:**
```json
{
  "title": "Data Structures Mid-Term (Updated)",
  "description": "Updated description",
  "duration": 130,
  "total_marks": "100.00",
  "instructions": "Updated instructions...",
  "allowed_departments": ["Computer Science", "Electronics"]
}
```

**Response (200 OK):**
```json
{
  "id": "exam_001",
  "title": "Data Structures Mid-Term (Updated)",
  "updated_at": "2024-02-03T11:00:00Z"
}
```

---

#### Delete Exam
```
DELETE /api/staff/exams/:exam_id/
```

**Restrictions:** Only deletable before exam start time

**Response (204 No Content)**

---

#### Publish Exam
```
PATCH /api/staff/exams/:exam_id/
```

**Request Body:**
```json
{
  "is_published": true
}
```

**Response (200 OK):**
```json
{
  "id": "exam_001",
  "title": "Data Structures Mid-Term",
  "is_published": true,
  "updated_at": "2024-02-03T11:00:00Z"
}
```

---

#### Unpublish Exam
```
PATCH /api/staff/exams/:exam_id/
```

**Request Body:**
```json
{
  "is_published": false
}
```

**Response (200 OK):**
```json
{
  "id": "exam_001",
  "title": "Data Structures Mid-Term",
  "is_published": false,
  "updated_at": "2024-02-03T11:00:00Z"
}
```

---

### Question Management

#### Get Questions for Exam
```
GET /api/staff/exams/:exam_id/questions/
```

**Query Parameters:**
- `page` (optional): Pagination page number
- `page_size` (optional): Items per page
- `type` (optional): Filter by question type (mcq, multiple_mcq, descriptive, coding)

**Response (200 OK):**
```json
{
  "count": 50,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": "q_001",
      "exam_id": "exam_001",
      "type": "mcq",
      "text": "What is a data structure?",
      "marks": "2.00",
      "order": 1,
      "options": [
        {"id": "opt_1", "text": "A way to organize data", "is_correct": true},
        {"id": "opt_2", "text": "A programming language", "is_correct": false}
      ],
      "correct_answer": "opt_1",
      "created_at": "2024-01-20T10:00:00Z",
      "updated_at": "2024-01-20T10:00:00Z"
    }
  ]
}
```

---

#### Add Question
```
POST /api/staff/exams/:exam_id/questions/
```

**Request Body (MCQ):**
```json
{
  "type": "mcq",
  "text": "What is a linked list?",
  "marks": "2.00",
  "order": 1,
  "options": [
    {"text": "A sequential data structure", "is_correct": false},
    {"text": "A non-sequential data structure with pointers", "is_correct": true},
    {"text": "A type of array", "is_correct": false},
    {"text": "A database table", "is_correct": false}
  ]
}
```

**Request Body (Descriptive):**
```json
{
  "type": "descriptive",
  "text": "Explain the difference between arrays and linked lists",
  "marks": "10.00",
  "order": 2,
  "expected_answer": "Arrays are contiguous in memory with fixed size, while linked lists use pointers and dynamic allocation..."
}
```

**Request Body (Coding):**
```json
{
  "type": "coding",
  "text": "Write a function to reverse a linked list",
  "marks": "15.00",
  "order": 3,
  "language": "python",
  "test_cases": [
    {
      "input": "[1, 2, 3, 4, 5]",
      "expected_output": "[5, 4, 3, 2, 1]"
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "id": "q_051",
  "exam_id": "exam_001",
  "type": "mcq",
  "text": "What is a linked list?",
  "marks": "2.00",
  "order": 1,
  "created_at": "2024-02-03T11:00:00Z",
  "updated_at": "2024-02-03T11:00:00Z"
}
```

---

#### Update Question
```
PUT /api/staff/questions/:id/
```

**Restrictions:** Only modifiable before exam start time

**Response (200 OK)**

---

#### Delete Question
```
DELETE /api/staff/questions/:id/
```

**Restrictions:** Only deletable before exam start time

**Response (204 No Content)**

---

### Exam Attempt Endpoints

#### Get My Results
```
GET /api/exams/my-results/
```

**Response (200 OK):**
```json
{
  "count": 5,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": "result_001",
      "exam": {
        "id": "exam_001",
        "title": "Data Structures Mid-Term"
      },
      "obtained_marks": "75.00",
      "total_marks": "100.00",
      "percentage": "75.00",
      "status": "pass",
      "submitted_at": "2024-02-05T12:00:00Z",
      "feedback": "Good attempt with room for improvement"
    }
  ]
}
```

---

#### Get My Exam Attempts
```
GET /api/exams/my-attempts/
```

**Response (200 OK):**
```json
{
  "count": 3,
  "results": [
    {
      "id": "attempt_789",
      "exam": {
        "id": "exam_001",
        "title": "Data Structures Mid-Term"
      },
      "start_time": "2024-02-05T10:00:00Z",
      "submit_time": "2024-02-05T12:00:00Z",
      "status": "submitted"
    }
  ]
}
```

---

#### Get Student Profile
```
GET /api/users/profile/
```

**Response (200 OK):**
```json
{
  "id": "user_123",
  "email": "student@example.com",
  "username": "john_doe",
  "name": "John Doe",
  "role": "student",
  "department": "Computer Science",
  "enrollment_id": "CS2024001",
  "date_joined": "2024-01-15T10:30:00Z",
  "last_login": "2024-02-05T14:45:00Z"
}
```

---

### Results Management

#### Get Exam Results (Staff)
```
GET /api/staff/exams/:exam_id/results/
```

**Query Parameters:**
- `page` (optional): Pagination page number
- `page_size` (optional): Items per page
- `ordering` (optional): Sort by field (-obtained_marks for descending)

**Response (200 OK):**
```json
{
  "count": 145,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": "result_001",
      "exam": {
        "id": "exam_001",
        "title": "Data Structures Mid-Term"
      },
      "student": {
        "id": "user_001",
        "name": "John Doe",
        "email": "john@example.com",
        "department": "Computer Science"
      },
      "obtained_marks": "75.00",
      "total_marks": "100.00",
      "percentage": "75.00",
      "status": "pass",
      "evaluation_status": "auto_evaluated",
      "submitted_at": "2024-02-05T12:00:00Z",
      "evaluated_at": "2024-02-05T13:00:00Z"
    }
  ]
}
```

---

#### Get Submission Detail (Staff)
```
GET /api/staff/submissions/:attempt_id/
```

**Response (200 OK):**
```json
{
  "id": "attempt_789",
  "exam": {
    "id": "exam_001",
    "title": "Data Structures Mid-Term"
  },
  "student": {
    "id": "user_123",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "start_time": "2024-02-05T10:00:00Z",
  "submit_time": "2024-02-05T12:00:00Z",
  "status": "submitted",
  "answers": [
    {
      "id": "answer_001",
      "question": {
        "id": "q_001",
        "text": "What is a data structure?",
        "type": "mcq",
        "marks": "2.00"
      },
      "answer": "opt_2",
      "marks_obtained": "2.00",
      "is_correct": true
    }
  ]
}
```

---

#### Evaluate Answer (Staff)
```
POST /api/staff/submissions/:attempt_id/evaluate/
```

**Request Body:**
```json
{
  "question_id": "q_002",
  "marks_obtained": "8.50",
  "feedback": "Good explanation with minor logical gaps"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Answer evaluated successfully",
  "answer_id": "answer_123",
  "marks_obtained": "8.50",
  "feedback": "Good explanation with minor logical gaps"
}
```

---

#### Evaluate Specific Question (Staff)
```
POST /api/staff/exams/:exam_id/questions/:question_id/evaluate/
```

**Request Body:**
```json
{
  "attempt_id": "attempt_123",
  "score": "8.50",
  "feedback": "Good explanation with minor logical gaps"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Question evaluated successfully",
  "answer_id": "answer_123",
  "score": "8.50",
  "feedback": "Good explanation with minor logical gaps"
}
```

---

### API Documentation Endpoints

#### Swagger UI Documentation
```
GET /api/docs/
```
Browse the interactive API documentation with Swagger UI.

#### Redoc Documentation
```
GET /api/redoc/
```
Browse the API documentation with Redoc viewer.

#### OpenAPI Schema
```
GET /api/schema/
```
Download the OpenAPI 3.0 schema in YAML format.

---

### Advanced Staff Features

#### Evaluate Specific Question
```
POST /api/staff/exams/:exam_id/questions/:question_id/evaluate
```

**Request Body:**
```json
{
  "attempt_id": "attempt_123",
  "score": 8.5,
  "feedback": "Good explanation with minor logical gaps"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Question evaluated successfully",
  "answer_id": "answer_123",
  "score": 8.5,
  "feedback": "Good explanation with minor logical gaps"
}
```

---

#### Get Result Answers (Staff)
```
GET /api/staff/results/:result_id/answers/
```

**Response (200 OK):**
```json
{
  "id": "result_001",
  "exam": {
    "id": "exam_001",
    "title": "Data Structures Mid-Term"
  },
  "student": {
    "id": "user_123",
    "name": "John Doe",
    "email": "john@example.com",
    "enrollment_id": "ST001234"
  },
  "obtained_marks": "75.00",
  "total_marks": "100.00",
  "percentage": "75.00",
  "status": "pass",
  "submitted_at": "2024-02-05T12:00:00Z",
  "answers": [
    {
      "id": "answer_001",
      "question": {
        "id": "q_001",
        "text": "What is a data structure?",
        "type": "mcq",
        "marks": "2.00"
      },
      "answer": "opt_2",
      "marks_obtained": "2.00",
      "is_correct": true,
      "feedback": "Correct!"
    },
    {
      "id": "answer_002",
      "question": {
        "id": "q_002",
        "text": "Explain recursion",
        "type": "descriptive",
        "marks": "10.00"
      },
      "answer": "A function that calls itself...",
      "marks_obtained": "8.50",
      "is_correct": null,
      "feedback": "Good explanation with minor gaps"
    }
  ]
}
```

---

#### Get Exam Analytics (Staff)
```
GET /api/staff/exams/:exam_id/analytics/
```

**Response (200 OK):**
```json
{
  "exam": {
    "id": "exam_001",
    "title": "Data Structures Mid-Term"
  },
  "total_attempts": 150,
  "submitted_attempts": 148,
  "average_score": "72.50",
  "highest_score": "98.00",
  "lowest_score": "22.00",
  "pass_count": 112,
  "fail_count": 36,
  "pass_percentage": "74.67",
  "question_statistics": [
    {
      "question": {
        "id": "q_001",
        "text": "What is a data structure?",
        "type": "mcq",
        "marks": "2.00"
      },
      "total_answers": 148,
      "average_score": "1.80",
      "correct_count": 135
    },
    {
      "question": {
        "id": "q_002",
        "text": "Explain recursion",
        "type": "descriptive",
        "marks": "10.00"
      },
      "total_answers": 148,
      "average_score": "7.20",
      "correct_count": null
    }
  ],
  "generated_at": "2024-02-05T14:00:00Z"
}
```

---

#### Extend Exam Time (Staff)
```
POST /api/staff/exams/:exam_id/extend-time/
```

**Request Body:**
```json
{
  "student": "student_uuid",
  "additional_minutes": 30,
  "reason": "Medical grounds - doctor's appointment"
}
```

**Response (201 Created):**
```json
{
  "id": "extension_001",
  "exam": {
    "id": "exam_001",
    "title": "Data Structures Mid-Term"
  },
  "student": {
    "id": "student_uuid",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "additional_minutes": 30,
  "reason": "Medical grounds - doctor's appointment",
  "approved_by": {
    "id": "staff_123",
    "name": "Dr. Smith"
  },
  "approved_at": "2024-02-05T09:00:00Z",
  "created_at": "2024-02-05T09:00:00Z"
}
```

---

#### List Time Extensions (Staff)
```
GET /api/staff/exams/:exam_id/extensions/
```

**Query Parameters:**
- `page` (optional): Pagination page number
- `page_size` (optional): Items per page

**Response (200 OK):**
```json
{
  "count": 5,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": "extension_001",
      "exam": {
        "id": "exam_001",
        "title": "Data Structures Mid-Term"
      },
      "student": {
        "id": "student_uuid",
        "name": "John Doe",
        "email": "john@example.com"
      },
      "additional_minutes": 30,
      "reason": "Medical grounds",
      "approved_by": {
        "id": "staff_123",
        "name": "Dr. Smith"
      },
      "approved_at": "2024-02-05T09:00:00Z",
      "created_at": "2024-02-05T09:00:00Z"
    }
  ]
}
```

---

#### Bulk Feedback Assignment (Staff)
```
POST /api/staff/exams/:exam_id/bulk-feedback/
```

**Request Body:**
```json
{
  "result_ids": ["result_001", "result_002", "result_003"],
  "feedback_template": "Review the fundamentals and practice more problems."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Feedback assigned to 12 answers",
  "results_updated": 3,
  "answers_updated": 12
}
```

---

#### Get Bulk Results (Staff)
```
GET /api/staff/exams/:exam_id/bulk-results/?min_percentage=70&status=pass&department=CSE&page_size=100
```

**Query Parameters:**
- `min_percentage` (optional): Minimum percentage threshold
- `max_percentage` (optional): Maximum percentage threshold
- `status` (optional): Filter by pass/fail
- `department` (optional): Filter by department
- `page_size` (optional): Maximum results (1-1000, default: 100)

**Response (200 OK):**
```json
{
  "count": 85,
  "next": "...",
  "previous": "...",
  "results": [
    {
      "id": "result_001",
      "student": {
        "id": "user_123",
        "name": "John Doe",
        "email": "john@example.com",
        "enrollment_id": "ST001234",
        "department": "Computer Science"
      },
      "obtained_marks": "85.00",
      "total_marks": "100.00",
      "percentage": "85.00",
      "status": "pass",
      "submitted_at": "2024-02-05T12:00:00Z"
    }
  ]
}
```

---

#### Check Code Plagiarism (Staff)
```
GET /api/staff/exams/:exam_id/plagiarism-check/
```

**Query Parameters:**
- `page` (optional): Pagination page number
- `page_size` (optional): Items per page

**Response (200 OK):**
```json
{
  "count": 3,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": "report_001",
      "exam": {
        "id": "exam_001",
        "title": "Data Structures Mid-Term"
      },
      "answer1": {
        "id": "answer_001",
        "student": {
          "id": "user_001",
          "name": "John Doe"
        }
      },
      "answer2": {
        "id": "answer_002",
        "student": {
          "id": "user_002",
          "name": "Jane Smith"
        }
      },
      "similarity_score": "92.50",
      "risk_level": "high",
      "report": "Similarity: 92.50% between students",
      "created_at": "2024-02-05T14:00:00Z"
    }
  ]
}
```

**Risk Levels:**
- `low`: 60-70% similarity
- `medium`: 70-90% similarity
- `high`: 90%+ similarity

---

## Data Models

### User
```json
{
  "id": "string (UUID)",
  "email": "string (unique)",
  "username": "string (unique)",
  "name": "string",
  "password_hash": "string",
  "role": "enum (student, staff)",
  "department": "string (optional)",
  "enrollment_id": "string (optional)",
  "phone": "string (optional)",
  "is_active": "boolean",
  "is_staff": "boolean",
  "is_superuser": "boolean",
  "date_joined": "timestamp",
  "last_login": "timestamp"
}
```

### Exam
```json
{
  "id": "string (UUID)",
  "title": "string",
  "description": "text",
  "exam_type": "enum (mcq, mixed, coding, descriptive)",
  "duration": "integer (minutes)",
  "total_marks": "decimal",
  "passing_marks": "decimal",
  "start_time": "timestamp",
  "end_time": "timestamp",
  "instructions": "text",
  "is_published": "boolean",
  "allowed_departments": "array of strings",
  "created_by": {
    "id": "string (UUID)",
    "name": "string"
  },
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Question
```json
{
  "id": "string (UUID)",
  "exam_id": "string (UUID)",
  "type": "enum (mcq, multiple_mcq, descriptive, coding)",
  "text": "text",
  "marks": "decimal",
  "order": "integer",
  "options": [
    {
      "id": "string",
      "text": "string",
      "is_correct": "boolean"
    }
  ],
  "correct_answer": "string (for MCQ)",
  "expected_answer": "text (for descriptive)",
  "test_cases": [
    {
      "input": "string",
      "expected_output": "string"
    }
  ],
  "language": "string (for coding questions)",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### ExamAttempt
```json
{
  "id": "string (UUID)",
  "exam": {
    "id": "string (UUID)",
    "title": "string"
  },
  "student": {
    "id": "string (UUID)",
    "name": "string",
    "email": "string"
  },
  "start_time": "timestamp",
  "submit_time": "timestamp (nullable)",
  "status": "enum (in_progress, submitted, auto_submitted)",
  "is_auto_submitted": "boolean"
}
```

### Answer
```json
{
  "id": "string (UUID)",
  "attempt": {
    "id": "string (UUID)"
  },
  "question": {
    "id": "string (UUID)",
    "text": "string",
    "type": "string",
    "marks": "decimal"
  },
  "answer": "string/text",
  "code": "string (for coding questions)",
  "is_correct": "boolean (for MCQ)",
  "marks_obtained": "decimal",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Result
```json
{
  "id": "string (UUID)",
  "exam": {
    "id": "string (UUID)",
    "title": "string"
  },
  "student": {
    "id": "string (UUID)",
    "name": "string",
    "email": "string",
    "department": "string",
    "enrollment_id": "string"
  },
  "obtained_marks": "decimal",
  "total_marks": "decimal",
  "percentage": "decimal",
  "status": "enum (pass, fail)",
  "evaluation_status": "enum (auto_evaluated, pending_evaluation, evaluated)",
  "published": "boolean",
  "submitted_at": "timestamp",
  "evaluated_at": "timestamp (nullable)",
  "published_at": "timestamp (nullable)",
  "feedback": "text (optional)"
}
```

---

## Error Handling

### Standard Error Response Format
```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": "object (optional)"
  }
}
```

### Common Error Codes

| HTTP Status | Code | Message | Description |
|-------------|------|---------|-------------|
| 400 | INVALID_REQUEST | Invalid request data | Request validation failed |
| 401 | UNAUTHORIZED | Unauthorized | Missing or invalid authentication token |
| 403 | FORBIDDEN | Access denied | User lacks required permissions |
| 404 | NOT_FOUND | Resource not found | Requested resource does not exist |
| 409 | CONFLICT | Exam already started | Action not allowed at current state |
| 429 | RATE_LIMITED | Too many requests | Rate limit exceeded |
| 500 | INTERNAL_ERROR | Internal server error | Unexpected server error |

### Example Error Response
```json
{
  "error": {
    "code": "EXAM_NOT_PUBLISHED",
    "message": "Cannot attempt unpublished exam",
    "details": {
      "exam_id": "exam_001"
    }
  }
}
```

---

## Request/Response Examples

### Complete Exam Workflow Example

**1. Student Views Available Exams**
```
GET /api/exams/available
Authorization: Bearer <token>

Response: 200 OK
[List of available exams]
```

**2. Student Starts Exam Attempt**
```
POST /api/exams/exam_001/attempt
Authorization: Bearer <token>

Response: 201 Created
{
  "attempt_id": "attempt_789",
  "questions": [...],
  "time_remaining_seconds": 7200
}
```

**3. Student Saves Answer**
```
POST /api/exams/exam_001/attempt/answers
Authorization: Bearer <token>
Content-Type: application/json

{
  "question_id": "q_001",
  "answer": "opt_2"
}

Response: 200 OK
{
  "message": "Answer saved successfully"
}
```

**4. Student Submits Exam**
```
POST /api/exams/exam_001/attempt/submit/
Authorization: Bearer <token>

Response: 200 OK
{
  "message": "Exam submitted successfully",
  "submitted_at": "2024-02-05T12:00:00Z"
}
```

**5. Staff Reviews Results**
```
GET /api/staff/exams/exam_001/results/
Authorization: Bearer <token>

Response: 200 OK
{
  "count": 145,
  "results": [...]
}
```

---

## Best Practices

### Authentication
- Always use HTTPS for all API requests
- Store JWT tokens securely (HTTP-only cookies recommended)
- Implement token refresh mechanism
- Validate tokens on every protected endpoint

### Rate Limiting
- Implement rate limiting to prevent abuse
- Standard limit: 100 requests per minute per user
- Higher limits for staff users during result evaluation

### Pagination
- Use pagination for list endpoints to reduce response size
- Default page size: 10 items
- Maximum page size: 100 items

### Caching
- Cache exam details for 5 minutes
- Cache published exam list for 1 minute
- Clear cache on exam publish/unpublish

### Data Validation
- Validate all input on the server side
- Enforce minimum/maximum values
- Validate email formats and file uploads
- Sanitize text inputs to prevent XSS

---

## Support and Feedback

For API issues or feature requests, contact the development team or submit an issue in the project repository.

**Last Updated:** January 2025
**API Version:** 2.0.0
**Backend Framework:** Django 4.2.8 + DRF 3.14.0
**Authentication:** JWT (SimpleJWT)
**Documentation:** Swagger UI / Redoc available at `/api/docs/` and `/api/redoc/`
