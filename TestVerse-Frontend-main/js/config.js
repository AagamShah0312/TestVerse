/**
 * TestVerse - Global Configuration
 * Central config for API base URL, endpoints, storage keys, and routes
 */

const CONFIG = {
  BASE_URL: 'https://testverse-backend.onrender.com',

  ENDPOINTS: {
    // ── Auth ──────────────────────────────────────────────────────────────────
    LOGIN: '/api/v1/auth/login/',
    REGISTER: '/api/v1/auth/register/',
    REFRESH: '/api/v1/auth/refresh/',
    // FIXED: correct profile endpoint from YAML spec (was /api/v1/auth/profile/)
    PROFILE: '/api/v1/auth/users/profile/',
    CHANGE_PASSWORD: '/api/v1/auth/users/change-password/',

    // ── Student ───────────────────────────────────────────────────────────────
    ANALYTICS: '/api/v1/auth/analytics/',
    ANNOUNCEMENTS: '/api/v1/auth/announcements/',
    BADGES: '/api/v1/auth/badges/',
    LEADERBOARD: '/api/v1/auth/leaderboard/',
    NOTIFICATIONS: '/api/v1/auth/notifications/',
    NOTIF_COUNT: '/api/v1/auth/notifications/count/',
    NOTIF_READ: '/api/v1/auth/notifications/mark-read/',
    POINTS: '/api/v1/auth/points/',

    // ── Exams (student) ───────────────────────────────────────────────────────
    EXAMS_AVAILABLE: '/api/v1/exams/available/',
    EXAMS_MY_ATTEMPTS: '/api/v1/exams/my-attempts/',
    EXAMS_MY_RESULTS: '/api/v1/exams/my-results/',
    EXAM_DETAIL: (id) => `/api/v1/exams/${id}/`,
    EXAM_ATTEMPT: (examId) => `/api/v1/exams/${examId}/attempt/`,
    EXAM_SAVE: (examId) => `/api/v1/exams/${examId}/attempt/save/`,
    EXAM_SUBMIT: (examId) => `/api/v1/exams/${examId}/attempt/submit/`,
    EXAM_RESULT: (examId) => `/api/v1/exams/${examId}/result/`,

    // ── Staff ──────────────────────────────────────────────────────────────────
    STAFF_EXAMS: '/api/v1/staff/exams/',
    STAFF_EXAM_DETAIL: (id) => `/api/v1/staff/exams/${id}/`,
    STAFF_EXAM_ANALYTICS: (examId) => `/api/v1/staff/exams/${examId}/analytics/`,
    STAFF_EXAM_RESULTS: (examId) => `/api/v1/staff/exams/${examId}/results/`,
    STAFF_QUESTIONS: (examId) => `/api/v1/staff/exams/${examId}/questions/`,
    // Backend route is /staff/questions/{id}/ (examId kept for backward-compatible call sites)
    STAFF_QUESTION_DETAIL: (examId, id) => `/api/v1/staff/questions/${id}/`,
    STAFF_EXAM_PUBLISH: (id) => `/api/v1/staff/exams/${id}/publish/`,
    STAFF_EXAM_UNPUBLISH: (id) => `/api/v1/staff/exams/${id}/unpublish/`,
    STAFF_EXAM_FINALIZE: (id) => `/api/v1/staff/exams/${id}/finalize-results/`,
    STAFF_EXAM_STATISTICS: (id) => `/api/v1/staff/exams/${id}/statistics/`,
    STAFF_EXAM_SUBMISSIONS: (id) => `/api/v1/staff/exams/${id}/submissions/`,
    STAFF_EXAM_LIVE_MONITOR: (examId) => `/api/v1/staff/exams/${examId}/live-monitor/`,
    STAFF_EXAM_PLAGIARISM: (examId) => `/api/v1/staff/exams/${examId}/plagiarism-check/`,
    STAFF_EXAM_EXTEND_TIME: (examId) => `/api/v1/staff/exams/${examId}/extend-time/`,
    STAFF_EXAM_EXTENSIONS: (examId) => `/api/v1/staff/exams/${examId}/extensions/`,
    STAFF_EXAM_BULK_RESULTS: (examId) => `/api/v1/staff/exams/${examId}/bulk-results/`,
    STAFF_EXAM_BULK_FEEDBACK: (examId) => `/api/v1/staff/exams/${examId}/bulk-feedback/`,
    STAFF_EXAM_PUBLISH_RESULTS: (examId) => `/api/v1/staff/exams/${examId}/publish-results/`,
    STAFF_EXAM_AUTO_GRADE_MCQ: (examId) => `/api/v1/staff/exams/${examId}/auto-grade-mcq/`,
    STAFF_EXAM_QUESTION_EVALUATE: (examId, qId) => `/api/v1/staff/exams/${examId}/questions/${qId}/evaluate/`,
    STAFF_SUBMISSIONS: (attemptId) => `/api/v1/staff/submissions/${attemptId}/`,
    STAFF_SUBMISSIONS_EVALUATE: (attemptId) => `/api/v1/staff/submissions/${attemptId}/evaluate/`,
    STAFF_RESULT_PUBLISH: (id) => `/api/v1/staff/results/${id}/publish/`,
    STAFF_RESULTS_ANSWERS: (resultId) => `/api/v1/staff/results/${resultId}/answers/`,
    STAFF_STUDENTS: '/api/v1/auth/staff/students/',
    STAFF_STUDENT_DETAIL: (id) => `/api/v1/auth/staff/students/${id}/`,
    STAFF_ANNOUNCEMENTS: '/api/v1/auth/staff/announcements/',
    STAFF_ANNOUNCEMENT_DETAIL: (id) => `/api/v1/auth/staff/announcements/${id}/`,
  },

  // localStorage keys
  STORAGE: {
    ACCESS_TOKEN: 'tv_access_token',
    REFRESH_TOKEN: 'tv_refresh_token',
    USER: 'tv_user',
    REMEMBER_ME: 'tv_remember',
  },

  // Page routes
  ROUTES: {
    HOME: '/index.html',
    LOGIN: '/login.html',
    REGISTER: '/signup.html',
    STUDENT_DASH: '/pages/student/dashboard.html',
    STAFF_DASH: '/pages/staff/dashboard.html',
  },
};
