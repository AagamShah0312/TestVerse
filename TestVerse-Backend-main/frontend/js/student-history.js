// Student History Page JavaScript Logic

if (!Auth.requireAuth()) {
  throw new Error('Unauthorized');
}

let allAttempts = [];
let currentFilter = 'all';
let currentReviewExamId = null;

// Load user info for branch badge
async function loadUserInfo() {
  try {
    const user = await API.getProfile();
    document.getElementById('branch-badge').textContent = user.department || 'Unassigned';
  } catch (error) {
    console.error('Error loading user:', error);
  }
}

// Load exam attempts (exams student has actually taken)
async function loadAttempts() {
  const container = document.getElementById('attempts-container');
  
  container.innerHTML = `
    <div class="loading-state" style="padding: 3rem; text-align: center;">
      <div class="skeleton" style="height: 100px; margin-bottom: 16px;"></div>
      <div class="skeleton" style="height: 100px; margin-bottom: 16px;"></div>
      <div class="skeleton" style="height: 100px;"></div>
    </div>
  `;
  
  try {
    // Get exam attempts (exams student has actually taken)
    const response = await API.getMyExamAttempts({ page_size: 100 });
    const attempts = response.results || response || [];
    
    allAttempts = [];
    
    // Process each attempt
    for (const attempt of attempts) {
      const exam = attempt.exam;
      
      // Try to get result (may not exist or may not be published)
      let resultData = null;
      let hasResult = false;
      
      try {
        resultData = await API.getExamResult(exam.id);
        hasResult = true;
      } catch (e) {
        // No result found or not published - this is expected
        hasResult = false;
      }
      
      // Create attempt object with appropriate status
      const attemptObj = {
        exam_id: exam.id,
        exam_title: exam.title,
        total_marks: exam.total_marks,
        passing_marks: exam.passing_marks,
        duration: exam.duration,
        submitted_at: attempt.submit_time,
        has_result: hasResult,
        is_published: hasResult ? resultData.is_published : false
      };
      
      // Add result data if available
      if (hasResult && resultData.is_published) {
        attemptObj.obtained_marks = resultData.obtained_marks;
        attemptObj.percentage = resultData.percentage;
        attemptObj.status = resultData.status;
      } else {
        // Show pending status
        attemptObj.obtained_marks = 0;
        attemptObj.percentage = 0;
        attemptObj.status = 'pending';
      }
      
      allAttempts.push(attemptObj);
    }
    
    updateStats();
    renderAttempts();
    
  } catch (error) {
    console.error('Error loading attempts:', error);
    container.innerHTML = `
      <div class="error-state">
        <div class="error-state-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4M12 16h.01"/>
          </svg>
        </div>
        <h3 class="error-state-title">Failed to load exam history</h3>
        <p class="error-state-message">${Utils.escapeHtml(error.message)}</p>
        <button class="btn btn-secondary" onclick="loadAttempts()">Retry</button>
      </div>
    `;
  }
}

// Update stats
function updateStats() {
  const total = allAttempts.length;
  const passed = allAttempts.filter(a => a.obtained_marks >= a.passing_marks).length;
  const failed = total - passed;
  
  // Calculate average score percentage safely
  let avgScore = 0;
  if (total > 0) {
    const sumPercentages = allAttempts.reduce((sum, a) => {
      if (a.total_marks && a.total_marks > 0) {
        return sum + (a.obtained_marks / a.total_marks * 100);
      }
      return sum;
    }, 0);
    
    // Count valid attempts for average calculation
    const validAttempts = allAttempts.filter(a => a.total_marks && a.total_marks > 0).length;
    avgScore = validAttempts > 0 ? Math.round(sumPercentages / validAttempts) : 0;
  }
  
  document.getElementById('total-attempts').textContent = total;
  document.getElementById('passed-count').textContent = passed;
  document.getElementById('failed-count').textContent = failed;
  document.getElementById('avg-score').textContent = avgScore + '%';
}

// Filter attempts
function filterAttempts(filter) {
  currentFilter = filter;
  
  document.querySelectorAll('.filter-tab').forEach(tab => tab.classList.remove('active'));
  document.querySelector(`[onclick="filterAttempts('${filter}')"]`).classList.add('active');
  
  renderAttempts();
}

// Render attempts
function renderAttempts() {
  const container = document.getElementById('attempts-container');
  const search = document.getElementById('search-input').value.toLowerCase();
  
  let filtered = allAttempts;
  
  // Apply filter
  if (currentFilter === 'passed') {
    filtered = filtered.filter(a => a.obtained_marks >= a.passing_marks);
  } else if (currentFilter === 'failed') {
    filtered = filtered.filter(a => a.obtained_marks < a.passing_marks);
  }
  
  // Apply search
  if (search) {
    filtered = filtered.filter(a => a.exam_title.toLowerCase().includes(search));
  }
  
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 3rem; text-align: center;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 16px; color: var(--text-tertiary);">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
          <rect x="9" y="3" width="6" height="4" rx="2"/>
        </svg>
        <h3 class="text-lg font-medium">No exam attempts found</h3>
        <p class="text-muted">Complete some exams to see your history here.</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = filtered.map(attempt => {
    const percentage = attempt.total_marks && attempt.total_marks > 0 
      ? Math.round((attempt.obtained_marks / attempt.total_marks) * 100)
      : 0;
    const passed = attempt.status === 'pass';
    const isPending = attempt.status === 'pending';
    
    return `
      <div class="attempt-card">
        <div class="attempt-header">
          <div>
            <div class="attempt-title">${Utils.escapeHtml(attempt.exam_title)}</div>
            <div class="attempt-date">
              Completed on ${Utils.formatDate(attempt.submitted_at)}
            </div>
          </div>
          ${isPending ? 
            `<div class="badge badge-warning">Result Pending</div>` :
            `<div class="score-circle ${passed ? 'pass' : 'fail'}">
              ${percentage}%
            </div>`
          }
        </div>
        
        <div class="attempt-stats">
          <div class="attempt-stat">
            <div class="attempt-stat-value">${isPending ? '-' : attempt.obtained_marks}</div>
            <div class="attempt-stat-label">Score</div>
          </div>
          <div class="attempt-stat">
            <div class="attempt-stat-value">${attempt.total_marks}</div>
            <div class="attempt-stat-label">Total</div>
          </div>
          <div class="attempt-stat">
            <div class="attempt-stat-value">${attempt.passing_marks}</div>
            <div class="attempt-stat-label">Passing</div>
          </div>
          <div class="attempt-stat">
            <div class="attempt-stat-value">${attempt.duration}m</div>
            <div class="attempt-stat-label">Duration</div>
          </div>
        </div>
        
        <div class="attempt-actions">
          ${isPending ? 
            `<span class="text-muted">Waiting for results to be published by staff</span>` :
            `<button class="btn btn-secondary btn-sm" onclick="openReviewModal('${attempt.exam_id}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              Review Answers
            </button>
            <button class="btn btn-ghost btn-sm" onclick="downloadPDFForExam('${attempt.exam_id}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download PDF
            </button>
            <span class="badge ${passed ? 'badge-active' : 'badge-inactive'}" style="margin-left: auto;">
              ${passed ? 'PASSED' : 'FAILED'}
            </span>`
          }
        </div>
      </div>
    `;
  }).join('');
}

// Open review modal
async function openReviewModal(examId) {
  currentReviewExamId = examId;
  const modal = document.getElementById('review-modal');
  const content = document.getElementById('review-content');
  
  content.innerHTML = '<div class="spinner" style="margin: 2rem auto;"></div>';
  modal.classList.add('active');
  
  try {
    const result = await API.getExamResult(examId);
    
    if (!result.answers || result.answers.length === 0) {
      content.innerHTML = `
        <div class="text-center text-muted" style="padding: 2rem;">
          No answer details available for this exam.
        </div>
      `;
      return;
    }
    
    content.innerHTML = result.answers.map((answer, i) => `
      <div class="answer-item">
        <div class="answer-question">
          <strong>Q${i + 1}.</strong> ${Utils.escapeHtml(answer.question_text || 'Question ' + (i + 1))}
        </div>
        <div class="answer-response">
          <strong>Your Answer:</strong> ${Utils.escapeHtml(answer.student_answer || 'No answer')}
        </div>
        ${answer.score_obtained !== undefined ? `
          <div class="text-sm text-muted">Marks: ${answer.score_obtained}/${answer.max_points || '-'}</div>
        ` : ''}
        ${answer.feedback ? `
          <div class="text-sm text-muted">Feedback: ${Utils.escapeHtml(answer.feedback)}</div>
        ` : ''}
      </div>
    `).join('');
    
  } catch (error) {
    console.error('Error loading answers:', error);
    content.innerHTML = `
      <div class="text-center text-muted" style="padding: 2rem;">
        Failed to load answers: ${Utils.escapeHtml(error.message)}
      </div>
    `;
  }
}

// Close review modal
function closeReviewModal() {
  document.getElementById('review-modal').classList.remove('active');
  currentReviewExamId = null;
}

// Download PDF for specific exam
function downloadPDFForExam(examId) {
  const attempt = allAttempts.find(a => a.exam_id === examId);
  if (!attempt) return;
  
  generatePDF(attempt);
}

// Download PDF from modal
function downloadPDF() {
  if (!currentReviewExamId) return;
  downloadPDFForExam(currentReviewExamId);
}

// Generate PDF (simple text-based)
function generatePDF(attempt) {
  const percentage = attempt.total_marks && attempt.total_marks > 0 
    ? Math.round((attempt.obtained_marks / attempt.total_marks) * 100)
    : 0;
  const passed = attempt.obtained_marks >= attempt.passing_marks;
  
  const content = `
UNIVERSITY EXAM PORTAL - RESULT CERTIFICATE
============================================

Exam: ${attempt.exam_title}
Date: ${new Date(attempt.submitted_at || attempt.created_at).toLocaleString()}

RESULT: ${passed ? 'PASSED' : 'FAILED'}

Score: ${attempt.obtained_marks} / ${attempt.total_marks} (${percentage}%)
Passing Marks: ${attempt.passing_marks}
Duration: ${attempt.duration} minutes

---
This is a computer-generated document.
Generated on: ${new Date().toLocaleString()}
  `.trim();
  
  // Create blob and download
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Result_${attempt.exam_title.replace(/\s+/g, '_')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  
  Utils.showToast('Result downloaded successfully', 'success');
}

// Search handler
document.getElementById('search-input').addEventListener('input', Utils.debounce(renderAttempts, 300));

// Close modal on overlay click
document.getElementById('review-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeReviewModal();
});

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  loadUserInfo();
  loadAttempts();
});