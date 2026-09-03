/**
 * TestVerse — Staff: Exam Question Editor
 * URL params:  ?id=<examId>   required
 *              ?new=1         optional — shows welcome banner
 *
 * ✅ FIXED:
 *   - Backend field is "points" NOT "marks"  → _buildPayload sends points
 *   - Backend field is "type" NOT "question_type"
 *   - Supports: mcq | multiple_mcq | descriptive | coding
 */
'use strict';

// ── State ──────────────────────────────────────────────────────────
let _examId      = null;
let _exam        = null;
let _questions   = [];
let _filtered    = [];
let _typeFilter  = '';
let _drawerMode  = 'add';   // 'add' | 'edit'
let _editQId     = null;
let _deleteQId   = null;
let _saving      = false;

// ── Boot ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireStaff()) return;

    const params = new URLSearchParams(location.search);
    _examId = params.get('id');
    if (!_examId) { window.location.href = 'exams.html'; return; }

    _initSidebar();
    _initUser();
    _initDrawer();
    _initTypeTabs();
    _initDeleteModal();

    await _loadExam();
    await _loadQuestions();

    if (params.get('new') === '1') _showWelcome();
});

// ── User ───────────────────────────────────────────────────────────
function _initUser() {
    const user = Auth.getUser(); if (!user) return;
    const name = user.name || user.username || user.email?.split('@')[0] || 'Staff';
    const av   = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff`;
    _set('sidebarName', name); _set('topbarName', name);
    _img('sidebarAvatar', av); _img('topbarAvatar', av);
}

// ── Sidebar ────────────────────────────────────────────────────────
function _initSidebar() {
    const sb   = document.getElementById('sidebar');
    const ov   = document.getElementById('sidebarOverlay');
    const open = () => { sb?.classList.add('open');    ov?.classList.add('show'); };
    const close= () => { sb?.classList.remove('open'); ov?.classList.remove('show'); };
    document.getElementById('menuToggle')?.addEventListener('click', open);
    document.getElementById('sidebarClose')?.addEventListener('click', close);
    ov?.addEventListener('click', close);
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Logout from TestVerse?')) Auth.logout();
    });
}

// ── Load Exam ──────────────────────────────────────────────────────
async function _loadExam() {
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.STAFF_EXAM_DETAIL(_examId));
        const { data, error } = await Api.parse(res);
        if (error || !data) return;
        _exam = data;
        _renderExamBar(data);
    } catch { /* silent */ }
}

function _renderExamBar(exam) {
    const typeLabel = { mcq:'MCQ Only', mixed:'Mixed', descriptive:'Descriptive', coding:'Coding' };
    const now = new Date();
    let status = 'Draft';
    if (exam.is_published) {
        if      (now > new Date(exam.end_time))    status = 'Completed';
        else if (now >= new Date(exam.start_time)) status = 'Live';
        else                                       status = 'Published';
    }
    _set('esbTitle',    exam.title || '—');
    _set('esbType',     typeLabel[exam.exam_type] || exam.exam_type || '—');
    _set('esbDuration', `${exam.duration || 0} min`);
    _set('esbMarks',    `${exam.total_marks || 0} marks`);
    _set('esbStatus',   status);
    _set('breadcrumbExamTitle', exam.title || 'Questions');
    document.title = `${exam.title} — Questions | TestVerse`;
    const bar = document.getElementById('examSummaryBar');
    if (bar) bar.style.display = '';
}

// ── Load Questions ─────────────────────────────────────────────────
async function _loadQuestions() {
    _showLoading();
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.STAFF_QUESTIONS(_examId));
        const { data, error } = await Api.parse(res);
        if (error) {
            _showAlert('Failed to load questions.', 'error');
            _showEmpty(); return;
        }
        _questions = Array.isArray(data)
            ? data
            : (data?.results || data?.questions || []);

        _questions.sort((a, b) => (a.order || 0) - (b.order || 0));
        _applyFilter();
        _updateSummaryStats();
    } catch {
        _showAlert('Network error loading questions.', 'error');
        _showEmpty();
    }
}

function _applyFilter() {
    _filtered = _typeFilter
        ? _questions.filter(q => (q.type || q.question_type) === _typeFilter)
        : [..._questions];
    _renderQuestions();
}

// ── Render Questions ───────────────────────────────────────────────
function _renderQuestions() {
    const list = document.getElementById('questionsList');
    const tb   = document.getElementById('qToolbar');
    const addR = document.getElementById('addQRow');
    document.getElementById('loadingState').style.display = 'none';

    const badge = document.getElementById('qCountBadge');
    if (badge) badge.textContent = `${_filtered.length} question${_filtered.length !== 1 ? 's' : ''}`;

    if (_questions.length === 0) { _showEmpty(); return; }

    document.getElementById('emptyState').style.display = 'none';
    if (tb)   tb.style.display   = '';
    if (list) list.style.display = '';
    if (addR) addR.style.display = '';

    list.innerHTML = _filtered.map((q, i) => _buildQCard(q, i + 1)).join('');

    list.querySelectorAll('.q-action-btn.edit').forEach(btn =>
        btn.addEventListener('click', () => _openDrawerEdit(btn.dataset.id))
    );
    list.querySelectorAll('.q-action-btn.del').forEach(btn =>
        btn.addEventListener('click', () => _openDeleteModal(btn.dataset.id))
    );
}

function _buildQCard(q, num) {
    const typeLabel = {
        mcq: 'MCQ', multiple_mcq: 'Multi-MCQ',
        descriptive: 'Descriptive', coding: 'Coding',
        true_false: 'True/False', short_answer: 'Short Answer', long_answer: 'Long Answer'
    };
    const type = q.type || q.question_type || 'mcq';
    // ✅ backend returns "points" — fallback to "marks" for safety
    const pts  = q.points ?? q.marks ?? 0;
    let bodyHtml = '';

    if ((type === 'mcq' || type === 'multiple_mcq') && Array.isArray(q.options) && q.options.length) {
        bodyHtml = `<div class="q-card-options">` +
            q.options.map((opt, i) => {
                const letter    = String.fromCharCode(65 + i);
                const isCorrect = _isOptionMarkedCorrect(opt, i, q, type === 'multiple_mcq');
                return `<div class="q-option ${isCorrect ? 'correct' : ''}">
                    <div class="q-option-indicator">${isCorrect ? '<i class="fas fa-check"></i>' : letter}</div>
                    <span>${_esc(opt.text || opt.value || '')}</span>
                </div>`;
            }).join('') + `</div>`;
    }

    if (type === 'true_false') {
        const ans = String(q.correct_answer || '').toLowerCase();
        bodyHtml = `<div class="q-tf-answer ${ans}">
            <i class="fas fa-${ans === 'true' ? 'check' : 'times'}"></i>
            Correct answer: <strong>${ans === 'true' ? 'True' : 'False'}</strong>
        </div>`;
    }

    if ((type === 'short_answer' || type === 'long_answer') && q.model_answer) {
        bodyHtml = `<div class="q-model-answer">
            <strong>Model answer:</strong> ${_esc(q.model_answer)}
        </div>`;
    }

    if (type === 'descriptive' && q.expected_answer) {
        bodyHtml = `<div class="q-model-answer">
            <strong>Expected answer:</strong> ${_esc(q.expected_answer)}
        </div>`;
    }

    if (type === 'coding') {
        const tcCount = q.test_cases?.length ?? 0;
        const lang = _toSupportedCodingLanguage(q.coding_language || q.language || 'python');
        bodyHtml = `<div class="q-model-answer">
            <i class="fas fa-code" style="color:#b45309;margin-right:.35rem;"></i>
            <strong>${_esc(_langLabel(lang))}</strong>
            ${tcCount ? `&nbsp;·&nbsp; ${tcCount} test case${tcCount !== 1 ? 's' : ''}` : ''}
        </div>`;
    }

    if (q.explanation) {
        bodyHtml += `<div class="q-explanation">
            <i class="fas fa-lightbulb"></i>
            <span>${_esc(q.explanation)}</span>
        </div>`;
    }

    return `
    <div class="q-card" data-id="${q.id}">
        <div class="q-card-top">
            <div class="q-card-left">
                <div class="q-num">${num}</div>
                <div class="q-text-block">
                    <p class="q-text">${_esc(q.text || q.question_text || '')}</p>
                    <div class="q-badges">
                        <span class="q-type-badge ${type}">${typeLabel[type] || type}</span>
                        <span class="q-marks-badge">
                            <i class="fas fa-star"></i>
                            ${pts} pt${parseFloat(pts) !== 1 ? 's' : ''}
                        </span>
                    </div>
                </div>
            </div>
            <div class="q-card-actions">
                <button class="q-action-btn edit" data-id="${q.id}" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="q-action-btn del" data-id="${q.id}" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
        ${bodyHtml}
    </div>`;
}

// ── Summary Stats ──────────────────────────────────────────────────
function _updateSummaryStats() {
    // ✅ backend returns "points" — fallback to "marks"
    const totalPts = _questions.reduce((s, q) => s + (parseFloat(q.points ?? q.marks) || 0), 0);
    _set('esbQCount', _questions.length);
    // Keep both ids for backward compatibility (markup changed across versions).
    const totalText = totalPts % 1 === 0 ? totalPts : totalPts.toFixed(1);
    _set('esbTotalQ', totalText);
    _set('esbTotalMarks', totalText);
}

// ── Type Tabs ──────────────────────────────────────────────────────
function _initTypeTabs() {
    document.querySelectorAll('.q-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.q-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            _typeFilter = tab.dataset.type;
            _applyFilter();
        });
    });
}

// ── Welcome Banner ─────────────────────────────────────────────────
function _showWelcome() {
    const b = document.getElementById('welcomeBanner');
    if (b) b.style.display = '';
    document.getElementById('welcomeClose')?.addEventListener('click', () => {
        if (b) b.style.display = 'none';
    });
}

// ═══════════════════════════════════════════════════════════════════
//  QUESTION DRAWER
// ═══════════════════════════════════════════════════════════════════

function _initDrawer() {
    document.getElementById('addQuestionBtn')?.addEventListener('click',  () => _openDrawerAdd());
    document.getElementById('emptyAddBtn')?.addEventListener('click',     () => _openDrawerAdd());
    document.getElementById('addQRowBtn')?.addEventListener('click',      () => _openDrawerAdd());

    document.getElementById('drawerClose')?.addEventListener('click',      _closeDrawer);
    document.getElementById('drawerCancelBtn')?.addEventListener('click',  _closeDrawer);
    document.getElementById('drawerBackdrop')?.addEventListener('click',   _closeDrawer);

    document.getElementById('drawerSaveBtn')?.addEventListener('click',    () => _saveQuestion(false));
    document.getElementById('drawerSaveAddBtn')?.addEventListener('click', () => _saveQuestion(true));

    document.querySelectorAll('.type-btn').forEach(btn =>
        btn.addEventListener('click', () => _setQType(btn.dataset.value))
    );

    document.getElementById('addOptionBtn')?.addEventListener('click', _addOptionRow);
    document.getElementById('addTestCaseBtn')?.addEventListener('click', () => _addTcRow());

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') _closeDrawer();
    });

    _resetOptions();
}

function _openDrawerAdd() {
    _drawerMode = 'add';
    _editQId    = null;
    _resetDrawer();
    _set('drawerTitle',    'Add Question');
    _set('drawerSubtitle', `Exam: ${_exam?.title || ''}`);
    const icon = document.getElementById('drawerIcon');
    if (icon) icon.innerHTML = '<i class="fas fa-plus"></i>';
    // Ensure any previous loading states are cleared
    _setBtnLoading(document.getElementById('drawerSaveBtn'), false);
    _setBtnLoading(document.getElementById('drawerSaveAddBtn'), false);
    _openDrawer();
}

function _openDrawerEdit(qId) {
    const q = _questions.find(x => String(x.id) === String(qId));
    if (!q) return;
    _drawerMode = 'edit';
    _editQId    = qId;
    _resetDrawer();
    _set('drawerTitle',    'Edit Question');
    _set('drawerSubtitle', `Editing Q${_questions.indexOf(q) + 1}`);
    const icon = document.getElementById('drawerIcon');
    if (icon) icon.innerHTML = '<i class="fas fa-edit"></i>';
    _populateDrawer(q);
    // Ensure any previous loading states are cleared
    _setBtnLoading(document.getElementById('drawerSaveBtn'), false);
    _setBtnLoading(document.getElementById('drawerSaveAddBtn'), false);
    _openDrawer();
}

function _openDrawer() {
    document.getElementById('questionDrawer').classList.add('open');
    document.getElementById('drawerBackdrop').classList.add('show');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('qText')?.focus(), 300);
}

function _closeDrawer() {
    document.getElementById('questionDrawer').classList.remove('open');
    document.getElementById('drawerBackdrop').classList.remove('show');
    document.body.style.overflow = '';
    _saving = false;
    
    // Reset button loading states
    _setBtnLoading(document.getElementById('drawerSaveBtn'), false);
    _setBtnLoading(document.getElementById('drawerSaveAddBtn'), false);
}

// ── Reset Drawer ───────────────────────────────────────────────────
function _resetDrawer() {
    _clearEl('drawerAlert');
    _val('qText',        '');
    _val('qPoints',      '');   // ✅ FIX: was qMarks
    _val('qOrder',       '');
    _val('qExplanation', '');
    _val('modelAnswer',  '');
    _val('expectedAnswer', '');
    _val('codingLanguage', 'python');

    const tcList = document.getElementById('testCasesList');
    if (tcList) tcList.innerHTML = '';

    document.querySelectorAll('input[name="tfAnswer"]').forEach(r => r.checked = false);

    _setQType('mcq');
    _resetOptions();

    // ✅ FIX: error element id is qPointsErr
    ['qTextErr', 'qOptionsErr', 'qCorrectErr', 'qTfErr', 'qPointsErr'].forEach(_clearEl);
    
    // Reset button loading states
    _setBtnLoading(document.getElementById('drawerSaveBtn'), false);
    _setBtnLoading(document.getElementById('drawerSaveAddBtn'), false);
}

// ── Populate Drawer for Edit ───────────────────────────────────────
function _populateDrawer(q) {
    const type = q.type || q.question_type || 'mcq';
    _setQType(type);
    _val('qText',        q.text || q.question_text || '');
    // ✅ FIX: backend returns "points" — fallback to "marks"
    _val('qPoints',      q.points ?? q.marks ?? '');
    _val('qOrder',       q.order || '');
    _val('qExplanation', q.explanation || '');

    if (type === 'mcq' || type === 'multiple_mcq') {
        const isMulti = type === 'multiple_mcq';
        const opts = Array.isArray(q.options) ? q.options : [];
        document.getElementById('optionsList').innerHTML = '';

        opts.forEach(opt => _addOptionRow(opt.text || opt.value || ''));
        const cur = document.querySelectorAll('.option-row').length;
        for (let i = cur; i < 2; i++) _addOptionRow();

        _syncCorrectSelect(false);

        // Restore correct selections AFTER sync
        const sel = document.getElementById('correctOption');
        if (sel) {
            [...sel.options].forEach(o => { o.selected = false; });
            opts.forEach((opt, i) => {
                const isCorrect = _isOptionMarkedCorrect(opt, i, q, isMulti);
                if (isCorrect) {
                    const match = [...sel.options].find(x => x.value === String(i));
                    if (match) match.selected = true;
                }
            });
        }
    }

    if (type === 'true_false') {
        const ans = String(q.correct_answer || '').toLowerCase();
        const radio = document.querySelector(`input[name="tfAnswer"][value="${ans}"]`);
        if (radio) radio.checked = true;
    }

    if (type === 'short_answer' || type === 'long_answer') {
        _val('modelAnswer', q.model_answer || '');
    }

    if (type === 'descriptive') {
        _val('expectedAnswer', q.expected_answer || '');
    }

    if (type === 'coding') {
        _val('codingLanguage', _toSupportedCodingLanguage(q.coding_language || q.language || 'python'));
        (q.test_cases || []).forEach(tc => _addTcRow(tc));
    }
}

// ── Set Question Type ──────────────────────────────────────────────
function _setQType(type) {
    document.querySelectorAll('.type-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.value === type)
    );

    const isMcq = type === 'mcq' || type === 'multiple_mcq';
    const mcqSec  = document.getElementById('mcqSection');
    const tfSec   = document.getElementById('tfSection');
    const saSec   = document.getElementById('saSection');
    const descSec = document.getElementById('descriptiveSection');
    const codeSec = document.getElementById('codingSection');

    if (mcqSec)  mcqSec.style.display  = isMcq ? '' : 'none';
    if (tfSec)   tfSec.style.display   = type === 'true_false'   ? '' : 'none';
    if (saSec)   saSec.style.display   = (type === 'short_answer' || type === 'long_answer') ? '' : 'none';
    if (descSec) descSec.style.display = type === 'descriptive'  ? '' : 'none';
    if (codeSec) codeSec.style.display = type === 'coding'       ? '' : 'none';

    const sel       = document.getElementById('correctOption');
    const multiHint = document.getElementById('multiHint');
    const lbl       = document.getElementById('correctLabel');
    if (sel)       sel.multiple = (type === 'multiple_mcq');
    if (multiHint) multiHint.style.display = type === 'multiple_mcq' ? '' : 'none';
    if (lbl)       lbl.innerHTML = type === 'multiple_mcq'
        ? 'Correct Answers <span class="req">*</span> <span class="optional-tag">multi-select</span>'
        : 'Correct Answer <span class="req">*</span>';
}

function _currentType() {
    return document.querySelector('.type-btn.active')?.dataset.value || 'mcq';
}

// ── Options Builder ────────────────────────────────────────────────
function _resetOptions() {
    const list = document.getElementById('optionsList');
    if (!list) return;
    list.innerHTML = '';
    ['Option A', 'Option B', 'Option C', 'Option D'].forEach(ph => _addOptionRow('', ph));
    _syncCorrectSelect(false);
}

function _addOptionRow(value = '', placeholder = '') {
    const list = document.getElementById('optionsList');
    if (!list) return;
    const count  = list.querySelectorAll('.option-row').length;
    if (count >= 6) {
        _setEl('drawerAlert', _alertHtml('Maximum 6 options allowed.', 'info'));
        return;
    }
    const letter = String.fromCharCode(65 + count);
    const row    = document.createElement('div');
    row.className = 'option-row';
    row.innerHTML = `
        <div class="option-letter">${letter}</div>
        <input type="text" class="option-input"
            placeholder="${placeholder || 'Option ' + letter}"
            value="${_esc(value)}" maxlength="500">
        <button type="button" class="option-remove" title="Remove option">
            <i class="fas fa-times"></i>
        </button>`;

    row.querySelector('.option-remove').addEventListener('click', () => {
        if (list.querySelectorAll('.option-row').length <= 2) {
            _setEl('drawerAlert', _alertHtml('Minimum 2 options required.', 'info'));
            return;
        }
        row.remove();
        _relabelOptions();
        _syncCorrectSelect();
    });

    // ✅ Preserve selection across input events
    row.querySelector('.option-input').addEventListener('input', () => {
        const sel  = document.getElementById('correctOption');
        const prev = sel ? [...sel.selectedOptions].map(o => o.value) : [];
        _syncCorrectSelect();
        if (sel && prev.length) {
            prev.forEach(v => {
                const o = [...sel.options].find(x => x.value === v);
                if (o) o.selected = true;
            });
        }
    });

    list.appendChild(row);
    _syncCorrectSelect();
}

function _relabelOptions() {
    document.querySelectorAll('.option-row').forEach((row, i) => {
        row.querySelector('.option-letter').textContent = String.fromCharCode(65 + i);
    });
}

function _syncCorrectSelect(preserveSelection = true) {
    const sel = document.getElementById('correctOption');
    if (!sel) return;
    // Save selection before full rebuild
    const prevSelected = preserveSelection ? [...sel.selectedOptions].map(o => o.value) : [];
    const rows = [...document.querySelectorAll('.option-row')];
    sel.innerHTML = '<option value="">— select correct answer —</option>';
    rows.forEach((row, i) => {
        const txt    = row.querySelector('.option-input')?.value.trim() || '';
        const letter = String.fromCharCode(65 + i);
        const opt    = document.createElement('option');
        opt.value    = String(i);
        opt.textContent = `${letter}: ${txt || '(empty)'}`;
        // ✅ Restore selection after rebuild
        if (prevSelected.includes(String(i))) opt.selected = true;
        sel.appendChild(opt);
    });
    if (!preserveSelection) sel.value = '';
}

// ── Test Cases (Coding) ────────────────────────────────────────────
function _addTcRow(tc = {}) {
    const list = document.getElementById('testCasesList');
    if (!list) return;
    const n   = list.querySelectorAll('.test-case-row').length + 1;
    const row = document.createElement('div');
    row.className = 'test-case-row';
    row.innerHTML = `
        <div class="tc-header">
            <span class="tc-label">Test Case ${n}</span>
            <button type="button" class="option-remove" title="Remove">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="tc-fields">
            <div class="tc-field">
                <label>Input</label>
                <textarea class="tc-textarea tc-input"
                    placeholder="e.g. [1,2,3]">${_esc(tc.input || '')}</textarea>
            </div>
            <div class="tc-field">
                <label>Expected Output</label>
                <textarea class="tc-textarea tc-output"
                    placeholder="e.g. [3,2,1]">${_esc(tc.expected_output || '')}</textarea>
            </div>
        </div>`;
    row.querySelector('.option-remove').addEventListener('click', () => {
        row.remove(); _relabelTc();
    });
    list.appendChild(row);
}

function _relabelTc() {
    document.querySelectorAll('.tc-label').forEach((el, i) => {
        el.textContent = `Test Case ${i + 1}`;
    });
}

// ── Validate ───────────────────────────────────────────────────────
function _validateDrawer() {
    let ok = true;
    const type = _currentType();

    // Question text
    const text = document.getElementById('qText')?.value.trim();
    if (!text) { _setErr('qTextErr', 'Question text is required'); ok = false; }
    else _clearEl('qTextErr');

    // ✅ FIX: read qPoints, show qPointsErr, explicit empty-string check
    const ptsRaw = document.getElementById('qPoints')?.value ?? '';
    const pts    = parseFloat(ptsRaw);
    if (ptsRaw.trim() === '' || isNaN(pts) || pts <= 0) {
        _setErr('qPointsErr', 'Enter valid points (> 0)'); ok = false;
    } else _clearEl('qPointsErr');

    if (type === 'mcq' || type === 'multiple_mcq') {
        const rows   = document.querySelectorAll('.option-row');
        const filled = [...rows].filter(r => r.querySelector('.option-input').value.trim());
        if (filled.length < 2) { _setErr('qOptionsErr', 'At least 2 options required'); ok = false; }
        else _clearEl('qOptionsErr');

        // ✅ FIX: check selectedOptions array, not .value string
        const sel    = document.getElementById('correctOption');
        const chosen = sel ? [...sel.selectedOptions].filter(o => o.value !== '') : [];
        if (chosen.length === 0) { _setErr('qCorrectErr', 'Select the correct answer'); ok = false; }
        else _clearEl('qCorrectErr');
    }

    if (type === 'true_false') {
        const sel = document.querySelector('input[name="tfAnswer"]:checked');
        if (!sel) { _setErr('qTfErr', 'Select True or False'); ok = false; }
        else _clearEl('qTfErr');
    }

    return ok;
}

// ── Build Payload ──────────────────────────────────────────────────
function _buildPayload() {
    const type  = _currentType();
    const text  = document.getElementById('qText').value.trim();
    // ✅ KEY FIX: backend field is "points" NOT "marks"
    const points = parseFloat(document.getElementById('qPoints').value);
    const order  = parseInt(document.getElementById('qOrder').value) || undefined;
    const expl   = document.getElementById('qExplanation').value.trim();

    const payload = { type, text, points };
    if (order) payload.order       = order;
    if (expl)  payload.explanation = expl;

    if (type === 'mcq' || type === 'multiple_mcq') {
        const rows = document.querySelectorAll('.option-row');
        const sel  = document.getElementById('correctOption');
        const correctIdxs = [...(sel?.selectedOptions || [])]
            .map(o => parseInt(o.value))
            .filter(n => !isNaN(n));
        const optionRows = [...rows]
            .map((r, idx) => ({
                rowIdx: idx,
                text: r.querySelector('.option-input').value.trim(),
            }))
            .filter(o => o.text);

        payload.options = optionRows.map((o, idx) => ({
            id: String(idx + 1),
            text: o.text,
            isCorrect: correctIdxs.includes(o.rowIdx),
        }));

        if (type === 'multiple_mcq') {
            payload.correct_answers = payload.options
                .filter(o => o.isCorrect)
                .map(o => o.id);
        }
    }

    if (type === 'true_false') {
        payload.correct_answer = document.querySelector('input[name="tfAnswer"]:checked')?.value;
    }

    if (type === 'short_answer' || type === 'long_answer') {
        payload.model_answer = document.getElementById('modelAnswer')?.value.trim() || '';
    }

    if (type === 'descriptive') {
        payload.expected_answer = document.getElementById('expectedAnswer')?.value.trim() || '';
    }

    if (type === 'coding') {
        const selectedLang = document.getElementById('codingLanguage')?.value || 'python';
        const codingLang = _toSupportedCodingLanguage(selectedLang);
        payload.coding_language = codingLang;
        payload.language = codingLang; // legacy compatibility for older consumers
        payload.test_cases = [...document.querySelectorAll('.test-case-row')].map(r => ({
            input:           r.querySelector('.tc-input')?.value.trim()  || '',
            expected_output: r.querySelector('.tc-output')?.value.trim() || '',
        })).filter(tc => tc.input || tc.expected_output);
    }

    return payload;
}

// ── Save Question ──────────────────────────────────────────────────
async function _saveQuestion(addAnother) {
    if (_saving) return;
    if (!_validateDrawer()) return;

    _saving = true;
    const btn = addAnother
        ? document.getElementById('drawerSaveAddBtn')
        : document.getElementById('drawerSaveBtn');
    _setBtnLoading(btn, true);
    _clearEl('drawerAlert');

    const payload = _buildPayload();

    try {
        const res = _drawerMode === 'add'
            ? await Api.post(CONFIG.ENDPOINTS.STAFF_QUESTIONS(_examId), payload)
            : await Api.put(CONFIG.ENDPOINTS.STAFF_QUESTION_DETAIL(_examId, _editQId), payload);

        const { data, error } = await Api.parse(res);

        if (error) {
            _setEl('drawerAlert', _alertHtml(_extractErr(error), 'error'));
            _setBtnLoading(btn, false);
            _saving = false;
            return;
        }

        if (_drawerMode === 'add') {
            _questions.push(data);
        } else {
            const idx = _questions.findIndex(q => String(q.id) === String(_editQId));
            if (idx !== -1) _questions[idx] = data;
        }

        _questions.sort((a, b) => (a.order || 0) - (b.order || 0));
        _applyFilter();
        _updateSummaryStats();

        if (addAnother) {
            _setBtnLoading(btn, false);
            _saving = false;
            _resetDrawer();
            _set('drawerTitle',    'Add Question');
            _set('drawerSubtitle', `Question ${_questions.length + 1}`);
            _setEl('drawerAlert', _alertHtml('Question saved! Add another.', 'success'));
        } else {
            _closeDrawer();
            _showAlert(
                _drawerMode === 'add' ? 'Question added successfully!' : 'Question updated!',
                'success'
            );
        }

    } catch {
        _setEl('drawerAlert', _alertHtml('Network error. Please try again.', 'error'));
        _setBtnLoading(btn, false);
        _saving = false;
    }
}

// ── Delete ─────────────────────────────────────────────────────────
function _initDeleteModal() {
    document.getElementById('deleteModalClose')?.addEventListener('click', _closeDeleteModal);
    document.getElementById('deleteCancelBtn')?.addEventListener('click',  _closeDeleteModal);
    document.getElementById('deleteModal')?.addEventListener('click', e => {
        if (e.target.id === 'deleteModal') _closeDeleteModal();
    });
    document.getElementById('deleteConfirmBtn')?.addEventListener('click', _confirmDelete);
}

function _openDeleteModal(qId) {
    _deleteQId = qId;
    document.getElementById('deleteModal').classList.add('show');
}
function _closeDeleteModal() {
    document.getElementById('deleteModal').classList.remove('show');
    _deleteQId = null;
}

async function _confirmDelete() {
    if (!_deleteQId) return;
    const btn = document.getElementById('deleteConfirmBtn');
    _setBtnLoading(btn, true);
    try {
        const res = await Api.del(CONFIG.ENDPOINTS.STAFF_QUESTION_DETAIL(_examId, _deleteQId));
        if (res.ok || res.status === 204) {
            _questions = _questions.filter(q => String(q.id) !== String(_deleteQId));
            _applyFilter();
            _updateSummaryStats();
            _closeDeleteModal();
            _showAlert('Question deleted.', 'success');
        } else {
            const { error } = await Api.parse(res);
            _showAlert(_extractErr(error), 'error');
            _closeDeleteModal();
        }
    } catch {
        _showAlert('Network error.', 'error');
        _closeDeleteModal();
    } finally {
        _setBtnLoading(btn, false);
    }
}

// ── Show States ────────────────────────────────────────────────────
function _showLoading() {
    document.getElementById('loadingState').style.display   = '';
    document.getElementById('emptyState').style.display     = 'none';
    document.getElementById('questionsList').style.display  = 'none';
    document.getElementById('qToolbar').style.display       = 'none';
    document.getElementById('addQRow').style.display        = 'none';
}
function _showEmpty() {
    document.getElementById('loadingState').style.display   = 'none';
    document.getElementById('questionsList').style.display  = 'none';
    document.getElementById('qToolbar').style.display       = 'none';
    document.getElementById('addQRow').style.display        = 'none';
    document.getElementById('emptyState').style.display     = '';
}

// ── Alerts ─────────────────────────────────────────────────────────
function _showAlert(msg, type) {
    const wrap = document.getElementById('alertContainer'); if (!wrap) return;
    wrap.innerHTML = _alertHtml(msg, type);
    setTimeout(() => { if (wrap.innerHTML) wrap.innerHTML = ''; }, 4000);
}
function _alertHtml(msg, type) {
    const icon = type === 'error' ? 'exclamation-circle' : type === 'success' ? 'check-circle' : 'info-circle';
    return `<div class="alert alert-${type}"><i class="fas fa-${icon}"></i><span>${msg}</span></div>`;
}

// ── Helpers ────────────────────────────────────────────────────────
function _set(id, val)   { const el = document.getElementById(id); if (el) el.textContent = val; }
function _img(id, src)   { const el = document.getElementById(id); if (el) el.src = src; }
function _val(id, val)   { const el = document.getElementById(id); if (el) el.value = val; }
function _clearEl(id)    { const el = document.getElementById(id); if (el) el.textContent = ''; }
function _setEl(id, html){ const el = document.getElementById(id); if (el) el.innerHTML = html; }
function _setErr(id, m)  { const el = document.getElementById(id); if (el) el.textContent = m; }
function _setBtnLoading(btn, on) {
    if (!btn) return;
    btn.disabled = on;
    btn.querySelector('.btn-text')?.classList.toggle('hidden', on);
    const l = btn.querySelector('.btn-loader');
    if (l) { l.classList.toggle('hidden', !on); if (on) l.style.display = 'inline-flex'; }
}
function _extractErr(err) {
    if (!err) return 'Something went wrong';
    if (typeof err === 'string') return err;
    const v = Object.values(err);
    return v.length ? (Array.isArray(v[0]) ? v[0][0] : String(v[0])) : 'Something went wrong';
}
function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _optionStrictKeys(opt, idx) {
    const letter = String.fromCharCode(65 + idx);
    return new Set([
        opt?.id,
        opt?.value,
        idx,
        idx + 1,
        letter,
    ]
        .map(v => String(v ?? '').trim().toLowerCase())
        .filter(Boolean));
}

function _optionTextKey(opt) {
    const txt = String(opt?.text ?? '').trim().toLowerCase();
    return txt || null;
}

function _normalisedSet(value) {
    if (value == null) return new Set();
    const arr = Array.isArray(value) ? value : [value];
    return new Set(arr.map(v => String(v ?? '').trim().toLowerCase()).filter(Boolean));
}

function _hasAnyStrictOptionMatch(question, targetSet) {
    if (!targetSet || targetSet.size === 0) return false;
    const options = Array.isArray(question?.options) ? question.options : [];
    return options.some((option, optionIdx) => {
        const keys = _optionStrictKeys(option, optionIdx);
        for (const key of keys) {
            if (targetSet.has(key)) return true;
        }
        return false;
    });
}

function _isOptionMarkedCorrect(opt, idx, question, isMulti) {
    if (!opt) return false;
    if (opt.isCorrect === true || opt.is_correct === true) return true;

    const keys = _optionStrictKeys(opt, idx);
    const textKey = _optionTextKey(opt);
    const correctAnswers = _normalisedSet(question?.correct_answers);
    const correctOption = _normalisedSet(question?.correct_option);
    const correctAnswer = _normalisedSet(question?.correct_answer);

    if (isMulti && correctAnswers.size > 0) {
        for (const key of keys) {
            if (correctAnswers.has(key)) return true;
        }
        // Legacy fallback when old data stores text labels only.
        if (!_hasAnyStrictOptionMatch(question, correctAnswers) && textKey) {
            return correctAnswers.has(textKey);
        }
        return false;
    }
    if (!isMulti && correctOption.size > 0) {
        for (const key of keys) {
            if (correctOption.has(key)) return true;
        }
        if (!_hasAnyStrictOptionMatch(question, correctOption) && textKey) {
            return correctOption.has(textKey);
        }
        return false;
    }
    if (!isMulti && correctAnswer.size > 0) {
        for (const key of keys) {
            if (correctAnswer.has(key)) return true;
        }
        if (!_hasAnyStrictOptionMatch(question, correctAnswer) && textKey) {
            return correctAnswer.has(textKey);
        }
        return false;
    }
    return false;
}

function _toSupportedCodingLanguage(lang) {
    const val = String(lang || '').toLowerCase();
    const allowed = new Set(['python', 'java', 'javascript', 'cpp']);
    if (allowed.has(val)) return val;
    if (val === 'c') return 'cpp';
    return 'python';
}

function _langLabel(lang) {
    const map = {
        python: 'Python',
        java: 'Java',
        javascript: 'JavaScript',
        cpp: 'C++',
    };
    const val = String(lang || '').toLowerCase();
    return map[val] || (val ? val : 'Python');
}
