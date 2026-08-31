// Login Page JavaScript Logic

// Redirect if already logged in
Auth.redirectIfLoggedIn();

// Back to home
function goToHome(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  window.location.href = '../index.html';
}

// Toggle password visibility
function togglePassword() {
  const input = document.getElementById('password');
  const icon = document.getElementById('eye-icon');
  
  if (input.type === 'password') {
    input.type = 'text';
    icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
  } else {
    input.type = 'password';
    icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  }
}

// Handle login
async function handleLogin() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const loginBtn = document.getElementById('login-btn');
  const errorDiv = document.getElementById('error-message');
  
  errorDiv.style.display = 'none';
  
  if (!email || !password) {
    showError('Please fill in all fields');
    return;
  }
  
  loginBtn.disabled = true;
  loginBtn.textContent = 'Signing in...';
  
  try {
    await Auth.login(email, password);
    errorDiv.style.display = 'none';
    loginBtn.textContent = 'Success!';
    
    setTimeout(() => {
      Auth.redirectToDashboard();
    }, 500);
    
  } catch (error) {
    showError(error.message || 'Invalid email or password. Please try again.');
    document.getElementById('password').value = '';
    document.getElementById('password').focus();
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign In';
  }
}

function showError(message) {
  const errorDiv = document.getElementById('error-message');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
}

// Enter key handlers
document.getElementById('password').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleLogin();
  }
});

document.getElementById('email').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('password').focus();
  }
});