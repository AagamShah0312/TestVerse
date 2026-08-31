/**
 * TestVerse — Student Results Page
 *
 * Two modes:
 *  A) List mode  – URL has no exam_id param → show all my results list
 *  B) Detail mode – URL has ?exam_id=X (coming from exam-taking page) →
 *     load that specific result and immediately open detail modal
 *
 * Endpoints:
 *   EXAMS_MY_RESULTS   GET  /api/v1/exams/my-results/
 *   EXAM_RESULT(id)    GET  /api/v1/exams/:id/result/
 *   NOTIF_COUNT        GET  /api/v1/auth/notifications/count/
 */
'use strict';

// ══════════════════════════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════════════════════════
const PAGE_SIZE = 10;
const CIRCUMFERENCE_SM = 2 * Math.PI * 27;   // r=27  (result card ring)
const CIRCUMFERENCE_LG = 2 * Math.PI * 44;   // r=44  (modal hero ring)

// ══════════════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════════════
let _allResults   = [];
let _filtered     = [];
let _page         = 1;
let _search       = '';
let _statusFilter = '';
let _sort         = 'date_desc';
let _openResultId = null;   // result id currently open in modal

// ══════════════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireAuth()) return;

    _initSidebar();
    _populateUser();
    _initControls();
    await _loadResults();

    // If arriving from exam-taking with ?exam_id=X, auto-open that result
    const params = new URLSearchParams(location.search);
    const directExamId   = params.get('exam_id');
    const directAttemptId= params.get('attempt_id');
    if (directExamId || directAttemptId) {
        // Prefer an exact attempt match when multiple attempts exist
        let match = null;
        if (directAttemptId) {
            match = _allResults.find(r =>
                String(r.attempt_id || r.id) === String(directAttemptId)
            );
        }
        if (!match && directExamId) {
            match = _allResults.find(r =>
                String(r.exam_id || r.exam?.id || r.exam) === String(directExamId)
            );
        }
        if (match) {
            _openDetailModal(match.id || match.result_id || match.attempt_id);
        } else {
            // Result is not published yet, so do not open direct analysis.
            history.replaceState({}, '', location.pathname);
        }
    }
});

// ══════════════════════════════════════════════════════════════════
//  SIDEBAR / USER
// ══════════════════════════════════════════════════════════════════
function _initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggle  = document.getElementById('mobileSidebarToggle');
    const overlay = document.getElementById('sidebarOverlay');

    toggle?.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay?.classList.toggle('show');
    });
    overlay?.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
    });
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Log out of TestVerse?')) Auth.logout();
    });
}

function _populateUser() {
    const user = Auth.getUser();
    if (!user) return;
    const name   = user.name || user.username || user.email?.split('@')[0] || 'Student';
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff&size=64`;
    _setText('sidebarName', name);
    _setText('topbarName',  name);
    ['sidebarAvatar','topbarAvatar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.src = avatar;
    });
}

// ══════════════════════════════════════════════════════════════════
//  CONTROLS
// ══════════════════════════════════════════════════════════════════
function _initControls() {
    const si = document.getElementById('searchInput');
    const sc = document.getElementById('searchClear');

    si?.addEventListener('input', () => {
        _search = si.value.trim().toLowerCase();
        sc?.classList.toggle('hidden', !_search);
        _page = 1; _applyAndRender();
    });
    sc?.addEventListener('click', () => {
        si.value = ''; _search = '';
        sc.classList.add('hidden');
        _page = 1; _applyAndRender();
    });

    document.getElementById('statusFilter')?.addEventListener('change', e => {
        _statusFilter = e.target.value; _page = 1; _applyAndRender();
    });
    document.getElementById('sortFilter')?.addEventListener('change', e => {
        _sort = e.target.value; _applyAndRender();
    });

    document.getElementById('clearFiltersBtn')?.addEventListener('click', _resetFilters);
    document.getElementById('refreshBtn')?.addEventListener('click', _loadResults);

    document.getElementById('prevBtn')?.addEventListener('click', () => { _page--; _renderList(); });
    document.getElementById('nextBtn')?.addEventListener('click', () => { _page++; _renderList(); });

    document.getElementById('detailModalClose')?.addEventListener('click', () => _closeModal('detailModal'));
    document.getElementById('detailModal')?.addEventListener('click', e => {
        if (e.target.id === 'detailModal') _closeModal('detailModal');
    });
}

// ══════════════════════════════════════════════════════════════════
//  LOAD RESULTS LIST
// ══════════════════════════════════════════════════════════════════
async function _loadResults() {
    _showState('loading');
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.EXAMS_MY_RESULTS);
        const { data, error } = await Api.parse(res);
        if (error || !data) {
            _showState('empty');
            _setText('emptyTitle', 'Could Not Load Results');
            _setText('emptySub',   'Please check your connection and try again.');
            return;
        }
        _allResults = Array.isArray(data) ? data : (data.results ?? []);
        _updateSummaryStats();
        _applyAndRender();
        _loadNotifCount();
    } catch (err) {
        console.error('[results] load:', err);
        _showState('empty');
        _setText('emptyTitle', 'Connection Error');
        _setText('emptySub',   'Failed to reach server. Please try again.');
    }
}

// ── Summary Stats ──────────────────────────────────────────────────
function _updateSummaryStats() {
    const total   = _allResults.length;
    let passed = 0, failed = 0, pending = 0, scoreSum = 0, scoreCnt = 0, best = 0;

    _allResults.forEach(r => {
        const s = _statusOf(r);
        if (s === 'pass') passed++;
        if (s === 'fail') failed++;
        if (s === 'pending') pending++;
        const pct = _pctOf(r);
        if (pct != null) { scoreSum += pct; scoreCnt++; if (pct > best) best = pct; }
    });

    _setText('statTotal',  total);
    _setText('statPassed', passed);
    _setText('statFailed', failed);
    _setText('statPending', pending);
    _setText('statAvg',    scoreCnt ? `${Math.round(scoreSum / scoreCnt)}%` : '—');
    _setText('statBest',   scoreCnt ? `${Math.round(best)}%` : '—');
}

// ── Filter + Sort ──────────────────────────────────────────────────
function _applyAndRender() {
    let list = _allResults.filter(r => {
        const name = _examName(r).toLowerCase();
        if (_search && !name.includes(_search)) return false;
        if (_statusFilter) {
            const s = _statusOf(r);
            if (_statusFilter === 'pending' && s !== 'pending') return false;
            if (_statusFilter === 'pass'    && s !== 'pass')    return false;
            if (_statusFilter === 'fail'    && s !== 'fail')    return false;
        }
        return true;
    });

    list.sort((a, b) => {
        switch (_sort) {
            case 'date_asc':   return new Date(a.submitted_at||a.created_at||0) - new Date(b.submitted_at||b.created_at||0);
            case 'date_desc':  return new Date(b.submitted_at||b.created_at||0) - new Date(a.submitted_at||a.created_at||0);
            case 'score_desc': return (_pctOf(b) ?? -1) - (_pctOf(a) ?? -1);
            case 'score_asc':  return (_pctOf(a) ?? 999) - (_pctOf(b) ?? 999);
            case 'name_asc':   return _examName(a).localeCompare(_examName(b));
            default: return 0;
        }
    });

    _filtered = list;
    _page = Math.min(_page, Math.max(1, Math.ceil(list.length / PAGE_SIZE)));

    // Results info
    const infoEl   = document.getElementById('resultsInfoText');
    const clearBtn = document.getElementById('clearFiltersBtn');
    const has      = _search || _statusFilter;
    if (infoEl) infoEl.textContent = `${list.length} result${list.length !== 1 ? 's' : ''}`;
    clearBtn?.classList.toggle('hidden', !has);

    _renderList();
}

// ══════════════════════════════════════════════════════════════════
//  RENDER LIST
// ══════════════════════════════════════════════════════════════════
function _renderList() {
    const listEl   = document.getElementById('resultsList');
    const paginEl  = document.getElementById('pagination');
    if (!listEl) return;

    if (!_filtered.length) {
        _showState('empty');
        const has = _search || _statusFilter;
        _setText('emptyTitle', has ? 'No Matching Results' : 'No Results Yet');
        _setText('emptySub',   has ? 'Try adjusting your search or filters.' : "You haven't attempted any exams yet.");
        document.getElementById('emptyActionBtn').style.display = has ? 'none' : 'inline-flex';
        return;
    }

    _showState('list');

    const total  = Math.ceil(_filtered.length / PAGE_SIZE);
    const start  = (_page - 1) * PAGE_SIZE;
    const items  = _filtered.slice(start, start + PAGE_SIZE);

    listEl.innerHTML = items.map(r => _buildResultCard(r)).join('');

    // Bind detail buttons
    listEl.querySelectorAll('.rc-detail-btn').forEach(btn =>
        btn.addEventListener('click', () => _openDetailModal(btn.dataset.id))
    );

    // Animate score rings after paint
    requestAnimationFrame(() => {
        listEl.querySelectorAll('.rc-ring-fill').forEach(path => {
            const pct   = parseFloat(path.dataset.pct || 0);
            const offset = CIRCUMFERENCE_SM * (1 - pct / 100);
            path.style.strokeDasharray  = CIRCUMFERENCE_SM;
            path.style.strokeDashoffset = offset;
        });
    });

    // Pagination
    if (total > 1) {
        paginEl.classList.remove('hidden');
        document.getElementById('prevBtn').disabled = _page <= 1;
        document.getElementById('nextBtn').disabled = _page >= total;
        _setText('pageInfo', `Page ${_page} of ${total}`);
    } else {
        paginEl.classList.add('hidden');
    }
}

// ── Build Result Card ──────────────────────────────────────────────
function _buildResultCard(r) {
    const status   = _statusOf(r);
    const pctRaw   = _pctOf(r);
    const pct      = pctRaw ?? 0;
    const id       = r.id || r.result_id || r.attempt_id;
    const name     = _examName(r);
    const score    = r.score ?? r.obtained_marks ?? r.marks_obtained;
    const total    = r.total_marks ?? r.max_marks;
    const passing  = r.passing_marks;
    const date     = r.submitted_at || r.created_at || r.completed_at;
    const duration = r.time_taken_seconds != null
        ? _fmtDuration(r.time_taken_seconds)
        : (r.duration ? r.duration + ' min' : null);
    const type     = r.exam_type || r.exam?.exam_type;
    const rank     = r.rank;
    const feedback = r.feedback || r.staff_feedback;

    const badgeHtml = status === 'pending'
        ? `<span class="rc-badge pending"><i class="fas fa-clock"></i> Pending</span>`
        : status === 'pass'
        ? `<span class="rc-badge pass"><i class="fas fa-check-circle"></i> Passed</span>`
        : `<span class="rc-badge fail"><i class="fas fa-times-circle"></i> Failed</span>`;

    const marksHtml = score != null && total != null
        ? `<div class="rc-marks-raw">${score} <span>/ ${total} marks</span></div>`
        : '';

    const chips = [
        date     ? `<span class="rc-chip"><i class="fas fa-calendar-alt"></i>${_fmtDate(date)}</span>` : '',
        type     ? `<span class="rc-chip"><i class="fas fa-tag"></i>${_esc(type)}</span>` : '',
        duration ? `<span class="rc-chip"><i class="fas fa-clock"></i>${_esc(duration)}</span>` : '',
        rank     ? `<span class="rc-chip"><i class="fas fa-medal"></i>Rank #${rank}</span>` : '',
        passing  ? `<span class="rc-chip"><i class="fas fa-check"></i>Pass: ${passing}</span>` : '',
    ].filter(Boolean).join('');

    const pendingNote = status === 'pending'
        ? `<div class="rc-pending-note"><i class="fas fa-info-circle"></i> Result under evaluation</div>` : '';

    // SVG donut  r=27 cx=34 cy=34  (68×68 viewBox)
    const offset = CIRCUMFERENCE_SM * (1 - pct / 100);
    const ringEl = `
    <div class="rc-score-ring">
        <svg width="68" height="68" viewBox="0 0 68 68">
            <circle class="rc-ring-track" cx="34" cy="34" r="27"/>
            <circle class="rc-ring-fill ${status}"
                    cx="34" cy="34" r="27"
                    data-pct="${pct}"
                    style="stroke-dasharray:${CIRCUMFERENCE_SM};stroke-dashoffset:${CIRCUMFERENCE_SM}"/>
        </svg>
        <div class="rc-score-center">
            <span class="rc-score-pct">${pctRaw != null ? Math.round(pct) + '%' : '?'}</span>
            <span class="rc-score-lbl">score</span>
        </div>
    </div>`;

    return `
    <div class="result-card ${status}">
        ${ringEl}
        <div class="rc-info">
            <div class="rc-exam-name" title="${_esc(name)}">${_esc(name)}</div>
            <div class="rc-meta">${chips}</div>
            ${feedback ? `<div class="rc-feedback"><i class="fas fa-comment-alt" style="color:#6366f1;margin-right:4px;font-size:.65rem;"></i>${_esc(feedback)}</div>` : ''}
            ${pendingNote}
        </div>
        <div class="rc-status">
            ${badgeHtml}
            ${marksHtml}
            <button class="rc-detail-btn" data-id="${_esc(String(id))}">
                <i class="fas fa-eye"></i> View
            </button>
        </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════
//  DETAIL MODAL
// ══════════════════════════════════════════════════════════════════
async function _openDetailModal(resultId) {
    _openResultId = resultId;
    const modal = document.getElementById('detailModal');
    const body  = document.getElementById('detailModalBody');
    if (!modal) return;

    body.innerHTML = `<div class="loading-state" style="padding:2rem 0;"><div class="spinner"></div><p>Loading result…</p></div>`;
    modal.classList.add('open');

    // Try from cache first
    const cached = _allResults.find(r => String(r.id || r.result_id || r.attempt_id) === String(resultId));
    const examId = cached?.exam_id || cached?.exam?.id || cached?.exam;

    await _renderDetailModal(body, cached, examId, resultId);
}

async function _renderDetailModal(body, cached, examId, resultId) {
    try {
        let detail = cached;

        // Fetch full detail from server if examId available
        if (examId) {
            const res = await Api.get(CONFIG.ENDPOINTS.EXAM_RESULT(examId));
            const { data, error } = await Api.parse(res);
            if (!error && data) detail = { ...(cached || {}), ...data };
        }

        if (!detail) {
            body.innerHTML = `<p style="color:#ef4444;font-size:.875rem;text-align:center;padding:2rem;">Could not load result details.</p>`;
            return;
        }

        const status   = _statusOf(detail);
        const pctRaw   = _pctOf(detail);
        const pct      = pctRaw ?? 0;
        const name     = _examName(detail);
        const score    = _toNum(detail.score ?? detail.obtained_marks ?? detail.marks_obtained);
        const total    = _toNum(detail.total_marks ?? detail.max_marks);
        const passing  = detail.passing_marks;
        const rank     = detail.rank;
        const feedback = detail.feedback || detail.staff_feedback;
        const timeTaken= detail.time_taken_seconds;
        const answers  = Array.isArray(detail.answers || detail.question_answers)
            ? (detail.answers || detail.question_answers)
            : [];
        const stats    = _deriveDetailStats(detail, answers);
        const correct  = stats.correct;
        const wrong    = stats.wrong;
        const skipped  = stats.skipped;
        const totalQuestions = stats.totalQuestions;
        const date     = detail.submitted_at || detail.completed_at || detail.created_at;

        _setText('modalExamTitle', name);

        // ── Hero Ring (r=44 in 100x100 viewBox)
        const offset = CIRCUMFERENCE_LG * (1 - pct / 100);
        const hero = `
        <div class="md-hero">
            <div class="md-hero-score">
                <svg width="100" height="100" viewBox="0 0 100 100">
                    <circle class="md-ring-track" cx="50" cy="50" r="44"/>
                    <circle class="md-ring-fill ${status}"
                            cx="50" cy="50" r="44"
                            id="mdRingFill"
                            style="stroke-dasharray:${CIRCUMFERENCE_LG};stroke-dashoffset:${CIRCUMFERENCE_LG}"/>
                </svg>
                <div class="md-score-center">
                    <span class="md-score-pct">${pctRaw != null ? Math.round(pct) + '%' : '?'}</span>
                    <span class="md-score-sub">score</span>
                </div>
            </div>
            <div class="md-hero-info">
                <h3 class="md-exam-title">${_esc(name)}</h3>
                <div class="md-hero-grid">
                    <div class="md-info-item">
                        <span class="md-info-label">Marks</span>
                        <span class="md-info-value">${score != null && total != null ? `${score} / ${total}` : '—'}</span>
                    </div>
                    <div class="md-info-item">
                        <span class="md-info-label">Passing</span>
                        <span class="md-info-value">${passing ?? '—'}</span>
                    </div>
                    <div class="md-info-item">
                        <span class="md-info-label">Rank</span>
                        <span class="md-info-value">${rank != null ? '#' + rank : '—'}</span>
                    </div>
                    <div class="md-info-item">
                        <span class="md-info-label">Submitted</span>
                        <span class="md-info-value">${date ? _fmtDateTime(date) : '—'}</span>
                    </div>
                    <div class="md-info-item">
                        <span class="md-info-label">Time Taken</span>
                        <span class="md-info-value">${timeTaken != null ? _fmtDuration(timeTaken) : '—'}</span>
                    </div>
                    <div class="md-info-item">
                        <span class="md-info-label">Status</span>
                        <span class="md-info-value">
                            <span class="md-badge ${status}">
                                <i class="fas fa-${status === 'pass' ? 'check-circle' : status === 'fail' ? 'times-circle' : 'clock'}"></i>
                                ${status === 'pass' ? 'Passed' : status === 'fail' ? 'Failed' : 'Pending'}
                            </span>
                        </span>
                    </div>
                </div>
            </div>
        </div>`;

        // ── Quick Stats
        const qs = `
        <p class="md-section-title"><i class="fas fa-chart-bar"></i> Quick Stats</p>
        <div class="md-quick-stats">
            <div class="md-qs-item">
                <span class="md-qs-val" style="color:#22c55e;">${correct != null ? correct : '—'}</span>
                <span class="md-qs-lbl">Correct</span>
            </div>
            <div class="md-qs-item">
                <span class="md-qs-val" style="color:#ef4444;">${wrong != null ? wrong : '—'}</span>
                <span class="md-qs-lbl">Wrong</span>
            </div>
            <div class="md-qs-item">
                <span class="md-qs-val" style="color:#94a3b8;">${skipped != null ? skipped : '—'}</span>
                <span class="md-qs-lbl">Skipped</span>
            </div>
            <div class="md-qs-item">
                <span class="md-qs-val" style="color:#6366f1;">${totalQuestions != null ? totalQuestions : '—'}</span>
                <span class="md-qs-lbl">Total Q's</span>
            </div>
        </div>`;

        // ── Score Breakdown Bars
        let barsHtml = '';
        if (totalQuestions != null && correct != null && wrong != null) {
            const tq  = totalQuestions || 1;
            const cp  = Math.round(((correct || 0) / tq) * 100);
            const wp  = Math.round(((wrong || 0) / tq) * 100);
            const sp  = Math.round(((skipped || 0) / tq) * 100);
            const mp  = (total != null && total > 0 && score != null) ? Math.round((score / total) * 100) : 0;
            barsHtml = `
            <p class="md-section-title"><i class="fas fa-chart-pie"></i> Score Breakdown</p>
            <div class="md-score-bars">
                <div class="md-bar-row">
                    <div class="md-bar-label"><span>Correct Answers</span><span>${correct} / ${tq}</span></div>
                    <div class="md-bar-track"><div class="md-bar-fill correct"  style="width:0%" data-w="${cp}"></div></div>
                </div>
                <div class="md-bar-row">
                    <div class="md-bar-label"><span>Wrong Answers</span><span>${wrong} / ${tq}</span></div>
                    <div class="md-bar-track"><div class="md-bar-fill incorrect" style="width:0%" data-w="${wp}"></div></div>
                </div>
                ${(skipped||0) > 0 ? `
                <div class="md-bar-row">
                    <div class="md-bar-label"><span>Unanswered</span><span>${skipped} / ${tq}</span></div>
                    <div class="md-bar-track"><div class="md-bar-fill unanswered" style="width:0%" data-w="${sp}"></div></div>
                </div>` : ''}
                ${score != null && total != null ? `<div class="md-bar-row">
                    <div class="md-bar-label"><span>Marks Obtained</span><span>${score} / ${total}</span></div>
                    <div class="md-bar-track"><div class="md-bar-fill marks" style="width:0%" data-w="${mp}"></div></div>
                </div>` : ''}
            </div>`;
        }

        // ── Feedback
        const fbHtml = feedback ? `
        <p class="md-section-title"><i class="fas fa-comment-alt"></i> Feedback</p>
        <div class="md-feedback-box"><p>${_esc(feedback)}</p></div>` : '';

        // ── Answer Review
        const pendingNotice = status === 'pending'
            ? `<div class="md-pending-notice">
                <i class="fas fa-hourglass-half"></i>
                <h3>Result Under Evaluation</h3>
                <p>Your coding/descriptive answers are under manual review. Auto-graded sections are shown below.</p>
            </div>`
            : '';

        let answerHtml = pendingNotice;
        if (answers.length) {
            answerHtml += `
            <p class="md-section-title"><i class="fas fa-list-check"></i> Answer Review</p>
            <div class="md-answer-filter">
                <button class="mad-btn active" data-filter="all">All (${answers.length})</button>
                <button class="mad-btn" data-filter="correct">
                    <i class="fas fa-check" style="color:#22c55e"></i> Correct
                </button>
                <button class="mad-btn" data-filter="incorrect">
                    <i class="fas fa-times" style="color:#ef4444"></i> Incorrect
                </button>
                <button class="mad-btn" data-filter="unanswered">
                    <i class="fas fa-minus" style="color:#94a3b8"></i> Skipped
                </button>
            </div>
            <div class="md-answer-list" id="answerList">
                ${answers.map((a, i) => _buildAnswerItem(a, i)).join('')}
            </div>`;
        }

        body.innerHTML = hero + qs + barsHtml + fbHtml + answerHtml;

        // Animate rings + bars after paint
        requestAnimationFrame(() => {
            const ring = document.getElementById('mdRingFill');
            if (ring) {
                ring.style.strokeDasharray  = CIRCUMFERENCE_LG;
                ring.style.strokeDashoffset = CIRCUMFERENCE_LG * (1 - pct / 100);
            }
            body.querySelectorAll('.md-bar-fill[data-w]').forEach(bar => {
                bar.style.width = bar.dataset.w + '%';
            });
        });

        // Answer filter buttons
        body.querySelectorAll('.mad-btn').forEach(btn =>
            btn.addEventListener('click', () => {
                body.querySelectorAll('.mad-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const f = btn.dataset.filter;
                body.querySelectorAll('.mad-item').forEach(item => {
                    item.style.display = (f === 'all' || item.dataset.status === f) ? 'block' : 'none';
                });
            })
        );

        // Answer accordion toggles
        body.querySelectorAll('.mad-header').forEach(hdr =>
            hdr.addEventListener('click', () => {
                const item    = hdr.closest('.mad-item');
                const bdy     = item?.querySelector('.mad-body');
                const chevron = hdr.querySelector('.mad-chevron');
                if (!bdy) return;
                const isOpen = bdy.classList.contains('open');
                bdy.classList.toggle('open', !isOpen);
                chevron?.classList.toggle('open', !isOpen);
            })
        );

    } catch (err) {
        console.error('[results] detailModal:', err);
        body.innerHTML = `<p style="color:#ef4444;font-size:.875rem;text-align:center;padding:2rem;">Failed to load result details.</p>`;
    }
}

// ── Build Answer Item ──────────────────────────────────────────────
function _buildAnswerItem(a, idx) {
    const qText     = a.question_text || a.question?.text || a.question?.body || `Question ${idx + 1}`;
    const yours     = _extractAnswerValue(a);
    const correct   = _extractCorrectValue(a);
    const marksGot  = _toNum(a.marks_obtained ?? a.score_obtained ?? a.score ?? a.points);
    const maxMarks  = _toNum(a.max_marks ?? a.max_points ?? a.marks ?? a.points_possible);
    const explain   = a.explanation || a.reason;
    const qType     = (a.question_type || a.type || '').toLowerCase();

    const status = _resolveAnswerStatus(a, qType, yours, correct, marksGot, maxMarks);

    const iconMap = {
        correct:   'fas fa-check-circle',
        incorrect: 'fas fa-times-circle',
        unanswered:'fas fa-minus-circle',
        pending:   'fas fa-clock',
    };
    const marksChip = maxMarks != null
        ? `<span class="mad-marks-chip ${status}">${marksGot ?? (status === 'pending' ? '—' : '0')} / ${maxMarks}</span>` : '';

    const yoursCls   = status === 'correct' ? 'correct-ans' : status === 'incorrect' ? 'incorrect-ans' : '';
    const hasYours   = _hasMeaningfulAnswer(yours);
    const yoursHtml  = `<div class="mad-answers-row">
               <div class="mad-answer-label">Your Answer</div>
               <div class="mad-your-answer ${yoursCls}">${_formatAnswerValue(hasYours ? yours : null)}</div>
           </div>`;

    const correctHtml = (correct != null && status === 'incorrect')
        ? `<div class="mad-answers-row" style="margin-top:.5rem;">
               <div class="mad-answer-label">Correct Answer</div>
               <div class="mad-correct-answer">${_formatAnswerValue(correct)}</div>
           </div>` : '';

    const explainHtml = explain
        ? `<div class="mad-explanation" style="margin-top:.625rem;">
               <i class="fas fa-lightbulb" style="color:#6366f1;margin-right:.35rem;"></i>${_esc(explain)}
           </div>` : '';

    return `
    <div class="mad-item ${status}" data-status="${status}">
        <div class="mad-header">
            <span class="mad-qnum">Q${idx + 1}</span>
            <span class="mad-qtext" title="${_esc(qText)}">${_esc(qText)}</span>
            ${marksChip}
            <i class="${iconMap[status]} mad-result-icon ${status}"></i>
            <i class="fas fa-chevron-down mad-chevron"></i>
        </div>
        <div class="mad-body">
            <div class="mad-full-q">${_formatQText(qText)}</div>
            ${yoursHtml}
            ${correctHtml}
            ${explainHtml}
        </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════
//  NOTIFICATION COUNT
// ══════════════════════════════════════════════════════════════════
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
function _toNum(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
}

function _extractAnswerValue(a) {
    return a.student_answer ?? a.your_answer ?? a.submitted_answer ?? a.answer;
}

function _extractCorrectValue(a) {
    return a.correct_answer ?? a.expected_answer;
}

function _hasMeaningfulAnswer(val) {
    if (val == null) return false;
    if (typeof val === 'string') return val.trim() !== '';
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'object') {
        if (val.code && String(val.code).trim() !== '') return true;
        if (val.text && String(val.text).trim() !== '') return true;
        if (val.answer && String(val.answer).trim() !== '') return true;
        const selected = Object.keys(val).filter(k => {
            const v = val[k];
            return v === true || v === 1 || v === '1' || v === 'true' || v === 'True';
        });
        return selected.length > 0;
    }
    return true;
}

function _normalizeAnswerTokens(val) {
    const arr = Array.isArray(val) ? val : [val];
    const out = [];

    arr.forEach(item => {
        if (item == null) return;
        if (Array.isArray(item)) {
            item.forEach(v => out.push(v));
            return;
        }
        if (typeof item === 'object') {
            if (item.id != null) out.push(item.id);
            else if (item.value != null) out.push(item.value);
            else if (item.text != null) out.push(item.text);
            else if (item.answer != null) out.push(item.answer);
            else {
                Object.keys(item).forEach(k => {
                    const v = item[k];
                    if (v === true || v === 1 || v === '1' || v === 'true' || v === 'True') out.push(k);
                });
            }
            return;
        }
        out.push(item);
    });

    return Array.from(new Set(
        out.map(v => String(v).trim().toLowerCase()).filter(Boolean)
    )).sort();
}

function _answersMatch(a, b) {
    const left = _normalizeAnswerTokens(a);
    const right = _normalizeAnswerTokens(b);
    if (!left.length || !right.length) return null;
    if (left.length !== right.length) return false;
    return left.every((v, i) => v === right[i]);
}

function _resolveAnswerStatus(a, qType, yours, correct, marksGot, maxMarks) {
    if (!_hasMeaningfulAnswer(yours)) return 'unanswered';
    if (a.is_pending === true) return 'pending';
    if (a.is_correct === true || a.correct === true) return 'correct';
    if (a.is_correct === false || a.correct === false) return 'incorrect';

    if (qType === 'mcq' || qType === 'multiple_mcq') {
        const cmp = _answersMatch(yours, correct);
        if (cmp === true) return 'correct';
        if (cmp === false) {
            // Fallback to awarded marks when answer formats differ (id vs text).
            if (marksGot != null && maxMarks != null && marksGot >= maxMarks) return 'correct';
            if (marksGot != null && marksGot > 0) return 'correct';
            return 'incorrect';
        }
    }

    if (marksGot != null && maxMarks != null) {
        if (marksGot <= 0) return 'incorrect';
        if (marksGot >= maxMarks) return 'correct';
        return 'correct';
    }
    if (marksGot != null) return marksGot > 0 ? 'correct' : 'incorrect';
    return 'pending';
}

function _deriveDetailStats(detail, answers) {
    const explicitCorrect = _toNum(detail.correct_count ?? detail.correct_answers_count ?? detail.correct_answers);
    const explicitWrong = _toNum(detail.wrong_count ?? detail.incorrect_count ?? detail.wrong_answers);
    const explicitSkipped = _toNum(detail.skipped_count ?? detail.unanswered_count ?? detail.unanswered);
    const explicitTotal = _toNum(detail.total_questions ?? detail.questions_count ?? detail.question_count);

    let derivedCorrect = 0;
    let derivedWrong = 0;
    let derivedSkipped = 0;
    if (Array.isArray(answers) && answers.length) {
        answers.forEach(a => {
            const status = _resolveAnswerStatus(
                a,
                (a.question_type || a.type || '').toLowerCase(),
                _extractAnswerValue(a),
                _extractCorrectValue(a),
                _toNum(a.marks_obtained ?? a.score_obtained ?? a.score ?? a.points),
                _toNum(a.max_marks ?? a.max_points ?? a.marks ?? a.points_possible)
            );
            if (status === 'correct') derivedCorrect++;
            else if (status === 'incorrect') derivedWrong++;
            else derivedSkipped++;
        });
    }

    const correct = explicitCorrect != null ? explicitCorrect : (answers.length ? derivedCorrect : null);
    const wrong = explicitWrong != null ? explicitWrong : (answers.length ? derivedWrong : null);
    const skipped = explicitSkipped != null ? explicitSkipped : (answers.length ? derivedSkipped : null);
    const totalQuestions = explicitTotal != null
        ? explicitTotal
        : (answers.length ? answers.length : (correct != null && wrong != null && skipped != null ? correct + wrong + skipped : null));

    return { correct, wrong, skipped, totalQuestions };
}

function _formatAnswerValue(val) {
    if (!_hasMeaningfulAnswer(val)) return '<em style="color:#94a3b8">No answer provided</em>';
    if (typeof val === 'object' && val.code) {
        return `<pre class="mad-code-block">${_esc(val.code)}</pre>`;
    }
    if (Array.isArray(val)) {
        return _esc(val.map(v => typeof v === 'object' ? (v.text ?? v.value ?? v.id ?? JSON.stringify(v)) : String(v)).join(', '));
    }
    if (typeof val === 'object') {
        if (val.text != null) return _esc(String(val.text));
        if (val.answer != null) return _esc(String(val.answer));
        if (val.value != null) return _esc(String(val.value));
        const selected = Object.keys(val).filter(k => {
            const v = val[k];
            return v === true || v === 1 || v === '1' || v === 'true' || v === 'True';
        });
        if (selected.length) return _esc(selected.join(', '));
        return `<pre class="mad-code-block">${_esc(JSON.stringify(val, null, 2))}</pre>`;
    }
    return _esc(String(val));
}

function _statusOf(r) {
    if (r.is_pending || r.status === 'pending' || r.result_status === 'pending') return 'pending';
    if (r.passed === true  || r.status === 'pass'   || r.result_status === 'pass')   return 'pass';
    if (r.passed === false || r.status === 'fail'   || r.result_status === 'fail')   return 'fail';
    // Infer from score
    const score   = r.score ?? r.obtained_marks ?? r.marks_obtained;
    const passing = r.passing_marks;
    if (score != null && passing != null) return score >= passing ? 'pass' : 'fail';
    return 'pending';
}

function _pctOf(r) {
    if (r.percentage != null) return parseFloat(r.percentage);
    const score = r.score ?? r.obtained_marks ?? r.marks_obtained;
    const total = r.total_marks ?? r.max_marks;
    if (score != null && total != null && total > 0) return (score / total) * 100;
    return null;
}

function _examName(r) {
    return (
        r.exam_title ||
        r.exam?.title ||
        r.exam?.exam_title ||
        r.exam_name ||
        r.title ||
        'Untitled Exam'
    );
}

function _resetFilters() {
    const si = document.getElementById('searchInput');
    const sf = document.getElementById('statusFilter');
    if (si) si.value = '';
    if (sf) sf.value = '';
    _search = ''; _statusFilter = '';
    document.getElementById('searchClear')?.classList.add('hidden');
    _page = 1; _applyAndRender();
}

function _showState(state) {
    const loading = document.getElementById('loadingState');
    const empty   = document.getElementById('emptyState');
    const list    = document.getElementById('resultsList');
    const pag     = document.getElementById('pagination');
    if (loading) loading.style.display  = state === 'loading' ? 'flex'  : 'none';
    if (empty)   empty.classList.toggle('hidden',  state !== 'empty');
    if (list)    list.classList.toggle('hidden',   state !== 'list');
    if (pag)     pag.classList.toggle('hidden',    state !== 'list');
}

function _closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val ?? '');
}

function _fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}

function _fmtDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function _fmtDuration(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function _formatQText(text) {
    return String(text ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, l, c) => `<pre><code>${c.trim()}</code></pre>`)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}

function _esc(s) {
    return String(s ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
