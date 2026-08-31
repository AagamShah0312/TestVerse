// Student Dashboard JavaScript Logic

// Protect route - exit if redirect happens
if (!Auth.requireStudent()) {
  // Redirect handled by requireStudent - stop further execution
  throw new Error('Unauthorized access');
}

let allExams = [];
let currentFilter = 'all';

// Profile dropdown toggle
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

// Load user info
function loadUserInfo() {
  const user = Auth.getCurrentUser();
  if (user) {
    document.getElementById('first-name').textContent = user.name?.split(' ')[0] || 'Student';
    document.getElementById('user-name').textContent = user.name || 'Student';
    document.getElementById('user-avatar').textContent = (user.name || 'S')[0].toUpperCase();
    document.getElementById('dropdown-name').textContent = user.name || 'Student';
    document.getElementById('dropdown-email').textContent = user.email || '';
  }
}

// Load exams with error handling
async function loadExams() {
  const grid = document.getElementById('exams-grid');
  const emptyState = document.getElementById('empty-state');
  
  // Show loading state
  emptyState.classList.add('hidden');
  grid.innerHTML = `
    <div class="loading-state" style="grid-column: 1 / -1;">
      <div class="skeleton" style="height: 280px; border-radius: var(--radius-xl);"></div>
    </div>
    <div class="loading-state">
      <div class="skeleton" style="height: 280px; border-radius: var(--radius-xl);"></div>
    </div>
    <div class="loading-state">
      <div class="skeleton" style="height: 280px; border-radius: var(--radius-xl);"></div>
    </div>
  `;
  
  try {
    const response = await API.getAvailableExams({ limit: 50 });
    allExams = response.results || [];
    
    // Update stats
    const now = new Date();
    const ongoing = allExams.filter(e => {
      const start = new Date(e.start_time);
      const end = new Date(e.end_time);
      return start <= now && now <= end;
    }).length;
    const upcoming = allExams.filter(e => new Date(e.start_time) > now).length;
    const completed = allExams.filter(e => new Date(e.end_time) < now).length;
    
    document.getElementById('available-count').textContent = allExams.length;
    document.getElementById('ongoing-count').textContent = ongoing;
    document.getElementById('completed-count').textContent = completed;
    
    renderExams();
  } catch (error) {
    console.error('Error loading exams:', error);
    grid.innerHTML = `
      <div class="error-state" style="grid-column: 1 / -1;">
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
    `;
  }
}

// Render exams
function renderExams() {
  const searchTerm = document.getElementById('search-input').value.toLowerCase();
  
  let filteredExams = allExams.filter(exam => {
    const status = Utils.getExamStatus(exam.start_time, exam.end_time);
    const matchesFilter = currentFilter === 'all' || status === currentFilter;
    const matchesSearch = exam.title.toLowerCase().includes(searchTerm) || 
                         (exam.description && exam.description.toLowerCase().includes(searchTerm));
    return matchesFilter && matchesSearch;
  });
  
  const grid = document.getElementById('exams-grid');
  const emptyState = document.getElementById('empty-state');
  
  if (filteredExams.length === 0) {
    grid.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  
  emptyState.classList.add('hidden');
  
  grid.innerHTML = filteredExams.map(exam => {
    const status = Utils.getExamStatus(exam.start_time, exam.end_time);
    const statusClass = `status-${status}`;
    const isOngoing = status === 'ongoing';
    const isUpcoming = status === 'upcoming';
    
    // Calculate time until start for upcoming exams
    let countdownText = '';
    if (isUpcoming) {
      const start = new Date(exam.start_time);
      const now = new Date();
      const diffMs = start - now;
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      if (hours > 24) {
        countdownText = `Starts ${Utils.formatDate(exam.start_time)}`;
      } else if (hours > 0) {
        countdownText = `Starts in ${hours}h ${mins}m`;
      } else {
        countdownText = `Starts in ${mins} minutes`;
      }
    }
    
    return `
      <div class="exam-card">
        <div class="exam-card-header">
          <div>
            <h3 class="exam-title">${Utils.escapeHtml(exam.title)}</h3>
          </div>
          <span class="badge ${statusClass}">${status}</span>
        </div>
        <p class="exam-desc">${Utils.escapeHtml(exam.description || 'No description')}</p>
        <div class="exam-meta">
          <div class="exam-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            ${Utils.formatDuration(exam.duration)}
          </div>
          <div class="exam-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            </svg>
            ${exam.question_count || exam.questions?.length || 0} Questions
          </div>
          <div class="exam-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5"/>
            </svg>
            ${exam.total_marks} Marks
          </div>
        </div>
        <div class="exam-meta" style="margin-bottom: var(--space-4);">
          <div class="exam-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            ${Utils.formatDate(exam.start_time)}
          </div>
        </div>
        <div class="exam-actions">
          ${isOngoing ? `
            <a href="exam-taking.html?id=${exam.id}" class="btn btn-primary w-full">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Start Exam
            </a>
          ` : isUpcoming ? `
            <button class="btn btn-secondary w-full" disabled title="Exam hasn't started yet">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              ${countdownText}
            </button>
          ` : `
            <button class="btn btn-ghost w-full" disabled>
              Exam Ended
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

// Filter tabs
document.getElementById('filter-tabs').addEventListener('click', (e) => {
  if (e.target.classList.contains('tab')) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    currentFilter = e.target.dataset.filter;
    renderExams();
  }
});

// Search
document.getElementById('search-input').addEventListener('input', Utils.debounce(renderExams, 300));

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
  loadUserInfo();
  loadExams();
});