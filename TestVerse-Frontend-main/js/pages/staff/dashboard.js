/**
 * TestVerse — Staff Dashboard
 *
 * Loads in parallel:
 *  1. User info
 *  2. Exam stats (total, published, live count)
 *  3. Recent exams list
 *  4. Recent results
 *  5. Top students
 *  6. Notification badge
 *  7. ★ Live exams widget (polls every 30s)
 */
'use strict';

let _liveWidgetTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    if (!Auth.requireStaff()) return;
    _initSidebar();
    _loadDashboard();
});

// ══════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════

function _initSidebar() {
    const sidebar      = document.getElementById('sidebar');
    const mobileToggle = document.getElementById('mobileSidebarToggle');
    const logoutBtn    = document.getElementById('logoutBtn');

    mobileToggle?.addEventListener('click', () => sidebar?.classList.toggle('open'));

    document.addEventListener('click', e => {
        if (window.innerWidth <= 768 &&
            !sidebar?.contains(e.target) &&
            !mobileToggle?.contains(e.target)) {
            sidebar?.classList.remove('open');
        }
    });

    logoutBtn?.addEventListener('click', () => {
        if (confirm('Are you sure you want to logout?')) Auth.logout();
    });

    // Live refresh button inside widget
    document.getElementById('liveRefreshBtn')?.addEventListener('click', () => _loadLiveExams());
}

// ══════════════════════════════════════════════════════════════════
//  DASHBOARD BOOT
// ══════════════════════════════════════════════════════════════════

async function _loadDashboard() {
    _updateUserInfo(Auth.getUser());

    await Promise.allSettled([
        _loadStats(),
        _loadRecentExams(),
        _loadRecentResults(),
        _loadTopStudents(),
        _loadNotifications(),
        _loadLiveExams(),          // ★ new
    ]);

    // Start polling live widget every 30s
    _startLivePoll();

    // Pause/resume poll on tab visibility
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            clearInterval(_liveWidgetTimer); _liveWidgetTimer = null;
        } else {
            _loadLiveExams();
            _startLivePoll();
        }
    });
}

function _startLivePoll() {
    if (_liveWidgetTimer) clearInterval(_liveWidgetTimer);
    _liveWidgetTimer = setInterval(_loadLiveExams, 30_000);
}

// ══════════════════════════════════════════════════════════════════
//  USER INFO
// ══════════════════════════════════════════════════════════════════

function _updateUserInfo(user) {
    if (!user) return;
    const name      = user.name || user.username || user.email?.split('@')[0] || 'Staff';
    const firstName = name.split(' ')[0];
    _setText('userName',    name);
    _setText('welcomeName', firstName);
    const av = document.getElementById('userAvatar');
    if (av) {
        av.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff`;
        av.alt = `${name}'s avatar`;
    }
}

// ══════════════════════════════════════════════════════════════════
//  STATS  (fixed — no more Math.random)
// ══════════════════════════════════════════════════════════════════

async function _loadStats() {
    try {
        // 1. Total exams
        const [totalRes, publishedRes, studentsRes, liveRes] = await Promise.all([
            Api.get(`${CONFIG.ENDPOINTS.STAFF_EXAMS}?page_size=1`),
            Api.get(`${CONFIG.ENDPOINTS.STAFF_EXAMS}?status=published&page_size=100`),
            Api.get(`${CONFIG.ENDPOINTS.STAFF_STUDENTS}?page_size=1`),
            Api.get(`${CONFIG.ENDPOINTS.STAFF_EXAMS}?status=active&page_size=100`),
        ]);

        const { data: td } = await Api.parse(totalRes);
        const { data: pd } = await Api.parse(publishedRes);
        const { data: sd } = await Api.parse(studentsRes);
        const { data: ld } = await Api.parse(liveRes);

        _setStatValue('totalExams',      td?.count ?? '—');
        _setStatValue('activeExams',     pd?.count ?? pd?.results?.length ?? '—');
        _setStatValue('totalStudents',   sd?.count ?? '—');
        _setStatValue('liveExamsCount',  ld?.results?.length ?? 0);

        // Submissions today — from live exams student counts (best approximation without dedicated endpoint)
        const liveExams = Array.isArray(ld) ? ld : (ld?.results ?? []);
        const todaySubs = liveExams.reduce((acc, e) => acc + (e.total_attempts || 0), 0);
        _setStatValue('submissionsToday', todaySubs || 0);

        // Show/hide live stat card pulse
        const count = ld?.results?.length ?? 0;
        const card  = document.getElementById('liveStatCard');
        if (card) card.classList.toggle('has-live', count > 0);

    } catch (err) {
        console.error('Stats error:', err);
        ['totalExams','activeExams','totalStudents','submissionsToday','liveExamsCount']
            .forEach(id => _setStatValue(id, '—'));
    }
}

function _setStatValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
}

// ══════════════════════════════════════════════════════════════════
//  ★ LIVE EXAMS WIDGET
// ══════════════════════════════════════════════════════════════════

async function _loadLiveExams() {
    const widget = document.getElementById('liveMonitorWidget');
    const list   = document.getElementById('liveExamsList');
    if (!widget || !list) return;

    try {
        const res = await Api.get(`${CONFIG.ENDPOINTS.STAFF_EXAMS}?status=active&page_size=20`);
        const { data, error } = await Api.parse(res);

        if (error) { widget.style.display = 'none'; return; }

        const exams = Array.isArray(data) ? data : (data?.results ?? []);

        // Compute "truly active" = now is between start and end
        const now   = Date.now();
        const live  = exams.filter(e => {
            if (!e.is_published) return false;
            const s = new Date(e.start_time).getTime();
            const d = new Date(e.end_time).getTime();
            return now >= s && now <= d;
        });

        // Update live count badge too (more accurate than stats call)
        _setStatValue('liveExamsCount', live.length);
        const card = document.getElementById('liveStatCard');
        if (card) card.classList.toggle('has-live', live.length > 0);

        if (!live.length) {
            widget.style.display = 'none';
            _updateQaLiveBtn(null);
            return;
        }

        // Show the widget
        widget.style.display = '';
        list.innerHTML = _buildLiveList(live, now);
        _updateQaLiveBtn(live[0]);

    } catch (err) {
        console.error('Live exams error:', err);
        widget.style.display = 'none';
    }
}

function _buildLiveList(exams, now) {
    return `<div class="live-exams-list">${exams.map(e => {
        const end      = new Date(e.end_time).getTime();
        const remMs    = Math.max(0, end - now);
        const remStr   = _fmtMs(remMs);
        const urgent   = remMs < 10 * 60 * 1000;   // < 10 min
        const pct      = e.total_attempts && e.total_capacity
            ? Math.round((e.total_attempts / e.total_capacity) * 100)
            : null;
        const typeLabel = (e.exam_type || 'exam').charAt(0).toUpperCase() + (e.exam_type || 'exam').slice(1);

        return `
        <div class="live-exam-row">
            <div class="live-exam-left">
                <div class="live-exam-dot ${urgent ? 'urgent' : ''}"></div>
                <div>
                    <div class="live-exam-name">${_esc(e.title)}</div>
                    <div class="live-exam-meta">
                        <span><i class="fas fa-tag"></i> ${typeLabel}</span>
                        <span><i class="fas fa-clock"></i> ${e.duration || 0} min</span>
                        <span><i class="fas fa-users"></i> ${e.total_attempts ?? '—'} attempting</span>
                        <span><i class="fas fa-trophy"></i> ${e.total_marks || 0} marks</span>
                    </div>
                </div>
            </div>
            <div class="live-exam-right">
                <div class="live-countdown ${urgent ? 'urgent' : ''}"
                     data-end="${e.end_time}"
                     id="dash-cd-${e.id}">
                    ${remStr}
                </div>
                <div class="live-countdown-lbl">remaining</div>
                ${pct !== null
                    ? `<div class="live-mini-bar"><div class="live-mini-fill" style="width:${pct}%"></div></div>`
                    : ''}
                <a href="live-monitor.html?id=${e.id}" class="btn-monitor">
                    <i class="fas fa-satellite-dish"></i> Monitor
                </a>
            </div>
        </div>`;
    }).join('')}
    </div>`;
}

// Tick countdowns inside the live widget
function _tickDashCountdowns() {
    document.querySelectorAll('.live-countdown[data-end]').forEach(el => {
        const end    = new Date(el.dataset.end).getTime();
        const diff   = Math.max(0, end - Date.now());
        el.textContent = diff > 0 ? _fmtMs(diff) : 'ENDED';
        el.classList.toggle('urgent', diff < 10 * 60 * 1000 && diff > 0);
    });
}
// Tick every second for countdown cells
setInterval(_tickDashCountdowns, 1000);

// Update the Quick Actions "Live Monitor" button dynamically
function _updateQaLiveBtn(firstLiveExam) {
    const btn = document.getElementById('qaLiveBtn');
    if (!btn) return;
    if (firstLiveExam) {
        btn.href = `live-monitor.html?id=${firstLiveExam.id}`;
        btn.classList.add('qa-live-active');
    } else {
        btn.href = 'exams.html';
        btn.classList.remove('qa-live-active');
    }
}

// ══════════════════════════════════════════════════════════════════
//  RECENT EXAMS
// ══════════════════════════════════════════════════════════════════

async function _loadRecentExams() {
    const container = document.getElementById('recentExams');
    if (!container) return;
    try {
        const res = await Api.get(`${CONFIG.ENDPOINTS.STAFF_EXAMS}?page_size=5&ordering=-created_at`);
        const { data, error } = await Api.parse(res);
        if (error || !data) { container.innerHTML = _renderEmpty('No exams found'); return; }

        const exams = data.results || [];
        if (!exams.length) { container.innerHTML = _renderEmpty('No exams yet. Create your first exam!'); return; }

        const now = Date.now();
        container.innerHTML = `<div class="exam-list">${exams.map(exam => {
            const status = _examStatus(exam, now);
            const label  = { draft:'Draft', published:'Published', active:'Live', completed:'Completed' }[status] || status;
            return `
            <a href="examedit.html?id=${exam.id}" class="exam-item">
                <div class="exam-info">
                    <h4>${_esc(exam.title)}</h4>
                    <div class="exam-meta">
                        <span><i class="fas fa-question-circle"></i> ${exam.question_count ?? exam.total_questions ?? 0} q</span>
                        <span><i class="fas fa-clock"></i> ${exam.duration || 0} min</span>
                        <span><i class="fas fa-trophy"></i> ${exam.total_marks || 0} marks</span>
                    </div>
                </div>
                <div class="exam-item-right">
                    <span class="exam-status s-${status}">${label}</span>
                    ${status === 'active'
                        ? `<a href="live-monitor.html?id=${exam.id}" class="exam-live-link" onclick="event.stopPropagation()">
                               <i class="fas fa-satellite-dish"></i>
                           </a>`
                        : ''}
                </div>
            </a>`;
        }).join('')}</div>`;
    } catch {
        container.innerHTML = _renderEmpty('Failed to load exams');
    }
}

// ══════════════════════════════════════════════════════════════════
//  RECENT RESULTS
// ══════════════════════════════════════════════════════════════════

async function _loadRecentResults() {
    const container = document.getElementById('recentResults');
    if (!container) return;
    try {
        const examsRes = await Api.get(`${CONFIG.ENDPOINTS.STAFF_EXAMS}?page_size=1`);
        const { data: examsData } = await Api.parse(examsRes);
        if (!examsData?.results?.[0]) { container.innerHTML = _renderEmpty('No results yet'); return; }

        const examId = examsData.results[0].id;
        const res = await Api.get(`${CONFIG.ENDPOINTS.STAFF_EXAM_RESULTS(examId)}?page_size=5`);
        const { data, error } = await Api.parse(res);
        if (error || !data) { container.innerHTML = _renderEmpty('No submissions yet'); return; }

        const results = data.results || [];
        if (!results.length) { container.innerHTML = _renderEmpty('No submissions yet'); return; }

        container.innerHTML = `<div class="result-list">${results.map(r => {
            const name    = r.student_name || r.student?.name || 'Student';
            const initials= name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            const score   = r.obtained_score || 0;
            const total   = r.total_score   || 100;
            const pct     = total > 0 ? Math.round((score / total) * 100) : 0;
            const pass    = pct >= 50;
            return `
            <div class="result-item">
                <div class="result-student">
                    <div class="result-avatar">${initials}</div>
                    <div class="result-info">
                        <h4>${_esc(name)}</h4>
                        <span class="result-exam">${_esc(r.exam_title || 'Exam')}</span>
                    </div>
                </div>
                <div class="result-score">
                    <span class="result-value">${score}/${total}</span>
                    <span class="result-percent">${pct}%</span>
                    <span class="result-badge ${pass ? 'pass' : 'fail'}">${pass ? 'Pass' : 'Fail'}</span>
                </div>
            </div>`;
        }).join('')}</div>`;
    } catch {
        container.innerHTML = _renderEmpty('Failed to load results');
    }
}

// ══════════════════════════════════════════════════════════════════
//  TOP STUDENTS
// ══════════════════════════════════════════════════════════════════

async function _loadTopStudents() {
    const container = document.getElementById('topStudents');
    if (!container) return;
    try {
        const res = await Api.get(`${CONFIG.ENDPOINTS.STAFF_STUDENTS}?page_size=5&ordering=-average_score`);
        const { data, error } = await Api.parse(res);
        if (error || !data) { container.innerHTML = _renderEmpty('No students found'); return; }

        const students = data.results || [];
        if (!students.length) { container.innerHTML = _renderEmpty('No students yet'); return; }

        container.innerHTML = `<div class="student-list">${students.map((s, i) => {
            const name    = s.name || s.username || s.email?.split('@')[0] || 'Student';
            const score   = s.average_score ?? '—';
            const exams   = s.exams_completed ?? '—';
            const rankCls = ['gold', 'silver', 'bronze'][i] || '';
            return `
            <div class="student-item">
                <div class="student-rank ${rankCls}">${i + 1}</div>
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random"
                     alt="${_esc(name)}" class="student-avatar">
                <div class="student-info">
                    <h4>${_esc(name)}</h4>
                    <span class="student-stats">${exams} exams completed</span>
                </div>
                <div class="student-score">${score}${typeof score === 'number' ? '%' : ''}</div>
            </div>`;
        }).join('')}</div>`;
    } catch {
        container.innerHTML = _renderEmpty('Failed to load students');
    }
}

// ══════════════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════

async function _loadNotifications() {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.NOTIF_COUNT);
        const { data } = await Api.parse(res);
        const count = data?.unread_count || 0;
        badge.textContent = count;
        badge.classList.toggle('hidden', count === 0);
    } catch { /* non-critical */ }
}

// ══════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════

function _examStatus(e, now = Date.now()) {
    if (!e.is_published) return 'draft';
    const s = new Date(e.start_time).getTime();
    const d = new Date(e.end_time).getTime();
    if (now < s)  return 'published';
    if (now <= d) return 'active';
    return 'completed';
}

function _fmtMs(ms) {
    const s   = Math.floor(ms / 1000);
    const h   = Math.floor(s / 3600);
    const m   = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const p   = n => String(n).padStart(2, '0');
    return h > 0 ? `${p(h)}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

function _renderEmpty(msg) {
    return `<div class="empty-state"><i class="fas fa-inbox"></i><p>${_esc(msg)}</p></div>`;
}

function _setText(id, v) { const e = document.getElementById(id); if (e) e.textContent = String(v ?? ''); }

function _esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
