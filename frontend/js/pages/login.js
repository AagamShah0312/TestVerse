/**
 * TestVerse - Login Page (login.html)
 * Handles: form validation, API login, JWT storage, redirect
 *
 * Load order (before </body>):
 *   <script src="js/config.js"></script>
 *   <script src="js/api.js"></script>
 *   <script src="js/auth.js"></script>
 *   <script src="js/ui.js"></script>
 *   <script src="js/pages/login.js"></script>
 */

document.addEventListener('DOMContentLoaded', () => {

  // If already logged in, go to dashboard immediately
  if (Auth.redirectIfLoggedIn()) return;

  _checkQueryMessage();
  _initPasswordToggle();
  _initRememberMe();
  _initLoginForm();
});

// ─── Query String Messages ────────────────────────────────────────────────────
// e.g. ?msg=Session+expired shown after auto-logout

function _checkQueryMessage() {
  const params = new URLSearchParams(window.location.search);
  const msg    = params.get('msg');
  if (msg) {
    UI.showAlert('alertContainer', msg, 'info', true);
  }
}

// ─── Password Visibility Toggle ───────────────────────────────────────────────
// The toggle button in login.html has no id — select by class inside form

function _initPasswordToggle() {
  const form      = document.getElementById('loginForm');
  if (!form) return;

  const input     = document.getElementById('password');
  // BUG FIX: use querySelector scoped to form so we don't accidentally grab
  // a toggle from another widget on the page
  const toggleBtn = form.querySelector('.toggle-password');

  if (!input || !toggleBtn) return;

  toggleBtn.addEventListener('click', () => {
    const show    = input.type === 'password';
    input.type    = show ? 'text' : 'password';

    const eyeOn   = toggleBtn.querySelector('.eye-icon');
    const eyeOff  = toggleBtn.querySelector('.eye-off-icon');
    if (eyeOn)  eyeOn.classList.toggle('hidden', !show);
    if (eyeOff) eyeOff.classList.toggle('hidden', show);

    toggleBtn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
}

// ─── Remember Me ──────────────────────────────────────────────────────────────

function _initRememberMe() {
  const saved = localStorage.getItem(CONFIG.STORAGE.REMEMBER_ME);
  if (!saved) return;

  const emailInput    = document.getElementById('email');
  const rememberCheck = document.getElementById('remember');

  if (emailInput)    emailInput.value    = saved;
  if (rememberCheck) rememberCheck.checked = true;
}

// ─── Login Form ───────────────────────────────────────────────────────────────

function _initLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  // Validate on blur
  document.getElementById('email')   ?.addEventListener('blur',  _validateEmail);
  document.getElementById('password')?.addEventListener('blur',  _validatePassword);

  // Clear error while typing
  document.getElementById('email')   ?.addEventListener('input', () => UI.setFieldError('email',    ''));
  document.getElementById('password')?.addEventListener('input', () => UI.setFieldError('password', ''));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    UI.clearAlert('alertContainer');

    const email    = (document.getElementById('email')   ?.value ?? '').trim();
    const password =  document.getElementById('password')?.value ?? '';
    const remember =  document.getElementById('remember')?.checked ?? false;

    // Validate both fields before hitting the API
    const emailErr    = _validateEmail();
    const passwordErr = _validatePassword();
    if (emailErr || passwordErr) return;

    // BUG FIX: disable button immediately and DON'T re-enable it on success
    // to prevent double-submit during the redirect delay
    _setLoading(true);

    let loginSucceeded = false;

    try {
      const { success, message } = await Auth.login(email, password);

      if (!success) {
        UI.showAlert(
          'alertContainer',
          message || 'Invalid email or password. Please try again.',
          'error'
        );
        return; // falls through to finally → re-enables button
      }

      loginSucceeded = true;

      // Persist email for "remember me"
      if (remember) {
        localStorage.setItem(CONFIG.STORAGE.REMEMBER_ME, email);
      } else {
        localStorage.removeItem(CONFIG.STORAGE.REMEMBER_ME);
      }

      UI.showAlert('alertContainer', 'Login successful! Redirecting…', 'success');

      // BUG FIX: redirect happens inside setTimeout — button must stay disabled
      // We call redirectToDashboard() here; button state is irrelevant after redirect
      setTimeout(() => Auth.redirectToDashboard(), 900);

    } catch (err) {
      console.error('[Login] Unexpected error:', err);
      UI.showAlert('alertContainer', 'Network error. Please check your connection.', 'error');
    } finally {
      // BUG FIX: only re-enable if login did NOT succeed (error path)
      if (!loginSucceeded) {
        _setLoading(false);
      }
    }
  });
}

// ─── Field Validators ─────────────────────────────────────────────────────────

function _validateEmail() {
  const val = (document.getElementById('email')?.value ?? '').trim();
  const err = UI.validateField(val, [
    UI.validators.required,
    UI.validators.email,
  ]);
  if (err) UI.setFieldError('email', err);
  else     UI.setFieldValid('email');
  return err; // null = valid, string = error message
}

function _validatePassword() {
  const val = document.getElementById('password')?.value ?? '';
  const err = UI.validateField(val, [
    UI.validators.required,
    UI.validators.minLength(6),
  ]);
  if (err) UI.setFieldError('password', err);
  else     UI.setFieldValid('password');
  return err;
}

// ─── Loading State ────────────────────────────────────────────────────────────

function _setLoading(loading) {
  const btn = document.getElementById('loginBtn');
  if (!btn) return;

  btn.disabled = loading;

  const textEl   = btn.querySelector('.btn-text');
  const loaderEl = btn.querySelector('.btn-loader');

  if (textEl)   textEl.classList.toggle('hidden', loading);
  if (loaderEl) loaderEl.classList.toggle('hidden', !loading);
}