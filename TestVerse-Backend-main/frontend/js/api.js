/**
 * API Service Layer - University Exam Portal
 * Handles all HTTP requests with JWT authentication
 * Updated to match OpenAPI 3.0.3 spec
 */

const API = {
  // ============ TOKEN MANAGEMENT ============
  
  _suppressToasts: false,
  
  getToken() {
    return sessionStorage.getItem(CONFIG.ACCESS_TOKEN_KEY);
  },
  
  setToken(token) {
    sessionStorage.setItem(CONFIG.ACCESS_TOKEN_KEY, token);
  },

  getRefreshToken() {
    return sessionStorage.getItem(CONFIG.REFRESH_TOKEN_KEY);
  },

  setRefreshToken(token) {
    sessionStorage.setItem(CONFIG.REFRESH_TOKEN_KEY, token);
  },

  clearTokens() {
    sessionStorage.removeItem(CONFIG.ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(CONFIG.REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(CONFIG.USER_DATA_KEY);
  },

  getUser() {
    const userData = sessionStorage.getItem(CONFIG.USER_DATA_KEY);
    return userData ? JSON.parse(userData) : null;
  },

  setUser(user) {
    sessionStorage.setItem(CONFIG.USER_DATA_KEY, JSON.stringify(user));
  },

  isAuthenticated() {
    return !!this.getToken();
  },

  // ============ HTTP HELPERS ============

  getHeaders(includeAuth = true) {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (includeAuth && this.getToken()) {
      headers['Authorization'] = `Bearer ${this.getToken()}`;
    }
    
    return headers;
  },

  async handleResponse(response) {
    // Handle 204 No Content
    if (response.status === 204) {
      return { success: true };
    }
    
    let data = {};
    try {
      data = await response.json();
    } catch (e) {
      // Response body is not JSON
      if (!response.ok) {
        const errorMsg = `Server error (${response.status}): ${response.statusText}`;
        if (typeof Utils !== 'undefined' && Utils.showToast) {
          Utils.showToast(errorMsg, 'error');
        }
        throw new Error(errorMsg);
      }
      // If it's not an error response but no JSON, return empty object
      return {};
    }
    
    if (!response.ok) {
      await this.handleError(response, data);
    }
    
    return data;
  },

  async handleError(response, data) {
    if (response.status === 401) {
      await this.handleAuthError();
      return;
    }
    
    const errorMessage = this.extractErrorMessage(data);
    
    // Show error in toast notification (unless suppressed during submit flow)
    if (!this._suppressToasts && typeof Utils !== 'undefined' && Utils.showToast) {
      Utils.showToast(errorMessage, 'error', 6000);
    }
    
    console.error('API Error:', response.status, errorMessage, data);
    throw new Error(errorMessage);
  },

  async handleAuthError() {
    const isOnLoginPage = window.location.pathname.includes('login');
    
    if (isOnLoginPage) {
      // On login page - just throw error, don't redirect
      throw new Error('Invalid email or password');
    }
    
    // Try to refresh token
    const refreshed = await this.tryRefreshToken();
    if (!refreshed) {
      this.clearTokens();
      window.location.href = CONFIG.ROUTES.LOGIN;
      throw new Error('Session expired. Please login again.');
    }
  },

  extractErrorMessage(data) {
    if (data.detail) {
      // DRF standard error format
      return data.detail;
    }
    
    if (data.error) {
      // Custom error format
      return typeof data.error === 'string' ? data.error : data.error.message || JSON.stringify(data.error);
    }
    
    if (data.message) {
      return data.message;
    }
    
    if (data.non_field_errors) {
      // DRF form validation errors
      return Array.isArray(data.non_field_errors) ? data.non_field_errors.join(', ') : data.non_field_errors;
    }
    
    if (typeof data === 'object' && Object.keys(data).length > 0) {
      // Field-specific validation errors - format them nicely
      const fieldErrors = [];
      for (const [field, errors] of Object.entries(data)) {
        const errorText = Array.isArray(errors) ? errors.join(', ') : errors;
        const fieldName = field.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
        fieldErrors.push(`${fieldName}: ${errorText}`);
      }
      return fieldErrors.join('\n');
    }
    
    return 'An error occurred';
  },

  async tryRefreshToken() {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;
    
    try {
      const response = await fetch(CONFIG.API_BASE_URL + CONFIG.ENDPOINTS.TOKEN_REFRESH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: refreshToken })
      });
      
      if (response.ok) {
        const data = await response.json();
        this.setToken(data.access);
        return true;
      }
    } catch (e) {
      console.error('Token refresh failed:', e);
    }
    return false;
  },

  // ============ HTTP METHODS ============

  async get(endpoint, params = {}) {
    const url = new URL(CONFIG.API_BASE_URL + endpoint);
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined && params[key] !== null) {
        url.searchParams.append(key, params[key]);
      }
    });

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders()
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleNetworkError(error, 'GET', endpoint);
    }
  },

  async post(endpoint, data = {}, auth = true) {
    try {
      const response = await fetch(CONFIG.API_BASE_URL + endpoint, {
        method: 'POST',
        headers: this.getHeaders(auth),
        body: JSON.stringify(data)
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleNetworkError(error, 'POST', endpoint);
    }
  },
  
  handleNetworkError(error, method, endpoint) {
    let errorMessage = 'Network error';
    
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      errorMessage = `Cannot connect to server. Please check:\n• Is the backend server running?\n• CORS may be blocking the request\n• Network connection issue`;
    } else if (error.message.includes('CORS')) {
      errorMessage = 'CORS error: The server is blocking this request. Make sure the backend allows your origin.';
    } else {
      errorMessage = `Request failed: ${error.message}`;
    }
    
    console.error(`${method} ${endpoint} failed:`, error);
    
    if (!this._suppressToasts && typeof Utils !== 'undefined' && Utils.showToast) {
      Utils.showToast(errorMessage, 'error', 8000);
    }
    
    throw new Error(errorMessage);
  },

  async put(endpoint, data = {}) {
    try {
      const response = await fetch(CONFIG.API_BASE_URL + endpoint, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(data)
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleNetworkError(error, 'PUT', endpoint);
    }
  },

  async patch(endpoint, data = {}) {
    try {
      const response = await fetch(CONFIG.API_BASE_URL + endpoint, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify(data)
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleNetworkError(error, 'PATCH', endpoint);
    }
  },

  async delete(endpoint) {
    try {
      const response = await fetch(CONFIG.API_BASE_URL + endpoint, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleNetworkError(error, 'DELETE', endpoint);
    }
  },

  // ============ AUTH ENDPOINTS ============
  
  async login(email, password) {
    const data = await this.post(CONFIG.ENDPOINTS.LOGIN, { email, password }, false);
    this.setToken(data.access);
    this.setRefreshToken(data.refresh);
    // Fetch and store user profile
    const profile = await this.getProfile();
    this.setUser(profile);
    return data;
  },

  async register(userData) {
    // userData should include: email, username, name, password, password_confirm, role, department?, enrollment_id?
    return await this.post(CONFIG.ENDPOINTS.REGISTER, userData, false);
  },

  async refreshToken() {
    const data = await this.post(CONFIG.ENDPOINTS.TOKEN_REFRESH, { 
      refresh: this.getRefreshToken() 
    }, false);
    this.setToken(data.access);
    return data;
  },

  async getProfile() {
    return await this.get(CONFIG.ENDPOINTS.PROFILE);
  },

  async updateProfile(profileData) {
    return await this.patch(CONFIG.ENDPOINTS.PROFILE, profileData);
  },

  async changePassword(passwordData) {
    // passwordData: old_password, new_password, confirm_password
    return await this.post(CONFIG.ENDPOINTS.CHANGE_PASSWORD, passwordData);
  },

  // ============ NOTIFICATIONS ============
  
  async getNotifications(params = {}) {
    // params: is_read (true/false)
    return await this.get(CONFIG.ENDPOINTS.NOTIFICATIONS, params);
  },

  async getNotificationCount() {
    return await this.get(CONFIG.ENDPOINTS.NOTIFICATION_COUNT);
  },

  async markNotificationsRead(notificationIds = [], markAll = false) {
    return await this.post(CONFIG.ENDPOINTS.NOTIFICATION_MARK_READ, {
      notification_ids: notificationIds,
      mark_all: markAll
    });
  },

  async getAnnouncements() {
    return await this.get(CONFIG.ENDPOINTS.ANNOUNCEMENTS);
  },

  // Staff Announcements
  async getStaffAnnouncements() {
    return await this.get(CONFIG.ENDPOINTS.STAFF_ANNOUNCEMENTS);
  },

  async createAnnouncement(data) {
    // data: title, content, target_departments, is_active
    return await this.post(CONFIG.ENDPOINTS.STAFF_ANNOUNCEMENTS, data);
  },

  async updateAnnouncement(id, data) {
    return await this.patch(CONFIG.ENDPOINTS.STAFF_ANNOUNCEMENT_DETAIL(id), data);
  },

  async deleteAnnouncement(id) {
    return await this.delete(CONFIG.ENDPOINTS.STAFF_ANNOUNCEMENT_DETAIL(id));
  },

  // Live Monitoring
  async getExamLiveMonitor(examId) {
    return await this.get(CONFIG.ENDPOINTS.EXAM_LIVE_MONITOR(examId));
  },

  // Gamification & Analytics
  async getLeaderboard() {
    return await this.get(CONFIG.ENDPOINTS.LEADERBOARD);
  },

  async getUserBadges() {
    return await this.get(CONFIG.ENDPOINTS.USER_BADGES);
  },

  async getUserPoints() {
    return await this.get(CONFIG.ENDPOINTS.USER_POINTS);
  },

  async getStudentAnalytics() {
    return await this.get(CONFIG.ENDPOINTS.STUDENT_ANALYTICS);
  },

  // ============ STUDENT EXAM ENDPOINTS ============
  
  async getAvailableExams(params = {}) {
    // params: page, page_size, search, ordering
    return await this.get(CONFIG.ENDPOINTS.AVAILABLE_EXAMS, params);
  },

  async getExamDetail(examId) {
    return await this.get(CONFIG.ENDPOINTS.EXAM_DETAIL(examId));
  },

  async startExamAttempt(examId) {
    return await this.post(CONFIG.ENDPOINTS.START_ATTEMPT(examId));
  },

  async saveAnswer(examId, questionId, answer, code = null) {
    // Matches AnswerSave schema: question (uuid), answer (any), code (string|null)
    const payload = { question: questionId, answer };
    if (code !== null) payload.code = code;
    return await this.put(CONFIG.ENDPOINTS.SAVE_ANSWER(examId), payload);
  },

  async submitExam(examId) {
    return await this.post(CONFIG.ENDPOINTS.SUBMIT_EXAM(examId));
  },

  async getExamResult(examId) {
    return await this.get(CONFIG.ENDPOINTS.EXAM_RESULT(examId));
  },
  
  async getMyResults(params = {}) {
    // Get current student's exam results
    return await this.get('/exams/my-results/', params);
  },
  
  async getMyExamAttempts(params = {}) {
    // Get current student's exam attempts (exams taken)
    return await this.get('/exams/my-attempts/', params);
  },
  
  // ============ STAFF EXAM MANAGEMENT ============
  
  async getStaffExams(params = {}) {
    // params: page, page_size, search, ordering
    return await this.get(CONFIG.ENDPOINTS.STAFF_EXAMS, params);
  },

  async getStaffExamDetail(examId) {
    return await this.get(CONFIG.ENDPOINTS.STAFF_EXAM_DETAIL(examId));
  },

  async createExam(examData) {
    // examData: title, description, exam_type?, start_time, end_time, duration, 
    //           total_marks, passing_marks, instructions?, allowed_departments?
    return await this.post(CONFIG.ENDPOINTS.STAFF_EXAMS, examData);
  },

  async updateExam(examId, examData) {
    return await this.put(CONFIG.ENDPOINTS.STAFF_EXAM_DETAIL(examId), examData);
  },

  async patchExam(examId, examData) {
    return await this.patch(CONFIG.ENDPOINTS.STAFF_EXAM_DETAIL(examId), examData);
  },

  async deleteExam(examId) {
    return await this.delete(CONFIG.ENDPOINTS.STAFF_EXAM_DETAIL(examId));
  },

  async publishExam(examId) {
    return await this.post(CONFIG.ENDPOINTS.PUBLISH_EXAM(examId), {});
  },

  async unpublishExam(examId) {
    return await this.post(CONFIG.ENDPOINTS.UNPUBLISH_EXAM(examId), {});
  },

  async finalizeResults(examId) {
    return await this.post(CONFIG.ENDPOINTS.FINALIZE_RESULTS(examId), {});
  },

  async getExamStatistics(examId) {
    return await this.get(CONFIG.ENDPOINTS.EXAM_STATISTICS(examId));
  },

  async getExamSubmissions(examId) {
    return await this.get(CONFIG.ENDPOINTS.EXAM_SUBMISSIONS(examId));
  },

  // ============ STAFF QUESTION MANAGEMENT ============

  async getExamQuestions(examId, params = {}) {
    return await this.get(CONFIG.ENDPOINTS.EXAM_QUESTIONS(examId), params);
  },

  async addQuestion(examId, questionData) {
    // questionData: type, text, points, options?, correct_answers?, 
    //               coding_language?, test_cases?, sample_input?, sample_output?, sample_answer?, order?
    return await this.post(CONFIG.ENDPOINTS.EXAM_QUESTIONS(examId), questionData);
  },

  async getQuestion(questionId) {
    return await this.get(CONFIG.ENDPOINTS.QUESTION_DETAIL(questionId));
  },

  async updateQuestion(questionId, questionData) {
    return await this.put(CONFIG.ENDPOINTS.QUESTION_DETAIL(questionId), questionData);
  },

  async patchQuestion(questionId, questionData) {
    return await this.patch(CONFIG.ENDPOINTS.QUESTION_DETAIL(questionId), questionData);
  },

  async deleteQuestion(questionId) {
    return await this.delete(CONFIG.ENDPOINTS.QUESTION_DETAIL(questionId));
  },

  async evaluateQuestion(examId, questionId, evaluationData) {
    return await this.post(CONFIG.ENDPOINTS.EVALUATE_QUESTION(examId, questionId), evaluationData);
  },

  // ============ STAFF RESULTS & EVALUATION ============

  async getExamResults(examId, params = {}) {
    return await this.get(CONFIG.ENDPOINTS.EXAM_RESULTS(examId), params);
  },

  async getBulkResults(examId, params = {}) {
    return await this.get(CONFIG.ENDPOINTS.BULK_RESULTS(examId), params);
  },

  async bulkPublishResults(examId, action) {
    // action: 'publish' or 'unpublish'
    return await this.post(CONFIG.ENDPOINTS.BULK_PUBLISH_RESULTS(examId), { action });
  },

  async publishResult(resultId, action) {
    // action: 'publish' or 'unpublish'
    return await this.put(CONFIG.ENDPOINTS.RESULT_PUBLISH(resultId), { action });
  },

  async submitBulkFeedback(examId, feedbackData) {
    return await this.post(CONFIG.ENDPOINTS.BULK_FEEDBACK(examId), feedbackData);
  },

  async getResultAnswers(resultId) {
    return await this.get(CONFIG.ENDPOINTS.RESULT_ANSWERS(resultId));
  },

  async getSubmissionDetail(attemptId) {
    return await this.get(CONFIG.ENDPOINTS.SUBMISSION_DETAIL(attemptId));
  },

  async evaluateSubmission(attemptId, evaluationData) {
    return await this.post(CONFIG.ENDPOINTS.SUBMISSION_EVALUATE(attemptId), evaluationData);
  },

  // ============ STAFF ANALYTICS & EXTRAS ============

  async getExamAnalytics(examId) {
    return await this.get(CONFIG.ENDPOINTS.EXAM_ANALYTICS(examId));
  },

  async generateResults(examId) {
    // Generate results for exam - usually auto-grades answers
    return await this.post(CONFIG.ENDPOINTS.FINALIZE_RESULTS(examId), {});
  },

  async getPlagiarismCheck(examId, params = {}) {
    return await this.get(CONFIG.ENDPOINTS.PLAGIARISM_CHECK(examId), params);
  },

  async extendExamTime(examId, extensionData) {
    // extensionData: student (uuid), additional_minutes, reason
    return await this.post(CONFIG.ENDPOINTS.EXTEND_TIME(examId), extensionData);
  },

  async getExamExtensions(examId, params = {}) {
    return await this.get(CONFIG.ENDPOINTS.EXAM_EXTENSIONS(examId), params);
  },

  // ============ STAFF STUDENT MANAGEMENT ============

  async getStudents(params = {}) {
    // params: search, department, page, page_size
    return await this.get(CONFIG.ENDPOINTS.STAFF_STUDENTS, params);
  },

  async getStudent(studentId) {
    return await this.get(CONFIG.ENDPOINTS.STAFF_STUDENT_DETAIL(studentId));
  },

  async updateStudent(studentId, studentData) {
    // studentData: department, enrollment_id, is_active
    return await this.patch(CONFIG.ENDPOINTS.STAFF_STUDENT_DETAIL(studentId), studentData);
  }
};

// Make API globally accessible
window.API = API;
