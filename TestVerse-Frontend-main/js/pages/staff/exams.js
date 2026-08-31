/**
 * TestVerse — Staff Exams Page
 * Features: list, filter, search, paginate, stat pill quick-filter,
 *           edit modal, publish/unpublish modal, delete modal,
 *           live countdown on active exams, start-countdown on published.
 */
'use strict';

// ── Canonical exam types — must match examcreate.html exactly ──────
const EXAM_TYPES = [
    { value: 'mcq',         label: 'MCQ Only'    },
    { value: 'mixed',       label: 'Mixed'       },
    { value: 'descriptive', label: 'Descriptive' },
    { value: 'coding',      label: 'Coding'      },
];

// ── State ──────────────────────────────────────────────────────────
let _page = 1, _totalPages = 1, _totalCount = 0, _allExams = [];
let _search = '', _statusFilter = '', _typeFilter = '', _sort = '-created_at';
let _editId = null, _deleteId = null, _publishId = null, _publishAct = 'publish';
let _searchTimer = null, _countdownIntervals = [];

// ── Boot ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (!Auth.requireStaff()) return;
    _initUser(); _initSidebar(); _initFilters();
    _initStatPills(); _initEditModal(); _initDeleteModal(); _initPublishModal();
    _loadExams();
});

// ── User ───────────────────────────────────────────────────────────
function _initUser() {
    const user = Auth.getUser(); if (!user) return;
    const name = user.name || user.username || user.email?.split('@')[0] || 'Staff';
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff`;
    // FIX: targets both old IDs (sidebarUserName/topbarUserName) and HTML IDs (sidebarName/topbarName)
    ['sidebarUserName', 'topbarUserName', 'sidebarName', 'topbarName'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = name;
    });
    ['sidebarAvatar', 'topbarAvatar'].forEach(id => {
        const el = document.getElementById(id); if (el) el.src = avatar;
    });
}

// ── Sidebar ────────────────────────────────────────────────────────
function _initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const open  = () => { sidebar.classList.add('open'); overlay.classList.add('show'); };
    const close = () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); };
    document.getElementById('menuToggle')?.addEventListener('click', open);
    document.getElementById('sidebarClose')?.addEventListener('click', close);
    overlay?.addEventListener('click', close);
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Logout from TestVerse?')) Auth.logout();
    });
    document.getElementById('refreshBtn')?.addEventListener('click', () => { _page = 1; _loadExams(); });
}

// ── Stat Pills ─────────────────────────────────────────────────────
// FIX: was '.tv-stat-pill' — HTML uses '.stat-pill'
function _initStatPills() {
    document.querySelectorAll('.stat-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const f = pill.dataset.filter;
            _statusFilter = (_statusFilter === f && f !== '') ? '' : f;
            _page = 1; _syncPillUI(); _loadExams();
        });
    });
}
function _syncPillUI() {
    document.querySelectorAll('.stat-pill').forEach(p =>
        p.classList.toggle('active-filter', p.dataset.filter === _statusFilter));
    const clearBtn = document.getElementById('clearFiltersBtn');
    if (clearBtn) clearBtn.style.display = (_search || _statusFilter || _typeFilter) ? 'flex' : 'none';
}

// ── Filters ────────────────────────────────────────────────────────
function _initFilters() {
    const searchEl = document.getElementById('searchInput');
    const clearEl  = document.getElementById('searchClear');
    searchEl?.addEventListener('input', e => {
        clearEl?.classList.toggle('hidden', !e.target.value);
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(() => { _search = e.target.value.trim(); _page = 1; _syncPillUI(); _loadExams(); }, 420);
    });
    clearEl?.addEventListener('click', () => {
        searchEl.value = ''; clearEl.classList.add('hidden');
        _search = ''; _page = 1; _syncPillUI(); _loadExams();
    });
    document.getElementById('typeFilter')?.addEventListener('change', e => { _typeFilter = e.target.value; _page = 1; _syncPillUI(); _loadExams(); });
    document.getElementById('sortFilter')?.addEventListener('change', e => { _sort = e.target.value; _page = 1; _loadExams(); });
    document.getElementById('prevBtn')?.addEventListener('click', () => { if (_page > 1) { _page--; _loadExams(); } });
    document.getElementById('nextBtn')?.addEventListener('click', () => { if (_page < _totalPages) { _page++; _loadExams(); } });
    document.getElementById('clearFiltersBtn')?.addEventListener('click', _clearAllFilters);
}
function _clearAllFilters() {
    _search = ''; _statusFilter = ''; _typeFilter = ''; _page = 1;
    const s = document.getElementById('searchInput'); if (s) s.value = '';
    document.getElementById('searchClear')?.classList.add('hidden');
    const t = document.getElementById('typeFilter'); if (t) t.value = '';
    _syncPillUI(); _loadExams();
}

// ── Load Exams ─────────────────────────────────────────────────────
async function _loadExams() {
    _clearCountdowns(); _showLoading();
    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn?.classList.add('spinning');
    try {
        const params = new URLSearchParams({ page: _page, page_size: 12 });
        if (_search)       params.set('search', _search);
        if (_statusFilter) params.set('status', _statusFilter);
        if (_typeFilter)   params.set('exam_type', _typeFilter);
        if (_sort)         params.set('ordering', _sort);
        // Include all exams created by any staff (visibility fix)
        params.set('all', 'true');

        const res = await Api.get(`${CONFIG.ENDPOINTS.STAFF_EXAMS}?${params}`);
        const { data, error } = await Api.parse(res);

        if (error) { UI.toast('Failed to load exams.', 'error'); _showEmpty('Error', 'Please refresh.', false); return; }

        let exams = [];
        if (data?.results) { exams = data.results; _totalCount = data.count || 0; _totalPages = Math.ceil(_totalCount / 12) || 1; }
        else if (Array.isArray(data)) { exams = data; _totalCount = exams.length; _totalPages = 1; }

        _allExams = exams;
        _updateStats(exams);
        _updateResultsInfo();

        if (!exams.length) {
            const hf = _search || _statusFilter || _typeFilter;
            _showEmpty(hf ? 'No Exams Found' : 'No Exams Yet', hf ? 'Try adjusting your filters.' : 'Create your first exam.', !hf);
        } else {
            _renderExams(exams);
        }
    } catch (err) {
        console.error(err); UI.toast('Network error.', 'error');
        _showEmpty('Network Error', 'Check your connection.', false);
    } finally {
        refreshBtn?.classList.remove('spinning');
    }
}

// ── Stats ──────────────────────────────────────────────────────────
function _updateStats(exams) {
    const now = new Date();
    const c = { all: _totalCount || exams.length, draft: 0, published: 0, active: 0, completed: 0 };
    exams.forEach(e => { const s = _getStatus(e, now); if (c[s] !== undefined) c[s]++; });
    document.getElementById('statAll').textContent       = c.all;
    document.getElementById('statDraft').textContent     = c.draft;
    document.getElementById('statPublished').textContent = c.published;
    document.getElementById('statActive').textContent    = c.active;
    document.getElementById('statCompleted').textContent = c.completed;
}
function _updateResultsInfo() {
    const el = document.getElementById('resultsInfo'), txt = document.getElementById('resultsText');
    if (!el || !txt) return;
    txt.textContent = `Showing ${_allExams.length} of ${_totalCount} ${_totalCount === 1 ? 'exam' : 'exams'}`;
    el.style.display = 'flex';
    const cb = document.getElementById('clearFiltersBtn');
    if (cb) cb.style.display = (_search || _statusFilter || _typeFilter) ? 'flex' : 'none';
}

// ── Status ─────────────────────────────────────────────────────────
function _getStatus(exam, now = new Date()) {
    if (!exam.is_published) return 'draft';
    const start = new Date(exam.start_time), end = new Date(exam.end_time);
    if (now < start) return 'published';
    if (now <= end)  return 'active';
    return 'completed';
}
const _statusLabel = { draft: 'Draft', published: 'Published', active: 'Live', completed: 'Completed' };

// ── Type label helper ──────────────────────────────────────────────
// FIX: looks up EXAM_TYPES for correct label instead of raw capitalise
function _typeLabel(type) {
    const found = EXAM_TYPES.find(t => t.value === (type || '').toLowerCase());
    return found ? found.label : (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'General');
}

// ── Render ─────────────────────────────────────────────────────────
function _renderExams(exams) {
    const grid = document.getElementById('examsGrid'); if (!grid) return;
    grid.innerHTML = exams.map(_buildCard).join('');
    grid.style.display = 'grid';
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
    _updatePagination();
    const now = new Date();
    exams.forEach(e => {
        const s = _getStatus(e, now);
        if (s === 'active')    _startCountdownEnd(e);
        if (s === 'published') _startCountdownStart(e);
    });
}

function _buildCard(exam) {
    const now = new Date(), status = _getStatus(exam, now), label = _statusLabel[status] || status;
    const fmt = iso => iso ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : 'Not set';

    const pubBtn = exam.is_published
        ? `<button class="action-btn unpublish" onclick="window._openPublish('${exam.id}','unpublish','${_esc(exam.title)}')"><i class="fas fa-eye-slash"></i> Unpublish</button>`
        : `<button class="action-btn publish"   onclick="window._openPublish('${exam.id}','publish','${_esc(exam.title)}')"><i class="fas fa-check-circle"></i> Publish</button>`;

    const liveBtn = status === 'active'
        ? `<a href="live-monitor.html?id=${exam.id}" class="action-btn live"><i class="fas fa-satellite-dish"></i> Live</a>`
        : '';

    let cdHtml = '';
    if (status === 'active')
        cdHtml = `<div class="countdown live" id="cd-${exam.id}"><i class="fas fa-spinner"></i><span id="cd-txt-${exam.id}">…</span></div>`;
    if (status === 'published')
        cdHtml = `<div class="countdown starts" id="cd-${exam.id}"><i class="fas fa-clock"></i><span id="cd-txt-${exam.id}">Starts in…</span></div>`;

    return `
    <div class="exam-card s-${status}" data-id="${exam.id}">
        <div class="card-top">
            <h3 class="exam-title">${_esc(exam.title)}</h3>
            <span class="status-badge s-${status}"><span class="status-dot"></span>${label}</span>
        </div>
        <div class="card-body">
            <span class="type-chip">${_typeLabel(exam.exam_type)}</span>
            ${exam.description ? `<p class="exam-desc">${_esc(exam.description)}</p>` : ''}
            ${cdHtml}
            <div class="card-meta">
                <div class="meta-item"><i class="fas fa-question-circle"></i><span><strong>${exam.question_count ?? '—'}</strong> Questions</span></div>
                <div class="meta-item"><i class="fas fa-clock"></i><span><strong>${exam.duration || 0}</strong> min</span></div>
                <div class="meta-item"><i class="fas fa-trophy"></i><span>Total: <strong>${exam.total_marks || 0}</strong></span></div>
                <div class="meta-item"><i class="fas fa-crosshairs"></i><span>Pass: <strong>${exam.passing_marks || 0}</strong></span></div>
                <div class="meta-item"><i class="fas fa-users"></i><span>Attempts: <strong>${exam.total_attempts || 0}</strong></span></div>
                <div class="meta-item"><i class="fas fa-percentage"></i><span>Pass%: <strong>${exam.pass_percentage || '—'}</strong></span></div>
            </div>
            <div class="timeline">
                <div class="timeline-row"><i class="fas fa-play"></i><span class="timeline-label">Starts</span><span class="timeline-val">${fmt(exam.start_time)}</span></div>
                <div class="timeline-row"><i class="fas fa-stop"></i><span class="timeline-label">Ends</span><span class="timeline-val">${fmt(exam.end_time)}</span></div>
            </div>
        </div>
        <div class="card-actions">
            <a href="examedit.html?id=${exam.id}" class="action-btn questions"><i class="fas fa-list-ol"></i> Questions</a>
            <button class="action-btn edit" onclick="window._openEdit('${exam.id}')"><i class="fas fa-edit"></i> Edit</button>
            ${pubBtn}${liveBtn}
            <button class="action-btn del" onclick="window._openDelete('${exam.id}','${_esc(exam.title)}')"><i class="fas fa-trash"></i></button>
        </div>
    </div>`;
}

// ── Countdowns ─────────────────────────────────────────────────────
function _startCountdownEnd(exam) {
    const end = new Date(exam.end_time).getTime();
    const id = setInterval(() => {
        const diff = end - Date.now();
        const el = document.getElementById(`cd-txt-${exam.id}`);
        if (!el) return clearInterval(id);
        diff <= 0 ? (el.textContent = 'Ended', clearInterval(id)) : (el.textContent = `${_fmtMs(diff)} remaining`);
    }, 1000);
    _countdownIntervals.push(id);
}
function _startCountdownStart(exam) {
    const start = new Date(exam.start_time).getTime();
    const id = setInterval(() => {
        const diff = start - Date.now();
        const el = document.getElementById(`cd-txt-${exam.id}`);
        if (!el) return clearInterval(id);
        diff <= 0 ? (el.textContent = 'Starting…', clearInterval(id)) : (el.textContent = `Starts in ${_fmtMs(diff)}`);
    }, 1000);
    _countdownIntervals.push(id);
}
function _clearCountdowns() { _countdownIntervals.forEach(clearInterval); _countdownIntervals = []; }
function _fmtMs(ms) {
    const s = Math.floor(ms/1000), h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
    return h > 0 ? `${h}h ${String(m).padStart(2,'0')}m` : `${String(m).padStart(2,'0')}m ${String(sec).padStart(2,'0')}s`;
}

// ── UI States ──────────────────────────────────────────────────────
function _showLoading() {
    document.getElementById('loadingState').style.display = 'flex';
    document.getElementById('examsGrid').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('pagination').style.display = 'none';
    document.getElementById('resultsInfo').style.display = 'none';
}
function _showEmpty(title, sub, showBtn = true) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('examsGrid').style.display = 'none';
    document.getElementById('pagination').style.display = 'none';
    document.getElementById('emptyTitle').textContent = title;
    document.getElementById('emptySubtitle').textContent = sub;
    const btn = document.getElementById('emptyAction');
    if (btn) btn.style.display = showBtn ? 'inline-flex' : 'none';
    document.getElementById('emptyState').style.display = 'flex';
}
function _updatePagination() {
    const p = document.getElementById('pagination');
    if (_totalPages <= 1) { p.style.display = 'none'; return; }
    p.style.display = 'flex';
    document.getElementById('pageInfo').textContent = `Page ${_page} of ${_totalPages}`;
    document.getElementById('prevBtn').disabled = _page <= 1;
    document.getElementById('nextBtn').disabled = _page >= _totalPages;
}

// ── Edit Modal ─────────────────────────────────────────────────────
function _initEditModal() {
    document.getElementById('editModalClose')?.addEventListener('click', _closeEdit);
    document.getElementById('editCancelBtn')?.addEventListener('click', _closeEdit);
    document.getElementById('editModal')?.addEventListener('click', e => { if (e.target.id === 'editModal') _closeEdit(); });
    ['editStart','editEnd'].forEach(id => document.getElementById(id)?.addEventListener('change', _calcDuration));
    document.getElementById('editSaveBtn')?.addEventListener('click', _saveEdit);
}
function _closeEdit() {
    document.getElementById('editModal').classList.remove('show');
    _editId = null;
    UI.clearAlert('editAlertContainer');
}

window._openEdit = (id) => {
    const exam = _allExams.find(e => e.id === id); if (!exam) return;
    _editId = id;
    document.getElementById('editTitle').value        = exam.title || '';
    document.getElementById('editDescription').value  = exam.description || '';
    // FIX: default fallback is 'mixed' not 'midterm'
    document.getElementById('editType').value         = exam.exam_type || 'mixed';
    document.getElementById('editTotalMarks').value   = exam.total_marks || '';
    document.getElementById('editPassMarks').value    = exam.passing_marks || '';
    document.getElementById('editInstructions').value = exam.instructions || '';
    if (exam.start_time) document.getElementById('editStart').value = _toLocal(exam.start_time);
    if (exam.end_time)   document.getElementById('editEnd').value   = _toLocal(exam.end_time);
    _calcDuration();
    UI.clearAlert('editAlertContainer');
    document.getElementById('editModal').classList.add('show');
};

function _toLocal(iso) {
    const d = new Date(iso), p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function _calcDuration() {
    const s = document.getElementById('editStart')?.value, e = document.getElementById('editEnd')?.value;
    const dur = document.getElementById('editDuration');
    if (s && e && dur) { const d = Math.floor((new Date(e) - new Date(s)) / 60000); dur.value = d > 0 ? d : ''; }
}
async function _saveEdit() {
    if (!_editId) return;
    const title        = document.getElementById('editTitle').value.trim();
    const description  = document.getElementById('editDescription').value.trim();
    const exam_type    = document.getElementById('editType').value;
    const start_time   = document.getElementById('editStart').value;
    const end_time     = document.getElementById('editEnd').value;
    const total_marks  = document.getElementById('editTotalMarks').value;
    const pass_marks   = document.getElementById('editPassMarks').value;
    const instructions = document.getElementById('editInstructions').value.trim();

    if (!title || !description || !start_time || !end_time || !total_marks || !pass_marks)
        return UI.showAlert('editAlertContainer', 'Please fill all required fields.', 'error');
    if (+pass_marks > +total_marks)
        return UI.showAlert('editAlertContainer', 'Passing marks cannot exceed total marks.', 'error');
    const duration = Math.floor((new Date(end_time) - new Date(start_time)) / 60000);
    if (duration <= 0)
        return UI.showAlert('editAlertContainer', 'End time must be after start time.', 'error');

    const btn = document.getElementById('editSaveBtn');
    _setBtnLoading(btn, true);
    try {
        const res = await Api.patch(CONFIG.ENDPOINTS.STAFF_EXAM_DETAIL(_editId), {
            title, description, exam_type,
            start_time: new Date(start_time).toISOString(),
            end_time:   new Date(end_time).toISOString(),
            duration, total_marks: String(total_marks), passing_marks: String(pass_marks), instructions,
        });
        const { data, error } = await Api.parse(res);
        if (error) return UI.showAlert('editAlertContainer', Auth.extractErrorMessage(error), 'error');
        const idx = _allExams.findIndex(e => e.id === _editId);
        if (idx !== -1) _allExams[idx] = { ..._allExams[idx], ...data };
        _closeEdit(); UI.toast('Exam updated!', 'success'); _loadExams();
    } catch { UI.showAlert('editAlertContainer', 'Network error. Try again.', 'error'); }
    finally { _setBtnLoading(btn, false); }
}

// ── Publish Modal ──────────────────────────────────────────────────
function _initPublishModal() {
    document.getElementById('publishModalClose')?.addEventListener('click', _closePublish);
    document.getElementById('publishCancelBtn')?.addEventListener('click', _closePublish);
    document.getElementById('publishModal')?.addEventListener('click', e => { if (e.target.id === 'publishModal') _closePublish(); });
    document.getElementById('publishConfirmBtn')?.addEventListener('click', _confirmPublish);
}
function _closePublish() {
    document.getElementById('publishModal').classList.remove('show');
    _publishId = null;
}

window._openPublish = (id, action, title) => {
    _publishId = id; _publishAct = action;
    const isP = action === 'publish';
    document.getElementById('publishModalTitle').innerHTML = isP
        ? '<i class="fas fa-check-circle" style="color:#34d399"></i> Publish Exam'
        : '<i class="fas fa-eye-slash" style="color:#fbbf24"></i> Unpublish Exam';
    document.getElementById('publishModalMsg').textContent = isP
        ? `"${title}" will become visible to students once published.`
        : `"${title}" will be hidden from students. You can republish anytime.`;
    const ct = document.getElementById('publishConfirmText');
    if (ct) ct.textContent = isP ? 'Yes, Publish' : 'Yes, Unpublish';

    // FIX: use classList.remove/add instead of btn.className= which wipes btn-text/btn-loader spans
    const btn = document.getElementById('publishConfirmBtn');
    if (btn) {
        btn.classList.remove('btn-primary', 'btn-warning', 'btn-success');
        btn.classList.add(isP ? 'btn-primary' : 'btn-warning');
    }

    document.getElementById('publishModal').classList.add('show');
};

async function _confirmPublish() {
    if (!_publishId) return;
    const btn = document.getElementById('publishConfirmBtn');
    _setBtnLoading(btn, true);
    try {
        const ep = _publishAct === 'publish'
            ? CONFIG.ENDPOINTS.STAFF_EXAM_PUBLISH(_publishId)
            : CONFIG.ENDPOINTS.STAFF_EXAM_UNPUBLISH(_publishId);
        const res = await Api.post(ep, {});
        const { error } = await Api.parse(res);
        if (error) { UI.toast(Auth.extractErrorMessage(error), 'error'); _closePublish(); return; }
        UI.toast(_publishAct === 'publish' ? 'Exam published!' : 'Exam unpublished.', 'success');
        _closePublish(); _loadExams();
    } catch { UI.toast('Network error.', 'error'); _closePublish(); }
    finally { _setBtnLoading(btn, false); }
}

// ── Delete Modal ───────────────────────────────────────────────────
function _initDeleteModal() {
    document.getElementById('deleteModalClose')?.addEventListener('click', _closeDelete);
    document.getElementById('deleteCancelBtn')?.addEventListener('click', _closeDelete);
    document.getElementById('deleteModal')?.addEventListener('click', e => { if (e.target.id === 'deleteModal') _closeDelete(); });
    document.getElementById('deleteConfirmBtn')?.addEventListener('click', _confirmDelete);
}
function _closeDelete() {
    document.getElementById('deleteModal').classList.remove('show');
    _deleteId = null;
}

window._openDelete = (id, title) => {
    _deleteId = id;
    document.getElementById('deleteExamName').textContent = title;
    document.getElementById('deleteModal').classList.add('show');
};

async function _confirmDelete() {
    if (!_deleteId) return;
    const btn = document.getElementById('deleteConfirmBtn');
    _setBtnLoading(btn, true);
    try {
        const res = await Api.del(CONFIG.ENDPOINTS.STAFF_EXAM_DETAIL(_deleteId));
        if (res.status === 204 || res.ok) {
            UI.toast('Exam deleted.', 'success'); _closeDelete(); _loadExams();
        } else {
            const { error } = await Api.parse(res);
            UI.toast(Auth.extractErrorMessage(error), 'error'); _closeDelete();
        }
    } catch { UI.toast('Network error.', 'error'); _closeDelete(); }
    finally { _setBtnLoading(btn, false); }
}

// ── Helpers ────────────────────────────────────────────────────────
function _setBtnLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    btn.querySelector('.btn-text')?.classList.toggle('hidden', loading);
    btn.querySelector('.btn-loader')?.classList.toggle('hidden', !loading);
}
function _esc(str) {
    return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}