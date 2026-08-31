// Student Results Page JavaScript Logic

// Protect route
if (!Auth.requireStudent()) {
  throw new Error('Unauthorized');
}

// Load user info
function loadUserInfo() {
  const user = Auth.getCurrentUser();
  if (user) {
    document.getElementById('user-name').textContent = user.name || 'Student';
    document.getElementById('user-avatar').textContent = (user.name || 'S')[0].toUpperCase();
  }
}

// Load results with error handling
async function loadResults() {
  const grid = document.getElementById('results-grid');
  const emptyState = document.getElementById('empty-state');

  // Show loading state
  emptyState.classList.add('hidden');
  grid.innerHTML = `
    <div class="loading-state" style="grid-column: 1 / -1;">
      <div class="skeleton" style="height: 160px; border-radius: var(--radius-xl); margin-bottom: 16px;"></div>
      <div class="skeleton" style="height: 160px; border-radius: var(--radius-xl); margin-bottom: 16px;"></div>
      <div class="skeleton" style="height: 160px; border-radius: var(--radius-xl);"></div>
    </div>
  `;

  try {
    const response = await API.getMyResults();
    const results = response.results || [];

    if (results.length === 0) {
      grid.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    grid.innerHTML = results.map(result => {
      const isPassed = result.status === 'pass';

      return `
        <div class="result-card animate-fadeInUp">
          <div class="result-info">
            <h3>${Utils.escapeHtml(result.exam_title)}</h3>
            <div class="result-meta">
              <div class="result-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="4" width="18" height="18" rx="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                ${Utils.formatDate(result.submitted_at, { hour: undefined, minute: undefined })}
              </div>
              <div class="result-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5"/>
                </svg>
                ${result.obtained_marks} / ${result.total_marks} marks
              </div>
            </div>
            ${result.feedback ? `
              <div class="feedback-text">
                <strong>Feedback:</strong> ${Utils.escapeHtml(result.feedback)}
              </div>
            ` : ''}
          </div>
          <div class="result-score">
            <div class="score-circle ${isPassed ? 'passed' : 'failed'}">
              <span class="score-value">${Math.round(result.percentage)}%</span>
            </div>
            <span class="badge ${isPassed ? 'badge-success' : 'badge-error'}">
              ${isPassed ? 'PASSED' : 'FAILED'}
            </span>
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('Error loading results:', error);
    grid.innerHTML = `
      <div class="error-state" style="grid-column: 1 / -1;">
        <div class="error-state-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4M12 16h.01"/>
          </svg>
        </div>
        <h3 class="error-state-title">Failed to load results</h3>
        <p class="error-state-message">${Utils.escapeHtml(error.message)}</p>
        <button class="btn btn-secondary" onclick="loadResults()">
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

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  loadUserInfo();
  loadResults();
});