/**
 * TestVerse — Student Profile Page
 *
 * Endpoints (from config.js):
 *   GET/PATCH  CONFIG.ENDPOINTS.PROFILE           /api/v1/auth/users/profile/
 *   POST       CONFIG.ENDPOINTS.CHANGE_PASSWORD   /api/v1/auth/users/change-password/
 *   GET        CONFIG.ENDPOINTS.ANALYTICS         /api/v1/auth/analytics/
 *   GET        CONFIG.ENDPOINTS.EXAMS_MY_RESULTS  /api/v1/exams/my-results/
 *   GET        CONFIG.ENDPOINTS.NOTIF_COUNT       /api/v1/auth/notifications/count/
 *
 * Auth.getUser() fields (from auth.js):
 *   id, email, name, username, role
 *
 * Profile PATCH body accepted fields (standard DRF user PATCH):
 *   name, username, email
 *
 * Change password POST body:
 *   old_password, new_password
 */
'use strict';

// ── State ──────────────────────────────────────────────────────────
let _profile    = null;   // live profile from API
let _results    = [];     // from EXAMS_MY_RESULTS
let _activeTab  = 'info';

// ══════════════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireAuth()) return;
    _initSidebar();
    _populateFromCache();   // instant paint from localStorage
    _wireTabs();
    _wireInfoForm();
    _wirePwForm();
    _wireDanger();
    _wireAvatarHint();
    await Promise.allSettled([
        _loadProfile(),
        _loadResults(),
        _loadNotifCount(),
    ]);
});

// ══════════════════════════════════════════════════════════════════
//  SIDEBAR
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
        overlay?.classList.remove('show');
    });
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Log out of TestVerse?')) Auth.logout();
    });
}

// ══════════════════════════════════════════════════════════════════
//  INSTANT PAINT FROM LOCALSTORAGE
// ══════════════════════════════════════════════════════════════════
function _populateFromCache() {
    const user = Auth.getUser();
    if (!user) return;
    const name   = user.name || user.username || user.email?.split('@')[0] || 'Student';
    const avatar = _avatarUrl(name);
    _setText('sidebarName', name);
    _setText('topbarName',  name);
    _setText('heroName',    name);
    _setText('heroEmail',   user.email || '');
    ['sidebarAvatar','topbarAvatar','heroAvatar'].forEach(id => {
        const el = document.getElementById(id); if (el) el.src = avatar;
    });
    _prefillForm(user);
}

// ══════════════════════════════════════════════════════════════════
//  LOAD PROFILE  (GET /api/v1/auth/users/profile/)
// ══════════════════════════════════════════════════════════════════
async function _loadProfile() {
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.PROFILE);
        const { data, error } = await Api.parse(res);
        if (error || !data) return;

        _profile = data;
        Auth.saveUser(data);   // refresh localStorage cache

        const name = data.name || data.username || data.email?.split('@')[0] || 'Student';
        const avatar = _avatarUrl(name);

        // Hero
        _setText('heroName',  name);
        _setText('heroEmail', data.email || '');
        ['sidebarAvatar','topbarAvatar','heroAvatar'].forEach(id => {
            const el = document.getElementById(id); if (el) el.src = avatar;
        });
        _setText('sidebarName', name);
        _setText('topbarName',  name);

        // Joined date chip
        const joinedEl = document.getElementById('heroJoined');
        if (joinedEl && (data.date_joined || data.created_at)) {
            joinedEl.innerHTML = `<i class="fas fa-calendar-alt"></i> Joined ${_fmtDate(data.date_joined || data.created_at)}`;
        }

        // Role chip
        const roleEl = document.getElementById('heroRole');
        if (roleEl) {
            const role = data.role || 'student';
            roleEl.innerHTML = `<i class="fas fa-user-graduate"></i> ${_cap(role)}`;
        }

        // Fill form
        _prefillForm(data);

        // Render meta list
        _renderMeta(data);
    } catch (err) {
        console.error('[profile] load:', err);
    }
}

// ══════════════════════════════════════════════════════════════════
//  LOAD RESULTS → hero stats + activity tab
// ══════════════════════════════════════════════════════════════════
async function _loadResults() {
    try {
        const [resR, resA] = await Promise.allSettled([
            Api.get(CONFIG.ENDPOINTS.EXAMS_MY_RESULTS),
            Api.get(CONFIG.ENDPOINTS.ANALYTICS),
        ]);

        let analytics = null;
        if (resA.status === 'fulfilled') {
            const { data } = await Api.parse(resA.value);
            analytics = data;
        }

        if (resR.status === 'fulfilled') {
            const { data } = await Api.parse(resR.value);
            _results = Array.isArray(data) ? data : (data?.results ?? []);
        }

        _renderHeroStats(_results, analytics);
        if (_activeTab === 'activity') _renderActivity();
    } catch (err) {
        console.error('[profile] results:', err);
        _renderHeroStats([], null);
    }
}

// ══════════════════════════════════════════════════════════════════
//  HERO STATS
// ══════════════════════════════════════════════════════════════════
function _renderHeroStats(results, analytics) {
    const statsEl = document.getElementById('heroStats');
    if (!statsEl) return;

    const total   = results.length;
    const scored  = results.filter(r => _scoreOf(r) != null);
    const passed  = scored.filter(r => _statusOf(r) === 'pass').length;
    const scores  = scored.map(r => _pctOf(r)).filter(Boolean);
    const avg     = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : null;
    const streak  = analytics?.streak ?? analytics?.current_streak ?? 0;

    const stats = [
        { val: total,                        lbl: 'Exams Done' },
        { val: avg != null ? avg + '%' : '—', lbl: 'Avg Score'  },
        { val: passed,                        lbl: 'Passed'     },
        ...(streak > 0 ? [{ val: '🔥 ' + streak, lbl: 'Streak' }] : []),
    ].slice(0, 4);

    statsEl.innerHTML = stats.map(s => `
    <div class="ph-stat">
        <span class="ph-stat-val">${s.val}</span>
        <span class="ph-stat-lbl">${s.lbl}</span>
    </div>`).join('');
}

// ══════════════════════════════════════════════════════════════════
//  ACCOUNT META LIST
// ══════════════════════════════════════════════════════════════════
function _renderMeta(data) {
    const el = document.getElementById('metaList');
    if (!el) return;

    const rows = [
        { icon: 'fas fa-id-badge',     label: 'User ID',     value: data.id ? `#${data.id}` : '—', cls: 'mono' },
        { icon: 'fas fa-user-tag',     label: 'Role',        value: null, badge: data.role || 'student' },
        { icon: 'fas fa-envelope',     label: 'Email',       value: data.email || '—' },
        { icon: 'fas fa-at',           label: 'Username',    value: data.username || '—' },
        { icon: 'fas fa-calendar-plus',label: 'Joined',      value: data.date_joined || data.created_at ? _fmtDate(data.date_joined || data.created_at) : '—' },
        { icon: 'fas fa-clock',        label: 'Last Login',  value: data.last_login ? _fmtDateTime(data.last_login) : '—' },
        { icon: 'fas fa-shield-check', label: 'Status',      value: null, badge: data.is_active !== false ? 'active' : 'inactive' },
    ];

    el.innerHTML = rows.map(r => {
        const val = r.badge
            ? `<span class="meta-badge ${r.badge}">${_cap(r.badge)}</span>`
            : `<span class="meta-value ${r.cls || ''}">${_esc(r.value)}</span>`;
        return `<div class="meta-row">
            <span class="meta-label">
                <i class="${r.icon}"></i> ${r.label}
            </span>
            ${val}
        </div>`;
    }).join('');
}

// ══════════════════════════════════════════════════════════════════
//  PREFILL INFO FORM
// ══════════════════════════════════════════════════════════════════
function _prefillForm(data) {
    _setVal('fieldName',     data.name || data.full_name || '');
    _setVal('fieldUsername', data.username || '');
    _setVal('fieldEmail',    data.email || '');
}

// ══════════════════════════════════════════════════════════════════
//  TABS
// ══════════════════════════════════════════════════════════════════
function _wireTabs() {
    document.querySelectorAll('.ptab[data-tab]').forEach(btn =>
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            _switchTab(tab);
        })
    );
}

function _switchTab(tab) {
    _activeTab = tab;
    document.querySelectorAll('.ptab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach(p => {
        p.classList.toggle('active', p.id === `tab-${tab}`);
        p.classList.toggle('hidden', p.id !== `tab-${tab}`);
    });

    if (tab === 'activity' && _results.length === 0) _loadResults();
    else if (tab === 'activity') _renderActivity();

    if (tab === 'danger') _renderSessionDetail();
}

// ══════════════════════════════════════════════════════════════════
//  ACTIVITY TAB
// ══════════════════════════════════════════════════════════════════
function _renderActivity() {
    const wrap    = document.getElementById('activityWrap');
    const loading = document.getElementById('activityLoading');
    if (!wrap) return;
    loading?.remove();

    if (!_results.length) {
        wrap.innerHTML = `<div class="act-empty">
            <i class="fas fa-history"></i>
            <span>No exam activity yet — start your first exam!</span>
        </div>`;
        return;
    }

    const sorted = [..._results]
        .sort((a,b) => new Date(b.submitted_at||b.created_at||0) - new Date(a.submitted_at||a.created_at||0))
        .slice(0, 15);

    wrap.innerHTML = `<div class="activity-list">${sorted.map((r, i) => {
        const name   = r.exam_title || r.exam?.title || 'Untitled Exam';
        const pct    = _pctOf(r);
        const status = _statusOf(r);
        const date   = r.submitted_at || r.created_at;
        const iconCls= status === 'pass' ? 'pass' : status === 'fail' ? 'fail' : 'pend';
        const icon   = status === 'pass' ? 'fas fa-check' : status === 'fail' ? 'fas fa-times' : 'fas fa-clock';
        const badgeTxt = status === 'pass' ? 'Passed' : status === 'fail' ? 'Failed' : 'Pending';
        return `
        <div class="activity-item" style="animation-delay:${Math.min(i*.04,.4)}s">
            <div class="act-icon ${iconCls}"><i class="${icon}"></i></div>
            <div class="act-body">
                <div class="act-exam">${_esc(name)}</div>
                <div class="act-date">${date ? _fmtDateTime(date) : '—'}</div>
            </div>
            <div class="act-right">
                <span class="act-score">${pct != null ? Math.round(pct) + '%' : '—'}</span>
                <span class="act-badge ${iconCls}">${badgeTxt}</span>
            </div>
        </div>`;
    }).join('')}</div>`;
}

// ══════════════════════════════════════════════════════════════════
//  INFO FORM (PATCH profile)
// ══════════════════════════════════════════════════════════════════
function _wireInfoForm() {
    const form   = document.getElementById('infoForm');
    const resetBtn = document.getElementById('infoResetBtn');

    resetBtn?.addEventListener('click', () => {
        const src = _profile || Auth.getUser() || {};
        _prefillForm(src);
        _hideAlert('infoAlert');
    });

    form?.addEventListener('submit', async e => {
        e.preventDefault();
        if (!_validateInfoForm()) return;

        const btn = document.getElementById('infoSaveBtn');
        _setLoading(btn, true, 'Saving…');
        _hideAlert('infoAlert');

        const body = {
            name:     _getVal('fieldName').trim(),
            username: _getVal('fieldUsername').trim(),
            email:    _getVal('fieldEmail').trim(),
        };

        try {
            const res = await Api.patch(CONFIG.ENDPOINTS.PROFILE, body);
            const { data, error } = await Api.parse(res);

            if (error) {
                _showAlert('infoAlert', 'error', _extractErr(error));
            } else {
                if (data) { _profile = data; Auth.saveUser(data); _populateFromCache(); }
                _showSaveStatus();
                _showToast('success', 'Profile saved successfully!');
            }
        } catch {
            _showAlert('infoAlert', 'error', 'Network error. Please try again.');
        } finally {
            _setLoading(btn, false, '<i class="fas fa-save"></i> Save Changes');
        }
    });
}

function _validateInfoForm() {
    let ok = true;
    const name  = _getVal('fieldName').trim();
    const email = _getVal('fieldEmail').trim();

    _clearFieldErr('errName');
    _clearFieldErr('errEmail');
    _clearFieldErr('errUsername');

    if (!name) { _showFieldErr('errName', 'Full name is required'); ok = false; }
    if (!email) { _showFieldErr('errEmail', 'Email is required'); ok = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        _showFieldErr('errEmail', 'Enter a valid email address'); ok = false;
    }
    return ok;
}

// ══════════════════════════════════════════════════════════════════
//  PASSWORD FORM (POST change-password)
// ══════════════════════════════════════════════════════════════════
function _wirePwForm() {
    const newPw    = document.getElementById('fieldNewPw');
    const confirmPw= document.getElementById('fieldConfirmPw');

    // Real-time rules
    newPw?.addEventListener('input', () => {
        _updatePwStrength(newPw.value);
        _updatePwRules(newPw.value, confirmPw?.value || '');
    });
    confirmPw?.addEventListener('input', () => {
        _updatePwRules(newPw?.value || '', confirmPw.value);
    });

    // Toggle visibility
    document.querySelectorAll('.pw-toggle[data-target]').forEach(btn =>
        btn.addEventListener('click', () => {
            const inp = document.getElementById(btn.dataset.target);
            if (!inp) return;
            const isText = inp.type === 'text';
            inp.type = isText ? 'password' : 'text';
            btn.querySelector('i').className = isText ? 'fas fa-eye' : 'fas fa-eye-slash';
        })
    );

    document.getElementById('pwForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        if (!_validatePwForm()) return;

        const btn = document.getElementById('pwSaveBtn');
        _setLoading(btn, true, 'Updating…');
        _hideAlert('pwAlert');

        try {
            const res = await Api.post(CONFIG.ENDPOINTS.CHANGE_PASSWORD, {
                old_password: _getVal('fieldCurrentPw'),
                new_password: _getVal('fieldNewPw'),
            });
            const { data, error } = await Api.parse(res);

            if (error) {
                _showAlert('pwAlert', 'error', _extractErr(error));
            } else {
                _showAlert('pwAlert', 'success', 'Password updated successfully!');
                _showToast('success', 'Password changed!');
                document.getElementById('pwForm').reset();
                document.getElementById('pwStrengthWrap')?.classList.add('hidden');
                _resetPwRules();
            }
        } catch {
            _showAlert('pwAlert', 'error', 'Network error. Please try again.');
        } finally {
            _setLoading(btn, false, '<i class="fas fa-key"></i> Update Password');
        }
    });
}

function _validatePwForm() {
    let ok = true;
    const curr = _getVal('fieldCurrentPw');
    const nw   = _getVal('fieldNewPw');
    const conf = _getVal('fieldConfirmPw');

    ['errCurrentPw','errNewPw','errConfirmPw'].forEach(_clearFieldErr);

    if (!curr)       { _showFieldErr('errCurrentPw', 'Enter your current password'); ok = false; }
    if (!nw)         { _showFieldErr('errNewPw', 'Enter a new password'); ok = false; }
    else if (nw.length < 8) { _showFieldErr('errNewPw', 'Password must be at least 8 characters'); ok = false; }
    if (nw !== conf) { _showFieldErr('errConfirmPw', 'Passwords do not match'); ok = false; }
    return ok;
}

function _updatePwStrength(pw) {
    const wrap  = document.getElementById('pwStrengthWrap');
    const fill  = document.getElementById('pwStrengthFill');
    const label = document.getElementById('pwStrengthLabel');
    if (!wrap || !fill || !label) return;

    if (!pw) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');

    let score = 0;
    if (pw.length >= 8)  score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    const levels = [
        { w: '20%',  color: '#ef4444', txt: 'Very Weak' },
        { w: '40%',  color: '#f97316', txt: 'Weak'      },
        { w: '60%',  color: '#f59e0b', txt: 'Fair'      },
        { w: '80%',  color: '#22c55e', txt: 'Strong'    },
        { w: '100%', color: '#16a34a', txt: 'Very Strong'},
    ];
    const lvl = levels[Math.min(score - 1, 4)] || levels[0];
    fill.style.width      = lvl.w;
    fill.style.background = lvl.color;
    label.textContent     = lvl.txt;
    label.style.color     = lvl.color;
}

function _updatePwRules(pw, conf) {
    _setRule('ruleLen',   pw.length >= 8);
    _setRule('ruleUpper', /[A-Z]/.test(pw));
    _setRule('ruleNum',   /[0-9]/.test(pw));
    _setRule('ruleMatch', !!pw && pw === conf);
}

function _resetPwRules() {
    ['ruleLen','ruleUpper','ruleNum','ruleMatch'].forEach(id => _setRule(id, false));
}

function _setRule(id, valid) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('valid', valid);
    el.querySelector('i').className = valid ? 'fas fa-check-circle' : 'fas fa-circle';
}

// ══════════════════════════════════════════════════════════════════
//  DANGER / SECURITY
// ══════════════════════════════════════════════════════════════════
function _wireDanger() {
    document.getElementById('signOutBtn')?.addEventListener('click', () => {
        if (confirm('Sign out of TestVerse?')) Auth.logout();
    });
    document.getElementById('deleteAccountBtn')?.addEventListener('click', () => {
        const confirmed = confirm(
            '⚠️ Delete your account?\n\nThis will permanently remove all your data, exam results, and badges.\nThis action CANNOT be undone.\n\nType OK to confirm.'
        );
        if (confirmed) {
            _showToast('error', 'Account deletion is not available yet.');
        }
    });
}

function _renderSessionDetail() {
    const el = document.getElementById('sessionDetail');
    if (!el) return;
    const ua = navigator.userAgent;
    const browser = ua.includes('Chrome') ? 'Chrome'
                  : ua.includes('Firefox') ? 'Firefox'
                  : ua.includes('Safari') ? 'Safari'
                  : 'Browser';
    el.textContent = `${browser} · Active now`;
}

// ══════════════════════════════════════════════════════════════════
//  NOTIF COUNT
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
//  TOAST
// ══════════════════════════════════════════════════════════════════
let _toastTimer = null;
function _showToast(type, msg) {
    const toast   = document.getElementById('toast');
    const icon    = document.getElementById('toastIcon');
    const msgEl   = document.getElementById('toastMsg');
    if (!toast) return;
    if (icon)  icon.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
    if (msgEl) msgEl.textContent = msg;
    toast.className = `toast ${type}`;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
}

function _showSaveStatus() {
    const el = document.getElementById('infoSaveStatus');
    if (!el) return;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 2500);
}

// ══════════════════════════════════════════════════════════════════
//  AVATAR HINT (no upload — ui-avatars)
// ══════════════════════════════════════════════════════════════════
function _wireAvatarHint() {
    document.getElementById('avatarOverlay')?.addEventListener('click', () => {
        _showToast('error', 'Avatar upload coming soon — update your name to change it!');
    });
}

// ══════════════════════════════════════════════════════════════════
//  HELPERS — DATA
// ══════════════════════════════════════════════════════════════════
function _statusOf(r) {
    if (r.is_pending || r.status === 'pending') return 'pending';
    if (r.passed === true  || r.status === 'pass'  || r.result_status === 'pass')  return 'pass';
    if (r.passed === false || r.status === 'fail'  || r.result_status === 'fail')  return 'fail';
    const s = _scoreOf(r), pm = r.passing_marks ?? r.passing_score;
    if (s != null && pm != null) return s >= pm ? 'pass' : 'fail';
    const pct = _pctOf(r);
    if (pct != null) return pct >= 40 ? 'pass' : 'fail';
    return 'pending';
}
function _scoreOf(r) {
    return r.score ?? r.obtained_marks ?? r.obtained_score ?? r.marks_obtained ?? null;
}
function _pctOf(r) {
    if (r.percentage != null) return parseFloat(r.percentage);
    const s = _scoreOf(r), t = r.total_marks ?? r.total_score;
    if (s != null && t && t > 0) return (s / t) * 100;
    return null;
}
function _extractErr(error) {
    return Auth.extractErrorMessage(error);
}

// ══════════════════════════════════════════════════════════════════
//  HELPERS — DOM
// ══════════════════════════════════════════════════════════════════
function _setText(id, val) {
    const el = document.getElementById(id); if (el) el.textContent = String(val ?? '');
}
function _getVal(id) {
    return document.getElementById(id)?.value ?? '';
}
function _setVal(id, val) {
    const el = document.getElementById(id); if (el) el.value = val ?? '';
}
function _setLoading(btn, loading, html) {
    if (!btn) return;
    btn.disabled = loading;
    btn.innerHTML = loading
        ? `<span class="spinner-sm" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:4px"></span>${html}`
        : html;
}
function _showAlert(id, type, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `form-alert ${type}`;
    el.textContent = msg;
}
function _hideAlert(id) {
    const el = document.getElementById(id);
    if (el) { el.className = 'form-alert hidden'; el.textContent = ''; }
}
function _showFieldErr(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg; el.classList.remove('hidden');
    const inputId = id.replace('err', 'field');
    document.getElementById(inputId)?.classList.add('has-error');
}
function _clearFieldErr(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = ''; el.classList.add('hidden');
    const inputId = id.replace('err', 'field');
    document.getElementById(inputId)?.classList.remove('has-error');
}

// ══════════════════════════════════════════════════════════════════
//  HELPERS — FORMATTING
// ══════════════════════════════════════════════════════════════════
function _avatarUrl(name, size = 96) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff&size=${size}`;
}
function _fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}
function _fmtDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function _cap(s) {
    return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
}
function _esc(s) {
    return String(s ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
