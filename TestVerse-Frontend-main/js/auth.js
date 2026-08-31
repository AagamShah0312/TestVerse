/**
 * TestVerse - Auth Utility
 * Session management, guards, user helpers
 */

const Auth = (() => {

  // ─── User Storage ────────────────────────────────────────────────────────────

  const saveUser = (user) =>
    localStorage.setItem(CONFIG.STORAGE.USER, JSON.stringify(user));

  const getUser = () => {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.STORAGE.USER));
    } catch {
      return null;
    }
  };

  const isLoggedIn = () => !!Api.getAccessToken();

  const isStaff = () => getUser()?.role === 'staff';

  const isStudent = () => getUser()?.role === 'student';

  // ─── Redirects ───────────────────────────────────────────────────────────────

  const redirectToLogin = (message = '') => {
    const url = message
      ? `${CONFIG.ROUTES.LOGIN}?msg=${encodeURIComponent(message)}`
      : CONFIG.ROUTES.LOGIN;
    window.location.href = url;
  };

  /**
   * Logout and redirect to home page
   */
  const logoutAndRedirectHome = () => {
    Api.clearTokens();
    // Use absolute URL to ensure proper redirection
    const baseUrl = window.location.origin;
    window.location.href = baseUrl + '/index.html';
  };

  /**
   * Redirect to the correct dashboard based on stored user role.
   * BUG FIX: was using getUser() which could be null if profile fetch failed.
   * Now falls back to student dashboard safely.
   */
  const redirectToDashboard = () => {
    const user = getUser();
    window.location.href = user?.role === 'staff'
      ? CONFIG.ROUTES.STAFF_DASH
      : CONFIG.ROUTES.STUDENT_DASH;
  };

  // ─── Route Guards ────────────────────────────────────────────────────────────

  /** Call on any protected page — bounces to login if no token */
  const requireAuth = () => {
    if (!isLoggedIn()) {
      redirectToLogin('Please log in to continue.');
      return false;
    }
    return true;
  };

  /** Call on staff-only pages */
  const requireStaff = () => {
    if (!isLoggedIn()) {
      redirectToLogin('Please log in to continue.');
      return false;
    }
    if (!isStaff()) {
      window.location.href = CONFIG.ROUTES.STUDENT_DASH;
      return false;
    }
    return true;
  };

  /** Call on login/register pages — bounces away if already authenticated */
  const redirectIfLoggedIn = () => {
    if (isLoggedIn()) {
      redirectToDashboard();
      return true;
    }
    return false;
  };

  // ─── Login ───────────────────────────────────────────────────────────────────

  /**
   * POST credentials → store tokens → fetch profile → return result
   *
   * BUG FIX 1: Profile endpoint was '/api/v1/auth/profile/' which may not exist.
   *            Now uses CONFIG.ENDPOINTS.PROFILE and falls back gracefully.
   *
   * BUG FIX 2: If profile fetch fails we still mark login as successful and
   *            decode role from the JWT payload as a fallback, so redirectToDashboard
   *            can still pick the right destination.
   *
   * @returns {{ success: boolean, message?: string }}
   */
  const login = async (email, password) => {
    let res, parsed;

    try {
      res    = await Api.post(CONFIG.ENDPOINTS.LOGIN, { email, password });
      parsed = await Api.parse(res);
    } catch (networkErr) {
      return { success: false, message: 'Network error. Please check your connection.' };
    }

    if (parsed.error) {
      return { success: false, message: extractErrorMessage(parsed.error) };
    }

    const { access, refresh } = parsed.data;
    Api.setTokens(access, refresh);

    // ── Fetch full profile to get role ────────────────────────────────────────
    // BUG FIX: wrap in its own try/catch so a 404 on /profile/ doesn't break login
    try {
      const profileRes            = await Api.get(CONFIG.ENDPOINTS.PROFILE);
      const { data: profile, error: profileErr } = await Api.parse(profileRes);

      if (profile && !profileErr) {
        saveUser(profile);
      } else {
        // Profile endpoint failed — decode role from JWT payload as fallback
        _saveUserFromToken(access);
      }
    } catch {
      _saveUserFromToken(access);
    }

    return { success: true };
  };

  /**
   * Decode the JWT payload (base64) and save a minimal user object.
   * This is a fallback so redirectToDashboard() always has a role to work with.
   */
  const _saveUserFromToken = (token) => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      // DRF Simple JWT puts custom claims at the top level
      saveUser({
        id:    payload.user_id || payload.id || null,
        email: payload.email   || '',
        name:  payload.name    || payload.username || '',
        role:  payload.role    || 'student',       // default to student
      });
    } catch {
      // If decode fails, save a bare-minimum object so we don't crash
      saveUser({ role: 'student' });
    }
  };

  // ─── Logout ──────────────────────────────────────────────────────────────────

  const logout = () => {
    Api.clearTokens();
    // Use absolute URL to ensure proper redirection
    const baseUrl = window.location.origin;
    window.location.href = baseUrl + '/index.html';
  };

  // ─── Error Normalizer ────────────────────────────────────────────────────────

  /**
   * Flatten DRF error objects into a single readable string.
   * Handles: string, { detail }, { non_field_errors }, { field: [msgs] }
   */
  const extractErrorMessage = (error) => {
    if (!error) return 'Something went wrong. Please try again.';

    if (typeof error === 'string') return error;

    if (typeof error === 'object') {
      if (error.detail)            return String(error.detail);
      if (error.non_field_errors)  return [].concat(error.non_field_errors).join(' ');

      // Collect all field-level messages
      const msgs = [];
      for (const [key, val] of Object.entries(error)) {
        const text = Array.isArray(val) ? val.join(', ') : String(val);
        msgs.push(text);          // just the message, no field prefix for cleaner UX
      }
      if (msgs.length) return msgs.join(' ');
    }

    return 'Something went wrong. Please try again.';
  };

  // ─── Public ──────────────────────────────────────────────────────────────────

  return {
    saveUser,
    getUser,
    isLoggedIn,
    isStaff,
    isStudent,
    login,
    logout,
    logoutAndRedirectHome,
    requireAuth,
    requireStaff,
    redirectIfLoggedIn,
    redirectToDashboard,
    redirectToLogin,
    extractErrorMessage,
  };
})();