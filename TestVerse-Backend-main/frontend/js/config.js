/**
 * API Configuration - University Exam Portal
 * Updated to match OpenAPI 3.0.3 spec
 */

const CONFIG = {
  // Base URL for all API requests
  API_BASE_URL: 'https://testverse-backend.onrender.com/api/v1',
  
  // Token keys for sessionStorage
  ACCESS_TOKEN_KEY: 'exam_portal_access_token',
  REFRESH_TOKEN_KEY: 'exam_portal_refresh_token',
  USER_DATA_KEY: 'exam_portal_user',
  
  // Token management
  TOKEN_EXPIRY_BUFFER: 5 * 60 * 1000, // 5 minutes
  AUTO_SAVE_INTERVAL: 30000, // 30 seconds
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
  
  // Security settings for exam mode
  SECURITY: {
    MAX_TAB_SWITCHES: 3,
    MAX_BLUR_EVENTS: 5,
    ENABLE_FULLSCREEN: true,
    LOG_VIOLATIONS: true
  },
  
  // Pagination defaults
  PAGINATION: { 
    DEFAULT_PAGE_SIZE: 10, 
    MAX_PAGE_SIZE: 100 
  },
  
  // Compute base URL once at startup
  BASE_URL: (() => {
    const path = window.location.pathname;
    const frontendIndex = path.indexOf('/frontend/');
    
    if (frontendIndex !== -1) {
      return path.substring(0, frontendIndex) + '/frontend';
    }
    
    if (path === '/' || path === '/index.html') {
      return '';
    }
    
    if (path.includes('/pages/staff/') || path.includes('/pages/student/')) {
      return '../..';
    }
    
    if (path.includes('/pages/')) {
      return '..';
    }
    
    return '';
  })(),
  
  // Frontend routes
  get ROUTES() {
    const joinPath = (p) => {
      const base = this.BASE_URL || '';
      if (!base) return p.replace(/^\.\//, '');
      return base.replace(/\/$/, '') + '/' + p.replace(/^\//, '').replace(/^\.\//, '');
    };
    
    return {
      HOME: joinPath('index.html'),
      LOGIN: joinPath('pages/login.html'),
      REGISTER: joinPath('pages/register.html'),
      STUDENT_DASHBOARD: joinPath('pages/student/dashboard.html'),
      STAFF_DASHBOARD: joinPath('pages/staff/dashboard.html'),
      EXAM_TAKING: joinPath('pages/student/exam-taking.html'),
      STUDENT_RESULTS: joinPath('pages/student/results.html')
    };
  },
  
  // API Endpoints
  ENDPOINTS: {
    // Auth
    LOGIN: '/auth/login/',
    REGISTER: '/auth/register/',
    TOKEN_REFRESH: '/auth/refresh/',
    PROFILE: '/auth/users/profile/',
    CHANGE_PASSWORD: '/auth/users/change-password/',
    
    // Notifications
    NOTIFICATIONS: '/auth/notifications/',
    NOTIFICATION_MARK_READ: '/auth/notifications/mark-read/',
    NOTIFICATION_COUNT: '/auth/notifications/count/',
    ANNOUNCEMENTS: '/auth/announcements/',
    
    // Staff Announcements
    STAFF_ANNOUNCEMENTS: '/auth/staff/announcements/',
    STAFF_ANNOUNCEMENT_DETAIL: (id) => `/auth/staff/announcements/${id}/`,
    
    // Live Monitoring
    EXAM_LIVE_MONITOR: (examId) => `/exams/staff/exams/${examId}/live-monitor/`,
    
    // Gamification & Analytics
    LEADERBOARD: '/auth/leaderboard/',
    USER_BADGES: '/auth/badges/',
    USER_POINTS: '/auth/points/',
    STUDENT_ANALYTICS: '/auth/analytics/',
    
    // Student exam endpoints
    AVAILABLE_EXAMS: '/exams/available/',
    EXAM_DETAIL: (id) => `/exams/${id}/`,
    START_ATTEMPT: (examId) => `/exams/${examId}/attempt/`,
    SAVE_ANSWER: (examId) => `/exams/${examId}/attempt/save/`,
    SUBMIT_EXAM: (examId) => `/exams/${examId}/attempt/submit/`,
    EXAM_RESULT: (examId) => `/exams/${examId}/result/`,
    
    // Staff exam management
    STAFF_EXAMS: '/staff/exams/',
    STAFF_EXAM_DETAIL: (id) => `/staff/exams/${id}/`,
    PUBLISH_EXAM: (id) => `/staff/exams/${id}/publish/`,
    UNPUBLISH_EXAM: (id) => `/staff/exams/${id}/unpublish/`,
    FINALIZE_RESULTS: (id) => `/staff/exams/${id}/finalize-results/`,
    EXAM_STATISTICS: (id) => `/staff/exams/${id}/statistics/`,
    EXAM_SUBMISSIONS: (id) => `/staff/exams/${id}/submissions/`,
    
    // Staff question management
    EXAM_QUESTIONS: (examId) => `/staff/exams/${examId}/questions/`,
    QUESTION_DETAIL: (questionId) => `/staff/questions/${questionId}/`,
    EVALUATE_QUESTION: (examId, questionId) => `/staff/exams/${examId}/questions/${questionId}/evaluate/`,
    
    // Staff results
    EXAM_RESULTS: (examId) => `/staff/exams/${examId}/results/`,
    BULK_RESULTS: (examId) => `/staff/exams/${examId}/bulk-results/`,
    BULK_PUBLISH_RESULTS: (examId) => `/staff/exams/${examId}/publish-results/`,
    BULK_FEEDBACK: (examId) => `/staff/exams/${examId}/bulk-feedback/`,
    RESULT_PUBLISH: (resultId) => `/staff/results/${resultId}/publish/`,
    RESULT_ANSWERS: (resultId) => `/staff/results/${resultId}/answers/`,
    SUBMISSION_DETAIL: (attemptId) => `/staff/submissions/${attemptId}/`,
    SUBMISSION_EVALUATE: (attemptId) => `/staff/submissions/${attemptId}/evaluate/`,
    
    // Staff analytics & extras
    EXAM_ANALYTICS: (examId) => `/staff/exams/${examId}/analytics/`,
    PLAGIARISM_CHECK: (examId) => `/staff/exams/${examId}/plagiarism-check/`,
    EXTEND_TIME: (examId) => `/staff/exams/${examId}/extend-time/`,
    EXAM_EXTENSIONS: (examId) => `/staff/exams/${examId}/extensions/`,
    
    // Staff student management
    STAFF_STUDENTS: '/auth/staff/students/',
    STAFF_STUDENT_DETAIL: (id) => `/auth/staff/students/${id}/`
  },
  
  // Available departments
  DEPARTMENTS: [
    { value: 'CSE', label: 'Computer Science & Engineering' },
    { value: 'ECE', label: 'Electronics & Communication' },
    { value: 'EE', label: 'Electrical Engineering' },
    { value: 'ME', label: 'Mechanical Engineering' },
    { value: 'CE', label: 'Civil Engineering' },
    { value: 'IT', label: 'Information Technology' }
  ],
  
  // CORS Configuration
  CORS_CONFIG: {
    origin: 'http://127.0.0.1:3000',
    credentials: true
  }
};

Object.freeze(CONFIG);