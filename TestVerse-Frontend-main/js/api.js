/**
 * TestVerse - API Service
 * Handles all HTTP requests with JWT auth, token refresh, and error handling
 */

const Api = (() => {

  // ─── Token Management ──────────────────────────────────────────────────────

  const getAccessToken  = () => localStorage.getItem(CONFIG.STORAGE.ACCESS_TOKEN);
  const getRefreshToken = () => localStorage.getItem(CONFIG.STORAGE.REFRESH_TOKEN);

  const setTokens = (access, refresh) => {
    localStorage.setItem(CONFIG.STORAGE.ACCESS_TOKEN, access);
    if (refresh) localStorage.setItem(CONFIG.STORAGE.REFRESH_TOKEN, refresh);
  };

  const clearTokens = () => {
    localStorage.removeItem(CONFIG.STORAGE.ACCESS_TOKEN);
    localStorage.removeItem(CONFIG.STORAGE.REFRESH_TOKEN);
    localStorage.removeItem(CONFIG.STORAGE.USER);
  };

  // ─── Token Refresh ─────────────────────────────────────────────────────────

  let _refreshPromise = null;

  const refreshAccessToken = async () => {
    // Prevent multiple simultaneous refresh calls
    if (_refreshPromise) return _refreshPromise;

    _refreshPromise = (async () => {
      const refresh = getRefreshToken();
      if (!refresh) throw new Error('No refresh token available');

      const res = await fetch(CONFIG.BASE_URL + CONFIG.ENDPOINTS.REFRESH, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refresh }),
      });

      if (!res.ok) {
        clearTokens();
        // Avoid calling Auth here to prevent circular dependency at module level
        const baseUrl = window.location.origin;
        window.location.href = baseUrl + '/index.html?msg=' +
          encodeURIComponent('Your session has expired. Please log in again.');
        throw new Error('Session expired');
      }

      const data = await res.json();
      setTokens(data.access, data.refresh || null);
      return data.access;
    })();

    try {
      return await _refreshPromise;
    } finally {
      _refreshPromise = null;
    }
  };

  // ─── Core Request ──────────────────────────────────────────────────────────

  const request = async (endpoint, options = {}, _retry = true) => {
    const url = endpoint.startsWith('http')
      ? endpoint
      : CONFIG.BASE_URL + endpoint;

    // Build headers — BUG FIX: options.headers may be undefined, guard it
    const headers = { 'Content-Type': 'application/json' };

    // Merge any caller-supplied headers
    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    // Attach JWT if present
    const token = getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // FormData: browser sets Content-Type with boundary automatically, remove ours
    if (options.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    // BUG FIX: spread options first, then override headers so our built headers win
    const fetchOptions = {
      ...options,
      headers,
    };

    const res = await fetch(url, fetchOptions);

    // Auto-refresh on 401 and retry once
    if (res.status === 401 && _retry) {
      try {
        await refreshAccessToken();
        return request(endpoint, options, false); // retry without refresh flag
      } catch {
        return res; // let caller handle the 401
      }
    }

    return res;
  };

  // ─── HTTP Helpers ──────────────────────────────────────────────────────────

  const get = (endpoint, params = {}) => {
    const qs  = new URLSearchParams(params).toString();
    const url = qs ? `${endpoint}?${qs}` : endpoint;
    return request(url, { method: 'GET' });
  };

  const post = (endpoint, body = {}) =>
    request(endpoint, {
      method: 'POST',
      body:   body instanceof FormData ? body : JSON.stringify(body),
    });

  const put = (endpoint, body = {}) =>
    request(endpoint, {
      method: 'PUT',
      body:   JSON.stringify(body),
    });

  const patch = (endpoint, body = {}) =>
    request(endpoint, {
      method: 'PATCH',
      body:   JSON.stringify(body),
    });

  const del = (endpoint) =>
    request(endpoint, { method: 'DELETE' });

  // ─── Response Parser ───────────────────────────────────────────────────────

  /**
   * Safe-parse a Response and return { data, error }
   * Never throws — always returns a consistent shape.
   */
  const parse = async (res) => {
    let data = null;

    try {
      const text = await res.text();
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      return { data: null, error: data || `HTTP ${res.status}` };
    }

    return { data, error: null };
  };

  // ─── Public ────────────────────────────────────────────────────────────────

  return {
    get, post, put, patch, del, parse,
    setTokens, clearTokens,
    getAccessToken, getRefreshToken,
    refreshAccessToken,
  };
})();