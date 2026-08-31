// Staff Exam Create Page JavaScript Logic

// Protect route
if (!Auth.requireStaff()) {
  throw new Error('Unauthorized');
}

// Auto-calculate duration from start and end time
function calculateDuration() {
  const startVal = document.getElementById('start_time').value;
  const endVal = document.getElementById('end_time').value;
  const durationInput = document.getElementById('duration');
  const durationDisplay = document.getElementById('duration-display');
  const hint = document.getElementById('duration-hint');
  const card = document.getElementById('duration-card');
  
  card.classList.remove('has-value', 'has-error');
  
  if (startVal && endVal) {
    const start = new Date(startVal);
    const end = new Date(endVal);
    const diffMs = end - start;
    
    if (diffMs > 0) {
      const diffMinutes = Math.round(diffMs / 60000);
      durationInput.value = diffMinutes;
      durationDisplay.textContent = Utils.formatDuration(diffMinutes);
      hint.textContent = `${diffMinutes} minutes total`;
      card.classList.add('has-value');
    } else {
      durationInput.value = '';
      durationDisplay.textContent = 'Invalid';
      hint.textContent = 'End time must be after start time';
      card.classList.add('has-error');
    }
  } else {
    durationInput.value = '';
    durationDisplay.textContent = '--';
    hint.textContent = 'Set start and end time to calculate';
  }
}

document.getElementById('start_time').addEventListener('change', calculateDuration);
document.getElementById('end_time').addEventListener('change', calculateDuration);

// Populate branch checkboxes
function populateBranchCheckboxes() {
  const container = document.getElementById('branch-checkboxes');
  container.innerHTML = CONFIG.DEPARTMENTS.map(dept => `
    <label class="branch-chip" onclick="this.classList.toggle('selected')">
      <input type="checkbox" class="branch-checkbox" value="${dept.value}">
      <span class="branch-chip-label">${dept.label}</span>
      <span class="branch-chip-code">${dept.value}</span>
    </label>
  `).join('');
}

// Get selected branches
function getSelectedBranches() {
  const checkboxes = document.querySelectorAll('.branch-checkbox:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

// Handle form submission with enhanced validation
document.getElementById('exam-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const form = e.target;
  
  // Define validation rules
  const validationRules = {
    title: { 
      required: true, 
      label: 'Exam Title',
      minLength: 3
    },
    total_marks: { 
      required: true, 
      label: 'Total Marks',
      validator: (val) => {
        const num = parseFloat(val);
        if (isNaN(num) || num < 1) return 'Total marks must be at least 1';
        return null;
      }
    },
    passing_marks: { 
      required: true, 
      label: 'Passing Marks',
      validator: (val, form) => {
        const num = parseFloat(val);
        const total = parseFloat(form.querySelector('#total_marks').value);
        if (isNaN(num) || num < 0) return 'Passing marks must be 0 or more';
        if (num > total) return 'Passing marks cannot exceed total marks';
        return null;
      }
    },
    start_time: { 
      required: true, 
      label: 'Start Time'
    },
    end_time: { 
      required: true, 
      label: 'End Time',
      validator: (val, form) => {
        const start = new Date(form.querySelector('#start_time').value);
        const end = new Date(val);
        if (end <= start) return 'End time must be after start time';
        return null;
      }
    }
  };
  
  // Validate form
  if (!Utils.validateForm(form, validationRules)) {
    return;
  }
  
  // Calculate duration from start/end if not manually set
  const durationVal = document.getElementById('duration').value;
  if (!durationVal || parseInt(durationVal) < 1) {
    Utils.showToast('Please set valid start and end times to calculate duration', 'error');
    return;
  }
  
  const examData = {
    title: document.getElementById('title').value.trim(),
    description: document.getElementById('description').value.trim(),
    duration: parseInt(durationVal),
    total_marks: parseFloat(document.getElementById('total_marks').value),
    passing_marks: parseFloat(document.getElementById('passing_marks').value),
    start_time: new Date(document.getElementById('start_time').value).toISOString(),
    end_time: new Date(document.getElementById('end_time').value).toISOString(),
    instructions: document.getElementById('instructions').value.trim(),
    allowed_departments: getSelectedBranches(),
    is_published: false
  };
  
  const createBtn = document.getElementById('create-btn');
  Utils.setButtonLoading(createBtn, true);
  
  try {
    const response = await API.createExam(examData);
    Utils.showToast('Exam created successfully!', 'success');
    
    setTimeout(() => {
      window.location.href = `questions.html?exam=${response.id}`;
    }, 1000);
    
  } catch (error) {
    Utils.setButtonLoading(createBtn, false);
    // Error already shown by API layer
  }
});

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  populateBranchCheckboxes();
});