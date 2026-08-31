/**
 * TestVerse — Exam Taking Page
 * FIX: normalise q.type → q.question_type on load so all rendering
 *      branches work regardless of which field the backend returns.
 *      Also map examedit type values → exam-taking type values:
 *        mcq           → mcq
 *        multiple_mcq  → multiple_choice
 *        descriptive   → descriptive
 *        coding        → coding
 *        true_false    → true_false
 *        short_answer  → short_answer
 *        long_answer   → long_answer
 */

'use strict';

// ══════════════════════════════════════════════════════════════════
//  CONFIG / CONSTANTS
// ══════════════════════════════════════════════════════════════════
const AUTOSAVE_INTERVAL_MS = 30_000;
const LIVE_SAVE_DEBOUNCE_MS = 1200;
const LS_KEY = (examId) => `tv_exam_draft_${examId}`;

// FIX: canonical type map — examedit.js values → exam-taking render values
const TYPE_NORMALISE = {
    mcq:           'mcq',
    single_choice: 'mcq',
    multiple_mcq:  'multiple_choice',
    multiple_choice: 'multiple_choice',
    true_false:    'true_false',
    short_answer:  'short_answer',
    long_answer:   'long_answer',
    descriptive:   'descriptive',
    coding:        'coding',
};

// FIX: display labels for type badge
const TYPE_LABELS = {
    mcq:             'MCQ',
    multiple_choice: 'Multi-Select',
    true_false:      'True / False',
    short_answer:    'Short Answer',
    long_answer:     'Long Answer',
    descriptive:     'Descriptive',
    coding:          'Coding',
};

// ══════════════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════════════
let _examId       = null;
let _attemptId    = null;
let _exam         = null;
let _questions    = [];
let _answers      = {};
let _flagged      = new Set();
let _currentIdx   = 0;
let _timeLeft     = 0;
let _timerInterval    = null;
let _autosaveInterval = null;
let _liveSaveTimer    = null;
let _isSubmitting     = false;
let _isSaving         = false;
let _isOffline        = false;
let _monacoInstances  = {};
let _monacoFsInstance = null;
let _warnToasts       = new Set();
let _sections         = [];
let _activeSection    = null;

const WARN_THRESHOLDS = [
    { sec: 300, msg: '5 minutes remaining!', cls: '' },
    { sec: 60,  msg: '1 minute remaining!',  cls: 'urgent' },
];

// ══════════════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireAuth()) return;

    const params  = new URLSearchParams(location.search);
    _examId    = params.get('exam_id');
    _attemptId = params.get('attempt_id');

    if (!_examId) {
        _fatalError('Missing exam ID', 'No exam was specified. Please go back and try again.');
        return;
    }

    _initOfflineDetection();
    _initKeyboardShortcuts();
    _wireMiscControls();

    await _loadExam();
});

// ══════════════════════════════════════════════════════════════════
//  LOAD EXAM
// ══════════════════════════════════════════════════════════════════
async function _loadExam() {
    try {
        const examRes = await Api.get(CONFIG.ENDPOINTS.EXAM_DETAIL(_examId));
        const { data: examData, error: examErr } = await Api.parse(examRes);
        if (examErr || !examData) {
            _fatalError('Exam Not Found', 'This exam could not be loaded. It may have ended or does not exist.');
            return;
        }
        _exam = examData;

        const attemptRes = _attemptId
            ? await Api.get(CONFIG.ENDPOINTS.EXAM_ATTEMPT(_examId))
            : await Api.post(CONFIG.ENDPOINTS.EXAM_ATTEMPT(_examId), {});
        const { data: attemptData, error: attemptErr } = await Api.parse(attemptRes);
        if (attemptErr || !attemptData) {
            const msg = typeof attemptErr === 'string'
                ? attemptErr
                : (attemptErr?.detail || attemptErr?.error || 'Could not start this exam.');
            _fatalError('Cannot Start Exam', msg);
            return;
        }

        _attemptId = attemptData.attempt_id || attemptData.id || _attemptId;
        _questions = attemptData.questions || attemptData.question_set || [];
        _timeLeft  = attemptData.time_remaining_seconds
            ?? attemptData.duration_seconds
            ?? (_exam.duration ? _exam.duration * 60 : null)
            ?? 3600;

        if (!_questions.length) {
            _fatalError('No Questions', 'This exam has no questions assigned yet.');
            return;
        }

        // ── FIX: normalise every question ──────────────────────────
        _questions = _questions.map(q => {
            const rawType = (q.type || q.question_type || 'mcq').toLowerCase();
            const normType = TYPE_NORMALISE[rawType] || rawType;
            return {
                ...q,
                id:            String(q.id),
                // always expose as question_type for the rest of the page
                question_type: normType,
                // preserve raw for debugging
                _raw_type:     rawType,
                // FIX: backend uses "points" not "marks"
                marks:         q.points ?? q.marks ?? 0,
                // normalise option text field
                options: (q.options || []).map(opt =>
                    typeof opt === 'string'
                        ? { text: opt, value: opt, id: opt }
                        : { ...opt, text: opt.text || opt.label || opt.value || '' }
                ),
            };
        });
        // ──────────────────────────────────────────────────────────

        _answers = {};
        (attemptData.saved_answers || attemptData.answers || []).forEach(a => {
            _answers[String(a.question_id || a.question)] = a.answer ?? a.response ?? a.selected_option;
        });
        _restoreFromLocal();

        const secSet = new Set();
        _questions.forEach(q => { if (q.section) secSet.add(q.section); });
        _sections = [...secSet];

        _setText('examTitle', _exam.title || 'Exam');
        _setText('examType',  _exam.exam_type ? _exam.exam_type.toUpperCase() : '');
        document.title = `${_exam.title || 'Exam'} | TestVerse`;

        _buildQNavGrid();
        _buildSectionBtns();
        _renderQuestion(0);
        _updateProgress();
        _startTimer();
        _startAutosave();
        _setSaveStatus('local', 'Draft loaded');

        document.getElementById('examShell').classList.remove('hidden');
        document.getElementById('qaLoading').style.display = 'none';

    } catch (err) {
        console.error('[exam-taking] loadExam:', err);
        _fatalError('Connection Error', 'Failed to connect to the server. Please check your network and try again.');
    }
}

// ══════════════════════════════════════════════════════════════════
//  TIMER
// ══════════════════════════════════════════════════════════════════
function _startTimer() {
    _renderTimer();
    _timerInterval = setInterval(() => {
        _timeLeft--;
        _renderTimer();
        _checkWarnings();
        if (_timeLeft <= 0) {
            _timeLeft = 0;
            clearInterval(_timerInterval);
            _autoSubmit();
        }
    }, 1000);
}

function _renderTimer() {
    const h = Math.floor(_timeLeft / 3600);
    const m = Math.floor((_timeLeft % 3600) / 60);
    const s = _timeLeft % 60;
    const p = n => String(n).padStart(2, '0');
    const el = document.getElementById('timerDisplay');
    const wr = document.getElementById('timerWrap');
    if (!el) return;
    el.textContent = h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
    wr.classList.toggle('warn',   _timeLeft <= 300 && _timeLeft > 60);
    wr.classList.toggle('danger', _timeLeft <= 60);
}

function _checkWarnings() {
    WARN_THRESHOLDS.forEach(t => {
        if (_timeLeft === t.sec && !_warnToasts.has(t.sec)) {
            _warnToasts.add(t.sec);
            _showTimeToast(t.msg, t.cls);
        }
    });
}

function _showTimeToast(msg, cls) {
    const toast = document.getElementById('timeToast');
    const msgEl = document.getElementById('timeToastMsg');
    toast.className = `time-toast${cls ? ' ' + cls : ''}`;
    msgEl.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 8000);
}

// ══════════════════════════════════════════════════════════════════
//  QUESTION RENDERING
// ══════════════════════════════════════════════════════════════════
function _renderQuestion(idx) {
    _currentIdx = Math.max(0, Math.min(idx, _questions.length - 1));
    const q = _questions[_currentIdx];
    if (!q) return;

    const card = document.getElementById('questionCard');
    card.classList.remove('hidden');

    _setText('qcNum',     `Q${_currentIdx + 1}`);
    _setText('qcSection', q.section || '');
    // FIX: backend field is "points" — already normalised to q.marks in _loadExam
    _setText('qcMarks',   q.marks != null ? `${q.marks} mark${q.marks !== 1 ? 's' : ''}` : '');

    // FIX: use q.question_type (already normalised)
    const qType = (q.question_type || 'mcq').toLowerCase();
    _setText('qcTypeBadge', TYPE_LABELS[qType] || qType || 'Question');

    const fb = document.getElementById('flagBtn');
    if (_flagged.has(q.id)) {
        fb.classList.add('flagged');
        _setText('flagBtnText', 'Flagged');
    } else {
        fb.classList.remove('flagged');
        _setText('flagBtnText', 'Flag');
    }

    const qText = document.getElementById('qText');
    qText.innerHTML = _formatQText(q.text || q.question_text || q.body || '');

    const imgWrap = document.getElementById('qImageWrap');
    if (q.image || q.image_url) {
        document.getElementById('qImage').src = q.image || q.image_url;
        imgWrap.classList.remove('hidden');
    } else {
        imgWrap.classList.add('hidden');
    }

    ['answerMcq','answerTf','answerText','answerCode'].forEach(id =>
        document.getElementById(id).style.display = 'none'
    );

    // FIX: use normalised qType — all branches now correctly reached
    if (qType === 'mcq' || qType === 'multiple_choice') {
        _renderMcq(q);
    } else if (qType === 'true_false') {
        _renderTrueFalse(q);
    } else if (qType === 'coding') {
        _renderCoding(q);
    } else {
        // descriptive | short_answer | long_answer
        _renderTextAnswer(q);
    }

    document.getElementById('prevQBtn').disabled = _currentIdx === 0;
    const nextBtn = document.getElementById('nextQBtn');
    if (_currentIdx === _questions.length - 1) {
        nextBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Review & Submit';
        nextBtn.classList.remove('btn-primary');
        nextBtn.classList.add('btn-submit');
    } else {
        nextBtn.innerHTML = 'Next <i class="fas fa-arrow-right"></i>';
        nextBtn.classList.remove('btn-submit');
        nextBtn.classList.add('btn-primary');
    }

    _updateQNavGrid();
    _scrollNavToQuestion(_currentIdx);
}

// ── MCQ ────────────────────────────────────────────────────────────
function _renderMcq(q) {
    const wrap = document.getElementById('answerMcq');
    const cont = document.getElementById('mcqOptions');
    wrap.style.display = 'block';

    const isMulti = q.question_type === 'multiple_choice';
    const saved   = _answers[q.id];
    const selArr  = isMulti
        ? _normalizeSelectionArray(saved)
        : (saved != null ? [String(saved)] : []);

    const keys = ['A','B','C','D','E','F'];
    const opts = q.options || q.choices || [];

    cont.innerHTML = '';

    if (isMulti) {
        const hint = document.createElement('div');
        hint.className = 'multi-hint';
        hint.innerHTML = `<i class="fas fa-info-circle"></i> Select all that apply`;
        cont.appendChild(hint);
    }

    opts.forEach((opt, i) => {
        const key  = keys[i] || String(i + 1);
        const text = typeof opt === 'object' ? (opt.text || opt.label || opt.value || '') : String(opt);
        // Always use a stable identifier (id/value/text), never the index
        const val  = typeof opt === 'object'
            ? String(opt.id ?? opt.value ?? text)
            : String(opt);
        const sel  = selArr.includes(val);

        const div  = document.createElement('div');
        div.className = `mcq-option${sel ? ' selected' : ''}`;
        div.dataset.val = val;
        div.innerHTML = `
            <span class="mcq-bullet${sel ? ' checked' : ''}"></span>
            <span class="mcq-label-key">${key}</span>
            <span class="mcq-label-text">${_esc(String(text))}</span>`;

        div.addEventListener('click', () => _selectMcqOption(q, div, val, isMulti));
        cont.appendChild(div);
    });
}

function _selectMcqOption(q, div, val, isMulti) {
    const cont = document.getElementById('mcqOptions');
    if (isMulti) {
        const saved  = _answers[q.id];
        let selArr   = _normalizeSelectionArray(saved);
        const idx    = selArr.indexOf(val);
        if (idx === -1) selArr.push(val); else selArr.splice(idx, 1);
        _answers[q.id] = selArr.length ? selArr : undefined;
        cont.querySelectorAll('.mcq-option').forEach(el => {
            const isNowSel = selArr.includes(el.dataset.val);
            el.classList.toggle('selected', isNowSel);
            el.querySelector('.mcq-bullet').classList.toggle('checked', isNowSel);
        });
    } else {
        _answers[q.id] = val;
        cont.querySelectorAll('.mcq-option').forEach(el => {
            const isSel = el.dataset.val === val;
            el.classList.toggle('selected', isSel);
            el.querySelector('.mcq-bullet').classList.toggle('checked', isSel);
        });
    }
    _saveLocal();
    _updateProgress();
    _updateQNavGrid();
    _queueLiveSave();
}

function _normalizeSelectionArray(raw) {
    if (Array.isArray(raw)) {
        return Array.from(new Set(raw.map(v => String(v)).filter(v => v !== '')));
    }
    if (raw && typeof raw === 'object') {
        const nested = raw.selected_options ?? raw.selected ?? raw.options ?? raw.answers;
        if (Array.isArray(nested)) {
            return Array.from(new Set(
                nested.map(v => String(v)).filter(v => v !== '')
            ));
        }

        const truthyKeys = Object.keys(raw).filter(k => {
            const v = raw[k];
            return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
        });
        if (truthyKeys.length) {
            return Array.from(new Set(truthyKeys.map(v => String(v)).filter(v => v !== '')));
        }

        const scalar = raw.id ?? raw.value ?? raw.text ?? raw.answer ?? raw.option ?? raw.option_id ?? null;
        if (scalar != null && String(scalar).trim() !== '') return [String(scalar)];
        return [];
    }
    if (raw == null) return [];

    const txt = String(raw).trim();
    if (!txt) return [];
    if (txt.includes(',')) {
        return Array.from(new Set(
            txt.split(',').map(v => v.trim()).filter(Boolean)
        ));
    }
    return [txt];
}

// ── True / False ───────────────────────────────────────────────────
function _renderTrueFalse(q) {
    const wrap  = document.getElementById('answerTf');
    wrap.style.display = 'block';
    const saved = _answers[q.id];
    ['tfTrue','tfFalse'].forEach(id => {
        const btn = document.getElementById(id);
        const val = btn.dataset.val;
        btn.classList.toggle('active', String(saved) === val);
        btn.onclick = () => {
            _answers[q.id] = val;
            document.getElementById('tfTrue').classList.toggle('active',  val === 'true');
            document.getElementById('tfFalse').classList.toggle('active', val === 'false');
            _saveLocal(); _updateProgress(); _updateQNavGrid();
            _queueLiveSave();
        };
    });
}

// ── Short / Descriptive / Long ─────────────────────────────────────
function _renderTextAnswer(q) {
    const wrap  = document.getElementById('answerText');
    const ta    = document.getElementById('textAnswer');
    wrap.style.display = 'block';
    const maxLen = q.max_length || q.word_limit || null;
    ta.maxLength  = maxLen || 999999;

    const qType = q.question_type || '';
    if (qType === 'descriptive' || qType === 'long_answer') {
        ta.placeholder = 'Write your detailed answer here…';
    } else {
        ta.placeholder = 'Type your short answer here…';
    }

    ta.value = _answers[q.id] || '';
    _updateCharCount(ta.value, maxLen);

    ta.oninput = () => {
        _answers[q.id] = ta.value || undefined;
        _updateCharCount(ta.value, maxLen);
        _saveLocal(); _updateProgress(); _updateQNavGrid();
        _queueLiveSave();
    };
}

function _updateCharCount(val, max) {
    _setText('charCount', max ? `${val.length} / ${max}` : `${val.length} chars`);
}

// ── Coding ─────────────────────────────────────────────────────────
function _renderCoding(q) {
    const wrap = document.getElementById('answerCode');
    wrap.style.display = 'block';

    const langSel = document.getElementById('codeLangSelect');
    const langs   = _codingLanguagesForQuestion(q);
    langSel.innerHTML = langs.map(l => `<option value="${l}">${_langLabel(l)}</option>`).join('');

    const savedAns  = _answers[q.id] || {};
    const savedLang = _normalizeCodingLanguage(savedAns.language || q.coding_language || q.language || langs[0]);
    const savedCode = savedAns.code || q.starter_code || q.boilerplate || '';
    langSel.value = langs.includes(savedLang) ? savedLang : langs[0];

    if (_monacoInstances[q.id]) {
        try { _monacoInstances[q.id].dispose(); } catch {}
        delete _monacoInstances[q.id];
    }

    document.getElementById('resetCodeBtn').onclick = () => {
        const editor = _monacoInstances[q.id];
        if (editor) editor.setValue(q.starter_code || q.boilerplate || '');
    };

    document.getElementById('fullscreenCodeBtn').onclick = () => _openFsEditor(q);

    _initMonaco('monacoEditor', q.id, savedCode, savedLang, (newCode) => {
        const cur = _answers[q.id] || {};
        _answers[q.id] = { ...cur, code: newCode, language: langSel.value };
        _saveLocal(); _updateProgress(); _updateQNavGrid();
        _queueLiveSave();
        _showCodeSaved();
    });

    langSel.onchange = () => {
        const editor = _monacoInstances[q.id];
        const lang   = langSel.value;
        if (editor) {
            const model = editor.getModel();
            if (model) window.monaco.editor.setModelLanguage(model, _monacoLang(lang));
        }
        const cur = _answers[q.id] || {};
        _answers[q.id] = { ...cur, language: lang };
        _saveLocal();
        _queueLiveSave();
    };
}

function _showCodeSaved() {
    const el = document.getElementById('codeSavedIndicator');
    if (!el) return;
    el.textContent = '✓ Saved';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.textContent = ''; }, 2500);
}

function _initMonaco(containerId, qId, code, lang, onChange) {
    require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
    require(['vs/editor/editor.main'], () => {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        const editor = window.monaco.editor.create(container, {
            value:          code,
            language:       _monacoLang(lang),
            theme:          'vs-dark',
            fontSize:       13,
            fontFamily:     "'Fira Code', 'Monaco', 'Consolas', monospace",
            fontLigatures:  true,
            minimap:        { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers:    'on',
            renderLineHighlight: 'line',
            automaticLayout: true,
            padding:        { top: 12, bottom: 12 },
            wordWrap:       'on',
            tabSize:        4,
            insertSpaces:   true,
            fixedOverflowWidgets: true,
        });

        editor.addCommand(
            window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyS,
            () => { _saveToServer(); }
        );

        editor.onDidChangeModelContent(() => {
            if (onChange) onChange(editor.getValue());
        });

        _monacoInstances[qId] = editor;
    });
}

// ── Fullscreen Monaco ──────────────────────────────────────────────
function _openFsEditor(q) {
    const overlay = document.getElementById('fsCodeOverlay');
    overlay.classList.remove('hidden');
    _setText('fsCodeTitle', q.title || q.text?.slice(0, 40) || 'Code Editor');

    const savedAns  = _answers[q.id] || {};
    const langs     = _codingLanguagesForQuestion(q);
    const savedLang = _normalizeCodingLanguage(savedAns.language || q.coding_language || q.language || langs[0]);
    const savedCode = savedAns.code || q.starter_code || '';

    const fsLang = document.getElementById('fsLangSelect');
    fsLang.innerHTML = langs.map(l => `<option value="${l}">${_langLabel(l)}</option>`).join('');
    fsLang.value = langs.includes(savedLang) ? savedLang : langs[0];

    if (_monacoFsInstance) {
        try { _monacoFsInstance.dispose(); } catch {}
        _monacoFsInstance = null;
    }

    require(['vs/editor/editor.main'], () => {
        const container = document.getElementById('fsMonacoEditor');
        container.innerHTML = '';
        _monacoFsInstance = window.monaco.editor.create(container, {
            value:          savedCode,
            language:       _monacoLang(savedLang),
            theme:          'vs-dark',
            fontSize:       14,
            fontFamily:     "'Fira Code', 'Monaco', 'Consolas', monospace",
            fontLigatures:  true,
            minimap:        { enabled: true },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            lineNumbers:    'on',
            padding:        { top: 12, bottom: 12 },
            tabSize:        4,
        });

        _monacoFsInstance.addCommand(
            window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyS,
            () => { _syncFsToMain(q); _saveToServer(); }
        );
        _monacoFsInstance.onDidChangeModelContent(() => _syncFsToMain(q));

        fsLang.onchange = () => {
            const lang = fsLang.value;
            const model = _monacoFsInstance?.getModel();
            if (model) window.monaco.editor.setModelLanguage(model, _monacoLang(lang));
            const mainEditor = _monacoInstances[q.id];
            if (mainEditor) {
                const mainModel = mainEditor.getModel();
                if (mainModel) window.monaco.editor.setModelLanguage(mainModel, _monacoLang(lang));
            }
            const cur = _answers[q.id] || {};
            _answers[q.id] = { ...cur, language: lang };
            _saveLocal();
            _queueLiveSave();
        };
    });

    document.getElementById('fsResetBtn').onclick = () => {
        if (_monacoFsInstance) _monacoFsInstance.setValue(q.starter_code || q.boilerplate || '');
    };
    document.getElementById('fsCloseBtn').onclick = () => {
        _syncFsToMain(q);
        overlay.classList.add('hidden');
    };
}

function _syncFsToMain(q) {
    if (!_monacoFsInstance) return;
    const code  = _monacoFsInstance.getValue();
    const lang  = document.getElementById('fsLangSelect').value;
    _answers[q.id] = { code, language: lang };
    _saveLocal(); _updateProgress(); _updateQNavGrid();
    _queueLiveSave();
    const mainEd = _monacoInstances[q.id];
    if (mainEd && mainEd.getValue() !== code) {
        const pos = mainEd.getPosition();
        mainEd.setValue(code);
        if (pos) mainEd.setPosition(pos);
    }
    const sel = document.getElementById('codeLangSelect');
    if (sel) sel.value = lang;
}

// ══════════════════════════════════════════════════════════════════
//  QUESTION NAVIGATOR
// ══════════════════════════════════════════════════════════════════
function _buildQNavGrid() {
    const grid = document.getElementById('qnavGrid');
    grid.innerHTML = '';
    _questions.forEach((q, i) => {
        const btn   = document.createElement('button');
        btn.className = 'qn-btn';
        btn.id        = `qnb_${i}`;
        btn.textContent = String(i + 1);
        btn.title       = q.section ? `Q${i+1} – ${q.section}` : `Question ${i+1}`;
        btn.addEventListener('click', () => _renderQuestion(i));
        grid.appendChild(btn);
    });
}

function _updateQNavGrid() {
    _questions.forEach((q, i) => {
        const btn = document.getElementById(`qnb_${i}`);
        if (!btn) return;
        const answered  = _isAnswered(q);
        const flagged   = _flagged.has(q.id);
        const current   = i === _currentIdx;
        btn.className   = 'qn-btn';
        if (current)                  btn.classList.add('qn-current');
        else if (flagged && answered) btn.classList.add('qn-flagged', 'qn-answered');
        else if (flagged)             btn.classList.add('qn-flagged');
        else if (answered)            btn.classList.add('qn-answered');
    });
}

function _scrollNavToQuestion(idx) {
    const btn = document.getElementById(`qnb_${idx}`);
    btn?.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function _buildSectionBtns() {
    const wrap = document.getElementById('qnavSections');
    wrap.innerHTML = '';
    if (_sections.length < 2) return;
    const allBtn = document.createElement('button');
    allBtn.className = 'qnav-section-btn active';
    allBtn.textContent = 'All Questions';
    allBtn.onclick = () => {
        _activeSection = null;
        wrap.querySelectorAll('.qnav-section-btn').forEach(b => b.classList.remove('active'));
        allBtn.classList.add('active');
        _buildQNavGrid();
    };
    wrap.appendChild(allBtn);
    _sections.forEach(sec => {
        const btn = document.createElement('button');
        btn.className  = 'qnav-section-btn';
        btn.textContent = sec;
        btn.onclick = () => {
            _activeSection = sec;
            wrap.querySelectorAll('.qnav-section-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const first = _questions.findIndex(q => q.section === sec);
            if (first !== -1) _renderQuestion(first);
        };
        wrap.appendChild(btn);
    });
}

// ══════════════════════════════════════════════════════════════════
//  PROGRESS
// ══════════════════════════════════════════════════════════════════
function _updateProgress() {
    const total    = _questions.length;
    const answered = _questions.filter(q => _isAnswered(q)).length;
    const pct      = total ? Math.round(answered / total * 100) : 0;

    _setText('progAnswered', `${answered} answered`);
    _setText('progTotal',    `${total} total`);
    document.getElementById('progFill').style.width = `${pct}%`;

    _setText('cntAnswered',   answered);
    _setText('cntUnanswered', total - answered);
    _setText('cntFlagged',    _flagged.size);
}

function _isAnswered(q) {
    const a = _answers[q.id];
    if (a == null || a === undefined) return false;
    if (Array.isArray(a))  return a.length > 0;
    if (typeof a === 'object') return !!(a.code && a.code.trim());
    return String(a).trim() !== '';
}

// ══════════════════════════════════════════════════════════════════
//  SAVE (LOCAL + SERVER)
// ══════════════════════════════════════════════════════════════════
function _saveLocal() {
    try {
        localStorage.setItem(LS_KEY(_examId), JSON.stringify({
            answers:   _answers,
            flagged:   [..._flagged],
            savedAt:   Date.now(),
            attemptId: _attemptId,
        }));
    } catch (e) {
        console.warn('[exam-taking] localStorage save failed:', e);
    }
}

function _restoreFromLocal() {
    try {
        const raw = localStorage.getItem(LS_KEY(_examId));
        if (!raw) return;
        const obj = JSON.parse(raw);
        if (!obj || typeof obj !== 'object') return;
        if (obj.answers) Object.assign(_answers, obj.answers);
        if (Array.isArray(obj.flagged)) _flagged = new Set(obj.flagged);
    } catch (e) {
        console.warn('[exam-taking] localStorage restore failed:', e);
    }
}

async function _saveToServer(silent = true) {
    if (!_examId || !_attemptId || _isSubmitting || _isSaving) return;
    _isSaving = true;
    _setSaveStatus('saving', 'Saving…');
    try {
        // For intermediate saves, we don't want to mark as final submission
        const payload = _buildSubmitPayload(false); // Always false for intermediate saves
        const res = await Api.post(CONFIG.ENDPOINTS.EXAM_SAVE(_examId), payload);
        const { error } = await Api.parse(res);
        if (error) {
            _setSaveStatus('failed', 'Save failed');
            if (_isOffline) _saveLocal();
        } else {
            _setSaveStatus('saved', 'Saved');
            if (!silent) _showSaveToast('Answers saved!');
            try { localStorage.removeItem(LS_KEY(_examId)); } catch {}
        }
    } catch {
        _setSaveStatus(_isOffline ? 'local' : 'failed', _isOffline ? 'Saved locally' : 'Save failed');
        _saveLocal();
    } finally {
        _isSaving = false;
    }
}

function _queueLiveSave() {
    if (_isOffline || !_examId || !_attemptId || _isSubmitting) return;
    clearTimeout(_liveSaveTimer);
    _liveSaveTimer = setTimeout(() => {
        _liveSaveTimer = null;
        _saveToServer(true);
    }, LIVE_SAVE_DEBOUNCE_MS);
}

function _startAutosave() {
    _autosaveInterval = setInterval(() => {
        _saveToServer(true);
    }, AUTOSAVE_INTERVAL_MS);
}

function _setSaveStatus(state, text) {
    const wrap = document.getElementById('saveStatus');
    if (!wrap) return;
    wrap.className = `et-save-status ${state}`;
    _setText('saveStatusText', text);
}

function _showSaveToast(msg) {
    const toast = document.getElementById('saveToast');
    _setText('saveToastMsg', msg);
    toast.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.add('hidden'), 2200);
}

// ══════════════════════════════════════════════════════════════════
//  SUBMIT
// ══════════════════════════════════════════════════════════════════
function _openConfirmModal() {
    _updateProgress();
    document.getElementById('confirmModal').classList.add('open');
}

async function _doSubmit() {
    if (_isSubmitting) return;
    _isSubmitting = true;
    clearTimeout(_liveSaveTimer);
    clearInterval(_timerInterval);
    clearInterval(_autosaveInterval);
    document.getElementById('confirmModal').classList.remove('open');

    const overlay = document.getElementById('submitOverlay');
    overlay.classList.remove('hidden');
    _setText('submitMsg', 'Submitting your exam…');
    const retryBtn = document.getElementById('submitRetryBtn');
    if (retryBtn) retryBtn.disabled = true;

    try {
        const payload = _buildSubmitPayload(true);
        const res     = await Api.post(CONFIG.ENDPOINTS.EXAM_SUBMIT(_examId), payload);
        const { data, error } = await Api.parse(res);

        if (error) {
            _isSubmitting = false;
            const msg = typeof error === 'string'
                ? error
                : (error?.detail || error?.error || 'We could not submit your exam. Please try again.');
            _showSubmitErrorOverlay('Submission failed: ' + msg);
            return;
        }

        try { localStorage.removeItem(LS_KEY(_examId)); } catch {}

        _setText('submitMsg', 'Submitted! Redirecting to dashboard...');
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1500);

    } catch (err) {
        console.error('[exam-taking] submit error:', err);
        _isSubmitting = false;
        _saveLocal();
        _showSubmitErrorOverlay(
            'Network error while submitting. Your answers are saved locally. Please check your connection and tap "Retry Submit".'
        );
    }
}

function _showSubmitErrorOverlay(message) {
    const overlay = document.getElementById('submitOverlay');
    if (!overlay) {
        // Fallback for unexpected DOM issues
        alert(message);
        return;
    }
    overlay.classList.remove('hidden');
    _setText('submitMsg', message);

    let btn = document.getElementById('submitRetryBtn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'submitRetryBtn';
        btn.className = 'btn btn-primary submit-retry-btn';
        btn.innerHTML = '<span class="btn-text">Retry Submit</span>';
        btn.addEventListener('click', () => {
            if (_isSubmitting) return;
            _doSubmit();
        });
        overlay.appendChild(btn);
    }
    btn.disabled = false;
}

function _autoSubmit() {
    // Capture ALL open Monaco editors, not just the currently visible one
    Object.entries(_monacoInstances || {}).forEach(([qId, editor]) => {
        if (!editor) return;
        const cur = _answers[qId] || {};
        _answers[qId] = { ...cur, code: editor.getValue() };
    });
    // Also capture any non-code answer on the current question
    _captureCurrentEditorState();
    _saveLocal();
    _doSubmit();
}

function _buildSubmitPayload(isFinal = false) {
    const answers = _questions.map(q => {
        const a = _answers[q.id];
        
        // Format answer based on question type according to API requirements
        let formattedAnswer;
        
        if (q.question_type === 'mcq') {
            // For MCQ, send the selected option ID
            formattedAnswer = a != null ? String(a) : a;
        } else if (q.question_type === 'multiple_choice') {
            // For multiple choice, send array of selected option IDs
            formattedAnswer = _normalizeSelectionArray(a);
        } else if (q.question_type === 'coding') {
            // For coding, send the code and language
            if (typeof a === 'object' && a.code) {
                formattedAnswer = a.code;
            } else {
                formattedAnswer = a || '';
            }
        } else {
            // For descriptive, short_answer, long_answer, send the text
            formattedAnswer = a || '';
        }
        
        return {
            question_id: q.id,
            answer:      formattedAnswer,
        };
    });
    return {
        attempt_id: _attemptId,
        answers,
        flagged:    [..._flagged],
        is_final:   isFinal,
        time_taken: _exam ? (_exam.duration * 60 - _timeLeft) : undefined,
    };
}

function _captureCurrentEditorState() {
    const q = _questions[_currentIdx];
    if (!q) return;
    const qType = (q.question_type || '').toLowerCase();
    if (qType === 'coding') {
        const editor = _monacoInstances[q.id] || _monacoFsInstance;
        if (editor) {
            const cur = _answers[q.id] || {};
            _answers[q.id] = {
                ...cur,
                code: editor.getValue(),
                language: document.getElementById('codeLangSelect')?.value || cur.language,
            };
        }
    } else if (qType !== 'mcq' && qType !== 'multiple_choice' && qType !== 'true_false') {
        const ta = document.getElementById('textAnswer');
        if (ta) _answers[q.id] = ta.value || undefined;
    }
}

// ══════════════════════════════════════════════════════════════════
//  OFFLINE DETECTION
// ══════════════════════════════════════════════════════════════════
function _initOfflineDetection() {
    const banner = document.getElementById('offlineBanner');
    window.addEventListener('online', () => {
        _isOffline = false;
        banner.classList.add('hidden');
        _saveToServer(true);
    });
    window.addEventListener('offline', () => {
        _isOffline = true;
        banner.classList.remove('hidden');
        _saveLocal();
        _setSaveStatus('local', 'Saved locally');
    });
    if (!navigator.onLine) {
        _isOffline = true;
        banner.classList.remove('hidden');
    }
}

// ══════════════════════════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ══════════════════════════════════════════════════════════════════
function _initKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
        const tag = document.activeElement?.tagName;
        if (tag === 'TEXTAREA' || tag === 'INPUT') return;
        if (document.activeElement?.closest?.('.monaco-editor')) return;

        if (e.key === 'ArrowRight' || e.key === 'd') {
            e.preventDefault();
            if (_currentIdx < _questions.length - 1) _renderQuestion(_currentIdx + 1);
        }
        if (e.key === 'ArrowLeft' || e.key === 'a') {
            e.preventDefault();
            if (_currentIdx > 0) _renderQuestion(_currentIdx - 1);
        }
        if (e.key === 'f' || e.key === 'F') {
            e.preventDefault();
            _toggleFlag();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            _captureCurrentEditorState();
            _saveToServer(false);
        }
        // Number keys for MCQ
        if (/^[1-9]$/.test(e.key)) {
            const q = _questions[_currentIdx];
            if (!q) return;
            const qType = (q.question_type || '').toLowerCase();
            if (qType === 'mcq') {
                const idx = parseInt(e.key) - 1;
                const opts = document.querySelectorAll('#mcqOptions .mcq-option');
                if (opts[idx]) opts[idx].click();
            }
        }
    });
}

// ══════════════════════════════════════════════════════════════════
//  MISC CONTROLS WIRING
// ══════════════════════════════════════════════════════════════════
function _wireMiscControls() {
    document.getElementById('flagBtn').addEventListener('click', _toggleFlag);

    document.getElementById('prevQBtn').addEventListener('click', () => {
        if (_currentIdx > 0) { _captureCurrentEditorState(); _renderQuestion(_currentIdx - 1); }
    });
    document.getElementById('nextQBtn').addEventListener('click', () => {
        _captureCurrentEditorState();
        if (_currentIdx < _questions.length - 1) {
            _renderQuestion(_currentIdx + 1);
        } else {
            _openConfirmModal();
        }
    });

    document.getElementById('clearAnswerBtn').addEventListener('click', () => {
        const q = _questions[_currentIdx];
        if (!q) return;
        delete _answers[q.id];
        _renderQuestion(_currentIdx);
        _saveLocal(); _updateProgress(); _updateQNavGrid();
        _queueLiveSave();
    });

    document.getElementById('topbarSubmitBtn').addEventListener('click', () => {
        _captureCurrentEditorState();
        _openConfirmModal();
    });

    document.getElementById('confirmSubmitBtn').addEventListener('click', _doSubmit);
    document.getElementById('confirmCancelBtn').addEventListener('click', () =>
        document.getElementById('confirmModal').classList.remove('open')
    );
    document.getElementById('confirmModalClose').addEventListener('click', () =>
        document.getElementById('confirmModal').classList.remove('open')
    );
    document.getElementById('confirmModal').addEventListener('click', e => {
        if (e.target.id === 'confirmModal') document.getElementById('confirmModal').classList.remove('open');
    });

    document.getElementById('timeToastClose').addEventListener('click', () =>
        document.getElementById('timeToast').classList.add('hidden')
    );

    window.addEventListener('beforeunload', e => {
        if (_isSubmitting) return;
        _captureCurrentEditorState();
        _saveLocal();
        e.preventDefault();
        e.returnValue = 'Your exam is in progress. Are you sure you want to leave?';
    });
}

function _toggleFlag() {
    const q = _questions[_currentIdx];
    if (!q) return;
    if (_flagged.has(q.id)) _flagged.delete(q.id); else _flagged.add(q.id);
    const fb = document.getElementById('flagBtn');
    fb.classList.toggle('flagged', _flagged.has(q.id));
    _setText('flagBtnText', _flagged.has(q.id) ? 'Flagged' : 'Flag');
    _saveLocal(); _updateQNavGrid(); _updateProgress();
}

// ══════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════
function _normalizeCodingLanguage(lang) {
    const value = String(lang || '').trim().toLowerCase();
    return value || 'python';
}

function _codingLanguagesForQuestion(q) {
    const fromQuestion = Array.isArray(q?.allowed_languages) && q.allowed_languages.length
        ? q.allowed_languages
        : (Array.isArray(q?.languages) && q.languages.length
            ? q.languages
            : [q?.coding_language || q?.language || 'python']);

    const normalized = Array.from(new Set(
        fromQuestion
            .map(_normalizeCodingLanguage)
            .filter(Boolean)
    ));

    return normalized.length ? normalized : ['python'];
}

function _monacoLang(lang) {
    const map = {
        python:'python', javascript:'javascript', js:'javascript',
        typescript:'typescript', ts:'typescript', java:'java',
        cpp:'cpp', c:'c', csharp:'csharp', cs:'csharp',
        go:'go', rust:'rust', php:'php', ruby:'ruby',
        swift:'swift', kotlin:'kotlin', sql:'sql',
    };
    return map[(lang||'').toLowerCase()] || 'plaintext';
}

function _langLabel(lang) {
    const map = {
        python:'Python', javascript:'JavaScript', js:'JavaScript',
        typescript:'TypeScript', ts:'TypeScript', java:'Java',
        cpp:'C++', c:'C', csharp:'C#', cs:'C#',
        go:'Go', rust:'Rust', php:'PHP', ruby:'Ruby',
        swift:'Swift', kotlin:'Kotlin', sql:'SQL',
    };
    return map[(lang||'').toLowerCase()] || lang;
}

function _formatQText(text) {
    return text
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
            `<pre><code>${code.trim()}</code></pre>`)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}

function _fatalError(title, msg) {
    _setText('fatalTitle', title);
    _setText('fatalMsg', msg);
    document.getElementById('fatalOverlay').classList.remove('hidden');
    document.getElementById('examShell').classList.add('hidden');
}

function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val ?? '');
}

function _esc(s) {
    return String(s ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
