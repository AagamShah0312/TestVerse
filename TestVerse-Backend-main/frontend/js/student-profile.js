// Student Profile Page JavaScript Logic

if (!Auth.requireAuth()) {
  throw new Error('Unauthorized');
}

let currentUser = null;

// Switch tabs
function switchTab(tabName) {
  document.querySelectorAll('.profile-tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  
  document.querySelector(`[onclick="switchTab('${tabName}')"]`).classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');
}

// Load profile data
async function loadProfile() {
  try {
    const user = await API.getProfile();
    currentUser = user;
    
    // Update profile card
    document.getElementById('profile-avatar').textContent = user.name ? user.name[0].toUpperCase() : '?';
    document.getElementById('profile-name').textContent = user.name || 'No Name';
    document.getElementById('profile-email').textContent = user.email;
    document.getElementById('profile-branch').textContent = user.department || 'Not Assigned';
    document.getElementById('profile-enrollment').textContent = user.enrollment_id || 'Not Set';
    document.getElementById('profile-joined').textContent = Utils.formatDate(user.created_at, { hour: undefined, minute: undefined });
    
    // Update navbar badge
    document.getElementById('branch-badge').textContent = user.department || 'Unassigned';
    
    // Populate edit form
    document.getElementById('edit-name').value = user.name || '';
    document.getElementById('edit-email').value = user.email || '';
    document.getElementById('edit-enrollment').value = user.enrollment_id || '';
    document.getElementById('edit-branch').value = user.department || 'Not Assigned';
    
  } catch (error) {
    console.error('Error loading profile:', error);
    Utils.showToast('Failed to load profile', 'error');
  }
}

// Show message
function showMessage(containerId, message, isError = false) {
  const container = document.getElementById(containerId);
  container.innerHTML = `
    <div class="${isError ? 'message-error' : 'message-success'}">
      ${Utils.escapeHtml(message)}
    </div>
  `;
  setTimeout(() => container.innerHTML = '', 5000);
}

// Handle personal info form
document.getElementById('personal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const btn = document.getElementById('save-personal-btn');
  Utils.setButtonLoading(btn, true);
  
  try {
    const data = {
      name: document.getElementById('edit-name').value.trim(),
      enrollment_id: document.getElementById('edit-enrollment').value.trim() || null
    };
    
    await API.updateProfile(data);
    showMessage('personal-message', 'Profile updated successfully!');
    loadProfile();
    
  } catch (error) {
    console.error('Error updating profile:', error);
    showMessage('personal-message', error.message || 'Failed to update profile', true);
  } finally {
    Utils.setButtonLoading(btn, false);
  }
});

// Handle password form
document.getElementById('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const oldPassword = document.getElementById('old-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  
  if (newPassword !== confirmPassword) {
    showMessage('password-message', 'New passwords do not match', true);
    return;
  }
  
  if (newPassword.length < 6) {
    showMessage('password-message', 'Password must be at least 6 characters', true);
    return;
  }
  
  const btn = document.getElementById('change-password-btn');
  Utils.setButtonLoading(btn, true);
  
  try {
    await API.changePassword({
      old_password: oldPassword,
      new_password: newPassword,
      confirm_password: confirmPassword
    });
    
    showMessage('password-message', 'Password changed successfully!');
    document.getElementById('password-form').reset();
    
  } catch (error) {
    console.error('Error changing password:', error);
    showMessage('password-message', error.message || error.error || 'Failed to change password', true);
  } finally {
    Utils.setButtonLoading(btn, false);
  }
});

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  loadProfile();
});