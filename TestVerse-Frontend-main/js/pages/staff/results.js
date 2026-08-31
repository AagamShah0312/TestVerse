/**
 * TestVerse — Staff Results Page
 *
 * Flow:
 *  1. Load all staff exams → show as cards (filter by completed)
 *  2. Click exam → load GET STAFF_EXAM_RESULTS(examId)
 *  3. Per row: "Grade" button → GET STAFF_RESULTS_ANSWERS(resultId) → show in drawer
 *  4. Staff scores descriptive/coding → POST STAFF_SUBMISSIONS_EVALUATE per question
 *  5. When all results are fully_graded → unlock "Publish All" button
 *  6. Publish All → POST STAFF_EXAM_PUBLISH_RESULTS(examId)
 *  7. Per row: individual "Publish" → POST STAFF_RESULT_PUBLISH(resultId)
 */
'use strict';

// ── State ──────────────────────────────────────────────────────────
let _exams         = [];
let _examFilter    = 'completed';  // 'completed' | 'all'
let _selectedExam  = null;

let _allResults    = [];
let _filteredRes   = [];
let _searchQ       = '';
let _gradingFilter = '';
let _publishFilter = '';

let _currentResultId  = null;
let _currentAttemptId = null;
let _answers          = [];   // full answer objects for drawer
let _saving           = false;

// ── Boot ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireStaff()) return;
    _initSidebar();
    _initTopbar();
    _initExamTabs();
    _initResultsToolbar();
    _initGradeDrawer();
    _initPublishModal();
    document.getElementById('backToExams')?.addEventListener('click', _backToExams);
    document.getElementById('publishAllBtn')?.addEventListener('click', _openPublishModal);
    await _loadExams();
});

// ── Topbar ─────────────────────────────────────────────────────────
function _initTopbar() {
    const u    = Auth.getUser(); if (!u) return;
    const name = u.name || u.username || 'Staff';
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
//  EXAMS LIST
// ══════════════════════════════════════════════════════════════════

async function _loadExams() {
    _setExamState('loading');
    try {
    const res = await Api.get(`${CONFIG.ENDPOINTS.STAFF_EXAMS}?all=true`);
        const { data, error } = await Api.parse(res);
        if (error) { _showAlert(_extractErr(error), 'error'); _setExamState('empty'); return; }
        _exams = Array.isArray(data) ? data : (data?.results ?? []);
        _renderExams();
    } catch {
        _showAlert('Network error. Could not load exams.', 'error');
        _setExamState('empty');
    }
}

function _initExamTabs() {
    document.querySelectorAll('#examStatusTabs .filter-tab').forEach(tab =>
        tab.addEventListener('click', () => {
            document.querySelectorAll('#examStatusTabs .filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            _examFilter = tab.dataset.status;
            _renderExams();
        })
    );
}

function _renderExams() {
    const now  = new Date();
    let list   = [..._exams];

    if (_examFilter === 'completed') {
        list = list.filter(e => {
            if (!e.end_time) return false;
            return new Date(e.end_time) < now;
        });
    }

    if (list.length === 0) { _setExamState('empty'); return; }

    _setExamState('grid');
    const grid = document.getElementById('examGrid');
    grid.innerHTML = list.map(_buildExamCard).join('');
    grid.querySelectorAll('.exam-card').forEach(card =>
        card.addEventListener('click', () => _selectExam(card.dataset.id))
    );
}

function _buildExamCard(e) {
    const now       = new Date();
    const endTime   = e.end_time ? new Date(e.end_time) : null;
    const startTime = e.start_time ? new Date(e.start_time) : null;

    let badgeClass = 'badge-draft', badgeText = 'Draft', badgeIcon = 'circle';
    if (endTime && endTime < now) { badgeClass = 'badge-completed'; badgeText = 'Completed'; badgeIcon = 'flag-checkered'; }
    else if (startTime && startTime <= now) { badgeClass = 'badge-live'; badgeText = 'Live'; badgeIcon = 'circle'; }
    else if (e.is_published) { badgeClass = 'badge-published'; badgeText = 'Published'; badgeIcon = 'check'; }

    const fmtDate = d => d ? d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';
    const attempts = e.student_attempts ?? e.attempts_count ?? '—';

    return `
    <div class="exam-card" data-id="${e.id}">
        <span class="exam-card-badge ${badgeClass}">
            <i class="fas fa-${badgeIcon}"></i>${badgeText}
        </span>
        <div class="exam-card-title">${_esc(e.title)}</div>
        <div class="exam-card-meta">
            <span><i class="fas fa-tag"></i>${_esc(e.exam_type || 'mixed')}</span>
            <span><i class="fas fa-calendar-alt"></i>${fmtDate(endTime)}</span>
            <span><i class="fas fa-clock"></i>${e.duration ?? '—'} min</span>
        </div>
        <div class="exam-card-footer">
            <span class="exam-card-stat"><i class="fas fa-users"></i> ${attempts} attempts</span>
            <i class="fas fa-arrow-right exam-card-arrow"></i>
        </div>
    </div>`;
}

function _setExamState(state) {
    document.getElementById('examListLoading').style.display = state === 'loading' ? 'flex' : 'none';
    document.getElementById('examGrid').style.display        = state === 'grid'    ? ''     : 'none';
    document.getElementById('examListEmpty').style.display   = state === 'empty'   ? 'flex' : 'none';
}

// ══════════════════════════════════════════════════════════════════
//  SELECT EXAM → LOAD RESULTS
// ══════════════════════════════════════════════════════════════════

async function _selectExam(examId) {
    _selectedExam = _exams.find(e => String(e.id) === String(examId));
    if (!_selectedExam) return;

    // Show panel, update header
    document.getElementById('resultsPanel').style.display = '';
    document.getElementById('selectedExamTitle').textContent = _selectedExam.title;
    document.getElementById('selectedExamMeta').textContent  =
        `${_selectedExam.exam_type ?? ''} · ${_selectedExam.duration ?? '—'} min · Total: ${_selectedExam.total_marks ?? '—'} marks`;

    // Scroll panel into view
    document.getElementById('resultsPanel').scrollIntoView({ behavior:'smooth', block:'start' });

    await _loadResults(examId);
}

async function _loadResults(examId) {
    _setResultsState('loading');
    _resetPublishBtn();
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.STAFF_EXAM_RESULTS(examId));
        const { data, error } = await Api.parse(res);
        if (error) {
            _showAlert(_extractErr(error), 'error');
            _setResultsState('empty');
            return;
        }
        _allResults = Array.isArray(data) ? data : (data?.results ?? []);
        _searchQ = ''; _gradingFilter = ''; _publishFilter = '';
        document.getElementById('resultSearch').value   = '';
        document.getElementById('gradingFilter').value  = '';
        document.getElementById('publishFilter').value  = '';
        _applyResultFilters();
        _updateResultsStats();
        _updatePublishBtn();
    } catch {
        _showAlert('Network error. Could not load results.', 'error');
        _setResultsState('empty');
    }
}

function _backToExams() {
    document.getElementById('resultsPanel').style.display = 'none';
    _selectedExam = null; _allResults = []; _filteredRes = [];
    // Scroll back to top
    window.scrollTo({ top:0, behavior:'smooth' });
}

// ── Filters & Render ───────────────────────────────────────────────
function _initResultsToolbar() {
    const input = document.getElementById('resultSearch');
    const clear = document.getElementById('resultSearchClear');
    let timer;
    input?.addEventListener('input', () => {
        _searchQ = input.value.trim();
        clear.style.display = _searchQ ? '' : 'none';
        clearTimeout(timer); timer = setTimeout(_applyResultFilters, 250);
    });
    clear?.addEventListener('click', () => {
        input.value = ''; _searchQ = '';
        clear.style.display = 'none'; _applyResultFilters();
    });
    document.getElementById('gradingFilter')?.addEventListener('change', e => {
        _gradingFilter = e.target.value; _applyResultFilters();
    });
    document.getElementById('publishFilter')?.addEventListener('change', e => {
        _publishFilter = e.target.value; _applyResultFilters();
    });
}

function _applyResultFilters() {
    let list = [..._allResults];
    if (_searchQ) {
        const q = _searchQ.toLowerCase();
        list = list.filter(r => {
            const s = r.student || {};
            return (s.name || s.email || s.username || '').toLowerCase().includes(q) ||
                   (s.email || '').toLowerCase().includes(q);
        });
    }
    if (_gradingFilter) list = list.filter(r => (r.grading_status || 'pending') === _gradingFilter);
    if (_publishFilter === 'published')   list = list.filter(r => r.is_published);
    if (_publishFilter === 'unpublished') list = list.filter(r => !r.is_published);
    _filteredRes = list;
    _renderResultsTable();
}

function _renderResultsTable() {
    if (_filteredRes.length === 0) { _setResultsState('empty'); return; }
    _setResultsState('table');
    const tbody = document.getElementById('resultsTableBody');
    tbody.innerHTML = _filteredRes.map(r => _buildResultRow(r)).join('');

    tbody.querySelectorAll('.grade-btn').forEach(btn =>
        btn.addEventListener('click', () => _openGradeDrawer(btn.dataset.resultId, btn.dataset.attemptId))
    );
    tbody.querySelectorAll('.publish-single-btn').forEach(btn =>
        btn.addEventListener('click', () => _publishSingle(btn.dataset.resultId))
    );
}

function _buildResultRow(r) {
    const s           = _getResultStudent(r);
    const name        = s.name || '—';
    const subLabel    = s.email || s.enrollmentId || s.username || '—';
    const resultId    = r.id ?? r.result_id ?? '';
    const obtained    = parseFloat(r.obtained_marks ?? r.score ?? 0);
    const total       = parseFloat(r.total_marks ?? _selectedExam?.total_marks ?? 100);
    const safeTotal   = Number.isFinite(total) && total > 0 ? total : 0;
    const pct         = r.percentage != null
        ? parseFloat(r.percentage).toFixed(1)
        : (safeTotal > 0 ? ((obtained / safeTotal) * 100).toFixed(1) : '0.0');
    const fillPct     = Math.min(100, Math.max(0, parseFloat(pct)));
    const passClass   = r.status === 'pass' ? 'pass' : r.status === 'fail' ? 'fail' : 'pending';
    const gradStatus  = r.grading_status || 'pending';
    const isFullyGraded = gradStatus === 'fully_graded';

    const gradingLabel = { fully_graded:'Fully Graded', partially_graded:'Partial', pending:'Pending' };
    const gradingIcon  = { fully_graded:'check-circle', partially_graded:'adjust', pending:'clock' };

    const statusLabel  = { pass:'Pass', fail:'Fail', pending:'Pending' };

    // Grade button: hide if already fully graded AND only MCQs (no manual grading needed)
    const gradeBtn = `
        <button class="row-btn grade-btn" data-result-id="${resultId}" data-attempt-id="${r.attempt_id || ''}">
            <i class="fas fa-pen-nib"></i> ${isFullyGraded ? 'Review' : 'Grade'}
        </button>`;

    // Publish button: only show if fully graded and not yet published
    const pubBtn = (isFullyGraded && !r.is_published)
        ? `<button class="row-btn publish-single-btn" data-result-id="${resultId}"><i class="fas fa-paper-plane"></i> Publish</button>`
        : '';

    return `
    <tr>
        <td>
            <div class="student-cell">
                <img class="student-avatar" src="${_avatar(name)}" alt="${_esc(name)}" loading="lazy">
                <div class="student-cell-info">
                    <span class="student-name">${_esc(name)}</span>
                    <span class="student-email">${_esc(subLabel)}</span>
                </div>
            </div>
        </td>
        <td>
            <div class="marks-wrap">
                <span class="marks-val">${obtained} / ${total}</span>
                <div class="marks-bar">
                    <div class="marks-fill ${passClass}" style="width:${fillPct}%"></div>
                </div>
            </div>
        </td>
        <td><strong>${pct}%</strong></td>
        <td><span class="status-badge ${passClass}"><i class="fas fa-${passClass === 'pass' ? 'check' : passClass === 'fail' ? 'times' : 'clock'}"></i>${statusLabel[r.status] || '—'}</span></td>
        <td><span class="grading-badge ${gradStatus}"><i class="fas fa-${gradingIcon[gradStatus] || 'clock'}"></i>${gradingLabel[gradStatus] || gradStatus}</span></td>
        <td><span class="pub-badge ${r.is_published ? 'yes' : 'no'}"><i class="fas fa-${r.is_published ? 'eye' : 'eye-slash'}"></i>${r.is_published ? 'Yes' : 'No'}</span></td>
        <td>
            <div class="row-actions">
                ${gradeBtn}
                ${pubBtn}
            </div>
        </td>
    </tr>`;
}

// ── Stats ──────────────────────────────────────────────────────────
function _updateResultsStats() {
    const total     = _allResults.length;
    const graded    = _allResults.filter(r => r.grading_status === 'fully_graded').length;
    const pending   = _allResults.filter(r => (r.grading_status || 'pending') !== 'fully_graded').length;
    const published = _allResults.filter(r => r.is_published).length;
    const scores    = _allResults
        .filter(r => r.percentage != null)
        .map(r => parseFloat(r.percentage));
    const avg = scores.length ? (scores.reduce((a,b) => a+b, 0) / scores.length).toFixed(1) + '%' : '—';

    _setText('rstatTotal',     total);
    _setText('rstatGraded',    graded);
    _setText('rstatPending',   pending);
    _setText('rstatPublished', published);
    _setText('rstatAvg',       avg);
}

function _setResultsState(state) {
    document.getElementById('resultsLoading').style.display = state === 'loading' ? 'flex' : 'none';
    document.getElementById('resultsEmpty').style.display   = state === 'empty'   ? 'flex' : 'none';
    document.getElementById('resultsTable').style.display   = state === 'table'   ? ''     : 'none';
}

// ── Publish All Button ─────────────────────────────────────────────
function _updatePublishBtn() {
    const total      = _allResults.length;
    const graded     = _allResults.filter(r => r.grading_status === 'fully_graded').length;
    const published  = _allResults.filter(r => r.is_published).length;
    const allGraded  = total > 0 && graded === total;
    const allPub     = total > 0 && published === total;

    const btn  = document.getElementById('publishAllBtn');
    const hint = document.getElementById('publishHint');

    if (allPub) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-check-circle"></i><span class="btn-text">All Published</span>';
        hint.textContent = 'All results are already published';
        hint.classList.add('ready');
    } else if (allGraded) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i><span class="btn-text">Publish All Results</span><span class="btn-loader hidden"><i class="fas fa-spinner fa-spin"></i></span>';
        hint.textContent = `${graded}/${total} graded — ready to publish!`;
        hint.classList.add('ready');
    } else {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-lock"></i><span class="btn-text">Publish All Results</span>';
        hint.textContent = `${graded}/${total} graded — grade all to unlock`;
        hint.classList.remove('ready');
    }
}

function _resetPublishBtn() {
    document.getElementById('publishAllBtn').disabled = true;
    document.getElementById('publishAllBtn').innerHTML = '<i class="fas fa-lock"></i><span class="btn-text">Publish All Results</span>';
    document.getElementById('publishHint').textContent = 'Grade all submissions first';
    document.getElementById('publishHint').classList.remove('ready');
}

// ══════════════════════════════════════════════════════════════════
//  GRADE DRAWER
// ══════════════════════════════════════════════════════════════════

function _initGradeDrawer() {
    document.getElementById('gradeDrawerClose')?.addEventListener('click', _closeGradeDrawer);
    document.getElementById('gradeDrawerBackdrop')?.addEventListener('click', _closeGradeDrawer);
    document.getElementById('saveAllGradesBtn')?.addEventListener('click', _saveAllGrades);
    document.getElementById('autoGradeMcqBtn')?.addEventListener('click', _autoGradeAllMcqs);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') _closeGradeDrawer(); });
}

async function _openGradeDrawer(resultId, attemptId) {
    _currentResultId  = resultId;
    _currentAttemptId = attemptId;
    _answers = [];

    // Find result in local state
    const result = _allResults.find(r =>
        String(r.id ?? r.result_id ?? r.attempt_id) === String(resultId)
    );
    const s      = _getResultStudent(result);
    const name   = s.name || '—';
    const curScore = result?.obtained_marks ?? result?.score ?? 0;
    const totalScore = result?.total_marks ?? _selectedExam?.total_marks ?? 100;

    // Open with loading
    _showGradeDrawerLoading(true);
    document.getElementById('gradeDrawer').classList.add('open');
    document.getElementById('gradeDrawerBackdrop').classList.add('show');
    document.body.style.overflow = 'hidden';

    // Set student info
    _setText('gradeDrawerTitle', 'Review & Grade');
    _setText('gradeDrawerSubtitle', name);
    _setImg('gradeStudentAvatar', _avatar(name));
    _setText('gradeStudentName',  name);
    _setText('gradeStudentEmail', s.email || s.enrollmentId || '—');
    _setText('gradeScoreCurrent', result ? parseFloat(curScore || 0) : '—');
    _setText('gradeScoreTotal',   result ? parseFloat(totalScore || 0) : '—');
    
    // Reset auto-grade button text
    const autoGradeBtn = document.getElementById('autoGradeMcqBtn');
    if (autoGradeBtn) {
        const btnText = autoGradeBtn.querySelector('.btn-text');
        if (btnText) {
            btnText.innerHTML = '<i class="fas fa-magic"></i> Auto Grade MCQs';
        }
    }

    try {
        const res = await Api.get(CONFIG.ENDPOINTS.STAFF_RESULTS_ANSWERS(resultId));
        const { data, error } = await Api.parse(res);
        if (error || !data) {
            _setHTML('gradeDrawerAlert', _alertHtml('Could not load answers.', 'error'));
            _showGradeDrawerLoading(false);
            return;
        }

        _answers = data.answers ?? data ?? [];
        _currentAttemptId = data.attempt_id || _currentAttemptId;

        // Prefer authoritative meta from answers endpoint when available.
        const drawerName = data.student_name || name;
        const drawerSub  = data.student_email || data.student_enrollment_id || s.email || s.enrollmentId || '—';
        _setText('gradeDrawerSubtitle', drawerName);
        _setText('gradeStudentName', drawerName);
        _setImg('gradeStudentAvatar', _avatar(drawerName));
        _setText('gradeStudentEmail', drawerSub);
        if (data.obtained_marks != null) _setText('gradeScoreCurrent', parseFloat(data.obtained_marks));
        if (data.total_marks != null) _setText('gradeScoreTotal', parseFloat(data.total_marks));

        _renderAnswers(_answers);
        _showGradeDrawerLoading(false);
        _clearEl('gradeDrawerAlert');

    } catch {
        _setHTML('gradeDrawerAlert', _alertHtml('Network error loading answers.', 'error'));
        _showGradeDrawerLoading(false);
    }
}

function _closeGradeDrawer() {
    if (_saving) return;
    document.getElementById('gradeDrawer').classList.remove('open');
    document.getElementById('gradeDrawerBackdrop').classList.remove('show');
    document.body.style.overflow = '';
}

function _showGradeDrawerLoading(on) {
    document.getElementById('gradeDrawerLoading').style.display  = on ? 'flex' : 'none';
    document.getElementById('gradeDrawerBody').style.display     = on ? 'none' : '';
}

// ── Render Answers ─────────────────────────────────────────────────
function _renderAnswers(answers) {
    const container = document.getElementById('questionsContainer');
    container.innerHTML = '';

    // MCQ summary (auto-graded)
    const mcqAnswers = answers.filter(a => {
        const t = _normQType(a);
        return t === 'mcq' || t === 'multiple_mcq';
    });
    const mcqCorrect = mcqAnswers.filter(a => _resolveMcqAutoStatus(a) === 'correct').length;
    const mcqPending = mcqAnswers.filter(a => _resolveMcqAutoStatus(a) === 'pending').length;
    const mcqSummary = document.getElementById('mcqSummary');
    if (mcqAnswers.length > 0) {
        mcqSummary.style.display = 'flex';
        _setText(
            'mcqSummaryText',
            `${mcqCorrect} correct / ${mcqAnswers.length} total (auto-graded${mcqPending ? `, ${mcqPending} pending` : ''})`
        );
    } else {
        mcqSummary.style.display = 'none';
    }

    if (answers.length === 0) {
        container.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:2rem;font-size:.9rem;">No answers found for this submission.</p>';
        return;
    }

    answers.forEach((ans, idx) => {
        const card = _buildAnswerCard(ans, idx + 1);
        container.appendChild(card);
    });
}

function _buildAnswerCard(ans, num) {
    const q         = ans.question || {};
    const qType     = _normQType(ans);
    const isManual  = qType === 'descriptive' || qType === 'coding'
        || qType === 'short_answer' || qType === 'long_answer';
    const gradedScore = ans.marks_obtained ?? ans.score;
    const isGraded  = gradedScore != null && gradedScore !== undefined;

    const wrapper = document.createElement('div');
    const answerKey = ans.id ?? ans.answer_id ?? ans.question_id ?? q.id;
    wrapper.className = `question-card ${isManual ? (isGraded ? 'graded' : 'needs-grading') : 'mcq-auto'}`;
    wrapper.dataset.answerId   = answerKey;
    wrapper.dataset.questionId = q.id;

    const typeLabels = {
        mcq:'MCQ',
        multiple_mcq:'Multi MCQ',
        descriptive:'Descriptive',
        short_answer:'Short Answer',
        long_answer:'Long Answer',
        coding:'Coding',
    };
    const typeClass  = `type-${qType}`;

    // Student answer display
    const studentVal = _getStudentAnswer(ans);
    let answerHtml = '';
    
    const isEmpty = _isEmptyAnswer(studentVal);
    
    if (isEmpty) {
        answerHtml = '<span class="qcard-answer-empty"><i class="fas fa-minus-circle"></i> No answer provided</span>';
    } else if (qType === 'coding' || (typeof studentVal === 'object' && studentVal.code)) {
        // Coding answer
        const code = typeof studentVal === 'object' && studentVal.code
            ? studentVal.code
            : (ans.code || (typeof studentVal === 'string' ? studentVal : JSON.stringify(studentVal)));
        answerHtml = `<pre class="qcard-answer-code">${_esc(code)}</pre>`;
    } else if (Array.isArray(studentVal)) {
        // Array of answers (e.g., multiple choice selections)
        const display = studentVal.map(v => {
            if (typeof v === 'object' && v.text) return v.text;
            if (typeof v === 'object' && v.value) return v.value;
            return String(v);
        }).join(', ');
        answerHtml = `<div class="qcard-answer-text">${_esc(display)}</div>`;
    } else if (typeof studentVal === 'object') {
        // Object that's not coding - try to extract meaningful display
        if (studentVal.text) {
            answerHtml = `<div class="qcard-answer-text">${_esc(String(studentVal.text))}</div>`;
        } else if (studentVal.value) {
            answerHtml = `<div class="qcard-answer-text">${_esc(String(studentVal.value))}</div>`;
        } else {
            // Fallback: show JSON representation
            answerHtml = `<div class="qcard-answer-text"><pre style="white-space:pre-wrap;font-size:0.85em;">${_esc(JSON.stringify(studentVal, null, 2))}</pre></div>`;
        }
    } else {
        // Primitive value (string, number, etc.)
        answerHtml = `<div class="qcard-answer-text">${_esc(String(studentVal))}</div>`;
    }

    // MCQ result indicator
    let mcqResult = '';
    if (!isManual) {
        const autoStatus = _resolveMcqAutoStatus(ans, studentVal);
        const mcqPts    = _getAnswerPoints(ans);

        let cls = 'skipped';
        let icon = 'minus-circle';
        let label = 'Pending auto-grade';

        if (autoStatus === 'correct') {
            cls = 'correct';
            icon = 'check-circle';
            label = `Correct (+${mcqPts} pts)`;
        } else if (autoStatus === 'incorrect') {
            cls = 'wrong';
            icon = 'times-circle';
            label = 'Incorrect (0 pts)';
        } else if (autoStatus === 'skipped') {
            cls = 'skipped';
            icon = 'minus-circle';
            label = 'Skipped (0 pts)';
        }

        mcqResult = `<div class="mcq-result-row ${cls}"><i class="fas fa-${icon}"></i>${label}</div>`;
    }

    // Grade input (manual only)
    let gradeInputHtml = '';
    if (isManual) {
        const maxPts = q.points ?? q.marks ?? ans.max_marks ?? ans.points_possible ?? '';
        const curPts = isGraded ? gradedScore : '';
        const curFb  = ans.feedback || '';
        const rowCls = isGraded ? 'grade-input-row graded' : 'grade-input-row';
        gradeInputHtml = `
        <div class="${rowCls}" data-answer-id="${answerKey}">
            <div class="grade-input-group">
                <label class="grade-input-label">
                    Score <span style="color:#94a3b8;font-weight:400;">/ ${maxPts}</span>
                </label>
                <input type="number" class="grade-score-input"
                       placeholder="0"
                       min="0" max="${maxPts}"
                       value="${curPts}"
                       data-answer-id="${answerKey}"
                       data-max="${maxPts}">
            </div>
            <div class="grade-input-group">
                <label class="grade-input-label">Feedback <span style="color:#94a3b8;font-weight:400;">(optional)</span></label>
                <textarea class="grade-feedback-input"
                          placeholder="Add feedback for the student…"
                          data-answer-id="${answerKey}">${_esc(curFb)}</textarea>
            </div>
        </div>`;
    }

    wrapper.innerHTML = `
    <div class="qcard-header">
        <div class="qcard-meta">
            <span class="qcard-num">Q${num}</span>
            <span class="qcard-type-badge ${typeClass}">${typeLabels[qType] || qType}</span>
            ${!isManual ? '<span style="font-size:.7rem;color:#059669;font-weight:600;"><i class="fas fa-robot"></i> Auto-graded</span>' : ''}
        </div>
        <span class="qcard-points">${q.points ?? q.marks ?? '—'} pts</span>
    </div>
    <div class="qcard-body">
        <p class="qcard-question-text">${_esc(_getQuestionText(ans))}</p>
        <div>
            <span class="qcard-answer-label">Student Answer</span>
            ${answerHtml}
        </div>
        ${mcqResult}
        ${gradeInputHtml}
    </div>`;

    return wrapper;
}

// ── Auto Grade All MCQs ──────────────────────────────────────────────
async function _autoGradeAllMcqs() {
    if (!_selectedExam || !_currentResultId) return;
    
    const btn = document.getElementById('autoGradeMcqBtn');
    if (!btn) return;
    
    if (!confirm('This will auto-grade all MCQ questions for the current student. Continue?')) {
        return;
    }
    
    _setBtnLoading(btn, true);
    _clearEl('gradeDrawerAlert');
    
    try {
        // Get the current student's answers
        let answers = [..._answers];
        
        // Calculate scores for MCQ questions only
        let mcqCount = 0;
        let correctCount = 0;
        
        for (let i = 0; i < answers.length; i++) {
            const answer = answers[i];
            const qType = _normQType(answer);
            
            // Only process MCQ and multiple choice questions
            if (qType === 'mcq' || qType === 'multiple_mcq') {
                mcqCount++;

                const correctAnswer = _extractCorrectAnswerTokens(answer);
                const rawStudentAnswer = _getStudentAnswer(answer);
                const studentAnswer = _normalizeAnswerTokens(rawStudentAnswer);
                const hasCorrectAnswer = correctAnswer.length > 0;
                const hasStudentAnswer = studentAnswer.length > 0 && !_isEmptyAnswer(rawStudentAnswer);
                const isCorrect = hasCorrectAnswer && hasStudentAnswer && _arraysEqual(correctAnswer, studentAnswer);

                if (isCorrect) {
                    correctCount++;
                }

                const points = isCorrect ? _getAnswerPoints(answer) : 0;
                // Update the answer object with scoring info
                answers[i] = {
                    ...answer,
                    is_correct: isCorrect,
                    marks_obtained: points,
                    score: points
                };
            }
        }
        
        // Update the display with the calculated scores
        _answers = answers;
        _renderAnswers(answers);

        const totalScore = answers.reduce((sum, a) => {
            const v = parseFloat(a.marks_obtained ?? a.score ?? 0);
            return sum + (Number.isFinite(v) ? v : 0);
        }, 0);
        _setText('gradeScoreCurrent', totalScore.toFixed(2).replace(/\.00$/, ''));
        
        _setHTML('gradeDrawerAlert', _alertHtml(
            `Auto-graded ${correctCount}/${mcqCount} MCQ questions for current student.`,
            'success'
        ));
        
    } catch (err) {
        console.error('[results] autoGradeMcq:', err);
        _setHTML('gradeDrawerAlert', _alertHtml(
            'Error during auto-grading: ' + err.message,
            'error'
        ));
    } finally {
        _setBtnLoading(btn, false);
        
        // Update button text after grading
        const btnText = btn.querySelector('.btn-text');
        if (btnText) {
            btnText.innerHTML = '<i class="fas fa-magic"></i> Re-Auto Grade MCQs';
        }
    }
}

// ── Save All Grades ────────────────────────────────────────────────
async function _saveAllGrades() {
    if (_saving) return;

    // Collect all manual grade inputs
    const gradeRows = document.querySelectorAll('.grade-input-row');
    const toSave    = [];
    const attemptId = _currentAttemptId || '';

    let hasError = false;
    gradeRows.forEach(row => {
        const answerId = row.dataset.answerId;
        const scoreInp = row.querySelector('.grade-score-input');
        const feedInp  = row.querySelector('.grade-feedback-input');
        if (!scoreInp) return;

        const score  = scoreInp.value.trim();
        const parsedMax = parseFloat(scoreInp.dataset.max || '');
        const maxVal = Number.isFinite(parsedMax) ? parsedMax : Number.POSITIVE_INFINITY;
        if (score === '') return; // skip unfilled

        const numScore = parseFloat(score);
        if (isNaN(numScore) || numScore < 0 || numScore > maxVal) {
            scoreInp.style.borderColor = '#ef4444';
            hasError = true;
            return;
        }
        scoreInp.style.borderColor = '';

        // Find the question_id for this answer
        const ans = _answers.find(a =>
            String(a.id ?? a.answer_id ?? a.question_id ?? a.question?.id) === String(answerId)
        );
        if (!ans) return;

        const qId = _getAnswerQuestionId(ans);
        if (!qId) return;

        toSave.push({
            attempt_id:  attemptId,
            question_id: qId,
            score:       numScore,
            feedback:    feedInp?.value.trim() || '',
        });
    });

    if (hasError) {
        _setHTML('gradeDrawerAlert', _alertHtml('Fix score errors (check min/max values).', 'error'));
        return;
    }
    if (toSave.length === 0) {
        _setHTML('gradeDrawerAlert', _alertHtml('No scores entered. Fill in at least one score to save.', 'info'));
        return;
    }
    if (!attemptId) {
        _setHTML('gradeDrawerAlert', _alertHtml('Missing attempt id for this submission. Reopen grading and try again.', 'error'));
        return;
    }

    _saving = true;
    const btn = document.getElementById('saveAllGradesBtn');
    _setBtnLoading(btn, true);
    _clearEl('gradeDrawerAlert');

    let failed = 0;
    for (const payload of toSave) {
        try {
            const res = await Api.post(
                CONFIG.ENDPOINTS.STAFF_EXAM_QUESTION_EVALUATE(_selectedExam.id, payload.question_id),
                payload
            );
            const { error } = await Api.parse(res);
            if (error) failed++;
        } catch { failed++; }
    }

    _saving = false;
    _setBtnLoading(btn, false);

    if (failed > 0) {
        _setHTML('gradeDrawerAlert', _alertHtml(`${failed} answer(s) could not be saved. Please retry.`, 'error'));
    } else {
        _setHTML('gradeDrawerAlert', _alertHtml(`${toSave.length} grade(s) saved successfully!`, 'success'));
        // Refresh results list to reflect new grading_status
        if (_selectedExam) {
            await _loadResults(_selectedExam.id);
        }
        // Close drawer after short delay
        setTimeout(_closeGradeDrawer, 1200);
    }
}

// ══════════════════════════════════════════════════════════════════
//  PUBLISH
// ══════════════════════════════════════════════════════════════════

function _initPublishModal() {
    document.getElementById('publishModalClose')?.addEventListener('click',   _closePublishModal);
    document.getElementById('publishModalCancel')?.addEventListener('click',  _closePublishModal);
    document.getElementById('publishModal')?.addEventListener('click', e => {
        if (e.target.id === 'publishModal') _closePublishModal();
    });
    document.getElementById('publishModalConfirm')?.addEventListener('click', _confirmPublishAll);
}

function _openPublishModal() {
    const graded = _allResults.filter(r => r.grading_status === 'fully_graded').length;
    _setText('publishCount', graded);
    document.getElementById('publishModal').classList.add('show');
}
function _closePublishModal() {
    document.getElementById('publishModal').classList.remove('show');
}

async function _confirmPublishAll() {
    const btn = document.getElementById('publishModalConfirm');
    _setBtnLoading(btn, true);
    try {
        const res = await Api.post(
            CONFIG.ENDPOINTS.STAFF_EXAM_PUBLISH_RESULTS(_selectedExam.id),
            { action: 'publish', publish_all: true }
        );
        const { error } = await Api.parse(res);
        if (error) {
            _showAlert(_extractErr(error), 'error');
        } else {
            _showAlert('All results published successfully! Students can now view their results.', 'success');
            await _loadResults(_selectedExam.id);
        }
    } catch {
        _showAlert('Network error. Could not publish results.', 'error');
    } finally {
        _setBtnLoading(btn, false);
        _closePublishModal();
    }
}

async function _publishSingle(resultId) {
    try {
        const res = await Api.post(CONFIG.ENDPOINTS.STAFF_RESULT_PUBLISH(resultId), { action: 'publish' });
        const { error } = await Api.parse(res);
        if (error) {
            _showAlert(_extractErr(error), 'error');
        } else {
            _showAlert('Result published for student.', 'success');
            // Update local state
            const idx = _allResults.findIndex(r => String(r.id) === String(resultId));
            if (idx !== -1) _allResults[idx].is_published = true;
            _applyResultFilters();
            _updateResultsStats();
            _updatePublishBtn();
        }
    } catch {
        _showAlert('Network error.', 'error');
    }
}

// ─═══════════════════════════════════════════════════════════════════
//  HELPERS FOR GRADING
// ─═══════════════════════════════════════════════════════════════════

// Normalise question type across different backend shapes
function _normQType(ans) {
    const q   = ans.question || {};
    const raw = (q.type || q.question_type || ans.question_type || ans.type || '').toLowerCase();
    const map = {
        mcq: 'mcq',
        single_choice: 'mcq',
        multiple_mcq: 'multiple_mcq',
        multiple_choice: 'multiple_mcq',
        descriptive: 'descriptive',
        short_answer: 'short_answer',
        long_answer: 'long_answer',
        coding: 'coding',
        code: 'coding',
    };
    return map[raw] || raw || 'mcq';
}

function _getQuestionText(ans) {
    const q = ans.question || {};
    return q.text
        || q.question_text
        || ans.question_text
        || ans.prompt
        || 'Question text not available';
}

function _getStudentAnswer(ans) {
    if (!ans) return null;

    const qType = _normQType(ans);

    // Try various field names for the answer value
    let val = ans.student_answer
        ?? ans.your_answer
        ?? ans.submitted_answer
        ?? ans.answer
        ?? ans.response
        ?? ans.selected_option
        ?? ans.selected_options;

    // Handle different question types according to API response format
    if (qType === 'mcq' || qType === 'multiple_mcq') {
        // For MCQ, answers can be option ids, labels, or object maps.
        if (val && typeof val === 'object' && !Array.isArray(val)) {
            const selectedKeys = _extractTruthyKeys(val);
            if (selectedKeys.length === 1) return selectedKeys[0];
            if (selectedKeys.length > 1) return selectedKeys;
            if (val.id != null) return val.id;
            if (val.value != null) return val.value;
            if (val.text != null) return val.text;
            return null;
        }
        return val;
    } else if (qType === 'coding') {
        // For coding questions, the answer field might contain code directly
        // or be an object with code field
        if (val && typeof val === 'object' && val.code) {
            return val.code;
        }
        if (typeof val === 'string') {
            return val;
        }
        // If it's an object with other fields, return as object
        return val || ans.code || '';
    } else {
        // For descriptive, short_answer, long_answer
        if (typeof val === 'object' && val.text) {
            return val.text;
        }
        if (typeof val === 'object' && val.answer) {
            return val.answer;
        }
        return val || '';
    }
}

function _getResultStudent(r) {
    const result = r || {};
    const student = result.student || {};
    return {
        name: student.name || student.username || student.email || result.student_name || result.name || '—',
        email: student.email || result.student_email || result.email || '',
        username: student.username || result.student_username || '',
        enrollmentId: student.enrollment_id || result.enrollment_id || result.student_enrollment_id || '',
    };
}

function _getAnswerQuestionId(ans) {
    if (!ans) return '';
    const q = ans.question;
    if (q && typeof q === 'object') {
        return q.id ?? ans.question_id ?? '';
    }
    return q ?? ans.question_id ?? '';
}

function _isEmptyAnswer(val) {
    if (val == null) return true;
    if (typeof val === 'string') return val.trim() === '';
    if (Array.isArray(val)) return val.length === 0;
    if (typeof val !== 'object') return false;

    // Common object payload styles:
    //  - {code: "..."}
    //  - {text: "..."} / {value: "..."} / {answer: "..."}
    //  - {optionId: true, ...}
    const scalarKeys = ['code', 'text', 'value', 'answer', 'id'];
    if (scalarKeys.some(k => val[k] != null && String(val[k]).trim() !== '')) {
        return false;
    }

    const selectedKeys = _extractTruthyKeys(val);
    if (selectedKeys.length > 0) return false;

    const keys = Object.keys(val);
    if (!keys.length) return true;

    // If keys exist but all values are falsy placeholders, treat as unanswered.
    const hasMeaningfulValue = keys.some(k => {
        const v = val[k];
        if (v == null) return false;
        if (typeof v === 'boolean') return v;
        if (typeof v === 'number') return v !== 0;
        if (typeof v === 'string') {
            const t = v.trim().toLowerCase();
            return t !== '' && t !== 'false' && t !== '0' && t !== 'null' && t !== 'undefined';
        }
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'object') return Object.keys(v).length > 0;
        return Boolean(v);
    });

    return !hasMeaningfulValue;
}

function _extractTruthyKeys(obj) {
    return Object.keys(obj || {}).filter(k => {
        const v = obj[k];
        return v === true || v === 1 || v === '1' || v === 'true' || v === 'True';
    });
}

function _getAnswerPoints(ans) {
    const q = ans?.question || {};
    const raw = q.points
        ?? q.marks
        ?? ans?.max_points
        ?? ans?.max_marks
        ?? ans?.points
        ?? ans?.points_possible
        ?? 0;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
}

function _resolveMcqAutoStatus(ans, studentAnswer) {
    const qType = _normQType(ans);
    if (qType !== 'mcq' && qType !== 'multiple_mcq') return 'pending';

    const val = studentAnswer !== undefined ? studentAnswer : _getStudentAnswer(ans);
    if (_isEmptyAnswer(val)) return 'skipped';

    if (ans?.is_correct === true || ans?.correct === true) return 'correct';
    if (ans?.is_correct === false || ans?.correct === false) return 'incorrect';

    const scored = _numOrNull(ans?.marks_obtained ?? ans?.score_obtained ?? ans?.score);
    if (scored == null) return 'pending';

    const maxPts = _getAnswerPoints(ans);
    if (maxPts > 0) return scored >= maxPts ? 'correct' : 'incorrect';
    return scored > 0 ? 'correct' : 'incorrect';
}

function _numOrNull(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
}

function _extractCorrectAnswerTokens(ans) {
    const q = ans?.question && typeof ans.question === 'object' ? ans.question : {};
    const direct = ans?.correct_answer
        ?? q.correct_answer
        ?? q.correct_answers
        ?? q.correct_option
        ?? q.correct_options;
    if (direct != null) {
        const normalized = _normalizeAnswerTokens(direct);
        if (normalized.length > 0) return normalized;
    }

    // Fallback for options with isCorrect flags.
    const opts = Array.isArray(q.options) ? q.options : [];
    const extracted = opts
        .filter(o => o && (o.isCorrect === true || o.is_correct === true))
        .map(o => o.id ?? o.value ?? o.text)
        .filter(v => v != null);
    return _normalizeAnswerTokens(extracted);
}

function _normalizeAnswerTokens(val) {
    const raw = Array.isArray(val) ? val : [val];
    const flat = [];

    raw.forEach(item => {
        if (item == null) return;
        if (Array.isArray(item)) {
            item.forEach(v => flat.push(v));
            return;
        }
        if (typeof item === 'object') {
            if (item.id != null) flat.push(item.id);
            else if (item.value != null) flat.push(item.value);
            else if (item.text != null) flat.push(item.text);
            else _extractTruthyKeys(item).forEach(k => flat.push(k));
            return;
        }
        flat.push(item);
    });

    const normalized = flat
        .map(v => String(v).trim().toLowerCase())
        .filter(v => v.length > 0);

    return Array.from(new Set(normalized)).sort();
}

// ══════════════════════════════════════════════════════════════════
//  ALERT
// ══════════════════════════════════════════════════════════════════

let _alertTimer;
function _showAlert(msg, type) {
    const wrap = document.getElementById('alertContainer'); if (!wrap) return;
    wrap.innerHTML = _alertHtml(msg, type);
    clearTimeout(_alertTimer);
    _alertTimer = setTimeout(() => { wrap.innerHTML = ''; }, 5000);
}
function _alertHtml(msg, type) {
    const icons = { error:'exclamation-circle', success:'check-circle', info:'info-circle' };
    return `<div class="alert alert-${type}"><i class="fas fa-${icons[type]||'info-circle'}"></i><span>${_esc(msg)}</span></div>`;
}

// ══════════════════════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════════════════════

function _avatar(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name||'?')}&background=6366f1&color=fff&size=80`;
}
function _setText(id, val)  { const e = document.getElementById(id); if (e) e.textContent = String(val ?? ''); }
function _setImg(id, src)   { const e = document.getElementById(id); if (e) e.src = src; }
function _clearEl(id)       { const e = document.getElementById(id); if (e) e.innerHTML = ''; }
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
    if (err.error)   return err.error;
    if (err.message) return err.message;
    const v = Object.values(err);
    if (!v.length) return 'Something went wrong.';
    return Array.isArray(v[0]) ? v[0][0] : String(v[0]);
}

function _esc(s) {
    return String(s ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _arraysEqual(a, b) {
    return Array.isArray(a) && Array.isArray(b) &&
        a.length === b.length &&
        a.every((val, index) => val === b[index]);
}
