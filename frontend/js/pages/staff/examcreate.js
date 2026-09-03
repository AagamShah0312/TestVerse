/**
 * TestVerse — Staff: Create Exam
 * API exam_type values: mcq | mixed | descriptive | coding
 * Access field: allowed_departments (array of strings)
 */
'use strict';

// ── State ──────────────────────────────────────────────────────────
let _selectedDepts  = [];   // array of department name strings
let _allDepts       = [];   // full list for search
let _submitting     = false;

// Static department list — replace with API call if backend provides one
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

// ── Boot ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (!Auth.requireStaff()) return;
    _initUser();
    _initSidebar();
    _initCharCounters();
    _initSchedule();
    _initScoring();
    _initDeptPicker();
    _initResultVisibility();
    _initForm();
});

// ── User ───────────────────────────────────────────────────────────
function _initUser() {
    const user = Auth.getUser(); if (!user) return;
    const name = user.name || user.username || user.email?.split('@')[0] || 'Staff';
    const av   = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff`;
    _setText('sidebarName', name);
    _setText('topbarName',  name);
    _setAttr('sidebarAvatar', 'src', av);
    _setAttr('topbarAvatar',  'src', av);
}

// ── Sidebar ────────────────────────────────────────────────────────
function _initSidebar() {
    const sb  = document.getElementById('sidebar');
    const ov  = document.getElementById('sidebarOverlay');
    const open = () => { sb?.classList.add('open');    ov?.classList.add('show'); };
    const close= () => { sb?.classList.remove('open'); ov?.classList.remove('show'); };
    document.getElementById('menuToggle')?.addEventListener('click', open);
    document.getElementById('sidebarClose')?.addEventListener('click', close);
    ov?.addEventListener('click', close);
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Logout from TestVerse?')) Auth.logout();
    });
}

// ── Char Counters ──────────────────────────────────────────────────
function _initCharCounters() {
    _bindCounter('examDescription', 'descCount',  1000);
    _bindCounter('examInstructions', 'instrCount', 2000);
}
function _bindCounter(fieldId, countId, max) {
    const ta = document.getElementById(fieldId);
    const ct = document.getElementById(countId);
    if (!ta || !ct) return;
    const update = () => {
        const len = ta.value.length;
        ct.textContent = `${len} / ${max}`;
        ct.className   = 'char-count' + (len > max * 0.9 ? ' warn' : '') + (len > max ? ' over' : '');
    };
    ta.addEventListener('input', update);
    update();
}

// ── Schedule — auto duration ───────────────────────────────────────
function _initSchedule() {
    const start = document.getElementById('startTime');
    const end   = document.getElementById('endTime');

    // Set initial min to now (rounded to next 5 min)
    const now = new Date();
    now.setMinutes(Math.ceil(now.getMinutes() / 5) * 5, 0, 0);
    const iso = _toDatetimeLocal(now);
    if (start) start.min = iso;

    // Recalculate "start" min whenever the field gains focus so it never
    // drifts far into the past if the page stays open for a long time.
    start?.addEventListener('focus', () => {
        const nf = new Date();
        nf.setMinutes(Math.ceil(nf.getMinutes() / 5) * 5, 0, 0);
        const isoNow = _toDatetimeLocal(nf);
        start.min = isoNow;
    });

    const calc = () => {
        const s = start?.value, e = end?.value;
        const disp  = document.getElementById('durationDisplay');
        const val   = document.getElementById('durationValue');
        const break_= document.getElementById('durationBreakdown');

        _clearErr('startErr');
        _clearErr('endErr');

        if (!s || !e) {
            if (val) val.textContent = '—';
            disp?.classList.remove('valid','invalid');
            return;
        }

        const diff = Math.floor((new Date(e) - new Date(s)) / 60000);

        if (diff <= 0) {
            if (val) val.textContent = 'Invalid range';
            disp?.classList.add('invalid');
            disp?.classList.remove('valid');
            _setErr('endErr', 'End time must be after start time');
            // If previously selected end is now before the new start, clear it
            if (end && new Date(end.value) <= new Date(s)) {
                end.value = '';
            }
            return;
        }

        const h = Math.floor(diff / 60);
        const m = diff % 60;
        if (val) val.textContent = h > 0 ? `${h}h ${m > 0 ? m + 'm' : ''}`.trim() : `${m} min`;
        if (break_) {
            break_.innerHTML = h > 0
                ? `<i class="fas fa-clock"></i> ${diff} minutes total`
                : `<i class="fas fa-clock"></i> ${m} minutes`;
        }
        disp?.classList.add('valid');
        disp?.classList.remove('invalid');

        // Update end min
        if (end) end.min = start.value;
    };

    start?.addEventListener('change', calc);
    end?.addEventListener('change', calc);
}

// ── Scoring — pass percentage & bar ───────────────────────────────
function _initScoring() {
    const total  = document.getElementById('totalMarks');
    const pass   = document.getElementById('passingMarks');
    const pct    = document.getElementById('passPercent');
    const wrap   = document.getElementById('passBarWrap');
    const fill   = document.getElementById('passBarFill');
    const marker = document.getElementById('passBarMarker');
    const plbl   = document.getElementById('passBarPassLabel');
    const tlbl   = document.getElementById('totalMarksLabel');

    const calc = () => {
        const t = parseFloat(total?.value);
        const p = parseFloat(pass?.value);

        _clearErr('passErr');
        _clearErr('totalErr');

        if (isNaN(t) || isNaN(p)) {
            if (pct) pct.textContent = '—';
            if (wrap) wrap.style.display = 'none';
            return;
        }

        if (p > t) {
            _setErr('passErr', 'Passing marks cannot exceed total marks');
            if (pct) pct.textContent = '—';
            if (wrap) wrap.style.display = 'none';
            return;
        }

        const percent = ((p / t) * 100).toFixed(1);
        if (pct) pct.textContent = percent;

        if (wrap) {
            wrap.style.display = 'block';
            const pctNum = parseFloat(percent);
            fill.style.width      = `${pctNum}%`;
            marker.style.left     = `${pctNum}%`;
            if (plbl) plbl.textContent = p;
            if (tlbl) tlbl.textContent = t;
        }
    };

    total?.addEventListener('input', calc);
    pass?.addEventListener('input', calc);
}

// ── Department Picker ──────────────────────────────────────────────
function _initDeptPicker() {
    _allDepts = [...DEPARTMENTS];
    _renderDeptList(_allDepts);

    document.getElementById('deptSearch')?.addEventListener('input', e => {
        const q = e.target.value.trim().toLowerCase();
        _renderDeptList(q ? _allDepts.filter(d => d.toLowerCase().includes(q)) : _allDepts);
    });
}

function _renderDeptList(list) {
    const container = document.getElementById('deptList');
    if (!container) return;

    if (!list.length) {
        container.innerHTML = `<div class="branch-loading">No departments found</div>`;
        return;
    }

    container.innerHTML = list.map(dept => {
        const selected = _selectedDepts.includes(dept);
        return `<div class="branch-item ${selected ? 'selected' : ''}" data-dept="${_esc(dept)}">
            <div class="branch-checkbox">
                <i class="fas fa-${selected ? 'check-square' : 'square'}"></i>
            </div>
            <span>${_esc(dept)}</span>
            ${selected ? '<i class="fas fa-check branch-check-mark"></i>' : ''}
        </div>`;
    }).join('');

    container.querySelectorAll('.branch-item').forEach(item => {
        item.addEventListener('click', () => _toggleDept(item.dataset.dept));
    });
}

function _toggleDept(dept) {
    if (_selectedDepts.includes(dept)) {
        _selectedDepts = _selectedDepts.filter(d => d !== dept);
    } else {
        _selectedDepts.push(dept);
    }
    // Re-render list with current search
    const q = document.getElementById('deptSearch')?.value.trim().toLowerCase() || '';
    _renderDeptList(q ? _allDepts.filter(d => d.toLowerCase().includes(q)) : _allDepts);
    _renderSelectedChips();
    _clearErr('deptErr');
}

function _renderSelectedChips() {
    const wrap = document.getElementById('selectedDepts');
    if (!wrap) return;
    wrap.innerHTML = _selectedDepts.map(d => `
        <div class="selected-chip">
            <span>${_esc(d)}</span>
            <button type="button" class="chip-remove" data-dept="${_esc(d)}">
                <i class="fas fa-times"></i>
            </button>
        </div>`).join('');
    wrap.querySelectorAll('.chip-remove').forEach(btn => {
        btn.addEventListener('click', () => _toggleDept(btn.dataset.dept));
    });
}

// ── Result Visibility hint ─────────────────────────────────────────
function _initResultVisibility() {
    const sel  = document.getElementById('resultVisibility');
    const hint = document.getElementById('resultVisibilityHint');
    if (!sel || !hint) return;
    const hints = {
        immediate: 'Students see score & answers right after they submit',
        after_end: 'Results become visible once the exam window closes',
        manual:    'You control exactly when results are released to students',
    };
    sel.addEventListener('change', () => { hint.textContent = hints[sel.value] || ''; });
}

// ── Form Submit ────────────────────────────────────────────────────
function _initForm() {
    document.getElementById('createExamForm')?.addEventListener('submit', e => {
        e.preventDefault();
        _submit(false);
    });
    document.getElementById('saveDraftBtn')?.addEventListener('click', () => _submit(true));
}

function _validate() {
    let ok = true;

    const title = document.getElementById('examTitle')?.value.trim();
    if (!title) { _setErr('titleErr', 'Title is required'); ok = false; }
    else _clearErr('titleErr');

    const type = document.getElementById('examType')?.value;
    if (!type) { _setErr('typeErr', 'Select an exam type'); ok = false; }
    else _clearErr('typeErr');

    const desc = document.getElementById('examDescription')?.value.trim();
    if (!desc) { _setErr('descErr', 'Description is required'); ok = false; }
    else _clearErr('descErr');

    const start = document.getElementById('startTime')?.value;
    const end   = document.getElementById('endTime')?.value;
    if (!start) { _setErr('startErr', 'Start time is required'); ok = false; }
    else _clearErr('startErr');
    if (!end) { _setErr('endErr', 'End time is required'); ok = false; }
    else _clearErr('endErr');
    if (start && end && new Date(end) <= new Date(start)) {
        _setErr('endErr', 'End time must be after start time'); ok = false;
    }

    const total  = parseFloat(document.getElementById('totalMarks')?.value);
    const pass   = parseFloat(document.getElementById('passingMarks')?.value);
    if (!total || total <= 0) { _setErr('totalErr', 'Enter valid total marks'); ok = false; }
    else _clearErr('totalErr');
    if (!pass  || pass  <= 0) { _setErr('passErr',  'Enter valid passing marks'); ok = false; }
    else _clearErr('passErr');
    if (total && pass && pass > total) {
        _setErr('passErr', 'Passing marks cannot exceed total marks'); ok = false;
    }

    // Department selection is optional; empty means exam is open to all departments
    _clearErr('deptErr');

    return ok;
}

async function _submit(asDraft) {
    if (_submitting) return;
    if (!_validate()) return;

    _submitting = true;
    const btn = asDraft
        ? document.getElementById('saveDraftBtn')
        : document.getElementById('submitBtn');
    _setBtnLoading(btn, true);

    const start = document.getElementById('startTime').value;
    const end   = document.getElementById('endTime').value;
    const duration = Math.floor((new Date(end) - new Date(start)) / 60000);

    const payload = {
        title:               document.getElementById('examTitle').value.trim(),
        description:         document.getElementById('examDescription').value.trim(),
        exam_type:           document.getElementById('examType').value,
        instructions:        document.getElementById('examInstructions').value.trim() || '',
        start_time:          new Date(start).toISOString(),
        end_time:            new Date(end).toISOString(),
        duration,
        total_marks:         String(document.getElementById('totalMarks').value),
        passing_marks:       String(document.getElementById('passingMarks').value),
        allowed_departments: _selectedDepts,
        is_published:        !asDraft,
        // Derived from result_visibility
        show_score:          document.getElementById('resultVisibility').value === 'immediate',
        result_visibility:   document.getElementById('resultVisibility').value,
        max_attempts:        parseInt(document.getElementById('attemptLimit').value) || 1,
        shuffle_questions:   document.getElementById('shuffleQuestions').checked,
        shuffle_options:     document.getElementById('shuffleOptions').checked,
        allow_review:        document.getElementById('allowReview').checked,
    };

    try {
        const res = await Api.post(CONFIG.ENDPOINTS.STAFF_EXAMS, payload);
        const { data, error } = await Api.parse(res);

        if (error) {
            _showAlert(_extractErr(error), 'error');
            _setBtnLoading(btn, false);
            _submitting = false;
            return;
        }

        const examId = data?.id;

        if (asDraft) {
            _submitting = false;
            _setBtnLoading(btn, false);
            _showAlert('Exam saved as draft!', 'success');
            setTimeout(() => { window.location.href = `exams.html`; }, 1200);
        } else {
            // Redirect to question editor with ?new=1 so welcome banner shows
            window.location.href = `examedit.html?id=${examId}&new=1`;
        }

    } catch {
        _showAlert('Network error. Please check your connection and try again.', 'error');
        _setBtnLoading(btn, false);
        _submitting = false;
    }
}

// ── Helpers ────────────────────────────────────────────────────────
function _toDatetimeLocal(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function _setText(id, v)       { const el = document.getElementById(id); if (el) el.textContent = v; }
function _setAttr(id, a, v)    { const el = document.getElementById(id); if (el) el[a] = v; }
function _setErr(id, msg)      { const el = document.getElementById(id); if (el) el.textContent = msg; }
function _clearErr(id)         { const el = document.getElementById(id); if (el) el.textContent = ''; }
function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _setBtnLoading(btn, on) {
    if (!btn) return;
    btn.disabled = on;
    btn.querySelector('.btn-text')?.classList.toggle('hidden', on);
    const l = btn.querySelector('.btn-loader');
    if (l) l.classList.toggle('hidden', !on);
}
function _extractErr(err) {
    if (!err) return 'Something went wrong';
    if (typeof err === 'string') return err;
    const vals = Object.values(err);
    if (!vals.length) return 'Something went wrong';
    const first = vals[0];
    return Array.isArray(first) ? first[0] : String(first);
}
function _showAlert(msg, type) {
    const wrap = document.getElementById('alertContainer'); if (!wrap) return;
    const icon = type === 'error' ? 'exclamation-circle' : 'check-circle';
    wrap.innerHTML = `<div class="alert alert-${type}">
        <i class="fas fa-${icon}"></i><span>${msg}</span>
    </div>`;
    if (type === 'success') {
        setTimeout(() => { wrap.innerHTML = ''; }, 3000);
    }
    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}