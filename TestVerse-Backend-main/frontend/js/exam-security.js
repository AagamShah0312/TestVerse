/**
 * Exam Security Module - University Exam Portal
 * Handles anti-cheating measures during exam taking
 */

const ExamSecurity = {
  tabSwitchCount: 0,
  blurCount: 0,
  violations: [],
  isActive: false,
  examId: null,

  init(examId) {
    this.examId = examId;
    this.tabSwitchCount = 0;
    this.blurCount = 0;
    this.violations = [];
    this.isActive = true;
    
    this.setupEventListeners();
    document.body.classList.add('exam-mode');
    console.log('Exam security initialized');
  },

  destroy() {
    this.isActive = false;
    document.body.classList.remove('exam-mode');
    this.removeEventListeners();
    console.log('Exam security destroyed');
  },

  logViolation(type, details = {}) {
    const violation = {
      type,
      timestamp: new Date().toISOString(),
      examId: this.examId,
      ...details
    };
    
    this.violations.push(violation);
    
    if (CONFIG.SECURITY.LOG_VIOLATIONS) {
      console.warn('Security violation:', violation);
    }
    
    return violation;
  },

  setupEventListeners() {
    this.setupVisibilityListener();
    this.setupBlurListener();
    this.setupCopyPasteListener();
    this.setupContextMenuListener();
    this.setupKeyboardListener();
  },

  removeEventListeners() {
    if (this.handleVisibilityChange) {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (this.handleBlur) {
      window.removeEventListener('blur', this.handleBlur);
    }
    if (this.preventCopyPaste) {
      document.removeEventListener('copy', this.preventCopyPaste);
      document.removeEventListener('paste', this.preventCopyPaste);
      document.removeEventListener('cut', this.preventCopyPaste);
    }
    if (this.preventContextMenu) {
      document.removeEventListener('contextmenu', this.preventContextMenu);
    }
    if (this.handleKeydown) {
      document.removeEventListener('keydown', this.handleKeydown);
    }
  },

  setupVisibilityListener() {
    this.handleVisibilityChange = () => {
      if (!this.isActive) return;
      
      if (document.hidden) {
        this.tabSwitchCount++;
        this.logViolation('TAB_SWITCH', { count: this.tabSwitchCount });
        
        if (this.tabSwitchCount >= CONFIG.SECURITY.MAX_TAB_SWITCHES) {
          this.showCriticalWarning();
        } else {
          this.showWarning('Tab Switch Detected', 
            `Warning ${this.tabSwitchCount}/${CONFIG.SECURITY.MAX_TAB_SWITCHES}: Please stay on the exam page. Further violations may result in auto-submission.`);
        }
      }
    };
    
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  },

  setupBlurListener() {
    this.handleBlur = () => {
      if (!this.isActive) return;
      
      this.blurCount++;
      this.logViolation('WINDOW_BLUR', { count: this.blurCount });
      
      if (this.blurCount >= CONFIG.SECURITY.MAX_BLUR_EVENTS) {
        this.showWarning('Focus Lost', 'Please keep this window in focus during the exam.');
      }
    };
    
    window.addEventListener('blur', this.handleBlur);
  },

  setupCopyPasteListener() {
    this.preventCopyPaste = (e) => {
      if (!this.isActive) return;
      
      // Allow in text inputs and Monaco editor
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || 
          e.target.closest('.monaco-editor, .code-editor-container, .code-question-wrapper')) {
        return;
      }
      
      e.preventDefault();
      this.logViolation('COPY_PASTE_ATTEMPT', { action: e.type });
      this.showWarning('Action Blocked', 'Copy/paste is disabled during the exam.');
    };
    
    document.addEventListener('copy', this.preventCopyPaste);
    document.addEventListener('cut', this.preventCopyPaste);
    document.addEventListener('paste', this.preventCopyPaste);
  },

  setupContextMenuListener() {
    this.preventContextMenu = (e) => {
      if (!this.isActive) return;
      e.preventDefault();
      this.logViolation('CONTEXT_MENU_ATTEMPT');
    };
    
    document.addEventListener('contextmenu', this.preventContextMenu);
  },

  setupKeyboardListener() {
    this.handleKeydown = (e) => {
      if (!this.isActive) return;
      
      // Block dev tools shortcuts
      if (e.key === 'F12' || 
          (e.ctrlKey && e.shiftKey && e.key === 'I') ||
          (e.ctrlKey && e.key === 'u')) {
        e.preventDefault();
        this.logViolation(`${e.key === 'F12' ? 'DEV_TOOLS' : e.key === 'u' ? 'VIEW_SOURCE' : 'DEV_TOOLS'}_ATTEMPT`);
        return;
      }
    };
    
    document.addEventListener('keydown', this.handleKeydown);
  },

  showWarning(title, message) {
    const overlay = this.createWarningModal(title, message, 'warning', 'I Understand');
    document.body.appendChild(overlay);
    
    overlay.querySelector('#warning-acknowledge').onclick = () => overlay.remove();
  },

  showCriticalWarning() {
    const overlay = this.createWarningModal(
      '⚠️ Critical Warning',
      '<p style="font-size: 1.1em;">You have exceeded the maximum number of tab switches allowed.</p><p class="text-muted mt-4">Your exam activity has been logged. Any further violations may result in automatic submission of your exam.</p>',
      'error',
      'I Understand - Continue Exam'
    );
    
    overlay.querySelector('.modal').style.border = '2px solid var(--error)';
    document.body.appendChild(overlay);
    
    overlay.querySelector('#warning-acknowledge').onclick = () => overlay.remove();
  },

  createWarningModal(title, message, type, buttonText) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'security-warning-modal';
    
    const icon = type === 'warning' 
      ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px; vertical-align: middle;"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>'
      : '';
    
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title" style="color: var(--${type});">
            ${icon}${title}
          </h3>
        </div>
        <div class="modal-body">
          ${typeof message === 'string' ? `<p>${message}</p>` : message}
        </div>
        <div class="modal-footer">
          <button class="btn btn-${type === 'error' ? 'danger' : 'primary'}" id="warning-acknowledge">${buttonText}</button>
        </div>
      </div>
    `;
    
    return overlay;
  },

  getViolationSummary() {
    return {
      tabSwitches: this.tabSwitchCount,
      windowBlurs: this.blurCount,
      totalViolations: this.violations.length,
      violations: this.violations
    };
  }
};
