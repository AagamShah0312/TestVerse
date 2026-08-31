// Staff Dashboard Page JavaScript Logic

// Protect route
if (!Auth.requireStaff()) {
  throw new Error('Unauthorized');
}

let allExams = [];

// Load user info
function loadUserInfo() {
  const user = Auth.getCurrentUser();
  if (user) {
    document.getElementById('user-name').textContent = user.name || 'Staff';
    document.getElementById('user-avatar').textContent = (user.name || 'S')[0].toUpperCase();
    document.getElementById('dropdown-name').textContent = user.name || 'Staff';
    document.getElementById('dropdown-email').textContent = user.email || '';
  }
}

// Toggle profile dropdown
function toggleProfileDropdown() {
  const dropdown = document.getElementById('profile-dropdown');
  dropdown.classList.toggle('active');
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('profile-dropdown');
  if (!dropdown.contains(e.target)) {
    dropdown.classList.remove('active');
  }
});

// Load exams with error handling
async function loadExams() {
  const tbody = document.getElementById('exams-table-body');
  
  // Show loading state
  tbody.innerHTML = `
    <tr>
      <td colspan="6">
        <div class="loading-state">
          <div class="skeleton" style="height: 40px; margin-bottom: 8px;"></div>
          <div class="skeleton" style="height: 40px; margin-bottom: 8px;"></div>
          <div class="skeleton" style="height: 40px;"></div>
        </div>
      </td>
    </tr>
  `;

  try {
    const response = await API.getExams({ limit: 5 });
    allExams = response.results || response || [];
    
    if (allExams.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="empty-state">
              <div class="empty-state-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <h3 class="empty-state-title">No exams created yet</h3>
              <p class="empty-state-description">Get started by creating your first exam.</p>
              <a href="exam-create.html" class="btn btn-primary">Create Exam</a>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = allExams.map(exam => {
      const startTime = new Date(exam.start_time);
      const endTime = new Date(exam.end_time);
      const now = new Date();
      
      let status, statusClass;
      if (now < startTime) {
        status = 'Scheduled';
        statusClass = 'badge-warning';
      } else if (now >= startTime && now <= endTime) {
        status = 'Active';
        statusClass = 'badge-success';
      } else {
        status = 'Completed';
        statusClass = 'badge-ghost';
      }

      return `
        <tr>
          <td>
            <div class="exam-title-cell">
              <h4>${Utils.escapeHtml(exam.title)}</h4>
              <p class="text-muted text-sm">${Utils.escapeHtml(exam.description || '')}</p>
            </div>
          </td>
          <td>
            <span class="badge ${statusClass}">${status}</span>
          </td>
          <td>${Utils.formatDate(exam.start_time)}</td>
          <td>${exam.total_marks} marks</td>
          <td>
            <div class="flex items-center gap-2">
              <span class="text-sm">${exam.questions_count || 0} questions</span>
            </div>
          </td>
          <td>
            <div class="action-buttons">
              <a href="questions.html?exam=${exam.id}" class="btn btn-ghost btn-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
              </a>
              <a href="results.html?exam=${exam.id}" class="btn btn-ghost btn-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              </a>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    
  } catch (error) {
    console.error('Error loading exams:', error);
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="error-state">
            <div class="error-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4M12 16h.01"/>
              </svg>
            </div>
            <h3 class="error-state-title">Failed to load exams</h3>
            <p class="error-state-message">${Utils.escapeHtml(error.message)}</p>
            <button class="btn btn-secondary" onclick="loadExams()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 4v6h6M23 20v-6h-6"/>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
              </svg>
              Retry
            </button>
          </div>
        </td>
      </tr>
    `;
  }
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  loadUserInfo();
  loadExams();
});