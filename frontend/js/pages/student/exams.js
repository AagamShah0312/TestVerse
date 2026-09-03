/**
 * TestVerse — Student Exams Page
 *
 * Auth:  Auth.requireAuth() / Auth.getUser() / Auth.logout()
 * API:   Api.get(endpoint) / Api.post(endpoint, body)
 *        Api.parse(res) → { data, error }
 *
 * Endpoints:
 *   EXAMS_AVAILABLE      GET  /api/v1/exams/available/
 *   EXAM_DETAIL(id)      GET  /api/v1/exams/:id/
 *   EXAMS_MY_ATTEMPTS    GET  /api/v1/exams/my-attempts/
 *   EXAM_ATTEMPT(id)     POST /api/v1/exams/:id/attempt/
 *   NOTIF_COUNT          GET  /api/v1/auth/notifications/count/
 */
'use strict';

// ── State ──────────────────────────────────────────────────────────
const PAGE_SIZE = 12;

let _allExams       = [];
let _attempts       = [];
let _filtered       = [];
let _activeFilter   = 'all';
let _page           = 1;
let _searchTerm     = '';
let _typeFilter     = '';
let _sortMode       = 'start_asc';
let _pendingStartId = null;

// ── Boot ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (!Auth.requireAuth()) return;
    _initSidebar();
    _populateUser();
    _initControls();
    _loadAll();
});

// ── Sidebar + Logout ───────────────────────────────────────────────
function _initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggle  = document.getElementById('mobileSidebarToggle');
    const overlay = document.getElementById('sidebarOverlay');
    const logout  = document.getElementById('logoutBtn');

    toggle?.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay?.classList.toggle('show');
    });
    overlay?.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
    });
    logout?.addEventListener('click', () => {
        if (confirm('Log out of TestVerse?')) Auth.logout();
    });
}

// ── User info ──────────────────────────────────────────────────────
function _populateUser() {
    const user = Auth.getUser();
    if (!user) return;
    const name      = user.name || user.username || user.email?.split('@')[0] || 'Student';
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff&size=64`;
    _setText('sidebarName', name);
    _setText('topbarName',  name);
    ['sidebarAvatar', 'topbarAvatar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.src = avatarUrl;
    });
}

// ── Wire Controls ──────────────────────────────────────────────────
function _initControls() {
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');

    searchInput?.addEventListener('input', () => {
        _searchTerm = searchInput.value.trim().toLowerCase();
        searchClear?.classList.toggle('hidden', !_searchTerm);
        _page = 1;
        _applyAndRender();
    });
    searchClear?.addEventListener('click', () => {
        searchInput.value = '';
        _searchTerm = '';
        searchClear.classList.add('hidden');
        _page = 1;
        _applyAndRender();
    });

    document.getElementById('typeFilter')?.addEventListener('change', e => {
        _typeFilter = e.target.value;
        _page = 1;
        _applyAndRender();
    });
    document.getElementById('sortFilter')?.addEventListener('change', e => {
        _sortMode = e.target.value;
        _applyAndRender();
    });

    document.querySelectorAll('.stat-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.stat-pill').forEach(p => p.classList.remove('active-pill'));
            pill.classList.add('active-pill');
            _activeFilter = pill.dataset.filter || 'all';
            _page = 1;
            _applyAndRender();
        });
    });

    document.getElementById('clearFiltersBtn')?.addEventListener('click', _resetFilters);
    document.getElementById('emptyResetBtn')?.addEventListener('click',   _resetFilters);
    document.getElementById('refreshBtn')?.addEventListener('click',      _loadAll);

    document.getElementById('prevBtn')?.addEventListener('click', () => { _page--; _renderGrid(); });
    document.getElementById('nextBtn')?.addEventListener('click', () => { _page++; _renderGrid(); });

    document.getElementById('examModalClose')?.addEventListener('click',    () => _closeModal('examModal'));
    document.getElementById('examModalCancelBtn')?.addEventListener('click', () => _closeModal('examModal'));
    document.getElementById('examModalStartBtn')?.addEventListener('click', e  => {
        e.preventDefault();
        _closeModal('examModal');
        if (_pendingStartId) _openStartConfirm(_pendingStartId);
    });
    document.getElementById('startModalClose')?.addEventListener('click',  () => _closeModal('startModal'));
    document.getElementById('startCancelBtn')?.addEventListener('click',   () => _closeModal('startModal'));
    document.getElementById('startConfirmBtn')?.addEventListener('click',  _handleStartConfirm);

    ['examModal', 'startModal'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', e => {
            if (e.target.id === id) _closeModal(id);
        });
    });
}

// ══════════════════════════════════════════════════════════════════
//  LOAD DATA
// ══════════════════════════════════════════════════════════════════
async function _loadAll() {
    _showState('loading');
    try {
        const [examsRes, attemptsRes] = await Promise.allSettled([
            Api.get(CONFIG.ENDPOINTS.EXAMS_AVAILABLE, { page_size: 500 }),
            Api.get(CONFIG.ENDPOINTS.EXAMS_MY_ATTEMPTS, { page_size: 500 }),
        ]);

        if (examsRes.status === 'fulfilled') {
            const { data, error } = await Api.parse(examsRes.value);
            if (!error && data) _allExams = Array.isArray(data) ? data : (data.results ?? []);
        }

        if (attemptsRes.status === 'fulfilled') {
            const { data } = await Api.parse(attemptsRes.value);
            if (data) _attempts = Array.isArray(data) ? data : (data.results ?? []);
        }

        _updateStatPills();
        _applyAndRender();
        _loadNotifCount();

    } catch (err) {
        console.error('[exams] loadAll:', err);
        _showState('empty');
        _setText('emptyTitle',    'Failed to Load');
        _setText('emptySubtitle', 'Could not connect. Please try again.');
    }
}

// ── Stat Pills ─────────────────────────────────────────────────────
function _updateStatPills() {
    const now = Date.now();
    const ids = _getAttemptedIds();
    const c   = { live:0, upcoming:0, attempted:0, missed:0 };
    _allExams.forEach(e => {
        const s = _statusOf(e, now, ids);
        if (c[s] !== undefined) c[s]++;
    });
    _setText('statAll',       _allExams.length);
    _setText('statLive',      c.live);
    _setText('statUpcoming',  c.upcoming);
    _setText('statAttempted', c.attempted);
    _setText('statMissed',    c.missed);
}

// ── Filter + Sort ──────────────────────────────────────────────────
function _applyAndRender() {
    const now = Date.now();
    const ids = _getAttemptedIds();

    let list = _allExams.filter(e => {
        const s = _statusOf(e, now, ids);
        if (_activeFilter !== 'all' && s !== _activeFilter) return false;
        if (_searchTerm && !(
            (e.title       || '').toLowerCase().includes(_searchTerm) ||
            (e.description || '').toLowerCase().includes(_searchTerm) ||
            (e.exam_type   || '').toLowerCase().includes(_searchTerm)
        )) return false;
        if (_typeFilter && (e.exam_type || '').toLowerCase() !== _typeFilter) return false;
        return true;
    });

    list.sort((a, b) => {
        switch (_sortMode) {
            case 'start_asc':  return new Date(a.start_time) - new Date(b.start_time);
            case 'start_desc': return new Date(b.start_time) - new Date(a.start_time);
            case 'title_asc':  return (a.title||'').localeCompare(b.title||'');
            case 'title_desc': return (b.title||'').localeCompare(a.title||'');
            case 'marks_desc': return (b.total_marks||0) - (a.total_marks||0);
            default: return 0;
        }
    });

    _filtered = list;
    _page = Math.min(_page, Math.max(1, Math.ceil(list.length / PAGE_SIZE)));
    _updateResultsInfo(list.length);
    _renderGrid();
}

function _updateResultsInfo(count) {
    const infoEl   = document.getElementById('resultsInfo');
    const clearBtn = document.getElementById('clearFiltersBtn');
    if (!infoEl) return;
    const has = _searchTerm || _typeFilter || _activeFilter !== 'all';
    infoEl.classList.remove('hidden');
    _setText('resultsText', `${count} exam${count !== 1 ? 's' : ''} found`);
    clearBtn?.classList.toggle('hidden', !has);
}

// ══════════════════════════════════════════════════════════════════
//  RENDER GRID
// ══════════════════════════════════════════════════════════════════
function _renderGrid() {
    const grid    = document.getElementById('examsGrid');
    const paginEl = document.getElementById('pagination');
    const resetBtn = document.getElementById('emptyResetBtn');
    if (!grid) return;

    if (!_filtered.length) {
        _showState('empty');
        const has = _searchTerm || _typeFilter || _activeFilter !== 'all';
        _setText('emptyTitle',    has ? 'No Matching Exams'  : 'No Exams Available');
        _setText('emptySubtitle', has ? 'Try adjusting your search or filters.' : 'Check back later for new exams.');
        if (resetBtn) resetBtn.style.display = has ? 'inline-flex' : 'none';
        return;
    }

    _showState('grid');

    const now        = Date.now();
    const ids        = _getAttemptedIds();
    const totalPages = Math.ceil(_filtered.length / PAGE_SIZE);
    const start      = (_page - 1) * PAGE_SIZE;
    const items      = _filtered.slice(start, start + PAGE_SIZE);

    grid.innerHTML = items.map(e => _buildCard(e, now, ids)).join('');

    grid.querySelectorAll('.ec-detail-btn').forEach(btn =>
        btn.addEventListener('click', () => _openDetailModal(btn.dataset.id))
    );
    grid.querySelectorAll('.ec-start-btn').forEach(btn =>
        btn.addEventListener('click', ev => {
            ev.stopPropagation();
            _openStartConfirm(btn.dataset.id);
        })
    );

    if (totalPages > 1) {
        paginEl.style.display = 'flex';
        document.getElementById('prevBtn').disabled = _page <= 1;
        document.getElementById('nextBtn').disabled = _page >= totalPages;
        _setText('pageInfo', `Page ${_page} of ${totalPages}`);
    } else {
        paginEl.style.display = 'none';
    }
}

// ── Build Card ─────────────────────────────────────────────────────
function _buildCard(e, now, ids) {
    const status  = _statusOf(e, now, ids);
    const startMs = new Date(e.start_time).getTime();
    const endMs   = new Date(e.end_time).getTime();

    const cardCls = { live:'card-live', upcoming:'card-upcoming', attempted:'card-attempted', missed:'card-missed' }[status] || '';

    const badge = {
        live:      `<span class="ec-badge live"><span class="live-dot"></span> Live Now</span>`,
        upcoming:  `<span class="ec-badge upcoming"><i class="fas fa-clock"></i> ${_rel(startMs)}</span>`,
        open:      `<span class="ec-badge open"><i class="fas fa-door-open"></i> Open</span>`,
        attempted: `<span class="ec-badge attempted"><i class="fas fa-check-circle"></i> Attempted</span>`,
        missed:    `<span class="ec-badge missed"><i class="fas fa-times-circle"></i> Missed</span>`,
    }[status] || '';

    const timer = status === 'live'
        ? (() => {
            const diff = endMs - now;
            const cls  = diff < 15 * 60_000 ? 'warning' : '';
            return `<span class="ec-timer ${cls}"><i class="fas fa-hourglass-half"></i> ${_fmtMs(diff)} left</span>`;
          })()
        : (status === 'upcoming'
            ? `<span class="ec-timer"><i class="fas fa-calendar-alt"></i> ${_fmtDate(e.start_time)}</span>`
            : '');

    const chips = [
        e.total_questions != null ? `<span class="ec-chip"><i class="fas fa-question-circle"></i>${e.total_questions} Q</span>`  : '',
        e.duration        != null ? `<span class="ec-chip"><i class="fas fa-clock"></i>${e.duration} min</span>`                  : '',
        e.total_marks     != null ? `<span class="ec-chip"><i class="fas fa-star"></i>${e.total_marks} marks</span>`              : '',
        e.exam_type             ? `<span class="ec-chip"><i class="fas fa-tag"></i>${_esc(e.exam_type)}</span>`                   : '',
        e.allowed_departments?.length
            ? `<span class="ec-chip"><i class="fas fa-building"></i>${_esc(e.allowed_departments.join(', '))}</span>` : '',
    ].filter(Boolean).join('');

    const canStart  = status === 'live' || status === 'open';
    const actionBtn = canStart
        ? `<button class="btn btn-primary btn-sm ec-start-btn" data-id="${_esc(String(e.id))}">
               <i class="fas fa-play"></i> Start
           </button>`
        : (status === 'attempted'
            ? `<a href="results.html" class="btn btn-outline btn-sm">
                   <i class="fas fa-chart-bar"></i> View Result
               </a>`
            : `<button class="btn btn-outline btn-sm" disabled>
                   <i class="fas fa-${status === 'upcoming' ? 'lock' : 'ban'}"></i>
                   ${status === 'upcoming' ? 'Not Yet' : 'Unavailable'}
               </button>`);

    return `
    <div class="exam-card ${cardCls}">
        <div class="ec-top">
            <div class="ec-title">${_esc(e.title)}</div>
            ${badge}
        </div>
        ${chips ? `<div class="ec-meta">${chips}</div>` : ''}
        <div class="ec-timing">
            ${e.start_time ? `<i class="fas fa-calendar-alt"></i><span>${_fmtDate(e.start_time)}</span>` : ''}
            ${e.end_time   ? `<span>→ ${_fmtDate(e.end_time)}</span>` : ''}
            ${timer}
        </div>
        ${e.instructions ? `<div class="ec-instructions">${_esc(e.instructions)}</div>` : ''}
        <div class="ec-actions">
            <button class="btn btn-outline btn-sm ec-detail-btn" data-id="${_esc(String(e.id))}">
                <i class="fas fa-info-circle"></i> Details
            </button>
            ${actionBtn}
        </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════
//  DETAIL MODAL
// ══════════════════════════════════════════════════════════════════
async function _openDetailModal(examId) {
    const modal    = document.getElementById('examModal');
    const body     = document.getElementById('examModalBody');
    const startBtn = document.getElementById('examModalStartBtn');
    if (!modal) return;

    _pendingStartId = null;
    body.innerHTML  = `<div class="loading-state"><div class="spinner"></div><p>Loading…</p></div>`;
    startBtn.style.display = 'none';
    modal.classList.add('open');

    try {
        const res = await Api.get(CONFIG.ENDPOINTS.EXAM_DETAIL(examId));
        const { data, error } = await Api.parse(res);

        if (error || !data) {
            body.innerHTML = `<p style="color:#ef4444; font-size:0.875rem;">Could not load exam details.</p>`;
            return;
        }

        const canStart = (() => {
            const s = _statusOf(data, Date.now(), _getAttemptedIds());
            return s === 'live' || s === 'open';
        })();

        body.innerHTML = `
        <div class="ed-title">${_esc(data.title)}</div>
        ${data.description ? `<p class="ed-desc">${_esc(data.description)}</p>` : ''}
        <div class="ed-grid">
            <div class="ed-item"><span class="ed-label">Type</span><span class="ed-value">${_esc(data.exam_type || '—')}</span></div>
            <div class="ed-item"><span class="ed-label">Duration</span><span class="ed-value">${data.duration != null ? data.duration + ' min' : '—'}</span></div>
            <div class="ed-item"><span class="ed-label">Total Marks</span><span class="ed-value">${data.total_marks ?? '—'}</span></div>
            <div class="ed-item"><span class="ed-label">Passing Marks</span><span class="ed-value">${data.passing_marks ?? '—'}</span></div>
            <div class="ed-item"><span class="ed-label">Questions</span><span class="ed-value">${data.total_questions ?? '—'}</span></div>
            <div class="ed-item"><span class="ed-label">Departments</span><span class="ed-value">${Array.isArray(data.allowed_departments) ? _esc(data.allowed_departments.join(', ')) : '—'}</span></div>
            <div class="ed-item"><span class="ed-label">Start</span><span class="ed-value">${_fmtDateTime(data.start_time)}</span></div>
            <div class="ed-item"><span class="ed-label">End</span><span class="ed-value">${_fmtDateTime(data.end_time)}</span></div>
        </div>
        ${data.instructions ? `
        <p class="ed-instructions-title"><i class="fas fa-info-circle"></i> Instructions</p>
        <div class="ed-instructions-body">${_esc(data.instructions)}</div>` : ''}`;

        if (canStart) {
            _pendingStartId = examId;
            startBtn.style.display = 'inline-flex';
        }

    } catch (err) {
        console.error('[exams] detailModal:', err);
        body.innerHTML = `<p style="color:#ef4444; font-size:0.875rem;">Failed to load details.</p>`;
    }
}

// ══════════════════════════════════════════════════════════════════
//  START CONFIRM MODAL
// ══════════════════════════════════════════════════════════════════
function _openStartConfirm(examId, examData) {
    const exam = examData || _allExams.find(e => String(e.id) === String(examId));
    _pendingStartId = examId;

    _setText('startExamName', exam?.title || 'this exam');
    _setText('startDuration', exam?.duration   != null ? exam.duration   + ' min' : '—');
    _setText('startMarks',    exam?.total_marks   ?? '—');
    _setText('startPassing',  exam?.passing_marks ?? '—');

    document.getElementById('startModal')?.classList.add('open');
}

async function _handleStartConfirm() {
    if (!_pendingStartId) return;
    const btn   = document.getElementById('startConfirmBtn');
    const txt   = btn?.querySelector('.btn-text');
    const load  = btn?.querySelector('.btn-loader');

    txt?.classList.add('hidden');
    load?.classList.remove('hidden');
    btn.disabled = true;

    try {
        const res = await Api.post(CONFIG.ENDPOINTS.EXAM_ATTEMPT(_pendingStartId), {});
        const { data, error } = await Api.parse(res);

        if (error) {
            const msg = typeof error === 'string' ? error : (error.detail || error.error || 'Could not start exam.');
            _closeModal('startModal');
            _showAlert(msg, 'error');
            return;
        }

        const attemptId = data?.attempt_id || data?.id;
        window.location.href = `exam-taking.html?exam_id=${_pendingStartId}${attemptId ? '&attempt_id=' + attemptId : ''}`;

    } catch (err) {
        console.error('[exams] startConfirm:', err);
        _closeModal('startModal');
        _showAlert('Failed to start exam. Please try again.', 'error');
    } finally {
        txt?.classList.remove('hidden');
        load?.classList.add('hidden');
        if (btn) btn.disabled = false;
    }
}

// ── Notification Count ─────────────────────────────────────────────
async function _loadNotifCount() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.NOTIF_COUNT);
        const { data } = await Api.parse(res);
        const n = typeof data === 'number' ? data : (data?.unread_count ?? data?.count ?? 0);
        badge.textContent = n;
        badge.classList.toggle('hidden', n === 0);
    } catch { /* non-critical */ }
}

// ══════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════
function _getAttemptedIds() {
    return new Set(_attempts.map(a => String(a.exam_id || a.exam?.id || a.exam)));
}

function _statusOf(exam, now, ids) {
    const s = new Date(exam.start_time).getTime();
    const e = new Date(exam.end_time).getTime();
    const id = String(exam.id);
    if (ids.has(id))         return 'attempted';
    if (now >= s && now <= e) return 'live';
    if (now > e)              return 'missed';
    return 'upcoming';
}

function _resetFilters() {
    const si = document.getElementById('searchInput');
    const tf = document.getElementById('typeFilter');
    const sf = document.getElementById('sortFilter');
    if (si) si.value = '';
    if (tf) tf.value = '';
    if (sf) sf.value = 'start_asc';
    _searchTerm = ''; _typeFilter = ''; _sortMode = 'start_asc';
    _activeFilter = 'all'; _page = 1;
    document.querySelectorAll('.stat-pill').forEach(p => p.classList.remove('active-pill'));
    document.getElementById('filterAll')?.classList.add('active-pill');
    document.getElementById('searchClear')?.classList.add('hidden');
    _applyAndRender();
}

function _showState(state) {
    const el = { loading: 'loadingState', empty: 'emptyState', grid: 'examsGrid' };
    ['loadingState','emptyState','examsGrid'].forEach(id => {
        const node = document.getElementById(id);
        if (!node) return;
        if (id === 'loadingState') node.style.display = state === 'loading' ? 'flex'  : 'none';
        if (id === 'emptyState')   node.style.display = state === 'empty'   ? 'flex'  : 'none';
        if (id === 'examsGrid')    node.style.display = state === 'grid'    ? 'grid'  : 'none';
    });
    const pag = document.getElementById('pagination');
    if (pag) pag.style.display = state === 'grid' ? 'flex' : 'none';
}

function _closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

function _showAlert(msg, type = 'error') {
    const c = document.getElementById('alertContainer');
    if (!c) return;
    const div = document.createElement('div');
    div.className = `alert alert-${type}`;
    div.innerHTML = `<i class="fas fa-${type === 'error' ? 'exclamation-circle' : 'check-circle'}"></i>
        ${_esc(msg)}
        <button onclick="this.parentElement.remove()"
            style="margin-left:auto;background:none;border:none;cursor:pointer;font-size:1rem;">&times;</button>`;
    div.style.cssText = 'display:flex;align-items:center;gap:.5rem;';
    c.prepend(div);
    setTimeout(() => div.remove(), 5000);
}

function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val ?? '');
}
function _fmtMs(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const p = n => String(n).padStart(2, '0');
    return h > 0 ? `${p(h)}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}
function _dur(ms) {
    const min = Math.floor(ms / 60_000), hr = Math.floor(min / 60), day = Math.floor(hr / 24);
    if (day > 0) return `${day}d ${hr % 24}h`;
    if (hr  > 0) return `${hr}h ${min % 60}m`;
    return `${min}m`;
}
function _rel(ts)      { const d = ts - Date.now(); return d <= 0 ? 'now' : _dur(d); }
function _fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}
function _fmtDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function _esc(s) {
    return String(s ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
