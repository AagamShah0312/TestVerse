/**
 * Exam Taking Logic - University Exam Portal
 */

// Protect route
if (!Auth.requireStudent()) {
  throw new Error('Unauthorized');
}

// State
let examId = Utils.getUrlParam('id');
let attemptData = null;
let questions = [];
let answers = {};
let currentQuestionIndex = 0;
let timeRemaining = 0;
let examEndTime = null;
let timerInterval = null;
let autoSaveInterval = null;

// Initialize exam
async function initExam() {
  if (!examId || examId === 'null' || examId === 'undefined') {
    Utils.showToast('Invalid exam ID', 'error');
    setTimeout(() => window.location.href = 'dashboard.html', 2000);
    return;
  }
  
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(examId)) {
    Utils.showToast('Invalid exam ID format', 'error');
    setTimeout(() => window.location.href = 'dashboard.html', 2000);
    return;
  }
  
  const container = document.getElementById('question-container');
  
  // Show loading state
  container.innerHTML = `
    <div class="loading-state text-center p-8">
      <div class="spinner" style="width: 48px; height: 48px; margin: 0 auto;"></div>
      <p class="text-muted mt-4">Loading exam...</p>
    </div>
  `;
  
  try {
    // Start or get attempt
    attemptData = await API.startExamAttempt(examId);
    
    if (!attemptData) {
      throw new Error('Invalid response from server');
    }
    
    questions = Array.isArray(attemptData.questions) ? attemptData.questions : [];
    timeRemaining = typeof attemptData.time_remaining_seconds === 'number' ? attemptData.time_remaining_seconds : 0;
    
    if (questions.length === 0) {
      throw new Error('No questions found for this exam');
    }
    
    // Check for duplicate question IDs
    const questionIds = questions.map(q => q.id);
    const uniqueIds = [...new Set(questionIds)];
    if (questionIds.length !== uniqueIds.length) {
      console.warn('Duplicate question IDs detected, deduplicating...');
      questions = questions.filter((q, index) => questionIds.indexOf(q.id) === index);
    }
    
    // Store the absolute exam end time from server
    if (attemptData.endTime) {
      examEndTime = new Date(attemptData.endTime);
    }
    
    document.getElementById('exam-title').textContent = 'Exam in Progress';
    if (questions.length > 0) {
      document.getElementById('total-count').textContent = questions.length;
    }
    
    // Initialize answers from saved data
    if (questions.length > 0) {
      questions.forEach(q => {
        if (q.type === 'coding') {
          if (q.student_code) answers[q.id] = q.student_code;
        } else if (q.student_answer !== null && q.student_answer !== undefined) {
          if (q.type === 'mcq' || q.type === 'multiple_mcq') {
            if (typeof q.student_answer === 'number') {
              answers[q.id] = q.student_answer;
            } else if (typeof q.student_answer === 'string' && !isNaN(q.student_answer)) {
              const optionId = parseInt(q.student_answer);
              if (q.options && q.options.some(opt => opt.id === optionId)) {
                answers[q.id] = optionId;
              } else {
                const matchingOption = q.options.find(opt => opt.text === q.student_answer);
                answers[q.id] = matchingOption ? matchingOption.id : q.student_answer;
              }
            } else {
              const matchingOption = q.options.find(opt => opt.text === q.student_answer);
              answers[q.id] = matchingOption ? matchingOption.id : q.student_answer;
            }
          } else {
            answers[q.id] = q.student_answer;
          }
        }
      });
    }
        
    // Initialize security
    if (questions.length > 0) {
      ExamSecurity.init(examId);
    }
    
    // Start timer and auto-save
    if (questions.length > 0) {
      startTimer();
      startAutoSave();
    }
    
    // Render
    if (questions.length > 0) {
      renderQuestionNav();
      renderQuestion();
      updateAnsweredCount();
      document.getElementById('question-actions').style.display = 'flex';
    }
    
  } catch (error) {
    console.error('Error starting exam:', error);
    container.innerHTML = `
      <div class="error-state">
        <div class="error-state-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4M12 16h.01"/>
          </svg>
        </div>
        <h3 class="error-state-title">Failed to load exam</h3>
        <p class="error-state-message">${Utils.escapeHtml(error.message)}</p>
        <div class="flex gap-4 justify-center">
          <button class="btn btn-secondary" onclick="initExam()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 4v6h6M23 20v-6h-6"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
            </svg>
            Retry
          </button>
          <a href="dashboard.html" class="btn btn-ghost">Back to Dashboard</a>
        </div>
      </div>
    `;
  }
}

// Timer
function startTimer() {
  updateTimerDisplay();
  
  timerInterval = setInterval(() => {
    if (examEndTime) {
      const now = new Date();
      timeRemaining = Math.max(0, Math.floor((examEndTime - now) / 1000));
    } else {
      timeRemaining = Math.max(0, timeRemaining - 1);
    }
    
    updateTimerDisplay();
    
    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      autoSubmit();
    }
  }, 1000);
}

function updateTimerDisplay() {
  if (questions.length === 0) return;
  
  const timerEl = document.getElementById('timer');
  const display = document.getElementById('timer-display');
  
  const displayTime = Math.max(0, timeRemaining);
  display.textContent = Utils.formatTime(displayTime);
  
  timerEl.classList.remove('exam-timer-warning', 'exam-timer-danger');
  
  if (timeRemaining <= 60) {
    timerEl.classList.add('exam-timer-danger');
  } else if (timeRemaining <= 300) {
    timerEl.classList.add('exam-timer-warning');
  }
}

// Auto-save
function startAutoSave() {
  if (questions.length === 0) return;
  autoSaveInterval = setInterval(saveCurrentAnswer, CONFIG.AUTO_SAVE_INTERVAL);
}

async function saveCurrentAnswer() {
  if (questions.length === 0) return;
  
  const question = questions[currentQuestionIndex];
  if (!question || !answers[question.id]) return;
  
  const indicator = document.getElementById('auto-save-status');
  if (!indicator) return;
  
  indicator.className = 'auto-save-indicator saving';
  indicator.querySelector('span').textContent = 'Saving...';
  
  try {
    if (question.type === 'coding') {
      await API.saveAnswer(examId, question.id, null, answers[question.id]);
    } else {
      await API.saveAnswer(examId, question.id, answers[question.id]);
    }
    indicator.className = 'auto-save-indicator saved';
    indicator.querySelector('span').textContent = 'Saved';
    
    setTimeout(() => {
      if (indicator) {
        indicator.className = 'auto-save-indicator';
        indicator.querySelector('span').textContent = 'Auto-save enabled';
      }
    }, 2000);
  } catch (e) {
    console.error('Auto-save error:', e);
    indicator.className = 'auto-save-indicator';
    indicator.querySelector('span').textContent = 'Save failed - retrying...';
  }
}

function renderQuestion() {
  if (questions.length === 0) return;
  
  const question = questions[currentQuestionIndex];
  if (!question) return;
  
  // Clean up existing Monaco editors
  const existingEditorElements = document.querySelectorAll('[id^="monaco-editor-"]');
  existingEditorElements.forEach(element => {
    if (element.editorInstance) {
      if (element.subscription && typeof element.subscription.dispose === 'function') {
        element.subscription.dispose();
      }
      element.editorInstance.dispose();
      element.editorInstance = null;
      element.subscription = null;
    }
  });
  
  const container = document.getElementById('question-container');
  
  // Question type configuration
  const typeLabels = {
    'mcq': 'Multiple Choice',
    'multiple_mcq': 'Multiple Select',
    'descriptive': 'Descriptive',
    'coding': 'Coding'
  };
  const typeBadgeClasses = {
    'mcq': 'type-badge-mcq',
    'multiple_mcq': 'type-badge-mcq',
    'descriptive': 'type-badge-descriptive',
    'coding': 'type-badge-coding'
  };
  const typeLabel = typeLabels[question.type] || question.type;
  const typeBadgeClass = typeBadgeClasses[question.type] || 'type-badge-mcq';
  
  let answerHTML = '';
  let questionCardClass = 'question-card animate-fadeIn';
  
  if (question.type === 'mcq' || question.type === 'multiple_mcq') {
    const optionsArray = Array.isArray(question.options) ? question.options : [];
    const optionLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    answerHTML = `
      <div class="mcq-instruction">Select the correct answer:</div>
      <div class="question-options">
        ${optionsArray.map((opt, idx) => `
          <label class="option-item ${String(answers[question.id]) === String(opt.id) ? 'selected' : ''}" data-option-id="${opt.id}">
            <div class="option-letter">${optionLetters[idx] || (idx + 1)}</div>
            <div class="option-radio"></div>
            <span class="option-text">${Utils.escapeHtml(opt.text || '')}</span>
          </label>
        `).join('')}
      </div>
    `;
  } else if (question.type === 'descriptive') {
    const currentAnswer = answers[question.id] || '';
    answerHTML = `
      <div class="descriptive-answer-section">
        <div class="descriptive-header">
          <span class="descriptive-label">Your Answer</span>
          <span class="char-count" id="char-count">${currentAnswer.length} characters</span>
        </div>
        <textarea 
          class="form-input textarea-answer" 
          id="answer-input"
          placeholder="Type your detailed answer here..."
          rows="10"
        >${Utils.escapeHtml(currentAnswer)}</textarea>
      </div>
    `;
  } else if (question.type === 'coding') {
    questionCardClass += ' question-card-coding';
    answerHTML = `
      <div class="form-group">
        <div class="code-question-wrapper">
          <div class="code-editor-header">
            <span class="form-label">Write your code below</span>
            <span class="language-badge">${Utils.escapeHtml(question.coding_language || 'Python')}</span>
          </div>
          <div id="editor-container-${question.id}" class="code-editor-container">
            <div id="monaco-editor-${question.id}" class="monaco-editor"></div>
          </div>
          <div class="code-editor-status">
            <span>Language: ${Utils.escapeHtml(question.coding_language || 'Python')}</span>
            <span>Auto-save enabled</span>
          </div>
        </div>
      </div>
    `;
  }
  
  container.innerHTML = `
    <div class="${questionCardClass}">
      <div class="question-header">
        <div class="question-header-left">
          <span class="question-number">Question ${currentQuestionIndex + 1} of ${questions.length}</span>
          <span class="question-type-badge ${typeBadgeClass}">${typeLabel}</span>
        </div>
        <span class="question-marks">${question.points} marks</span>
      </div>
      <div class="question-text">${Utils.escapeHtml(question.text || '')}</div>
      ${question.type === 'coding' && question.sample_input ? `
        <div class="sample-io">
          <div class="sample-io-item">
            <div class="sample-io-label">Sample Input</div>
            <pre class="sample-io-content">${Utils.escapeHtml(question.sample_input)}</pre>
          </div>
          ${question.sample_output ? `
          <div class="sample-io-item">
            <div class="sample-io-label">Expected Output</div>
            <pre class="sample-io-content">${Utils.escapeHtml(question.sample_output)}</pre>
          </div>
          ` : ''}
        </div>
      ` : ''}
      ${answerHTML}
    </div>
  `;
  
  // Event listeners
  if (question.type === 'mcq' || question.type === 'multiple_mcq') {
    const options = container.querySelectorAll('.option-item');
    options.forEach(opt => {
      const clone = opt.cloneNode(true);
      opt.parentNode.replaceChild(clone, opt);
      clone.addEventListener('click', () => selectOption(clone.dataset.optionId));
    });
  } else if (question.type === 'coding') {
    initializeCodingEditor(question);
  } else {
    const input = document.getElementById('answer-input');
    if (input) {
      const newInput = input.cloneNode(true);
      input.parentNode.replaceChild(newInput, input);
      newInput.addEventListener('input', handleAnswerInput);
    }
  }
  
  // Update nav buttons
  document.getElementById('prev-btn').disabled = currentQuestionIndex === 0;
  const nextBtn = document.getElementById('next-btn');
  if (currentQuestionIndex === questions.length - 1) {
    nextBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Finish Exam
    `;
  } else {
    nextBtn.innerHTML = `
      Next
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    `;
  }
  
  updateQuestionNav();
}

function initializeCodingEditor(question) {
  const editorElement = document.getElementById(`monaco-editor-${question.id}`);
  if (editorElement && !editorElement.editorInstance) {
    const languageMap = {
      'python': 'python',
      'java': 'java',
      'javascript': 'javascript',
      'js': 'javascript',
      'cpp': 'cpp',
      'c++': 'cpp',
      'c': 'c',
      'typescript': 'typescript',
      'ts': 'typescript',
      'html': 'html',
      'css': 'css',
      'sql': 'sql'
    };
    const language = languageMap[(question.coding_language || 'python').toLowerCase()] || 'python';
    
    let retryCount = 0;
    const maxRetries = 20;
    
    const initializeEditor = () => {
      if (!editorElement.offsetParent) {
        retryCount++;
        if (retryCount >= maxRetries) {
          console.error('Monaco editor element not visible after retries, using fallback');
          createFallbackEditor(editorElement, question);
          return;
        }
        setTimeout(initializeEditor, 50);
        return;
      }
      
      initializeMonacoEditor(editorElement, language, answers[question.id] || '')
        .then(editor => {
          editorElement.editorInstance = editor;
          const subscription = editorElement.editorInstance.onDidChangeModelContent(() => {
            answers[question.id] = editorElement.editorInstance.getValue();
            updateAnsweredCount();
          });
          editorElement.subscription = subscription;
        })
        .catch(error => {
          console.error('Failed to initialize Monaco Editor:', error);
          createFallbackEditor(editorElement, question);
        });
    };
    
    initializeEditor();
  }
}

function createFallbackEditor(editorElement, question) {
  const fallbackContainer = document.createElement('div');
  fallbackContainer.className = 'code-question-wrapper';
  
  const headerDiv = document.createElement('div');
  headerDiv.className = 'code-editor-header';
  headerDiv.innerHTML = `
    <span class="form-label">Coding Question</span>
    <span class="language-badge">${Utils.escapeHtml(question.coding_language || 'Python')}</span>
  `;
  
  const textarea = document.createElement('textarea');
  textarea.className = 'form-input textarea-answer code-fallback';
  textarea.placeholder = 'Write your code here...';
  textarea.value = answers[question.id] || '';
  textarea.style.width = '100%';
  textarea.style.height = '400px';
  textarea.style.fontFamily = 'var(--font-mono), monospace';
  
  const statusDiv = document.createElement('div');
  statusDiv.className = 'code-editor-status';
  statusDiv.innerHTML = `
    <span>Language: ${Utils.escapeHtml(question.coding_language || 'Python')}</span>
    <span>Using fallback editor</span>
  `;
  
  fallbackContainer.appendChild(headerDiv);
  fallbackContainer.appendChild(textarea);
  fallbackContainer.appendChild(statusDiv);
  
  editorElement.parentElement.replaceWith(fallbackContainer);
  
  textarea.addEventListener('input', (e) => {
    answers[question.id] = e.target.value;
    updateAnsweredCount();
  });
}

function handleAnswerInput(e) {
  if (questions.length === 0) return;
  
  const question = questions[currentQuestionIndex];
  if (question) {
    answers[question.id] = e.target.value;
    updateAnsweredCount();
    const charCount = document.getElementById('char-count');
    if (charCount) {
      charCount.textContent = `${e.target.value.length} characters`;
    }
  }
}

function selectOption(optionId) {
  if (questions.length === 0) return;
  
  const question = questions[currentQuestionIndex];
  if (!question) return;
  
  answers[question.id] = optionId;
  
  document.querySelectorAll('.option-item').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.optionId === optionId);
  });
  
  updateAnsweredCount();
  saveCurrentAnswer();
}

// Question navigation
function renderQuestionNav() {
  if (questions.length === 0) return;
  
  const nav = document.getElementById('question-nav');
  nav.innerHTML = questions.map((q, i) => `
    <button class="nav-item ${i === currentQuestionIndex ? 'current' : ''} ${answers[q.id] ? 'answered' : ''}" data-index="${i}">
      ${i + 1}
    </button>
  `).join('');
  
  nav.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      if (questions.length === 0) return;
      saveCurrentAnswer();
      currentQuestionIndex = parseInt(btn.dataset.index);
      renderQuestion();
    });
  });
}

function updateQuestionNav() {
  if (questions.length === 0) return;
  
  document.querySelectorAll('.nav-item').forEach((btn, i) => {
    const q = questions[i];
    btn.className = `nav-item ${i === currentQuestionIndex ? 'current' : ''} ${answers[q.id] ? 'answered' : ''}`;
  });
}

function updateAnsweredCount() {
  if (questions.length === 0) return;
  
  const count = Object.keys(answers).filter(k => answers[k]).length;
  document.getElementById('answered-count').textContent = count;
}

// Navigation
document.getElementById('prev-btn').addEventListener('click', () => {
  if (currentQuestionIndex > 0 && questions.length > 0) {
    saveCurrentAnswer();
    currentQuestionIndex--;
    renderQuestion();
    updateQuestionNav();
  }
});

document.getElementById('next-btn').addEventListener('click', () => {
  saveCurrentAnswer();
  if (currentQuestionIndex < questions.length - 1 && questions.length > 0) {
    currentQuestionIndex++;
    renderQuestion();
    updateQuestionNav();
  } else if (questions.length > 0) {
    const answered = Object.keys(answers).filter(k => answers[k]).length;
    const unanswered = questions.length - answered;
    
    let message = 'Are you sure you want to finish the exam?';
    if (unanswered > 0) {
      message = `You have ${unanswered} unanswered question(s). Are you sure you want to finish?`;
    }
    
    Utils.confirm(message, submitExam);
  }
});

// Submit
document.getElementById('submit-btn').addEventListener('click', () => {
  if (questions.length === 0) return;
  
  const answered = Object.keys(answers).filter(k => answers[k]).length;
  const unanswered = questions.length - answered;
  
  let message = 'Are you sure you want to submit the exam?';
  if (unanswered > 0) {
    message = `You have ${unanswered} unanswered question(s). Are you sure you want to submit?`;
  }
  
  Utils.confirm(message, submitExam);
});

let isSubmitting = false;
let hasSubmitted = false;

async function saveAllAnswers() {
  const savePromises = [];
  API._suppressToasts = true;
  
  for (const question of questions) {
    const answer = answers[question.id];
    if (!answer) continue;
    
    try {
      if (question.type === 'coding') {
        savePromises.push(API.saveAnswer(examId, question.id, null, answer));
      } else {
        savePromises.push(API.saveAnswer(examId, question.id, answer));
      }
    } catch (e) {
      // Ignore individual save errors
    }
  }
  
  try {
    await Promise.allSettled(savePromises);
  } catch (e) {
    console.warn('Some answers failed to save:', e);
  } finally {
    API._suppressToasts = false;
  }
}

async function submitExam() {
  if (isSubmitting || hasSubmitted) return;
  isSubmitting = true;
  hasSubmitted = true;
  
  try {
    clearInterval(timerInterval);
    clearInterval(autoSaveInterval);
    
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
    }
    
    // Capture current Monaco editor value
    const question = questions[currentQuestionIndex];
    if (question && question.type === 'coding') {
      const editorElement = document.getElementById(`monaco-editor-${question.id}`);
      if (editorElement && editorElement.editorInstance) {
        answers[question.id] = editorElement.editorInstance.getValue();
      }
    }
    
    // Clean up Monaco editors
    const existingEditorElements = document.querySelectorAll('[id^="monaco-editor-"]');
    existingEditorElements.forEach(element => {
      if (element.editorInstance) {
        if (element.subscription && typeof element.subscription.dispose === 'function') {
          element.subscription.dispose();
        }
        element.editorInstance.dispose();
        element.editorInstance = null;
        element.subscription = null;
      }
    });
    
    ExamSecurity.destroy();
    
    await saveAllAnswers();
    window.onbeforeunload = null;
    
    const response = await API.submitExam(examId);
    Utils.showToast(response.message || 'Exam submitted successfully!', 'success');
    
    setTimeout(() => {
      window.location.href = CONFIG.ROUTES.STUDENT_RESULTS;
    }, 1500);
  } catch (error) {
    console.error('Submit error:', error);
    
    try {
      const retryResponse = await API.submitExam(examId);
      Utils.showToast(retryResponse.message || 'Exam submitted successfully!', 'success');
      window.onbeforeunload = null;
      setTimeout(() => {
        window.location.href = CONFIG.ROUTES.STUDENT_RESULTS;
      }, 1500);
      return;
    } catch (retryError) {
      console.error('Submit retry also failed:', retryError);
    }
    
    isSubmitting = false;
    hasSubmitted = false;
    Utils.showToast(error.message || 'Failed to submit exam. Please try again.', 'error');
    
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Exam';
    }
    
    startTimer();
    startAutoSave();
  }
}

function autoSubmit() {
  clearInterval(timerInterval);
  clearInterval(autoSaveInterval);
  
  const question = questions[currentQuestionIndex];
  if (question && question.type === 'coding') {
    const editorElement = document.getElementById(`monaco-editor-${question.id}`);
    if (editorElement && editorElement.editorInstance) {
      answers[question.id] = editorElement.editorInstance.getValue();
    }
  }
  
  const existingEditorElements = document.querySelectorAll('[id^="monaco-editor-"]');
  existingEditorElements.forEach(element => {
    if (element.editorInstance) {
      if (element.subscription && typeof element.subscription.dispose === 'function') {
        element.subscription.dispose();
      }
      element.editorInstance.dispose();
      element.editorInstance = null;
      element.subscription = null;
    }
  });
  
  Utils.showToast('Time is up! Auto-submitting your exam...', 'warning');
  
  (async () => {
    try {
      await submitExam();
    } catch (e) {
      console.error('Auto-submit failed:', e);
      Utils.showToast('Auto-submit completed. Redirecting to results...', 'info');
      window.onbeforeunload = null;
      setTimeout(() => {
        window.location.href = CONFIG.ROUTES.STUDENT_RESULTS;
      }, 2000);
    }
  })();
}

// Prevent leaving
window.onbeforeunload = (e) => {
  if (!isSubmitting) {
    e.preventDefault();
    e.returnValue = 'You have an exam in progress. Are you sure you want to leave?';
  }
};

// Clean up resources
window.addEventListener('beforeunload', () => {
  if (timerInterval) clearInterval(timerInterval);
  if (autoSaveInterval) clearInterval(autoSaveInterval);
  
  const existingEditorElements = document.querySelectorAll('[id^="monaco-editor-"]');
  existingEditorElements.forEach(element => {
    if (element.editorInstance) {
      if (element.subscription && typeof element.subscription.dispose === 'function') {
        element.subscription.dispose();
      }
      element.editorInstance.dispose();
      element.editorInstance = null;
      element.subscription = null;
    }
  });
  
  ExamSecurity.destroy();
});

// Init
initExam();