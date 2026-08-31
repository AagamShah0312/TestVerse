// Staff Exams Page JavaScript Logic

if (!Auth.requireStaff()) {
  throw new Error('Unauthorized');
}

let allExams = [];

// Track loading state
let isLoading = false;

async function loadExams(showLoading = true) {
  // Prevent multiple simultaneous loads
  if (isLoading) return;
  
  const tbody = document.getElementById('exams-tbody');
  
  if (showLoading) {
    isLoading = true;
    // Show loading state
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="p-0">
          <div class="loading-state">
            <div class="skeleton skeleton-text" style="width: 100%; height: 48px; margin-bottom: 8px;"></div>
            <div class="skeleton skeleton-text" style="width: 100%; height: 48px; margin-bottom: 8px;"></div>
            <div class="skeleton skeleton-text" style="width: 100%; height: 48px;"></div>
          </div>
        </td>
      </tr>
    `;
  }
  
  try {
    const response = await API.getStaffExams({ limit: 100 });
    allExams = Array.isArray(response.results) ? response.results : [];
    
    // Validate exam data
    allExams = allExams.map(exam => ({
      ...exam,
      title: exam.title || 'Untitled Exam',
      question_count: exam.question_count || 0,
      total_marks: exam.total_marks || 0,
      questions_total_marks: exam.questions_total_marks || 0,
      duration: exam.duration || 0,
      start_time: exam.start_time || new Date().toISOString(),
      end_time: exam.end_time || new Date(Date.now() + 3600000).toISOString()
    }));
    
    renderExams();
  } catch (error) {
    console.error('Load exams error:', error);
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="error-state">
            <div class="error-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4M12 16h.01"/>
              </svg>
            </div>
            <h3 class="error-state-title">Failed to load exams</h3>
            <p class="error-state-message">${Utils.escapeHtml(error.message || 'Unknown error occurred')}</p>
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
  } finally {
    isLoading = false;
  }
}

function renderExams() {
  const searchInput = document.getElementById('search-input');
  const statusFilter = document.getElementById('status-filter');
  
  if (!searchInput || !statusFilter) {
    console.error('Required DOM elements not found');
    return;
  }
  
  const search = searchInput.value.toLowerCase().trim();
  const status = statusFilter.value;
  
  // Validate exam data before filtering
  const validExams = allExams.filter(exam => {
    return exam && typeof exam === 'object' && exam.id;
  });
  
  let filtered = validExams.filter(e => {
    const title = (e.title || '').toString().toLowerCase();
    const matchesSearch = title.includes(search);
    const matchesStatus = status === 'all' || 
      (status === 'published' && e.is_published) || 
      (status === 'draft' && !e.is_published);
    return matchesSearch && matchesStatus;
  });
  
  const tbody = document.getElementById('exams-tbody');
  if (!tbody) {
    console.error('Table body element not found');
    return;
  }
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center p-8 text-muted">No exams found</td></tr>';
    return;
  }
  
  const now = new Date();
  tbody.innerHTML = filtered.map(exam => {
    // Validate numeric values
    const totalMarks = parseFloat(exam.total_marks) || 0;
    const questionsTotalMarks = parseFloat(exam.questions_total_marks) || 0;
    const questionCount = parseInt(exam.question_count) || 0;
    const duration = parseInt(exam.duration) || 0;
    
    const marksMatch = Math.abs(questionsTotalMarks - totalMarks) < 0.01; // Account for floating point precision
    const hasQuestions = questionCount > 0;
    const canPublish = marksMatch && hasQuestions;
    const marksInfo = hasQuestions 
      ? `${questionsTotalMarks.toFixed(1)}/${totalMarks.toFixed(1)} marks`
      : 'No questions';
    const marksClass = canPublish ? 'text-success' : 'text-error';
    
    // Parse dates safely
    let examStart, examEnd;
    try {
      examStart = new Date(exam.start_time);
      examEnd = new Date(exam.end_time);
    } catch (dateError) {
      console.warn('Invalid date format for exam:', exam.id, dateError);
      examStart = new Date();
      examEnd = new Date(Date.now() + 3600000); // Default to 1 hour from now
    }
    
    const hasStarted = examStart <= now;
    const hasEnded = examEnd <= now;
    const isRunning = hasStarted && !hasEnded;
    
    // Determine exam time status
    let timeStatus = '';
    if (isRunning) {
      timeStatus = '<span class="badge badge-info" style="font-size:0.65rem;">Running</span>';
    } else if (hasEnded) {
      timeStatus = '<span class="badge badge-ghost" style="font-size:0.65rem;">Ended</span>';
    }
    
    // Publish toggle: disable if exam has started (cannot unpublish a started exam)
    const publishDisabled = hasStarted && exam.is_published;
    const publishTitle = publishDisabled ? 'Cannot unpublish after exam has started' 
      : (!canPublish && !exam.is_published ? 'Marks mismatch - cannot publish' : '');
    
    // Delete: disable if exam has started
    const deleteDisabled = hasStarted;
    
    // Accessibility attributes
    const publishAriaLabel = exam.is_published 
      ? `Unpublish exam: ${Utils.escapeHtml(exam.title)}` 
      : `Publish exam: ${Utils.escapeHtml(exam.title)}`;
    
    return `
    <tr>
      <td>
        <strong>${Utils.escapeHtml(exam.title || 'Untitled Exam')}</strong>
        ${timeStatus ? '<br>' + timeStatus : ''}
      </td>
      <td>
        <span class="badge ${exam.is_published ? 'badge-success' : 'badge-warning'}" 
              aria-label="Status: ${exam.is_published ? 'Published' : 'Draft'}">
          ${exam.is_published ? 'Published' : 'Draft'}
        </span>
      </td>
      <td>
        <span>${questionCount}</span>
        <br><small class="${marksClass}" aria-label="Marks: ${marksInfo}">${marksInfo}</small>
      </td>
      <td aria-label="Duration: ${Utils.formatDuration(duration)}">${Utils.formatDuration(duration)}</td>
      <td aria-label="Start time: ${Utils.formatDate(exam.start_time)}">${Utils.formatDate(exam.start_time)}</td>
      <td>
        <label class="toggle-switch" title="${publishTitle}" aria-label="${publishAriaLabel}">
          <input type="checkbox" 
                 ${exam.is_published ? 'checked' : ''} 
                 ${publishDisabled ? 'disabled' : ''}
                 onchange="togglePublish('${exam.id}', this.checked, this)">
          <span class="toggle-slider" 
                style="${publishDisabled ? 'opacity:0.5;cursor:not-allowed;' : ''}" 
                role="switch" 
                aria-checked="${exam.is_published ? 'true' : 'false'}"></span>
        </label>
      </td>
      <td>
        <div class="flex gap-2">
          <button class="btn btn-ghost btn-sm" 
                  onclick="navigateToQuestions('${exam.id}')"
                  aria-label="Manage questions for ${Utils.escapeHtml(exam.title)}">
            Questions
          </button>
          <button class="btn btn-ghost btn-sm" 
                  onclick="navigateToResults('${exam.id}')"
                  aria-label="View results for ${Utils.escapeHtml(exam.title)}">
            Results
          </button>
          <button class="btn btn-ghost btn-sm text-error" 
                  ${deleteDisabled ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}
                  ${deleteDisabled ? '' : `onclick="deleteExam('${exam.id}')"`}
                  title="${deleteDisabled ? 'Cannot delete after exam has started' : 'Delete exam'}"
                  aria-label="${deleteDisabled ? 'Delete disabled' : `Delete exam: ${Utils.escapeHtml(exam.title)}`}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  `}).join('');
}

// Track ongoing operations to prevent race conditions
const pendingOperations = new Set();

async function togglePublish(examId, publish, checkbox) {
  const operationKey = `publish_${examId}`;
  
  // Prevent multiple simultaneous operations on same exam
  if (pendingOperations.has(operationKey)) {
    Utils.showToast('Operation in progress...', 'warning');
    return;
  }
  
  // Show loading state
  if (checkbox) {
    checkbox.disabled = true;
    checkbox.style.opacity = '0.7';
  }
  
  pendingOperations.add(operationKey);
  
  try {
    if (publish) {
      await API.publishExam(examId);
      Utils.showToast('Exam published successfully', 'success');
    } else {
      await API.unpublishExam(examId);
      Utils.showToast('Exam unpublished successfully', 'success');
    }
    await loadExams(); // Refresh the list
  } catch (error) {
    console.error('Publish/unpublish error:', error);
    Utils.showToast(error.message || 'Operation failed', 'error');
    // Revert checkbox state on error
    if (checkbox) checkbox.checked = !publish;
  } finally {
    pendingOperations.delete(operationKey);
    // Restore checkbox state
    if (checkbox) {
      checkbox.disabled = false;
      checkbox.style.opacity = '';
    }
  }
}

async function deleteExam(examId) {
  const operationKey = `delete_${examId}`;
  
  // Prevent multiple simultaneous operations
  if (pendingOperations.has(operationKey)) {
    Utils.showToast('Deletion already in progress...', 'warning');
    return;
  }
  
  Utils.confirm('Are you sure you want to delete this exam? This action cannot be undone.', async () => {
    pendingOperations.add(operationKey);
    
    try {
      // Show loading state
      const deleteButtons = document.querySelectorAll(`button[onclick*="deleteExam('${examId}')"]`);
      deleteButtons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.7';
        btn.innerHTML = '<div class="spinner" style="width:16px;height:16px"></div>';
      });
      
      await API.deleteExam(examId);
      Utils.showToast('Exam deleted successfully', 'success');
      await loadExams(); // Refresh the list
    } catch (error) {
      console.error('Delete exam error:', error);
      Utils.showToast(error.message || 'Failed to delete exam', 'error');
    } finally {
      pendingOperations.delete(operationKey);
    }
  });
}

function navigateToQuestions(examId) {
  if (!examId) {
    Utils.showToast('Invalid exam ID', 'error');
    return;
  }
  try {
    window.location.href = `questions.html?exam=${encodeURIComponent(examId)}`;
  } catch (error) {
    console.error('Navigation error:', error);
    Utils.showToast('Failed to navigate to questions page', 'error');
  }
}

function navigateToResults(examId) {
  if (!examId) {
    Utils.showToast('Invalid exam ID', 'error');
    return;
  }
  try {
    window.location.href = `results.html?exam=${encodeURIComponent(examId)}`;
  } catch (error) {
    console.error('Navigation error:', error);
    Utils.showToast('Failed to navigate to results page', 'error');
  }
}

// Add event listeners with error handling
const searchInput = document.getElementById('search-input');
const statusFilter = document.getElementById('status-filter');

if (searchInput) {
  searchInput.addEventListener('input', Utils.debounce(() => {
    try {
      renderExams();
    } catch (error) {
      console.error('Search input error:', error);
    }
  }, 300));
}

if (statusFilter) {
  statusFilter.addEventListener('change', () => {
    try {
      renderExams();
    } catch (error) {
      console.error('Status filter error:', error);
    }
  });
}

// Initialize page with error handling
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadExams();
  } catch (error) {
    console.error('Page initialization error:', error);
    Utils.showToast('Failed to initialize page', 'error');
  }
});

// Fallback initialization for older browsers
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => loadExams());
} else {
  loadExams();
}