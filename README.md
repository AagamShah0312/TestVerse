# TestVerse

TestVerse is an online examination platform for students and staff. It supports role-based dashboards, exam authoring, timed attempts, saved answers, results, analytics, and API documentation.

## Demo credentials

These accounts are intentionally public so reviewers can explore both roles. All use the password **`TestVerse@123`**.

| Role | Email | Username |
|---|---|---|
| Staff | `staff1@testverse.local` | `staff1` |
| Staff | `staff2@testverse.local` | `staff2` |
| Student | `student1@testverse.local` | `student1` |
| Student | `student2@testverse.local` | `student2` |
| Student | `student3@testverse.local` | `student3` |
| Student | `student4@testverse.local` | `student4` |
| Student | `student5@testverse.local` | `student5` |

Log in with an **email address** and the shared password. Staff accounts open the staff dashboard; student accounts open the student dashboard.

## Demo data

The application automatically seeds idempotent presentation data when started through Docker or the hosted service:

- A live Web Development Fundamentals exam that a student can attempt.
- An upcoming Database Systems exam.
- A completed Python Basics exam, including an attempted submission and a published result for `student1@testverse.local`.

The seed command is safe to run repeatedly: `python manage.py seed_demo_data`.

## Technology

- Django and Django REST Framework API
- Static HTML, CSS, and JavaScript frontend
- JWT authentication and role-based authorization
- PostgreSQL-ready production configuration; SQLite for local development
- Docker Compose, Redis, Vercel, and Render configuration
