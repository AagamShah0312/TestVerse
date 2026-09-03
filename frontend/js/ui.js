/**
 * TestVerse - UI Utilities
 * Reusable helpers for alerts, loaders, form validation, toasts, etc.
 *
 * ⚠️  Your CSS files already cover all the visual styles.
 *     Do NOT use ui-extras.css — it is not needed.
 *
 * CSS class mapping used by this file:
 *   auth.css   → .alert .alert-error/success/info, .form-error,
 *                .form-input.error, .hidden, .spinner,
 *                .password-strength.weak/fair/good/strong .visible
 *   landing.css→ .landing-nav.scrolled, .nav-menu.open, .mobile-menu-toggle.open
 */

const UI = (() => {

  // ─── Alert Component ────────────────────────────────────────────────────────
  // auth.css already styles: .alert, .alert-error, .alert-success, .alert-info
  // Structure matches: .alert > .alert-content (.alert-icon + .alert-message) + .alert-close

  /**
   * Render an alert inside a container element
   * @param {string}  containerId
   * @param {string}  message
   * @param {'success'|'error'|'info'|'warning'} type
   * @param {boolean} autoDismiss  - auto-remove after 5 s
   */
  const showAlert = (containerId, message, type = 'error', autoDismiss = false) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

    container.innerHTML = `
      <div class="alert alert-${type}" role="alert">
        <div class="alert-content">
          <span class="alert-icon">${icons[type] || icons.info}</span>
          <span class="alert-message">${message}</span>
        </div>
        <button class="alert-close" onclick="this.closest('.alert').remove()" aria-label="Close">×</button>
      </div>
    `;

    if (autoDismiss) {
      setTimeout(() => {
        const el = container.querySelector('.alert');
        if (el) el.remove();
      }, 5000);
    }
  };

  const clearAlert = (containerId) => {
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '';
  };

  // ─── Button Loader ───────────────────────────────────────────────────────────
  // Uses .hidden (auth.css) to swap .btn-text ↔ .btn-loader

  /**
   * Toggle loading state on a submit button
   * @param {string}  btnId
   * @param {boolean} loading
   */
  const setButtonLoading = (btnId, loading = true) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    const textEl   = btn.querySelector('.btn-text');
    const loaderEl = btn.querySelector('.btn-loader');

    btn.disabled = loading;
    if (textEl)   textEl.classList.toggle('hidden', loading);
    if (loaderEl) loaderEl.classList.toggle('hidden', !loading);
  };

  // ─── Form Field Errors ────────────────────────────────────────────────────────
  // auth.css styles:
  //   .form-input.error  → red border + bg
  //   .form-error        → red text, hidden by default, shake animation

  /**
   * Show an error below a field (pass '' to clear)
   */
  const setFieldError = (fieldId, message = '') => {
    const field   = document.getElementById(fieldId);
    const errorEl = document.getElementById(`${fieldId}Error`);

    if (field) {
      field.classList.toggle('error', !!message);
    }

    if (errorEl) {
      errorEl.textContent   = message;
      errorEl.style.display = message ? 'block' : 'none';
    }
  };

  const setFieldValid = (fieldId) => {
    const field = document.getElementById(fieldId);
    if (field) field.classList.remove('error');
    setFieldError(fieldId, '');
  };

  const clearFormErrors = (...fieldIds) => {
    fieldIds.forEach((id) => setFieldError(id, ''));
  };

  // ─── Password Strength ────────────────────────────────────────────────────────
  // auth.css uses class-based approach:
  //   .password-strength            → container (opacity:0 by default)
  //   .password-strength.visible    → fades in
  //   .password-strength.weak/fair/good/strong → colours the bars
  //   .strength-text::before        → CSS inserts the label text automatically
  //
  // So we ONLY need to toggle classes — no innerHTML needed.

  /**
   * Update password strength indicator
   * @param {string} password
   * @param {string} containerId  - ID of .password-strength wrapper
   * @returns {number} score 0–4
   */
  const updatePasswordStrength = (password, containerId = 'passwordStrength') => {
    const container = document.getElementById(containerId);
    if (!container) return 0;

    let score = 0;
    if (password.length >= 8)           score++;
    if (/[A-Z]/.test(password))         score++;
    if (/[0-9]/.test(password))         score++;
    if (/[^A-Za-z0-9]/.test(password))  score++;

    const levels = ['', 'weak', 'fair', 'good', 'strong'];

    container.classList.remove('weak', 'fair', 'good', 'strong');

    if (password.length > 0) {
      container.classList.add('visible');
      if (score > 0) container.classList.add(levels[score]);
    } else {
      container.classList.remove('visible');
    }

    return score;
  };

  // ─── Scroll & Nav ─────────────────────────────────────────────────────────────

  /**
   * Smooth scroll to an element
   * @param {string} selector  - '#features', 'features', or any CSS selector
   * @param {number} offset    - px to subtract (for fixed nav)
   */
  const scrollToSection = (selector, offset = 80) => {
    let el;
    if (selector.startsWith('#') || selector.startsWith('.')) {
      el = document.querySelector(selector);
    } else {
      el = document.getElementById(selector) || document.querySelector(selector);
    }
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  // ─── Validation Helpers ───────────────────────────────────────────────────────

  const validators = {
    required:  (val) => val.trim() !== ''                       || 'This field is required.',
    email:     (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) || 'Enter a valid email address.',
    minLength: (n)   => (val) => val.length >= n                || `Must be at least ${n} characters.`,
    maxLength: (n)   => (val) => val.length <= n                || `Must be no more than ${n} characters.`,
    noSpaces:  (val) => !/\s/.test(val)                         || 'No spaces allowed.',
    match:     (val, otherVal) => val === otherVal               || 'Passwords do not match.',
  };

  /**
   * Run a value through an array of rule functions.
   * Each rule returns true (valid) or an error string.
   * @returns {string|null}  First error, or null if all pass
   */
  const validateField = (value, rules = []) => {
    for (const rule of rules) {
      const result = rule(value);
      if (result !== true) return result;
    }
    return null;
  };

  // ─── Format Helpers ────────────────────────────────────────────────────────────

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const formatDuration = (minutes) => {
    if (!minutes) return '—';
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  };

  // ─── Toast Notifications ──────────────────────────────────────────────────────
  // Used on dashboard pages where auth.css alerts aren't available.
  // Injects a minimal <style> block once, then appends toast elements.

  let _toastContainer      = null;
  let _toastStyleInjected  = false;

  const _injectToastStyles = () => {
    if (_toastStyleInjected) return;
    _toastStyleInjected = true;
    const s = document.createElement('style');
    s.textContent = `
      #tv-toasts{position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;
        display:flex;flex-direction:column;gap:.5rem;pointer-events:none;max-width:340px}
      .tv-toast{display:flex;align-items:center;justify-content:space-between;gap:.75rem;
        padding:.75rem 1rem;border-radius:10px;font-size:.875rem;font-weight:500;
        pointer-events:all;box-shadow:0 4px 20px rgba(0,0,0,.12);
        opacity:0;transform:translateY(10px);transition:opacity .25s,transform .25s}
      .tv-toast.in{opacity:1;transform:translateY(0)}
      .tv-toast.out{opacity:0;transform:translateY(10px)}
      .tv-toast-success{background:#d1fae5;color:#065f46;border-left:4px solid #10b981}
      .tv-toast-error{background:#fee2e2;color:#991b1b;border-left:4px solid #ef4444}
      .tv-toast-warning{background:#fef3c7;color:#92400e;border-left:4px solid #f59e0b}
      .tv-toast-info{background:#dbeafe;color:#1e40af;border-left:4px solid #3b82f6}
      .tv-toast-close{background:none;border:none;cursor:pointer;font-size:1.1rem;
        opacity:.6;color:inherit;padding:0 .25rem;line-height:1}
      .tv-toast-close:hover{opacity:1}
    `;
    document.head.appendChild(s);
  };

  /**
   * Show a floating toast notification
   * @param {string}  message
   * @param {'success'|'error'|'warning'|'info'} type
   * @param {number}  duration  ms before auto-dismiss
   */
  const toast = (message, type = 'info', duration = 4000) => {
    _injectToastStyles();

    if (!_toastContainer) {
      _toastContainer = document.createElement('div');
      _toastContainer.id = 'tv-toasts';
      document.body.appendChild(_toastContainer);
    }

    const el = document.createElement('div');
    el.className = `tv-toast tv-toast-${type}`;
    el.innerHTML = `<span>${message}</span>
      <button class="tv-toast-close" aria-label="Close">×</button>`;

    el.querySelector('.tv-toast-close').addEventListener('click', () => _dismissToast(el));
    _toastContainer.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => _dismissToast(el), duration);
  };

  const _dismissToast = (el) => {
    el.classList.replace('in', 'out');
    setTimeout(() => el.remove(), 300);
  };

  // ─── Public API ───────────────────────────────────────────────────────────────

  return {
    showAlert,
    clearAlert,
    toast,
    setButtonLoading,
    setFieldError,
    setFieldValid,
    clearFormErrors,
    updatePasswordStrength,
    validators,
    validateField,
    scrollToSection,
    formatDate,
    formatDateTime,
    formatDuration,
  };
})();