// Staff Results Page JavaScript Logic

if (!Auth.requireStaff()) {
  throw new Error('Unauthorized');
}

let currentExamId = Utils.getUrlParam('exam');
let allResults = [];
let currentGradingData = null; // { result, answers }
let currentExamData = null; // Stores selected exam details

async function loadExams() {
  try {
    const response = await API.getStaffExams({ limit: 100 });
    const exams = response.results || [];
    
    const select = document.getElementById('exam-select');
    select.innerHTML = '<option value="">Select an exam</option>' + 
      exams.map(e => `<option value="${e.id}" ${e.id === currentExamId ? 'selected' : ''}>${Utils.escapeHtml(e.title)}</option>`).join('');
    
    // Store exam data for status checks
    select._examsData = exams;
    
    if (currentExamId) {
      currentExamData = exams.find(e => e.id === currentExamId) || null;
      loadResults(currentExamId);
    }
  } catch (error) {
    Utils.showToast('Failed to load exams', 'error');
  }
}

async function loadResults(examId) {
  if (!examId) return;
  
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('analytics-section').style.display = 'block';
  document.getElementById('results-section').style.display = 'block';
  document.getElementById('action-bar').style.display = 'flex';
  
  const tbody = document.getElementById('results-tbody');
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
  
  try {
    const resultsRes = await API.getExamResults(examId, { limit: 200 });
    allResults = resultsRes.results || [];
    updateOverview();
    renderResults();
  } catch (error) {
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
            <h3 class="error-state-title">Failed to load results</h3>
            <p class="error-state-message">${Utils.escapeHtml(error.message)}</p>
            <button class="btn btn-secondary" onclick="loadResults('${examId}')">
              Retry
            </button>
          </div>
        </td>
      </tr>
    `;
  }
}

function updateOverview() {
  const total = allResults.length;
  const needsGrading = allResults.filter(r => r.grading_status !== 'fully_graded').length;
  const fullyGraded = allResults.filter(r => r.grading_status === 'fully_graded').length;
  const published = allResults.filter(r => r.is_published).length;
  
  // Check if exam is still running
  const now = new Date();
  const examRunning = currentExamData && new Date(currentExamData.end_time) > now && new Date(currentExamData.start_time) <= now;
  const examNotStarted = currentExamData && new Date(currentExamData.start_time) > now;
  
  document.getElementById('total-attempts').textContent = total;
  document.getElementById('needs-grading').textContent = needsGrading;
  document.getElementById('fully-graded').textContent = fullyGraded;
  document.getElementById('published-count').textContent = published;
  
  const pct = total > 0 ? (fullyGraded / total * 100) : 0;
  document.getElementById('grading-bar').style.width = `${pct}%`;
  document.getElementById('grading-progress-text').textContent = `${fullyGraded} / ${total} graded`;
  
  // Enable/disable publish button
  const publishBtn = document.getElementById('publish-all-btn');
  const unpublishBtn = document.getElementById('unpublish-all-btn');
  const generateBtn = document.getElementById('generate-btn');
  
  // Auto-Grade button: disable if exam is still running or not started
  if (examRunning || examNotStarted) {
    generateBtn.disabled = true;
    generateBtn.title = examRunning ? 'Cannot generate results while exam is running' : 'Exam has not started yet';
    generateBtn.style.opacity = '0.5';
  } else {
    generateBtn.disabled = false;
    generateBtn.title = '';
    generateBtn.style.opacity = '';
  }
  
  // Publish button: disable if exam running, not all graded, or no results
  if (examRunning || examNotStarted) {
    publishBtn.disabled = true;
    publishBtn.title = examRunning ? 'Cannot publish while exam is running' : 'Exam has not started yet';
  } else if (total > 0 && fullyGraded === total) {
    publishBtn.disabled = false;
    publishBtn.title = '';
  } else {
    publishBtn.disabled = true;
    publishBtn.title = `${needsGrading} student(s) still need grading`;
  }
  
  // Show unpublish if any are published
  unpublishBtn.style.display = published > 0 ? 'inline-flex' : 'none';
  
  // Update grading summary
  const summaryEl = document.getElementById('grading-summary');
  if (examRunning) {
    summaryEl.innerHTML = '<span class="badge badge-info">Exam is currently running</span>';
  } else if (examNotStarted) {
    summaryEl.innerHTML = '<span class="badge badge-ghost">Exam has not started yet</span>';
  } else if (total === 0) {
    summaryEl.innerHTML = '<span class="text-muted">No results yet. Click "Auto-Grade MCQs" to start.</span>';
  } else if (needsGrading > 0) {
    summaryEl.innerHTML = `<span class="badge badge-warning">${needsGrading} student(s) need grading</span>`;
  } else if (published === total) {
    summaryEl.innerHTML = '<span class="badge badge-success">All results published</span>';
  } else {
    summaryEl.innerHTML = '<span class="badge badge-info">All graded — ready to publish</span>';
  }
}

function getGradingBadge(gradingStatus) {
  const map = {
    'pending': '<span class="badge badge-warning">Pending</span>',
    'partially_graded': '<span class="badge badge-info">Partial</span>',
    'fully_graded': '<span class="badge badge-success">Graded</span>',
  };
  return map[gradingStatus] || '<span class="badge badge-ghost">Unknown</span>';
}

function getStatusBadge(resultStatus) {
  const map = {
    'pending': '<span class="badge badge-ghost">Pending</span>',
    'pass': '<span class="badge badge-success">Passed</span>',
    'fail': '<span class="badge badge-error">Failed</span>',
  };
  return map[resultStatus] || '<span class="badge badge-ghost">-</span>';
}

function renderResults() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const filtered = allResults.filter(r => 
    r.student_name.toLowerCase().includes(search)
  );
  
  const tbody = document.getElementById('results-tbody');
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center p-8 text-muted">No results found</td></tr>';
    return;
  }
  
  tbody.innerHTML = filtered.map(r => {
    const isFullyGraded = r.grading_status === 'fully_graded';
    
    return `
      <tr>
        <td><strong>${Utils.escapeHtml(r.student_name)}</strong></td>
        <td>${r.obtained_marks} / ${r.total_marks}</td>
        <td>
          <div class="flex items-center gap-3">
            <div class="score-bar">
              <div class="score-bar-fill" style="width: ${r.percentage}%; background: ${isFullyGraded ? (r.status === 'pass' ? 'var(--success)' : 'var(--error)') : 'var(--text-tertiary)'};"></div>
            </div>
            <span>${parseFloat(r.percentage).toFixed(1)}%</span>
          </div>
        </td>
        <td>${getGradingBadge(r.grading_status)}</td>
        <td>${getStatusBadge(r.status)}</td>
        <td>${Utils.formatDate(r.submitted_at)}</td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="openGrading('${r.id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            ${isFullyGraded ? 'Review' : 'Grade'}
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// ============ AUTO-GRADE MCQs ============

async function autoGradeMCQs() {
  if (!currentExamId) return;
  
  Utils.confirm('Auto-grade MCQ questions for all submitted students? Descriptive and coding answers will need manual grading.', async () => {
    try {
      const res = await API.generateResults(currentExamId);
      Utils.showToast(res.message || 'MCQs auto-graded!', 'success');
      loadResults(currentExamId);
    } catch (error) {
      Utils.showToast(error.message, 'error');
    }
  });
}

// ============ GRADING PANEL ============

async function openGrading(resultId) {
  try {
    const data = await API.getResultAnswers(resultId);
    currentGradingData = data;
    
    document.getElementById('grading-student-name').textContent = `Grade: ${data.student_name}`;
    document.getElementById('grading-student-info').textContent = 
      `${data.student_enrollment_id || 'N/A'} • ${data.exam_title} • ${data.grading_status === 'fully_graded' ? 'All graded' : 'Needs grading'}`;
    
    document.getElementById('grading-panel-summary').innerHTML = `
      <div class="grading-summary-cards">
        <div class="grading-summary-item">
          <span class="text-muted text-sm">Current Score</span>
          <span class="font-semibold">${data.obtained_marks} / ${data.total_marks}</span>
        </div>
        <div class="grading-summary-item">
          <span class="text-muted text-sm">Percentage</span>
          <span class="font-semibold">${parseFloat(data.percentage).toFixed(1)}%</span>
        </div>
        <div class="grading-summary-item">
          <span class="text-muted text-sm">Status</span>
          ${getGradingBadge(data.grading_status)}
        </div>
      </div>
    `;
    
    renderGradingAnswers(data);
    
    document.getElementById('grading-overlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  } catch (error) {
    Utils.showToast('Failed to load student answers: ' + error.message, 'error');
  }
}

function renderGradingAnswers(data) {
  const list = document.getElementById('grading-answers-list');
  const answers = data.answers || [];
  
  list.innerHTML = answers.map((ans, idx) => {
    const isMCQ = ans.question_type === 'mcq' || ans.question_type === 'multiple_mcq';
    const isAutoGraded = isMCQ;
    const needsGrading = !isAutoGraded && ans.score === null;
    const currentScore = ans.score !== null ? parseFloat(ans.score) : '';
    
    let studentAnswerHTML = '';
    if (isMCQ) {
      studentAnswerHTML = `
        <div class="answer-content answer-mcq">
          <span class="text-sm text-muted">Student's answer:</span>
          <span class="font-semibold">${Utils.escapeHtml(String(ans.answer || 'No answer'))}</span>
          ${ans.correct_answer ? `<span class="text-sm text-success">Correct: ${Utils.escapeHtml(String(ans.correct_answer))}</span>` : ''}
        </div>
      `;
    } else if (ans.question_type === 'coding') {
      studentAnswerHTML = `
        <div class="answer-content answer-code">
          <span class="text-sm text-muted">Student's code:</span>
          <pre class="code-block">${Utils.escapeHtml(ans.code || ans.answer || 'No code submitted')}</pre>
        </div>
      `;
    } else {
      // Descriptive
      studentAnswerHTML = `
        <div class="answer-content answer-descriptive">
          <span class="text-sm text-muted">Student's answer:</span>
          <div class="descriptive-text">${Utils.escapeHtml(String(ans.answer || 'No answer'))}</div>
          ${ans.correct_answer ? `
            <details class="sample-answer-details">
              <summary class="text-sm text-muted">View sample answer</summary>
              <div class="descriptive-text text-sm" style="margin-top: 8px;">${Utils.escapeHtml(String(ans.correct_answer))}</div>
            </details>
          ` : ''}
        </div>
      `;
    }
    
    return `
      <div class="grading-answer-card ${needsGrading ? 'needs-grading' : ''} ${isAutoGraded ? 'auto-graded' : ''}">
        <div class="grading-answer-header">
          <div class="grading-answer-q">
            <span class="question-number">Q${idx + 1}</span>
            <span class="question-type-badge badge ${isMCQ ? 'badge-ghost' : 'badge-warning'}">${ans.question_type.toUpperCase()}</span>
            <span class="text-sm text-muted">(${parseFloat(ans.max_points)} pts)</span>
          </div>
          ${isAutoGraded ? '<span class="badge badge-ghost">Auto-graded</span>' : ''}
        </div>
        <div class="grading-answer-question">${Utils.escapeHtml(ans.question_text)}</div>
        ${studentAnswerHTML}
        <div class="grading-answer-scoring">
          <div class="score-input-group">
            <label class="text-sm font-semibold">Score:</label>
            <input type="number" 
              class="form-input score-input" 
              id="score-${ans.id}" 
              data-answer-id="${ans.id}"
              data-max="${ans.max_points}"
              data-question-type="${ans.question_type}"
              value="${currentScore}" 
              min="0" 
              max="${ans.max_points}" 
              step="0.5"
              ${isAutoGraded ? 'readonly' : ''}
              placeholder="0"
              oninput="updateGradingTotal()"
            >
            <span class="text-sm text-muted">/ ${parseFloat(ans.max_points)}</span>
          </div>
          ${!isAutoGraded ? `
            <div class="feedback-group">
              <label class="text-sm font-semibold">Feedback:</label>
              <textarea class="form-input feedback-input" 
                id="feedback-${ans.id}" 
                data-answer-id="${ans.id}"
                placeholder="Optional feedback for the student..."
                rows="2"
              >${ans.feedback || ''}</textarea>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
  
  updateGradingTotal();
}

function updateGradingTotal() {
  if (!currentGradingData) return;
  const totalMarks = currentGradingData.total_marks;
  let sumScores = 0;
  
  document.querySelectorAll('.score-input').forEach(input => {
    const val = parseFloat(input.value);
    const max = parseFloat(input.dataset.max);
    
    // Clamp value to max points
    if (!isNaN(val) && !isNaN(max) && val > max) {
      input.value = max;
      Utils.showToast(`Score clamped to max ${max} points`, 'warning');
    }
    // Clamp to min 0
    if (!isNaN(val) && val < 0) {
      input.value = 0;
    }
    
    const clampedVal = parseFloat(input.value);
    if (!isNaN(clampedVal)) sumScores += clampedVal;
  });
  
  document.getElementById('grading-total').innerHTML = 
    `Total: <strong>${sumScores}</strong> / ${totalMarks} (${totalMarks > 0 ? (sumScores / totalMarks * 100).toFixed(1) : 0}%)`;
}

async function saveGrades() {
  if (!currentGradingData) return;
  
  const btn = document.getElementById('save-grades-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span> Saving...';
  
  try {
    const manualInputs = document.querySelectorAll('.score-input:not([readonly])');
    let savedCount = 0;
    
    for (const input of manualInputs) {
      const answerId = input.dataset.answerId;
      const score = parseFloat(input.value);
      
      if (isNaN(score)) continue;
      
      const feedbackEl = document.getElementById(`feedback-${answerId}`);
      const feedback = feedbackEl ? feedbackEl.value : '';
      
      // Find the question_id for this answer
      const answer = currentGradingData.answers.find(a => a.id === answerId);
      if (!answer) continue;
      
      await API.evaluateSubmission(currentGradingData.attempt_id, {
        questionId: answer.question,
        score: score,
        feedback: feedback
      });
      savedCount++;
    }
    
    Utils.showToast(`Saved ${savedCount} grade(s) successfully!`, 'success');
    closeGradingPanel();
    loadResults(currentExamId);
  } catch (error) {
    Utils.showToast('Failed to save grades: ' + error.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
      Save All Grades
    `;
  }
}

function closeGradingPanel() {
  document.getElementById('grading-overlay').style.display = 'none';
  document.body.style.overflow = '';
  currentGradingData = null;
}

// ============ PUBLISH ============

async function bulkPublish(action) {
  if (!currentExamId) return;
  const actionText = action === 'publish' ? 'PUBLISH all' : 'UNPUBLISH all';
  
  Utils.confirm(`Are you sure you want to ${actionText} results? ${action === 'publish' ? 'Students will be able to see their results.' : 'Results will be hidden from students.'}`, async () => {
    try {
      await API.bulkPublishResults(currentExamId, action);
      Utils.showToast(`Results ${action}ed successfully!`, 'success');
      loadResults(currentExamId);
    } catch (error) {
      Utils.showToast(error.message, 'error');
    }
  });
}

// ============ EVENT LISTENERS ============

document.getElementById('exam-select').addEventListener('change', (e) => {
  currentExamId = e.target.value;
  // Update current exam data reference
  const select = document.getElementById('exam-select');
  const examsData = select._examsData || [];
  currentExamData = examsData.find(ex => ex.id === currentExamId) || null;
  
  if (currentExamId) {
    loadResults(currentExamId);
  } else {
    document.getElementById('empty-state').style.display = 'block';
    document.getElementById('analytics-section').style.display = 'none';
    document.getElementById('results-section').style.display = 'none';
    document.getElementById('action-bar').style.display = 'none';
  }
});

document.getElementById('search-input').addEventListener('input', Utils.debounce(renderResults, 300));

// Close grading panel on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('grading-overlay').style.display !== 'none') {
    closeGradingPanel();
  }
});

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  loadExams();
});