/**
 * Authentication Module - University Exam Portal
 */

const Auth = {
  isLoggedIn() {
    return API.isAuthenticated();
  },

  getCurrentUser() {
    return API.getUser();
  },

  getUserRole() {
    const user = this.getCurrentUser();
    return user ? user.role : null;
  },

  isStaff() {
    return this.getUserRole() === 'staff';
  },

  isStudent() {
    return this.getUserRole() === 'student';
  },

  async login(email, password) {
    return await API.login(email, password);
  },

  async register(userData) {
    return await API.register(userData);
  },

  logout() {
    API.clearTokens();
    window.location.href = CONFIG.ROUTES.LOGIN;
  },

  redirectToDashboard() {
    const route = this.isStaff() 
      ? CONFIG.ROUTES.STAFF_DASHBOARD 
      : CONFIG.ROUTES.STUDENT_DASHBOARD;
    window.location.href = route;
  },

  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = CONFIG.ROUTES.LOGIN;
      return false;
    }
    return true;
  },

  requireStaff() {
    if (!this.requireAuth()) return false;
    if (!this.isStaff()) {
      window.location.href = CONFIG.ROUTES.STUDENT_DASHBOARD;
      return false;
    }
    return true;
  },

  requireStudent() {
    if (!this.requireAuth()) return false;
    if (!this.isStudent()) {
      window.location.href = CONFIG.ROUTES.STAFF_DASHBOARD;
      return false;
    }
    return true;
  },

  redirectIfLoggedIn() {
    // Prevent redirect loops
    if (window._redirectIfLoggedInExecuted) {
      return false;
    }
    
    if (this.isLoggedIn()) {
      window._redirectIfLoggedInExecuted = true;
      this.redirectToDashboard();
      return true;
    }
    return false;
  }
};
