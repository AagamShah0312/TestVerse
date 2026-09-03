/**
 * TestVerse - Register Page (register.html / signup.html)
 * Handles: form validation, password strength, API registration, redirect
 *
 * Dependencies (load in order):
 */

document.addEventListener('DOMContentLoaded', () => {

  // Redirect if already logged in
  if (Auth.redirectIfLoggedIn()) return;

  _initPasswordToggles();
  _initPasswordStrength();
  _initLiveValidation();
  _initRegisterForm();
});

// ─── Password Visibility Toggles ─────────────────────────────────────────────

function _initPasswordToggles() {
  _attachToggle('password',        'togglePassword');
  _attachToggle('confirmPassword', 'toggleConfirmPassword');
}

function _attachToggle(inputId, btnId) {
  const input  = document.getElementById(inputId);
  const btn    = document.getElementById(btnId);
  if (!input || !btn) return;

  btn.addEventListener('click', () => {
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';

    const eyeOn  = btn.querySelector('.eye-icon');
    const eyeOff = btn.querySelector('.eye-off-icon');
    if (eyeOn)  eyeOn.classList.toggle('hidden', !isHidden);
    if (eyeOff) eyeOff.classList.toggle('hidden', isHidden);

    btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
  });
}

// ─── Password Strength Meter ──────────────────────────────────────────────────

function _initPasswordStrength() {
  const passwordInput = document.getElementById('password');
  if (!passwordInput) return;

  passwordInput.addEventListener('input', () => {
    UI.updatePasswordStrength(passwordInput.value, 'passwordStrength');
  });
}

// ─── Live Field Validation (on blur) ─────────────────────────────────────────

function _initLiveValidation() {
  const fields = ['name', 'username', 'email', 'password', 'confirmPassword'];

  fields.forEach((fieldId) => {
    const input = document.getElementById(fieldId);
    if (!input) return;

    // Validate on blur
    input.addEventListener('blur', () => _validateField(fieldId));

    // Clear error on input
    input.addEventListener('input', () => {
      UI.setFieldError(fieldId, '');
      // Re-validate confirm if password changes
      if (fieldId === 'password') {
        const confirmVal = document.getElementById('confirmPassword')?.value;
        if (confirmVal) _validateField('confirmPassword');
      }
    });
  });
}

// ─── Register Form Submit ─────────────────────────────────────────────────────

function _initRegisterForm() {
  const form = document.getElementById('registerForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    UI.clearAlert('alertContainer');

    // Collect values
    const name            = document.getElementById('name')?.value.trim()            || '';
    const username        = document.getElementById('username')?.value.trim()        || '';
    const email           = document.getElementById('email')?.value.trim()           || '';
    const department      = document.getElementById('department')?.value.trim()      || '';
    const password        = document.getElementById('password')?.value               || '';
    const confirmPassword = document.getElementById('confirmPassword')?.value        || '';
    const terms           = document.getElementById('terms')?.checked                || false;

    // Validate all fields
    const errors = [
      _validateField('name'),
      _validateField('username'),
      _validateField('email'),
      _validateField('password'),
      _validateField('confirmPassword'),
    ];

    if (!terms) {
      UI.setFieldError('terms', 'You must agree to the Terms of Service.');
      errors.push('terms');
    } else {
      UI.setFieldError('terms', '');
    }

    if (errors.some(Boolean)) return;

    // Set loading
    _setLoading(true);

    try {
      // Build payload — role is always 'student' on self-registration
      const payload = {
        name,
        username,
        email,
        password,
        password_confirm: confirmPassword,
        role: 'student',
      };

      if (department) payload.department = department;

      const res                = await Api.post(CONFIG.ENDPOINTS.REGISTER, payload);
      const { data, error }    = await Api.parse(res);

      if (error) {
        // Map field errors back to the form
        _handleApiErrors(error);
        return;
      }

      // Registration successful — auto-login
      const { success, message } = await Auth.login(email, password);

      if (success) {
        UI.showAlert('alertContainer', 'Account created! Taking you to your dashboard…', 'success');
        setTimeout(() => Auth.redirectToDashboard(), 1000);
      } else {
        // Registered but login failed — send to login page
        UI.showAlert(
          'alertContainer',
          'Account created! Please log in.',
          'success',
        );
        setTimeout(() => {
          window.location.href = CONFIG.ROUTES.LOGIN;
        }, 1500);
      }

    } catch (err) {
      console.error('Registration error:', err);
      UI.showAlert('alertContainer', 'Network error. Please check your connection.', 'error');
    } finally {
      _setLoading(false);
    }
  });
}

// ─── Per-field Validation ─────────────────────────────────────────────────────

function _validateField(fieldId) {
  const input = document.getElementById(fieldId);
  if (!input) return null;

  const value = input.value;
  let error   = null;

  switch (fieldId) {
    case 'name':
      error = UI.validateField(value.trim(), [
        UI.validators.required,
        UI.validators.minLength(2),
        UI.validators.maxLength(255),
      ]);
      break;

    case 'username':
      error = UI.validateField(value.trim(), [
        UI.validators.required,
        UI.validators.minLength(3),
        UI.validators.maxLength(150),
        UI.validators.noSpaces,
      ]);
      break;

    case 'email':
      error = UI.validateField(value.trim(), [
        UI.validators.required,
        UI.validators.email,
      ]);
      break;

    case 'password':
      error = UI.validateField(value, [
        UI.validators.required,
        UI.validators.minLength(6),
      ]);
      break;

    case 'confirmPassword': {
      const pass = document.getElementById('password')?.value || '';
      error = UI.validateField(value, [
        UI.validators.required,
        (v) => UI.validators.match(v, pass),
      ]);
      break;
    }

    default:
      break;
  }

  if (error) UI.setFieldError(fieldId, error);
  else       UI.setFieldValid(fieldId);

  return error;
}

// ─── API Error Handler ────────────────────────────────────────────────────────

/**
 * Map DRF field errors back to their form inputs,
 * and show any remaining errors in the alert container.
 */
function _handleApiErrors(error) {
  if (typeof error !== 'object') {
    UI.showAlert('alertContainer', Auth.extractErrorMessage(error), 'error');
    return;
  }

  // Field-level errors from DRF
  const fieldMap = {
    name:             'name',
    username:         'username',
    email:            'email',
    password:         'password',
    password_confirm: 'confirmPassword',
    department:       'department',
  };

  const unhandled = [];

  for (const [key, val] of Object.entries(error)) {
    const fieldId = fieldMap[key];
    const msg     = Array.isArray(val) ? val.join(' ') : String(val);

    if (fieldId) {
      UI.setFieldError(fieldId, msg);
    } else if (key === 'detail' || key === 'non_field_errors') {
      unhandled.push(Array.isArray(val) ? val.join(' ') : msg);
    } else {
      unhandled.push(`${key}: ${msg}`);
    }
  }

  if (unhandled.length) {
    UI.showAlert('alertContainer', unhandled.join(' | '), 'error');
  }
}

// ─── Loading State ────────────────────────────────────────────────────────────

function _setLoading(loading) {
  const btn = document.getElementById('registerBtn');
  if (!btn) return;

  const textEl   = btn.querySelector('.btn-text');
  const loaderEl = btn.querySelector('.btn-loader');

  btn.disabled = loading;
  if (textEl)   textEl.classList.toggle('hidden', loading);
  if (loaderEl) loaderEl.classList.toggle('hidden', !loading);
}