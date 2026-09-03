/**
 * TestVerse — Staff Live Monitor
 *
 * Reads ?id= from URL → polls these endpoints every N seconds:
 *   GET STAFF_EXAM_LIVE_MONITOR(examId)   → student list, progress, time left
 *   GET STAFF_EXAM_STATISTICS(examId)     → aggregate KPIs
 *
 * This page is read-only monitoring for staff.
 */
'use strict';

// ── State ──────────────────────────────────────────────────────────
let _examId       = null;
let _examData     = null;
let _students     = [];     // raw list from live-monitor
let _pollTimer    = null;
let _countdownId  = null;
let _pollInterval = 15000;  // ms — updated from selector
let _searchQ      = '';
let _statusF      = '';

// ── Boot ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireStaff()) return;
    _initSidebar();
    _initTopbar();

    // Read exam ID from URL
    const params = new URLSearchParams(window.location.search);
    _examId = params.get('id') || params.get('examId');
    if (!_examId) {
        _showAlert('No exam ID provided. Please go back and select an exam.', 'error');
        return;
    }

    _initControls();
    await _loadExamMeta();
    await _fetchLiveData();
    _startPolling();
});

// ══════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════

function _initTopbar() {
    const u    = Auth.getUser(); if (!u) return;
    const name = u.name || u.username || 'Staff';
    const av   = _avatar(name);
    _setText('sidebarName', name); _setText('topbarName', name);
    _setImg('sidebarAvatar', av);  _setImg('topbarAvatar', av);
}

function _initSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('sidebarOverlay');
    const o  = () => { sb?.classList.add('open');    ov?.classList.add('show'); };
    const cl = () => { sb?.classList.remove('open'); ov?.classList.remove('show'); };
    document.getElementById('menuToggle')?.addEventListener('click', o);
    document.getElementById('sidebarClose')?.addEventListener('click', cl);
    ov?.addEventListener('click', cl);
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Logout from TestVerse?')) Auth.logout();
    });
}

function _initControls() {
    // Poll interval selector
    const sel = document.getElementById('pollInterval');
    sel?.addEventListener('change', () => {
        _pollInterval = parseInt(sel.value, 10);
        _setText('hintInterval', _pollInterval / 1000);
        _startPolling(); // restart with new interval
    });
    _setText('hintInterval', '15');

    // Manual refresh
    document.getElementById('refreshNowBtn')?.addEventListener('click', () => _fetchLiveData());

    // Search
    let timer;
    document.getElementById('studentSearch')?.addEventListener('input', e => {
        clearTimeout(timer);
        timer = setTimeout(() => { _searchQ = e.target.value.toLowerCase(); _renderTable(); }, 200);
    });

    // Status filter
    document.getElementById('statusFilter')?.addEventListener('change', e => {
        _statusF = e.target.value; _renderTable();
    });
}

// ══════════════════════════════════════════════════════════════════
//  DATA LOADING
// ══════════════════════════════════════════════════════════════════

async function _loadExamMeta() {
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.STAFF_EXAM_DETAIL(_examId));
        const { data, error } = await Api.parse(res);
        if (error || !data) return;
        _examData = data;
        _renderExamHeader(data);
        _startCountdown(data.end_time);
    } catch { /* non-critical */ }
}

async function _fetchLiveData() {
    _spinPollIcon(true);
    try {
        // Fetch both in parallel
        const [monRes, statRes] = await Promise.all([
            Api.get(CONFIG.ENDPOINTS.STAFF_EXAM_LIVE_MONITOR(_examId)),
            Api.get(CONFIG.ENDPOINTS.STAFF_EXAM_STATISTICS(_examId)),
        ]);

        const { data: monData,  error: monErr  } = await Api.parse(monRes);
        const { data: statData, error: statErr } = await Api.parse(statRes);

        if (monErr && statErr) {
            _showAlert('Could not fetch live data. Retrying…', 'error'); return;
        }

        // Students come from live-monitor endpoint (supports legacy and new payloads)
        const rawStudents = Array.isArray(monData)
            ? monData
            : (monData?.live_attempts ?? monData?.students ?? monData?.results ?? []);
        const students = rawStudents.map(_normalizeLiveStudent);
        _students = students;

        // Build KPIs from live-monitor summary, statistics endpoint, or student list
        const kpi = _buildKpis({ ...(monData || {}), ...(statData || {}) }, students);
        _renderKpis(kpi);
        _renderAggBar(kpi);
        _renderTable();

        // Update last refresh time
        _setText('kpiLastUpdate', _timeNow());
        _updateLiveIndicator(true);
        _clearAlert();

        // Show content first time
        document.getElementById('pageLoading').style.display  = 'none';
        document.getElementById('monitorContent').style.display = '';
        document.getElementById('examHeaderCard').style.display = '';

    } catch (err) {
        _showAlert('Network error during live fetch.', 'error');
    } finally {
        _spinPollIcon(false);
    }
}

// ──────────────────────────────────────────────────────────────────
//  KPIs
// ──────────────────────────────────────────────────────────────────
function _buildKpis(stat, students) {
    // Prefer stats endpoint values, fallback to computing from student list
    const total      = stat?.total_students
                    ?? stat?.total_students_registered
                    ?? stat?.totalAttempts
                    ?? stat?.total
                    ?? students.length;
    const active     = stat?.active_students
                    ?? stat?.active_count
                    ?? stat?.in_progress
                    ??
                       students.filter(s => _normStatus(s) === 'in_progress').length;
    const submitted  = stat?.submitted_count
                    ?? stat?.completed_count
                    ?? stat?.submitted
                    ??
                       students.filter(s => _normStatus(s) === 'submitted').length;
    const notStarted = stat?.not_started_count ?? (total - active - submitted);
    const avgProg    = stat?.average_progress
                    ?? stat?.avg_progress
                    ?? (students.length
                        ? (students.reduce((a, s) => a + _toNumber(_normPct(s)), 0) / students.length).toFixed(0)
                        : 0);
    return { total, active, submitted, notStarted: Math.max(0, notStarted), avgProg };
}

function _renderKpis(k) {
    _setText('kpiActive',     k.active);
    _setText('kpiSubmitted',  k.submitted);
    _setText('kpiNotStarted', k.notStarted);
    _setText('kpiTotal',      k.total);
    _setText('kpiAvgProg',    k.avgProg + '%');
}

function _renderAggBar(k) {
    const tot  = k.total || 1;
    const subP = ((k.submitted  / tot) * 100).toFixed(1);
    const actP = ((k.active     / tot) * 100).toFixed(1);
    const pct  = ((( k.submitted + k.active) / tot) * 100).toFixed(0);
    _setProp('aggSubmittedFill', 'width', subP + '%');
    _setProp('aggActiveFill',    'width', actP + '%');
    _setText('aggPct', pct + '%');
}

// ──────────────────────────────────────────────────────────────────
//  TABLE
// ──────────────────────────────────────────────────────────────────
function _renderTable() {
    const tbody = document.getElementById('monitorTableBody');
    const empty = document.getElementById('tableEmpty');
    if (!tbody) return;

    // Filter
    let list = _students.filter(s => {
        const st = s.student || s.user || s;
        const name  = (st.name || st.username || st.email || '').toLowerCase();
        const email = (st.email || '').toLowerCase();
        const matchQ = !_searchQ || name.includes(_searchQ) || email.includes(_searchQ);
        const matchS = !_statusF || _normStatus(s) === _statusF;
        return matchQ && matchS;
    });

    _setText('monitorCount', `${list.length} student${list.length !== 1 ? 's' : ''}`);

    if (!list.length) {
        tbody.innerHTML = '';
        empty.style.display = 'flex';
        return;
    }
    empty.style.display = 'none';

    tbody.innerHTML = list.map((s, idx) => _buildRow(s, idx + 1)).join('');
}

function _buildRow(s, idx) {
    const st       = s.student || s.user || {};
    const name     = st.name || s.student_name || st.username || s.student_username || st.email?.split('@')[0] || s.student_email?.split('@')[0] || '—';
    const email    = st.email || s.student_email || '';
    const status   = _normStatus(s);
    const pct      = _normPct(s);
    const answered = _fmtCount(
        s.answered_questions
        ?? s.answers_count
        ?? s.answers_submitted
        ?? s.answered_count
        ?? s.questions_answered
        ?? s.answered
    );
    const total_q  = _fmtCount(
        s.total_questions
        ?? s.question_count
        ?? s.total_question_count
        ?? s.questions_total
        ?? s.exam_question_count
        ?? s.exam?.question_count
        ?? s.exam?.total_questions
        ?? _examData?.question_count
        ?? _examData?.total_questions
    );
    const timeLeft = _fmtTimeLeft(s);
    const startedAt= s.started_at ? _fmtTime(s.started_at) : '—';
    const av       = _avatar(name);

    const statusHTML = {
        in_progress: `<span class="status-badge s-in-progress"><span class="s-dot"></span>In Progress</span>`,
        submitted:   `<span class="status-badge s-submitted"><span class="s-dot"></span>Submitted</span>`,
        not_started: `<span class="status-badge s-not-started"><span class="s-dot"></span>Not Started</span>`,
    }[status] || `<span class="status-badge s-not-started">${status}</span>`;

    const timeClass = _timeClass(s);

    return `<tr>
        <td class="row-num">${idx}</td>
        <td>
            <div class="student-cell">
                <img class="student-avatar" src="${av}" alt="">
                <div>
                    <div class="student-name">${_esc(name)}</div>
                    <div class="student-email">${_esc(email)}</div>
                </div>
            </div>
        </td>
        <td>${statusHTML}</td>
        <td>
            <div class="progress-cell">
                <div class="prog-track">
                    <div class="prog-fill" style="width:${pct}%"></div>
                </div>
                <span class="prog-pct">${pct}%</span>
            </div>
        </td>
        <td style="font-weight:600;color:#94a3b8;">${answered}${total_q !== '—' ? '<span style="color:#334155;font-weight:400;"> / '+total_q+'</span>' : ''}</td>
        <td><span class="time-left ${timeClass}">${timeLeft}</span></td>
        <td style="font-size:.78rem;color:#475569;">${startedAt}</td>
    </tr>`;
}

// ──────────────────────────────────────────────────────────────────
//  EXAM HEADER + COUNTDOWN
// ──────────────────────────────────────────────────────────────────
function _renderExamHeader(e) {
    _setText('examTitle',    e.title || '—');
    _setText('examType',     e.exam_type || '—');
    _setText('examDuration', e.duration || '—');
    _setText('examMarks',    e.total_marks || '—');
    _setText('examStart',    e.start_time ? _fmtTime(e.start_time) : '—');
    _setText('examEnd',      e.end_time   ? _fmtTime(e.end_time)   : '—');
}

function _startCountdown(endTimeIso) {
    if (_countdownId) clearInterval(_countdownId);
    const el = document.getElementById('examCountdown');
    if (!el || !endTimeIso) return;
    const end = new Date(endTimeIso).getTime();
    const tick = () => {
        const diff = end - Date.now();
        if (diff <= 0) {
            el.textContent = 'ENDED';
            el.classList.add('urgent');
            clearInterval(_countdownId);
            return;
        }
        el.textContent = _fmtMs(diff);
        el.classList.toggle('urgent', diff < 5 * 60 * 1000); // urgent if < 5 min
    };
    tick();
    _countdownId = setInterval(tick, 1000);
}

// ══════════════════════════════════════════════════════════════════
//  POLLING
// ══════════════════════════════════════════════════════════════════
function _startPolling() {
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(_fetchLiveData, _pollInterval);
}

// Stop polling when tab hidden, resume when visible (saves API calls)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        clearInterval(_pollTimer); _pollTimer = null;
        _updateLiveIndicator(false);
    } else {
        _fetchLiveData();
        _startPolling();
        _updateLiveIndicator(true);
    }
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
    clearInterval(_pollTimer);
    clearInterval(_countdownId);
});

// ══════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════

function _normStatus(s) {
    const raw = s.status || s.attempt_status || (s.time_remaining_minutes != null ? 'in_progress' : '');
    if (/in.?progress|ongoing|started/i.test(raw)) return 'in_progress';
    if (/submit/i.test(raw))                        return 'submitted';
    return 'not_started';
}

function _normPct(s) {
    const direct = s.progress_percent
        ?? s.progress_percentage
        ?? s.progress
        ?? s.completion_percentage
        ?? s.completion_percent
        ?? s.percent_complete
        ?? s.percentage_complete;

    const directN = parseFloat(direct);
    if (Number.isFinite(directN)) {
        return Math.max(0, Math.min(100, Math.round(directN)));
    }

    const a = _toNumber(
        s.answered_questions
        ?? s.answers_count
        ?? s.answers_submitted
        ?? s.answered_count
        ?? s.questions_answered
        ?? s.answered
        ?? 0
    );
    const t = _toNumber(
        s.total_questions
        ?? s.question_count
        ?? s.total_question_count
        ?? s.questions_total
        ?? s.exam_question_count
        ?? s.exam?.question_count
        ?? s.exam?.total_questions
        ?? _examData?.question_count
        ?? _examData?.total_questions
        ?? 0
    );
    return t > 0 ? Math.round((a / t) * 100) : 0;
}

function _fmtTimeLeft(s) {
    if (_normStatus(s) === 'submitted') return 'Done';
    const rawSeconds = s.time_remaining != null
        ? s.time_remaining
        : (s.time_remaining_minutes != null ? Math.round(parseFloat(s.time_remaining_minutes) * 60) : null);
    if (rawSeconds == null || Number.isNaN(parseFloat(rawSeconds))) return '—';
    const secs = parseInt(rawSeconds, 10);
    if (secs <= 0) return '00:00';
    return _fmtMs(secs * 1000);
}

function _timeClass(s) {
    if (_normStatus(s) === 'submitted') return 'done';
    const rawSeconds = s.time_remaining != null
        ? s.time_remaining
        : (s.time_remaining_minutes != null ? Math.round(parseFloat(s.time_remaining_minutes) * 60) : -1);
    const secs = parseInt(rawSeconds ?? -1, 10);
    if (secs < 0)    return '';
    if (secs < 300)  return 'low';    // < 5 min
    if (secs < 900)  return 'mid';    // < 15 min
    return 'ok';
}

function _normalizeLiveStudent(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};

    const student = s.student || s.user || {
        id: s.student_id || s.user_id || s.id || '',
        name: s.student_name || s.name || s.studentName || '',
        email: s.student_email || s.email || '',
    };

    const answered = s.answered_questions
        ?? s.answers_count
        ?? s.answers_submitted
        ?? s.answered_count
        ?? s.questions_answered
        ?? s.attempted_questions
        ?? s.answered
        ?? 0;
    const totalQuestions = s.total_questions
        ?? s.question_count
        ?? s.total_question_count
        ?? s.questions_total
        ?? s.exam_question_count
        ?? s.exam?.question_count
        ?? s.exam?.total_questions
        ?? _examData?.question_count
        ?? _examData?.total_questions
        ?? 0;
    const progress = s.progress_percentage
        ?? s.progress_percent
        ?? s.progress
        ?? s.completion_percentage
        ?? s.completion_percent
        ?? s.percent_complete
        ?? s.percentage_complete
        ?? (totalQuestions > 0 ? (answered / totalQuestions) * 100 : 0);
    const remaining = s.time_remaining
        ?? s.time_left_seconds
        ?? s.remaining_seconds
        ?? s.time_remaining_seconds
        ?? s.time_left
        ?? (s.time_remaining_minutes != null ? Math.round(parseFloat(s.time_remaining_minutes) * 60) : null);

    return {
        ...s,
        student,
        status: s.status || s.attempt_status || (remaining != null ? 'in_progress' : 'not_started'),
        answered_questions: answered,
        total_questions: totalQuestions,
        progress_percentage: progress,
        time_remaining: remaining,
    };
}

function _toNumber(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
}

function _fmtCount(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? String(Math.max(0, Math.round(n))) : '—';
}

function _fmtMs(ms) {
    const s   = Math.floor(ms / 1000);
    const h   = Math.floor(s / 3600);
    const m   = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const p   = n => String(n).padStart(2, '0');
    return h > 0 ? `${p(h)}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

function _fmtTime(iso) {
    return new Date(iso).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
}

function _timeNow() {
    return new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

function _spinPollIcon(on) {
    document.getElementById('pollIcon')?.classList.toggle('spinning', on);
}

function _updateLiveIndicator(on) {
    const el = document.getElementById('liveIndicator');
    if (!el) return;
    el.style.opacity = on ? '1' : '0.4';
}

// Alert
let _alertTimer;
function _showAlert(msg, type = 'info') {
    const w = document.getElementById('alertContainer'); if (!w) return;
    const icons = { error:'exclamation-circle', success:'check-circle', info:'info-circle', warning:'exclamation-triangle' };
    w.innerHTML = `<div class="alert alert-${type}"><i class="fas fa-${icons[type]||'info-circle'}"></i><span>${_esc(msg)}</span></div>`;
    clearTimeout(_alertTimer);
    _alertTimer = setTimeout(() => { w.innerHTML = ''; }, type === 'error' ? 8000 : 4000);
}
function _clearAlert() {
    const w = document.getElementById('alertContainer'); if (w) w.innerHTML = '';
}

function _avatar(n) { return `https://ui-avatars.com/api/?name=${encodeURIComponent(n||'?')}&background=6366f1&color=fff&size=64`; }
function _setText(id, v)    { const e = document.getElementById(id); if (e) e.textContent = String(v ?? ''); }
function _setImg(id, src)   { const e = document.getElementById(id); if (e) e.src = src; }
function _setProp(id, p, v) { const e = document.getElementById(id); if (e) e.style[p] = v; }
function _extractErr(e) {
    if (!e) return 'Something went wrong.';
    if (typeof e === 'string') return e;
    return e.detail || e.message || e.error || Object.values(e)[0] || 'Something went wrong.';
}
function _esc(s) {
    return String(s ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
