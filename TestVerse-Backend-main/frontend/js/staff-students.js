// Staff Students Page JavaScript Logic

if (!Auth.requireStaff()) {
  throw new Error('Unauthorized');
}

let allStudents = [];
let currentEditId = null;

// Populate department filter and edit dropdowns
function populateDepartments() {
  const filter = document.getElementById('department-filter');
  const editSelect = document.getElementById('edit-department');
  
  CONFIG.DEPARTMENTS.forEach(dept => {
    filter.innerHTML += `<option value="${dept.value}">${dept.value}</option>`;
    // Only populate the staff department dropdown
    if (editSelect) {
      editSelect.innerHTML += `<option value="${dept.value}">${dept.label}</option>`;
    }
  });
}

// Load students with error handling
async function loadStudents() {
  const tbody = document.getElementById('students-tbody');
  
  // Show loading state
  tbody.innerHTML = `
    <tr><td colspan="7">
      <div class="loading-state" style="padding: 2rem;">
        <div class="skeleton" style="height: 48px; margin-bottom: 8px;"></div>
        <div class="skeleton" style="height: 48px; margin-bottom: 8px;"></div>
        <div class="skeleton" style="height: 48px;"></div>
      </div>
    </td></tr>
  `;
  
  try {
    const search = document.getElementById('search-input').value;
    const department = document.getElementById('department-filter').value;
    
    const params = {};
    if (search) params.search = search;
    if (department) params.department = department;
    
    const response = await API.getStudents(params);
    allStudents = response.results || response || [];
    
    // Update stats
    const total = allStudents.length;
    const assigned = allStudents.filter(s => s.department && s.department.trim()).length;
    const unassigned = total - assigned;
    
    document.getElementById('total-count').textContent = total;
    document.getElementById('assigned-count').textContent = assigned;
    document.getElementById('unassigned-count').textContent = unassigned;
    
    renderStudents();
  } catch (error) {
    console.error('Error loading students:', error);
    tbody.innerHTML = `
      <tr><td colspan="7">
        <div class="error-state">
          <div class="error-state-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v4M12 16h.01"/>
            </svg>
          </div>
          <h3 class="error-state-title">Failed to load students</h3>
          <p class="error-state-message">${Utils.escapeHtml(error.message)}</p>
          <button class="btn btn-secondary" onclick="loadStudents()">Retry</button>
        </div>
      </td></tr>
    `;
  }
}

// Render students table
function renderStudents() {
  const tbody = document.getElementById('students-tbody');
  
  if (allStudents.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center p-8 text-muted">
          No students found
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = allStudents.map(student => {
    const roleBadge = student.role === 'staff' 
      ? `<span class="badge badge-warning">Staff</span>`
      : `<span class="badge badge-primary">Student</span>`;
    
    const hasBranch = student.department && student.department.trim();
    const branchBadge = hasBranch 
      ? `<span class="badge badge-primary">${Utils.escapeHtml(student.department)}</span>`
      : `<span class="badge badge-unassigned">Unassigned</span>`;
    
    const statusBadge = student.is_active
      ? `<span class="badge badge-active">Active</span>`
      : `<span class="badge badge-inactive">Inactive</span>`;
    
    return `
      <tr>
        <td>
          <div class="font-medium">${Utils.escapeHtml(student.name)}</div>
          <div class="text-sm text-muted">@${Utils.escapeHtml(student.username)}</div>
        </td>
        <td>${Utils.escapeHtml(student.email)}</td>
        <td>${student.enrollment_id ? Utils.escapeHtml(student.enrollment_id) : '<span class="text-muted">Not set</span>'}</td>
        <td>${roleBadge}</td>
        <td>${branchBadge}</td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="openEditModal('${student.id}')" title="Edit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Open edit modal
function openEditModal(studentId) {
  const student = allStudents.find(s => s.id === studentId);
  if (!student) return;
  
  currentEditId = studentId;
  document.getElementById('edit-student-id').value = studentId;
  document.getElementById('edit-name').value = student.name;
  document.getElementById('edit-email').value = student.email;
  document.getElementById('edit-role').value = student.role || 'student';
  document.getElementById('edit-active').checked = student.is_active;
  
  // Set role-specific fields
  const role = student.role || 'student';
  toggleRoleFields(role);
  
  // Set field values
  document.getElementById('edit-department').value = student.department || '';
  if (role === 'student') {
    document.getElementById('edit-enrollment').value = student.enrollment_id || '';
  }
  
  document.getElementById('edit-modal').classList.add('active');
}

// Toggle fields based on role selection
function toggleRoleFields(role) {
  const studentFields = document.getElementById('student-fields');
  const staffFields = document.getElementById('staff-fields');
  const activeLabel = document.getElementById('active-label');
  
  if (role === 'student') {
    studentFields.classList.remove('hidden');
    staffFields.classList.add('hidden');
    activeLabel.textContent = 'Student is active';
  } else {
    studentFields.classList.add('hidden');
    staffFields.classList.remove('hidden');
    activeLabel.textContent = 'Staff member is active';
  }
  
  // Both roles need department, so we don't hide the department field
  // The department dropdown is shared between both role sections
}

// Close edit modal
function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('active');
  currentEditId = null;
}

// Save student changes
async function saveStudent() {
  if (!currentEditId) return;
  
  const role = document.getElementById('edit-role').value;
  const department = document.getElementById('edit-department').value;
  const is_active = document.getElementById('edit-active').checked;
  
  // All users must have a department assigned
  if (!department) {
    Utils.showToast('All users must be assigned to a branch/department', 'error');
    return;
  }
  
  let updateData = { role, department, is_active };
  
  // Add role-specific fields
  if (role === 'student') {
    const enrollment_id = document.getElementById('edit-enrollment').value.trim();
    updateData.enrollment_id = enrollment_id || null;
  }
  
  try {
    await API.updateStudent(currentEditId, updateData);
    
    Utils.showToast('User updated successfully!', 'success');
    closeEditModal();
    loadStudents();
  } catch (error) {
    console.error('Error updating student:', error);
    Utils.showToast(error.message || 'Failed to update student', 'error');
  }
}

// Search handler
document.getElementById('search-input').addEventListener('input', Utils.debounce(loadStudents, 300));
document.getElementById('department-filter').addEventListener('change', loadStudents);

// Close modal on overlay click
document.getElementById('edit-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeEditModal();
});

// Add event listener for role changes
document.getElementById('edit-role').addEventListener('change', function() {
  toggleRoleFields(this.value);
});

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  populateDepartments();
  loadStudents();
});