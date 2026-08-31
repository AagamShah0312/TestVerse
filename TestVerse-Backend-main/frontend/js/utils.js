/**
 * Utility Functions - University Exam Portal
 */

const Utils = {
  /**
   * Format date to readable string
   */
  formatDate(dateString, options = {}) {
    try {
      const date = new Date(dateString);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }
      
      const defaultOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      };
      return date.toLocaleDateString('en-US', { ...defaultOptions, ...options });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  },

  /**
   * Format time remaining (seconds to HH:MM:SS)
   */
  formatTime(seconds) {
    // Ensure seconds is a number and not NaN
    seconds = Number(seconds) || 0;
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  },

  /**
   * Format duration in minutes to readable string
   */
  formatDuration(minutes) {
    // Ensure minutes is a number and not NaN
    minutes = Number(minutes) || 0;
    
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  },

  /**
   * Get exam status based on times
   */
  getExamStatus(startTime, endTime) {
    try {
      const now = new Date();
      const start = new Date(startTime);
      const end = new Date(endTime);
      
      // Check if dates are valid
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return 'invalid';
      }
      
      if (now < start) return 'upcoming';
      if (now >= start && now <= end) return 'ongoing';
      return 'completed';
    } catch (error) {
      console.error('Error determining exam status:', error);
      return 'invalid';
    }
  },

  /**
   * Get status badge class
   */
  getStatusBadgeClass(status) {
    const classes = {
      'upcoming': 'badge-info',
      'ongoing': 'badge-success',
      'completed': 'badge-secondary',
      'draft': 'badge-warning',
      'published': 'badge-success',
      'passed': 'badge-success',
      'failed': 'badge-error'
    };
    return classes[status] || 'badge-primary';
  },

  /**
   * Show toast notification
   */
  showToast(message, type = 'info', duration = 4000) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <svg class="toast-icon" viewBox="0 0 24 24" fill="currentColor">
        ${this.getToastIcon(type)}
      </svg>
      <div class="toast-content">
        <div class="toast-message">${message}</div>
      </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  getToastIcon(type) {
    const icons = {
      success: '<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>',
      error: '<path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>',
      warning: '<path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>',
      info: '<path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'
    };
    return icons[type] || icons.info;
  },

  /**
   * Show loading state on button
   */
  setButtonLoading(button, loading = true) {
    if (loading) {
      button.disabled = true;
      button.dataset.originalText = button.innerHTML;
      button.innerHTML = '<span class="spinner spinner-sm"></span> Loading...';
    } else {
      button.disabled = false;
      button.innerHTML = button.dataset.originalText || button.innerHTML;
    }
  },

  /**
   * Show confirmation modal
   */
  confirm(message, onConfirm, onCancel = null) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">Confirm Action</h3>
        </div>
        <div class="modal-body">
          <p>${message}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="modal-confirm">Confirm</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#modal-confirm').onclick = () => {
      overlay.remove();
      if (onConfirm) onConfirm();
    };

    overlay.querySelector('#modal-cancel').onclick = () => {
      overlay.remove();
      if (onCancel) onCancel();
    };
  },

  /**
   * Debounce function
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Get URL parameter
   */
  getUrlParam(param) {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get(param);
    } catch (error) {
      console.error('Error getting URL parameter:', error);
      return null;
    }
  },

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    try {
      // Convert to string if not already
      text = String(text || '');
      
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    } catch (error) {
      console.error('Error escaping HTML:', error);
      return '';
    }
  },

  /**
   * Generate skeleton loader HTML
   */
  skeleton(type = 'text', count = 1) {
    let html = '';
    for (let i = 0; i < count; i++) {
      switch (type) {
        case 'card':
          html += '<div class="card skeleton" style="height: 200px;"></div>';
          break;
        case 'title':
          html += '<div class="skeleton skeleton-title"></div>';
          break;
        default:
          html += '<div class="skeleton skeleton-text"></div>';
      }
    }
    return html;
  },

  // ============ ERROR HANDLING UTILITIES ============

  /**
   * Show error state in a container with optional retry button
   */
  showError(container, message, retryFn = null) {
    const retryButton = retryFn 
      ? `<button class="btn btn-secondary mt-4" onclick="(${retryFn.toString()})()">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
             <path d="M1 4v6h6M23 20v-6h-6"/>
             <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
           </svg>
           Retry
         </button>`
      : '';
    
    container.innerHTML = `
      <div class="error-state">
        <div class="error-state-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4M12 16h.01"/>
          </svg>
        </div>
        <h3 class="error-state-title">Something went wrong</h3>
        <p class="error-state-message">${this.escapeHtml(message)}</p>
        ${retryButton}
      </div>
    `;
  },

  /**
   * Show loading skeleton in a container
   */
  showLoading(container, type = 'table') {
    const skeletons = {
      table: `
        <div class="loading-state">
          <div class="skeleton skeleton-text" style="width: 100%; height: 40px; margin-bottom: 8px;"></div>
          <div class="skeleton skeleton-text" style="width: 100%; height: 40px; margin-bottom: 8px;"></div>
          <div class="skeleton skeleton-text" style="width: 100%; height: 40px; margin-bottom: 8px;"></div>
          <div class="skeleton skeleton-text" style="width: 100%; height: 40px;"></div>
        </div>
      `,
      cards: `
        <div class="loading-state stats-grid">
          <div class="skeleton" style="height: 120px; border-radius: var(--radius-xl);"></div>
          <div class="skeleton" style="height: 120px; border-radius: var(--radius-xl);"></div>
          <div class="skeleton" style="height: 120px; border-radius: var(--radius-xl);"></div>
          <div class="skeleton" style="height: 120px; border-radius: var(--radius-xl);"></div>
        </div>
      `,
      list: `
        <div class="loading-state">
          <div class="skeleton" style="height: 80px; border-radius: var(--radius-lg); margin-bottom: 12px;"></div>
          <div class="skeleton" style="height: 80px; border-radius: var(--radius-lg); margin-bottom: 12px;"></div>
          <div class="skeleton" style="height: 80px; border-radius: var(--radius-lg);"></div>
        </div>
      `,
      content: `
        <div class="loading-state text-center p-8">
          <div class="spinner"></div>
          <p class="text-muted mt-4">Loading...</p>
        </div>
      `
    };
    
    container.innerHTML = skeletons[type] || skeletons.content;
  },

  /**
   * Show empty state in a container
   */
  showEmpty(container, message, actionHtml = '') {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
            <polyline points="13 2 13 9 20 9"/>
          </svg>
        </div>
        <h3 class="empty-state-title">No data found</h3>
        <p class="empty-state-description">${message}</p>
        ${actionHtml}
      </div>
    `;
  },

  /**
   * Validate form fields with rules
   * Returns true if valid, false otherwise
   * Shows inline error messages for invalid fields
   */
  validateForm(form, rules) {
    let isValid = true;
    
    // Clear previous errors
    form.querySelectorAll('.field-error').forEach(el => el.remove());
    form.querySelectorAll('.form-input.invalid').forEach(el => el.classList.remove('invalid'));
    
    for (const [fieldName, fieldRules] of Object.entries(rules)) {
      const field = form.querySelector(`[name="${fieldName}"], #${fieldName}`);
      if (!field) continue;
      
      const value = field.value.trim();
      let fieldError = null;
      
      // Check required
      if (fieldRules.required && !value) {
        fieldError = fieldRules.message || `${fieldRules.label || fieldName} is required`;
      }
      
      // Check min length
      if (!fieldError && fieldRules.minLength && value.length < fieldRules.minLength) {
        fieldError = `${fieldRules.label || fieldName} must be at least ${fieldRules.minLength} characters`;
      }
      
      // Check pattern
      if (!fieldError && fieldRules.pattern && !fieldRules.pattern.test(value)) {
        fieldError = fieldRules.patternMessage || `${fieldRules.label || fieldName} is invalid`;
      }
      
      // Check custom validator
      if (!fieldError && fieldRules.validator) {
        const customError = fieldRules.validator(value, form);
        if (customError) fieldError = customError;
      }
      
      if (fieldError) {
        isValid = false;
        field.classList.add('invalid');
        
        // Add error message
        const errorEl = document.createElement('div');
        errorEl.className = 'field-error text-error text-sm mt-1';
        errorEl.textContent = fieldError;
        field.parentNode.appendChild(errorEl);
        
        // Clear error on focus
        field.addEventListener('focus', function onFocus() {
          field.classList.remove('invalid');
          const err = field.parentNode.querySelector('.field-error');
          if (err) err.remove();
          field.removeEventListener('focus', onFocus);
        }, { once: true });
      }
    }
    
    if (!isValid) {
      // Scroll to first error
      const firstError = form.querySelector('.invalid');
      if (firstError) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstError.focus();
      }
    }
    
    return isValid;
  },

  /**
   * Handle API errors consistently
   */
  handleApiError(error, context = '') {
    console.error(`Error${context ? ` in ${context}` : ''}:`, error);
    
    let message = error.message || 'An unexpected error occurred';
    
    // Friendly messages for common errors
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
      message = 'Unable to connect to server. Please check your connection.';
    } else if (message.includes('401') || message.includes('Unauthorized')) {
      message = 'Your session has expired. Please log in again.';
    } else if (message.includes('403') || message.includes('Forbidden')) {
      message = 'You don\'t have permission to perform this action.';
    } else if (message.includes('404')) {
      message = 'The requested resource was not found.';
    } else if (message.includes('500')) {
      message = 'Server error. Please try again later.';
    }
    
    this.showToast(message, 'error', 5000);
    return message;
  }
};
