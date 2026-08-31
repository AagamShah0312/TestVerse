/**
 * TestVerse — Staff: Students & Staff Management
 *
 * PATCH /api/staff/students/{id}/ accepts ONLY:
 *   { role, department, enrollment_id, is_active }
 *
 * name, username, email, password → READ-ONLY (shown but not sent)
 */
'use strict';

// ── Canonical department list (same as examcreate.js) ──────────────
const DEPARTMENTS = [
    'Computer Science',
    'Information Technology',
    'Electronics & Communication',
    'Electrical Engineering',
    'Mechanical Engineering',
    'Civil Engineering',
    'Chemical Engineering',
    'Biotechnology',
    'Mathematics',
    'Physics',
    'Commerce',
    'Management Studies',
    'Arts & Humanities',
];

// ── State ──────────────────────────────────────────────────────────
let _allUsers   = [];
let _filtered   = [];
let _roleFilter = '';
let _deptFilter = '';
let _searchQ    = '';
let _page       = 1;
const PER_PAGE  = 15;

let _editUserId  = null;
let _saving      = false;

let _deleteUserId = null;
let _roleAction   = null;
let _selectedIds  = new Set();

// ── Boot ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireStaff()) return;
    _initSidebar();
    _initTopbarUser();
    _initSearch();
    _initRoleTabs();
    _initDeptFilter();
    _initPagination();
    _initDrawer();
    _initSelectAll();
    _initBulkActions();
    _initDeleteModal();
    _initRoleModal();
    await _loadUsers();
});

// ── User ───────────────────────────────────────────────────────────
function _initTopbarUser() {
    const user = Auth.getUser(); if (!user) return;
    const name = user.name || user.username || user.email?.split('@')[0] || 'Staff';
    const av   = _avatar(name);
    _setText('sidebarName', name);
    _setText('topbarName',  name);
    _setImg('sidebarAvatar', av);
    _setImg('topbarAvatar',  av);
}

// ── Sidebar ────────────────────────────────────────────────────────
function _initSidebar() {
    const sb  = document.getElementById('sidebar');
    const ov  = document.getElementById('sidebarOverlay');
    const open  = () => { sb?.classList.add('open');    ov?.classList.add('show');    };
    const close = () => { sb?.classList.remove('open'); ov?.classList.remove('show'); };
    document.getElementById('menuToggle')?.addEventListener('click', open);
    document.getElementById('sidebarClose')?.addEventListener('click', close);
    ov?.addEventListener('click', close);
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Logout from TestVerse?')) Auth.logout();
    });
}

// ══════════════════════════════════════════════════════════════════
//  DATA
// ══════════════════════════════════════════════════════════════════

async function _loadUsers() {
    _showTableState('loading');
    try {
        const res  = await Api.get(CONFIG.ENDPOINTS.STAFF_STUDENTS);
        const { data, error } = await Api.parse(res);
        if (error) {
            _showAlert(_extractErr(error), 'error');
            _showTableState('empty');
            _setText('emptyMsg', 'Failed to load users. Try refreshing.');
            return;
        }
        _allUsers = Array.isArray(data) ? data : (data?.results ?? []);
        _buildDeptOptions();
        _applyFilters();
        _updateStats();
    } catch {
        _showAlert('Network error. Could not load users.', 'error');
        _showTableState('empty');
        _setText('emptyMsg', 'Network error. Please try again.');
    }
}

function _updateStats() {
    const depts = new Set(_allUsers.map(u => u.department).filter(Boolean));
    _setText('statTotal',    _allUsers.length);
    _setText('statStudents', _allUsers.filter(u => _role(u) === 'student').length);
    _setText('statStaff',    _allUsers.filter(u => _role(u) === 'staff').length);
    _setText('statDepts',    depts.size);
}

/**
 * Builds department lists:
 *  1. Toolbar <select> filter — from API users only
 *  2. Drawer <select> — DEPARTMENTS constant merged with any extra
 *     departments found in the API (so nothing is ever missing)
 */
function _buildDeptOptions() {
    // Extra depts from API not in the canonical list
    const apiDepts = [...new Set(_allUsers.map(u => u.department).filter(Boolean))].sort();
    const extraDepts = apiDepts.filter(d => !DEPARTMENTS.includes(d));

    // Merged & sorted full list for drawer
    const allDepts = [...DEPARTMENTS, ...extraDepts];

    // ── Toolbar dropdown (filter by dept) ──
    const toolbarSel = document.getElementById('deptFilter');
    if (toolbarSel) {
        const prev = toolbarSel.value;
        toolbarSel.innerHTML = '<option value="">All Departments</option>';
        apiDepts.forEach(d => {
            const o = document.createElement('option');
            o.value = d; o.textContent = d;
            toolbarSel.appendChild(o);
        });
        toolbarSel.value = prev;
    }

    // ── Drawer <select> — full canonical list ──
    const drawerSel = document.getElementById('dDepartment');
    if (drawerSel) {
        // Remember current selection so we can restore it
        const current = drawerSel.value;
        drawerSel.innerHTML = '<option value="" disabled>Select department…</option>';
        allDepts.forEach(d => {
            const o = document.createElement('option');
            o.value = d; o.textContent = d;
            drawerSel.appendChild(o);
        });
        // Restore selection if still valid
        if (current && allDepts.includes(current)) {
            drawerSel.value = current;
        }
    }
}

function _role(u) {
    return (u.role || (u.is_staff ? 'staff' : 'student')).toLowerCase();
}

// ══════════════════════════════════════════════════════════════════
//  FILTER & RENDER
// ══════════════════════════════════════════════════════════════════

function _applyFilters() {
    let list = [..._allUsers];
    if (_roleFilter) list = list.filter(u => _role(u) === _roleFilter);
    if (_deptFilter) list = list.filter(u => u.department === _deptFilter);
    if (_searchQ) {
        const q = _searchQ.toLowerCase();
        list = list.filter(u =>
            (u.name          || '').toLowerCase().includes(q) ||
            (u.email         || '').toLowerCase().includes(q) ||
            (u.username      || '').toLowerCase().includes(q) ||
            (u.enrollment_id || '').toLowerCase().includes(q) ||
            (u.department    || '').toLowerCase().includes(q)
        );
    }
    _filtered = list;
    _page     = 1;
    _selectedIds.clear();
    _renderTable();
    _updateBulkBar();
}

function _renderTable() {
    const total = _filtered.length;
    _setText('resultCount', `${total} user${total !== 1 ? 's' : ''}`);

    if (total === 0) {
        _showTableState('empty');
        _setText('emptyMsg', (_searchQ || _roleFilter || _deptFilter)
            ? 'No users match your current filters.'
            : 'No users yet. Ask users to register.');
        return;
    }

    _showTableState('table');
    const start     = (_page - 1) * PER_PAGE;
    const pageSlice = _filtered.slice(start, start + PER_PAGE);
    const tbody     = document.getElementById('usersTableBody');
    tbody.innerHTML = pageSlice.map(_buildRow).join('');

    tbody.querySelectorAll('.row-btn.edit').forEach(btn =>
        btn.addEventListener('click', () => _openDrawer(btn.dataset.id))
    );
    tbody.querySelectorAll('.row-btn.delete').forEach(btn =>
        btn.addEventListener('click', () => _openDeleteModal(btn.dataset.id, btn.dataset.name))
    );
    tbody.querySelectorAll('.row-btn.promote').forEach(btn =>
        btn.addEventListener('click', () => _openRoleModal(btn.dataset.id, btn.dataset.name, 'staff'))
    );
    tbody.querySelectorAll('.row-btn.demote').forEach(btn =>
        btn.addEventListener('click', () => _openRoleModal(btn.dataset.id, btn.dataset.name, 'student'))
    );
    tbody.querySelectorAll('.row-checkbox').forEach(cb =>
        cb.addEventListener('change', () => _onRowCheck(cb))
    );

    _renderPagination(total);
    _syncSelectAll();
}

function _buildRow(u) {
    const r      = _role(u);
    const name   = u.name || u.username || u.email || '—';
    const joined = u.date_joined
        ? new Date(u.date_joined).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
        : '—';
    const sel = _selectedIds.has(String(u.id));

    const enrollCell = (r === 'student' && u.enrollment_id)
        ? `<span class="enroll-tag">${_esc(u.enrollment_id)}</span>`
        : `<span class="cell-empty">—</span>`;

    const deptCell = u.department
        ? `<span class="dept-tag"><i class="fas fa-building"></i>${_esc(u.department)}</span>`
        : `<span class="cell-empty">—</span>`;

    const roleIcon  = r === 'staff' ? 'chalkboard-teacher' : 'user-graduate';
    const roleBadge = `<span class="role-badge ${r}"><i class="fas fa-${roleIcon}"></i>${r}</span>`;

    const activeDot = u.is_active !== false
        ? `<span class="active-dot active" title="Active"></span>`
        : `<span class="active-dot inactive" title="Inactive"></span>`;

    const roleBtn = r === 'student'
        ? `<button class="row-btn promote" data-id="${u.id}" data-name="${_esc(name)}" title="Make Staff"><i class="fas fa-arrow-up"></i></button>`
        : `<button class="row-btn demote"  data-id="${u.id}" data-name="${_esc(name)}" title="Make Student"><i class="fas fa-arrow-down"></i></button>`;

    return `
    <tr class="${sel ? 'selected' : ''}" data-id="${u.id}">
        <td><input type="checkbox" class="row-checkbox" data-id="${u.id}" ${sel ? 'checked' : ''}></td>
        <td>
            <div class="user-cell">
                <div class="avatar-wrap">
                    <img class="user-avatar-sm" src="${_avatar(name)}" alt="${_esc(name)}" loading="lazy">
                    ${activeDot}
                </div>
                <div class="user-cell-info">
                    <span class="user-cell-name">${_esc(name)}</span>
                    <span class="user-cell-email">${_esc(u.email || '')}</span>
                </div>
            </div>
        </td>
        <td>${roleBadge}</td>
        <td>${enrollCell}</td>
        <td>${deptCell}</td>
        <td>${joined}</td>
        <td>
            <div class="row-actions">
                <button class="row-btn edit"   data-id="${u.id}" title="Edit"><i class="fas fa-edit"></i></button>
                ${roleBtn}
                <button class="row-btn delete" data-id="${u.id}" data-name="${_esc(name)}" title="Delete"><i class="fas fa-trash"></i></button>
            </div>
        </td>
    </tr>`;
}

// ── Pagination ─────────────────────────────────────────────────────
function _renderPagination(total) {
    const pages = Math.ceil(total / PER_PAGE);
    const pag   = document.getElementById('pagination');
    if (pages <= 1) { pag.style.display = 'none'; return; }
    pag.style.display = 'flex';
    _setText('pageInfo', `Page ${_page} of ${pages}`);
    document.getElementById('prevPage').disabled = (_page === 1);
    document.getElementById('nextPage').disabled = (_page === pages);
}

function _initPagination() {
    document.getElementById('prevPage')?.addEventListener('click', () => { if (_page > 1) { _page--; _renderTable(); } });
    document.getElementById('nextPage')?.addEventListener('click', () => { _page++; _renderTable(); });
}

// ── Search ─────────────────────────────────────────────────────────
function _initSearch() {
    const input = document.getElementById('searchInput');
    const clear = document.getElementById('searchClear');
    let timer;
    input?.addEventListener('input', () => {
        _searchQ = input.value.trim();
        clear.style.display = _searchQ ? '' : 'none';
        clearTimeout(timer);
        timer = setTimeout(_applyFilters, 280);
    });
    clear?.addEventListener('click', () => {
        input.value = ''; _searchQ = '';
        clear.style.display = 'none';
        _applyFilters(); input.focus();
    });
}

function _initRoleTabs() {
    document.querySelectorAll('.filter-tab').forEach(tab =>
        tab.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            _roleFilter = tab.dataset.role;
            _applyFilters();
        })
    );
}

function _initDeptFilter() {
    document.getElementById('deptFilter')?.addEventListener('change', e => {
        _deptFilter = e.target.value;
        _applyFilters();
    });
}

function _showTableState(state) {
    document.getElementById('tableLoading').style.display = state === 'loading' ? '' : 'none';
    document.getElementById('tableEmpty').style.display   = state === 'empty'   ? '' : 'none';
    document.getElementById('usersTable').style.display   = state === 'table'   ? '' : 'none';
    document.getElementById('pagination').style.display   = state === 'table'   ? '' : 'none';
}

// ── Checkbox ───────────────────────────────────────────────────────
function _initSelectAll() {
    document.getElementById('selectAll')?.addEventListener('change', e => {
        const start = (_page - 1) * PER_PAGE;
        _filtered.slice(start, start + PER_PAGE).forEach(u => {
            e.target.checked ? _selectedIds.add(String(u.id)) : _selectedIds.delete(String(u.id));
        });
        _renderTable(); _updateBulkBar();
    });
}

function _syncSelectAll() {
    const start = (_page - 1) * PER_PAGE;
    const page  = _filtered.slice(start, start + PER_PAGE);
    const cb    = document.getElementById('selectAll');
    if (cb) cb.checked = page.length > 0 && page.every(u => _selectedIds.has(String(u.id)));
}

function _onRowCheck(cb) {
    cb.checked ? _selectedIds.add(cb.dataset.id) : _selectedIds.delete(cb.dataset.id);
    cb.closest('tr')?.classList.toggle('selected', cb.checked);
    _syncSelectAll(); _updateBulkBar();
}

function _updateBulkBar() {
    const n = _selectedIds.size;
    document.getElementById('bulkBar').style.display = n > 0 ? 'flex' : 'none';
    if (n > 0) _setText('bulkCount', `${n} selected`);
}

function _initBulkActions() {
    document.getElementById('bulkDelete')?.addEventListener('click', async () => {
        if (!confirm(`Delete ${_selectedIds.size} selected user(s)? This cannot be undone.`)) return;
        const ids = [..._selectedIds]; let failed = 0;
        for (const id of ids) {
            try {
                const res = await Api.del(CONFIG.ENDPOINTS.STAFF_STUDENT_DETAIL(id));
                if (res.ok || res.status === 204) _allUsers = _allUsers.filter(u => String(u.id) !== id);
                else failed++;
            } catch { failed++; }
        }
        _selectedIds.clear();
        _buildDeptOptions(); _applyFilters(); _updateStats(); _updateBulkBar();
        _showAlert(failed > 0 ? `${failed} user(s) could not be deleted.` : `${ids.length - failed} user(s) deleted.`,
                   failed > 0 ? 'error' : 'success');
    });
    document.getElementById('bulkPromote')?.addEventListener('click', () => _bulkSetRole('staff'));
    document.getElementById('bulkDemote')?.addEventListener('click',  () => _bulkSetRole('student'));
}

async function _bulkSetRole(newRole) {
    const ids = [..._selectedIds]; let failed = 0;
    for (const id of ids) {
        try {
            const res = await Api.patch(CONFIG.ENDPOINTS.STAFF_STUDENT_DETAIL(id), { role: newRole });
            const { data, error } = await Api.parse(res);
            if (!error && data) {
                const idx = _allUsers.findIndex(u => String(u.id) === id);
                if (idx !== -1) _allUsers[idx] = { ..._allUsers[idx], ...data };
            } else failed++;
        } catch { failed++; }
    }
    _selectedIds.clear();
    _buildDeptOptions(); _applyFilters(); _updateStats(); _updateBulkBar();
    _showAlert(failed > 0 ? `${failed} update(s) failed.` : `${ids.length} user(s) set to ${newRole}.`,
               failed > 0 ? 'error' : 'success');
}

// ══════════════════════════════════════════════════════════════════
//  DRAWER
// ══════════════════════════════════════════════════════════════════

function _initDrawer() {
    document.getElementById('drawerClose')?.addEventListener('click',      _closeDrawer);
    document.getElementById('drawerCancelBtn')?.addEventListener('click',  _closeDrawer);
    document.getElementById('drawerBackdrop')?.addEventListener('click',   _closeDrawer);
    document.getElementById('drawerSaveBtn')?.addEventListener('click',    _saveUser);

    document.querySelectorAll('.role-btn').forEach(btn =>
        btn.addEventListener('click', () => _setDrawerRole(btn.dataset.value))
    );

    document.getElementById('dIsActive')?.addEventListener('change', e => {
        _setText('isActiveLabel', e.target.checked ? 'Active' : 'Inactive');
    });

    document.addEventListener('keydown', e => { if (e.key === 'Escape') _closeDrawer(); });
}

async function _openDrawer(userId) {
    _editUserId = userId;

    _clearEl('drawerAlert');
    _clearErr('dDepartmentErr');
    _clearErr('dEnrollmentIdErr');
    _setText('drawerSubtitle', 'Loading user details…');
    _showDrawerLoading(true);

    document.getElementById('userDrawer').classList.add('open');
    document.getElementById('drawerBackdrop').classList.add('show');
    document.body.style.overflow = 'hidden';

    // Always rebuild dropdown options fresh when drawer opens
    _buildDeptOptions();

    try {
        const res = await Api.get(CONFIG.ENDPOINTS.STAFF_STUDENT_DETAIL(userId));
        const { data, error } = await Api.parse(res);

        if (error || !data) {
            _setHTML('drawerAlert', _alertHtml('Could not load user details.', 'error'));
            _showDrawerLoading(false);
            return;
        }

        const idx = _allUsers.findIndex(u => String(u.id) === String(userId));
        if (idx !== -1) _allUsers[idx] = { ..._allUsers[idx], ...data };

        // Fill read-only identity
        const name = data.name || data.username || data.email || '—';
        _setImg('uidAvatar', _avatar(name));
        _setText('uidName',     name);
        _setText('uidEmail',    data.email    || '—');
        _setText('uidUsername', data.username ? `@${data.username}` : '—');

        // Fill editable fields
        _setDrawerRole(_role(data));

        // Set department dropdown value
        const deptSel = document.getElementById('dDepartment');
        if (deptSel && data.department) {
            // If user's dept isn't in dropdown yet, add it
            if (![...deptSel.options].some(o => o.value === data.department)) {
                const o = document.createElement('option');
                o.value = data.department;
                o.textContent = data.department;
                deptSel.appendChild(o);
            }
            deptSel.value = data.department;
        } else if (deptSel) {
            deptSel.value = '';
        }

        _setVal('dEnrollmentId', data.enrollment_id || '');

        const activeChk = document.getElementById('dIsActive');
        if (activeChk) {
            activeChk.checked = data.is_active !== false;
            _setText('isActiveLabel', activeChk.checked ? 'Active' : 'Inactive');
        }

        _setText('drawerSubtitle', `Editing ${name}`);
        _showDrawerLoading(false);

    } catch {
        _setHTML('drawerAlert', _alertHtml('Network error. Could not load user.', 'error'));
        _showDrawerLoading(false);
    }
}

function _showDrawerLoading(loading) {
    document.getElementById('drawerFetchLoading').style.display = loading ? ''     : 'none';
    document.getElementById('drawerBody').style.display         = loading ? 'none' : '';
    const footer = document.querySelector('.drawer-footer');
    if (footer) footer.style.display = loading ? 'none' : '';
}

function _closeDrawer() {
    if (_saving) return;
    document.getElementById('userDrawer').classList.remove('open');
    document.getElementById('drawerBackdrop').classList.remove('show');
    document.body.style.overflow = '';
    _editUserId = null;
}

function _setDrawerRole(role) {
    document.querySelectorAll('.role-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.value === role)
    );
    const wrap = document.getElementById('dEnrollWrap');
    if (wrap) wrap.style.display = role === 'student' ? '' : 'none';
    const note = document.getElementById('deptNote');
    if (note) note.classList.toggle('visible', role === 'staff');
}

function _currentDrawerRole() {
    return document.querySelector('.role-btn.active')?.dataset.value || 'student';
}

// ── Validate ────────────────────────────────────────────────────────
function _validateDrawer() {
    let ok = true;

    const dept = _getVal('dDepartment').trim();
    if (!dept) { _setErr('dDepartmentErr', 'Please select a department'); ok = false; }
    else        _clearErr('dDepartmentErr');

    const enroll = _getVal('dEnrollmentId').trim();
    if (_currentDrawerRole() === 'student' && enroll && enroll.length > 50) {
        _setErr('dEnrollmentIdErr', 'Max 50 characters'); ok = false;
    } else _clearErr('dEnrollmentIdErr');

    return ok;
}

// ── Build Payload ────────────────────────────────────────────────────
function _buildPayload() {
    const role    = _currentDrawerRole();
    const payload = {
        role,
        department: _getVal('dDepartment').trim(),
        is_active:  document.getElementById('dIsActive')?.checked ?? true,
    };
    if (role === 'student') {
        payload.enrollment_id = _getVal('dEnrollmentId').trim() || '';
    }
    return payload;
}

// ── Save ────────────────────────────────────────────────────────────
async function _saveUser() {
    if (_saving) return;
    if (!_validateDrawer()) return;

    _saving = true;
    const btn = document.getElementById('drawerSaveBtn');
    _setBtnLoading(btn, true);
    _clearEl('drawerAlert');

    try {
        const res = await Api.patch(
            CONFIG.ENDPOINTS.STAFF_STUDENT_DETAIL(_editUserId),
            _buildPayload()
        );
        const { data, error } = await Api.parse(res);

        if (error) {
            _setHTML('drawerAlert', _alertHtml(_extractErr(error), 'error'));
            return;
        }

        const idx = _allUsers.findIndex(u => String(u.id) === String(_editUserId));
        if (idx !== -1) _allUsers[idx] = { ..._allUsers[idx], ...data };

        _buildDeptOptions();
        _applyFilters();
        _updateStats();
        _closeDrawer();
        _showAlert('User updated successfully!', 'success');

    } catch {
        _setHTML('drawerAlert', _alertHtml('Network error. Please try again.', 'error'));
    } finally {
        _saving = false;
        _setBtnLoading(btn, false);
    }
}

// ══════════════════════════════════════════════════════════════════
//  DELETE MODAL
// ══════════════════════════════════════════════════════════════════

function _initDeleteModal() {
    document.getElementById('deleteModalClose')?.addEventListener('click',  _closeDeleteModal);
    document.getElementById('deleteCancelBtn')?.addEventListener('click',   _closeDeleteModal);
    document.getElementById('deleteModal')?.addEventListener('click', e => {
        if (e.target.id === 'deleteModal') _closeDeleteModal();
    });
    document.getElementById('deleteConfirmBtn')?.addEventListener('click', _confirmDelete);
}

function _openDeleteModal(userId, name) {
    _deleteUserId = userId;
    _setText('deleteUserName', name || 'This user');
    document.getElementById('deleteModal').classList.add('show');
}
function _closeDeleteModal() {
    document.getElementById('deleteModal').classList.remove('show');
    _deleteUserId = null;
}

async function _confirmDelete() {
    if (!_deleteUserId) return;
    const btn = document.getElementById('deleteConfirmBtn');
    _setBtnLoading(btn, true);
    try {
        const res = await Api.del(CONFIG.ENDPOINTS.STAFF_STUDENT_DETAIL(_deleteUserId));
        if (res.ok || res.status === 204) {
            _allUsers = _allUsers.filter(u => String(u.id) !== String(_deleteUserId));
            _buildDeptOptions(); _applyFilters(); _updateStats();
            _showAlert('User removed successfully.', 'success');
        } else {
            const { error } = await Api.parse(res);
            _showAlert(_extractErr(error) || 'Could not delete user.', 'error');
        }
    } catch {
        _showAlert('Network error. Please try again.', 'error');
    } finally {
        _setBtnLoading(btn, false);
        _closeDeleteModal();
    }
}

// ══════════════════════════════════════════════════════════════════
//  ROLE MODAL
// ══════════════════════════════════════════════════════════════════

function _initRoleModal() {
    document.getElementById('roleModalClose')?.addEventListener('click',  _closeRoleModal);
    document.getElementById('roleCancelBtn')?.addEventListener('click',   _closeRoleModal);
    document.getElementById('roleModal')?.addEventListener('click', e => {
        if (e.target.id === 'roleModal') _closeRoleModal();
    });
    document.getElementById('roleConfirmBtn')?.addEventListener('click', _confirmRoleChange);
}

function _openRoleModal(userId, name, newRole) {
    _roleAction = { userId, name, newRole };
    const promote = newRole === 'staff';
    document.getElementById('roleModalTitle').innerHTML =
        `<i class="fas fa-${promote ? 'arrow-up' : 'arrow-down'}"></i> ${promote ? 'Promote to Staff' : 'Demote to Student'}`;
    document.getElementById('roleModalMsg').innerHTML = promote
        ? `<strong>${_esc(name)}</strong> will be promoted to <strong>Staff</strong> and gain access to staff features.`
        : `<strong>${_esc(name)}</strong> will be changed to <strong>Student</strong>. Staff access will be revoked.`;
    document.getElementById('roleModal').classList.add('show');
}

function _closeRoleModal() {
    document.getElementById('roleModal').classList.remove('show');
    _roleAction = null;
}

async function _confirmRoleChange() {
    if (!_roleAction) return;
    const { userId, newRole } = _roleAction;
    const btn = document.getElementById('roleConfirmBtn');
    _setBtnLoading(btn, true);
    try {
        const res = await Api.patch(CONFIG.ENDPOINTS.STAFF_STUDENT_DETAIL(userId), { role: newRole });
        const { data, error } = await Api.parse(res);
        if (error) {
            _showAlert(_extractErr(error), 'error');
        } else {
            const idx = _allUsers.findIndex(u => String(u.id) === String(userId));
            if (idx !== -1) _allUsers[idx] = { ..._allUsers[idx], ...data };
            _buildDeptOptions(); _applyFilters(); _updateStats();
            _showAlert(`Role updated to ${newRole}.`, 'success');
        }
    } catch {
        _showAlert('Network error. Please try again.', 'error');
    } finally {
        _setBtnLoading(btn, false);
        _closeRoleModal();
    }
}

// ══════════════════════════════════════════════════════════════════
//  ALERT
// ══════════════════════════════════════════════════════════════════

let _alertTimer;
function _showAlert(msg, type) {
    const wrap = document.getElementById('alertContainer'); if (!wrap) return;
    wrap.innerHTML = _alertHtml(msg, type);
    clearTimeout(_alertTimer);
    _alertTimer = setTimeout(() => { wrap.innerHTML = ''; }, 4500);
}
function _alertHtml(msg, type) {
    const icons = { error:'exclamation-circle', success:'check-circle', info:'info-circle' };
    return `<div class="alert alert-${type}"><i class="fas fa-${icons[type]||'info-circle'}"></i><span>${_esc(msg)}</span></div>`;
}

// ══════════════════════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════════════════════

function _avatar(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || '?')}&background=6366f1&color=fff&size=80`;
}
function _setText(id, val)  { const e = document.getElementById(id); if (e) e.textContent = String(val); }
function _setImg(id, src)   { const e = document.getElementById(id); if (e) e.src = src; }
function _setVal(id, val)   { const e = document.getElementById(id); if (e) e.value = val; }
function _getVal(id)        { return document.getElementById(id)?.value ?? ''; }
function _clearEl(id)       { const e = document.getElementById(id); if (e) e.innerHTML = ''; }
function _clearErr(id)      { const e = document.getElementById(id); if (e) e.textContent = ''; }
function _setErr(id, msg)   { const e = document.getElementById(id); if (e) e.textContent = msg; }
function _setHTML(id, html) { const e = document.getElementById(id); if (e) e.innerHTML = html; }

function _setBtnLoading(btn, on) {
    if (!btn) return;
    btn.disabled = on;
    btn.querySelector('.btn-text')?.classList.toggle('hidden', on);
    const l = btn.querySelector('.btn-loader');
    if (l) l.classList.toggle('hidden', !on);
}

function _extractErr(err) {
    if (!err) return 'Something went wrong.';
    if (typeof err === 'string') return err;
    if (err.message) return err.message;
    const vals = Object.values(err);
    if (!vals.length) return 'Something went wrong.';
    const first = vals[0];
    return Array.isArray(first) ? first[0] : String(first);
}

function _esc(s) {
    return String(s ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

(function _injectActiveDotStyles() {
    const s = document.createElement('style');
    s.textContent = `
    .avatar-wrap { position:relative; display:inline-block; }
    .active-dot  { position:absolute; bottom:1px; right:1px; width:9px; height:9px;
                   border-radius:50%; border:2px solid #fff; }
    .active-dot.active   { background:#22c55e; }
    .active-dot.inactive { background:#94a3b8; }
    `;
    document.head.appendChild(s);
})();
