// Register Page JavaScript Logic

// Redirect if already logged in
Auth.redirectIfLoggedIn();

// Back to home button functionality
function goToHome(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  window.location.href = '../index.html';
}

// Validation patterns
const validationPatterns = {
  name: /^[a-zA-Z\s]{2,50}$/,
  username: /^[a-zA-Z0-9_]{3,20}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  password: /^.{6,}$/,
  enrollment_id: /^[a-zA-Z0-9_-]{0,20}$/
};

// Validate field with regex
function validateField(fieldId, value) {
  const errorElement = document.getElementById(`${fieldId}-error`);
  let isValid = true;
  let errorMessage = '';
  
  switch(fieldId) {
    case 'name':
      if (!value.trim()) {
        errorMessage = 'Name is required';
        isValid = false;
      } else if (!validationPatterns.name.test(value)) {
        errorMessage = 'Name must be 2-50 characters with letters and spaces only';
        isValid = false;
      }
      break;
    case 'username':
      if (!value.trim()) {
        errorMessage = 'Username is required';
        isValid = false;
      } else if (!validationPatterns.username.test(value)) {
        errorMessage = 'Username must be 3-20 characters (letters, numbers, underscore)';
        isValid = false;
      }
      break;
    case 'email':
      if (!value.trim()) {
        errorMessage = 'Email is required';
        isValid = false;
      } else if (!validationPatterns.email.test(value)) {
        errorMessage = 'Please enter a valid email address';
        isValid = false;
      }
      break;
    case 'password':
      if (!value) {
        errorMessage = 'Password is required';
        isValid = false;
      } else if (!validationPatterns.password.test(value)) {
        errorMessage = 'Password must be at least 6 characters';
        isValid = false;
      }
      break;
    case 'password_confirm':
      const password = document.getElementById('password').value;
      if (!value) {
        errorMessage = 'Please confirm your password';
        isValid = false;
      } else if (value !== password) {
        errorMessage = 'Passwords do not match';
        isValid = false;
      }
      break;
    case 'enrollment_id':
      if (value && !validationPatterns.enrollment_id.test(value)) {
        errorMessage = 'Enrollment ID: max 20 chars (letters, numbers, -, _)';
        isValid = false;
      }
      break;
    case 'terms':
      if (!document.getElementById('terms').checked) {
        errorMessage = 'You must agree to terms and conditions';
        isValid = false;
      }
      break;
  }
  
  // Show/hide error
  if (errorMessage) {
    errorElement.textContent = errorMessage;
    errorElement.style.display = 'block';
  } else {
    errorElement.style.display = 'none';
  }
  
  return isValid;
}

// Add validation listeners
['name', 'username', 'email', 'password', 'password_confirm', 'enrollment_id'].forEach(field => {
  document.getElementById(field).addEventListener('blur', function() {
    validateField(field, this.value);
  });
});

document.getElementById('terms').addEventListener('change', function() {
  validateField('terms');
});

// Handle registration
async function handleRegister() {
  const registerBtn = document.getElementById('register-btn');
  
  // Hide previous error
  hideError();
  
  // Validate all fields
  const nameValid = validateField('name', document.getElementById('name').value);
  const usernameValid = validateField('username', document.getElementById('username').value);
  const emailValid = validateField('email', document.getElementById('email').value);
  const passwordValid = validateField('password', document.getElementById('password').value);
  const passwordConfirmValid = validateField('password_confirm', document.getElementById('password_confirm').value);
  const enrollmentValid = validateField('enrollment_id', document.getElementById('enrollment_id').value);
  const termsValid = validateField('terms');
  
  if (!nameValid || !usernameValid || !emailValid || !passwordValid || !passwordConfirmValid || !enrollmentValid || !termsValid) {
    showError('Please fix the errors above');
    return;
  }
  
  // Build request data
  const formData = {
    name: document.getElementById('name').value.trim(),
    username: document.getElementById('username').value.trim(),
    email: document.getElementById('email').value.trim(),
    password: document.getElementById('password').value,
    password_confirm: document.getElementById('password_confirm').value,
    role: 'student'
  };
  
  // Add enrollment ID if provided
  const enrollmentId = document.getElementById('enrollment_id').value.trim();
  if (enrollmentId) {
    formData.enrollment_id = enrollmentId;
  }
  
  // Show loading
  registerBtn.disabled = true;
  registerBtn.textContent = 'Creating Account...';
  
  try {
    await Auth.register(formData);
    
    // Success
    hideError();
    registerBtn.textContent = 'Success!';
    registerBtn.classList.add('btn-success');
    
    const errorDiv = document.getElementById('error-message');
    errorDiv.style.background = 'rgba(16, 185, 129, 0.1)';
    errorDiv.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    errorDiv.style.color = '#10b981';
    errorDiv.textContent = 'Account created successfully! Redirecting to login...';
    errorDiv.style.display = 'block';
    
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1500);
    
  } catch (error) {
    showError(error.message || 'Registration failed. Please try again.');
    registerBtn.disabled = false;
    registerBtn.textContent = 'Create Account';
    registerBtn.classList.remove('btn-success');
  }
}

// Show error message
function showError(message) {
  const errorDiv = document.getElementById('error-message');
  errorDiv.style.background = 'rgba(239, 68, 68, 0.1)';
  errorDiv.style.borderColor = 'rgba(239, 68, 68, 0.3)';
  errorDiv.style.color = '#ef4444';
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
  // Scroll to top to show error
  errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Hide error message
function hideError() {
  document.getElementById('error-message').style.display = 'none';
}