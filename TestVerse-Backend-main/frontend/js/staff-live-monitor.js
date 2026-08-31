// Staff Live Monitor Page JavaScript Logic

if (!Auth.requireStaff()) {
  throw new Error('Unauthorized');
}

const examId = new URLSearchParams(window.location.search).get('id');
let refreshInterval;

if (!examId) {
  Utils.showToast('No exam ID provided', 'error');
  setTimeout(() => window.location.href = 'exams.html', 1500);
}

// Load live monitor data
async function loadLiveData() {
  const container = document.getElementById('progress-container');
  const refreshIndicator = document.getElementById('refresh-indicator');
  
  refreshIndicator.style.opacity = '1';
  
  try {
    const data = await API.getExamLiveMonitor(examId);
    
    // Update header
    document.getElementById('exam-title').textContent = data.exam_title || 'Live Exam Monitor';
    
    // Update live status
    const liveStatus = document.getElementById('live-status');
    if (data.is_live) {
      liveStatus.textContent = 'LIVE';
      liveStatus.classList.add('live');
    } else {
      liveStatus.textContent = 'OFFLINE';
      liveStatus.classList.remove('live');
    }
    
    // Update stats
    document.getElementById('active-count').textContent = data.active_count || 0;
    document.getElementById('completed-count').textContent = data.completed_count || 0;
    document.getElementById('not-started-count').textContent = data.not_started_count || 0;
    document.getElementById('total-questions').textContent = data.total_questions || 0;
    
    // Render progress list
    renderProgressList(data.live_attempts || []);
    
  } catch (error) {
    console.error('Error loading live data:', error);
    container.innerHTML = `
      <div class="error-state" style="padding: 2rem; text-align: center;">
        <p class="text-muted">Failed to load live data: ${Utils.escapeHtml(error.message)}</p>
        <button class="btn btn-secondary btn-sm" onclick="loadLiveData()">Retry</button>
      </div>
    `;
  } finally {
    setTimeout(() => refreshIndicator.style.opacity = '0.5', 500);
  }
}

// Render progress list
function renderProgressList(attempts) {
  const container = document.getElementById('progress-container');
  
  if (attempts.length === 0) {
    container.innerHTML = `
      <div class="text-center text-muted" style="padding: 3rem;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 16px; opacity: 0.5;">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <p>No students currently taking this exam</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = attempts.map(attempt => {
    const timeClass = attempt.time_remaining_minutes < 5 ? 'critical' : 
                     attempt.time_remaining_minutes < 15 ? 'warning' : '';
    const tabClass = attempt.tab_switches > 3 ? 'high' : '';
    
    return `
      <div class="progress-item ${attempt.is_struggling ? 'struggling' : ''}">
        <div class="student-info">
          <span class="student-name">${Utils.escapeHtml(attempt.student_name)}</span>
          <span class="student-email">${Utils.escapeHtml(attempt.student_email)}</span>
        </div>
        <div>
          <span class="badge badge-secondary">${Utils.escapeHtml(attempt.department)}</span>
        </div>
        <div class="progress-details">
          <div class="progress-bar-container">
            <div class="progress-bar-fill ${attempt.is_struggling ? 'struggling' : ''}" 
                 style="width: ${attempt.progress_percent}%"></div>
          </div>
          <span class="progress-answers">${attempt.answers_submitted}/${attempt.total_questions} answered (${attempt.progress_percent}%)</span>
        </div>
        <div class="time-remaining ${timeClass}">
          ${Math.floor(attempt.time_remaining_minutes)} min
        </div>
        <div class="tab-switches ${tabClass}">
          ${attempt.tab_switches} ${attempt.tab_switches === 1 ? 'switch' : 'switches'}
        </div>
      </div>
    `;
  }).join('');
}

// Start auto-refresh
function startAutoRefresh() {
  loadLiveData();
  refreshInterval = setInterval(loadLiveData, 5000); // Refresh every 5 seconds
}

// Stop on page leave
window.addEventListener('beforeunload', () => {
  if (refreshInterval) clearInterval(refreshInterval);
});

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  startAutoRefresh();
});