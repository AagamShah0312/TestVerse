// Staff Questions Page JavaScript Logic

if (!Auth.requireStaff()) {
  throw new Error('Unauthorized');
}

const examId = Utils.getUrlParam('exam');
let currentType = 'mcq';
let examData = null;

if (!examId) {
  Utils.showToast('Invalid exam ID', 'error');
  setTimeout(() => window.location.href = 'exams.html', 2000);
}

// Load exam details for marks comparison
async function loadExamInfo() {
  try {
    examData = await API.getStaffExamDetail(examId);
    if (examData.title) {
      document.getElementById('page-title').textContent = `Questions - ${examData.title}`;
    }
    
    // Check if exam has started - disable add/delete if so
    const now = new Date();
    const examStarted = new Date(examData.start_time) <= now;
    if (examStarted) {
      const addCard = document.querySelector('.add-question-card');
      addCard.innerHTML = `
        <div style="padding: var(--space-4); text-align: center;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5" style="margin-bottom:8px;">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          <p class="text-muted text-sm" style="margin:0;">Cannot add or modify questions after exam has started</p>
        </div>
      `;
    }
  } catch (e) {
    console.warn('Could not load exam details:', e);
  }
}

function updateMarksSummary(questions) {
  const summary = document.getElementById('marks-summary');
  const status = document.getElementById('marks-status');
  const totalMarks = examData ? parseFloat(examData.total_marks) : 0;
  const questionsMarks = questions.reduce((sum, q) => sum + parseFloat(q.points || 0), 0);
  
  summary.style.display = 'block';
  
  if (totalMarks > 0) {
    const match = questionsMarks === totalMarks;
    status.innerHTML = `Marks: <strong style="color: ${match ? 'var(--success)' : 'var(--error)'}">${questionsMarks} / ${totalMarks}</strong>${match ? ' &#10003;' : ' (mismatch)'}`;
  } else {
    status.innerHTML = `Marks: <strong>${questionsMarks}</strong>`;
  }
}

// Type selector
document.getElementById('type-selector').addEventListener('click', (e) => {
  const btn = e.target.closest('.type-btn');
  if (!btn) return;
  
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentType = btn.dataset.type;
  
  const isMcq = ['mcq', 'multiple_mcq'].includes(currentType);
  document.getElementById('mcq-options').style.display = isMcq ? 'block' : 'none';
  document.getElementById('descriptive-fields').style.display = currentType === 'descriptive' ? 'block' : 'none';
  document.getElementById('coding-fields').style.display = currentType === 'coding' ? 'block' : 'none';
  
  // Toggle required attribute on MCQ options based on question type
  document.querySelectorAll('.option-input').forEach(input => {
    if (isMcq) {
      input.setAttribute('required', '');
    } else {
      input.removeAttribute('required');
    }
  });
});

// Add option
document.getElementById('add-option-btn').addEventListener('click', () => {
  const list = document.getElementById('options-list');
  const idx = list.children.length;
  const row = document.createElement('div');
  row.className = 'option-row';
  row.innerHTML = `
    <input type="radio" name="correct" value="${idx}">
    <input type="text" class="form-input option-input" placeholder="Option ${idx + 1}" required>
    <button type="button" class="btn btn-ghost btn-sm remove-option">×</button>
  `;
  list.appendChild(row);
});

// Remove option
document.getElementById('options-list').addEventListener('click', (e) => {
  if (e.target.classList.contains('remove-option')) {
    e.target.closest('.option-row').remove();
  }
});

// Submit question
document.getElementById('question-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const text = document.getElementById('q-text').value.trim();
  const marks = parseFloat(document.getElementById('q-marks').value);
  
  // Client-side marks overflow check
  if (examData && examData.total_marks) {
    const totalMarks = parseFloat(examData.total_marks);
    const currentMarks = parseFloat(examData.questions_total_marks || 0);
    const remaining = totalMarks - currentMarks;
    if (marks > remaining) {
      Utils.showToast(`Cannot add: marks (${marks}) would exceed exam total (${totalMarks}). Remaining: ${remaining}`, 'error');
      return;
    }
  }
  
  const questionData = { type: currentType, text, points: marks };
  
  if (['mcq', 'multiple_mcq'].includes(currentType)) {
    const optionInputs = document.querySelectorAll('.option-input');
    const correctIdx = document.querySelector('input[name="correct"]:checked')?.value;
    
    questionData.options = Array.from(optionInputs).map((input, i) => ({
      id: i + 1,
      text: input.value.trim(),
      isCorrect: i == correctIdx
    }));
  } else if (currentType === 'descriptive') {
    questionData.sample_answer = document.getElementById('expected-answer').value.trim();
  } else if (currentType === 'coding') {
    questionData.coding_language = document.getElementById('code-lang').value;
  }
  
  const addBtn = document.getElementById('add-btn');
  Utils.setButtonLoading(addBtn, true);
  
  try {
    await API.addQuestion(examId, questionData);
    Utils.showToast('Question added!', 'success');
    document.getElementById('question-form').reset();
    // Refresh exam data for updated marks totals
    await loadExamInfo();
    loadQuestions();
  } catch (error) {
    Utils.showToast(error.message, 'error');
  } finally {
    Utils.setButtonLoading(addBtn, false);
  }
});

async function loadQuestions() {
  const list = document.getElementById('questions-list');
  
  // Show loading state
  list.innerHTML = `
    <div class="loading-state">
      <div class="skeleton" style="height: 70px; border-radius: var(--radius-lg); margin-bottom: 12px;"></div>
      <div class="skeleton" style="height: 70px; border-radius: var(--radius-lg); margin-bottom: 12px;"></div>
      <div class="skeleton" style="height: 70px; border-radius: var(--radius-lg);"></div>
    </div>
  `;
  
  try {
    const response = await API.getExamQuestions(examId);
    const questions = response.results || response || [];
    
    document.getElementById('q-count').textContent = questions.length;
    document.getElementById('exam-info').textContent = `${questions.length} questions`;
    updateMarksSummary(questions);
    
    if (questions.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
          </div>
          <h3 class="empty-state-title">No questions yet</h3>
          <p class="empty-state-description">Add your first question using the form above</p>
        </div>
      `;
      return;
    }
    
    list.innerHTML = questions.map((q, i) => {
      const examStarted = examData && new Date(examData.start_time) <= new Date();
      return `
      <div class="question-item">
        <div class="question-info">
          <h4>Q${i + 1}. ${Utils.escapeHtml(q.text.substring(0, 100))}${q.text.length > 100 ? '...' : ''}</h4>
          <div class="question-meta">
            <span class="badge badge-primary">${q.type.toUpperCase()}</span>
            <span>${q.points} points</span>
          </div>
        </div>
        ${examStarted ? '' : `
        <button class="btn btn-ghost btn-sm text-error" onclick="deleteQuestion('${q.id}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
        `}
      </div>
    `}).join('');
  } catch (error) {
    list.innerHTML = `
      <div class="error-state">
        <div class="error-state-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4M12 16h.01"/>
          </svg>
        </div>
        <h3 class="error-state-title">Failed to load questions</h3>
        <p class="error-state-message">${Utils.escapeHtml(error.message)}</p>
        <button class="btn btn-secondary" onclick="loadQuestions()">
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

async function deleteQuestion(questionId) {
  Utils.confirm('Delete this question?', async () => {
    try {
      await API.deleteQuestion(questionId);
      Utils.showToast('Question deleted', 'success');
      // Refresh exam data for updated marks totals
      await loadExamInfo();
      loadQuestions();
    } catch (error) {
      Utils.showToast(error.message, 'error');
    }
  });
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  loadExamInfo().then(() => loadQuestions());
});