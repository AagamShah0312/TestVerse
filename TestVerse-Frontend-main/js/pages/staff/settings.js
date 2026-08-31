/**
 * TestVerse — Staff Settings Page
 *
 * Tabs:
 *  1. Profile  — PATCH /api/v1/auth/users/profile/ { name, username, department }
 *  2. Password — POST  /api/v1/auth/users/change-password/ { old_password, new_password, new_password_confirm }
 *  3. Account  — session info display + logout + clear session
 */
'use strict';

// ── State ──────────────────────────────────────────────────────────
let _profile    = null;  // loaded from GET PROFILE
let _origProfile = {};   // snapshot for reset

// ── Boot ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireStaff()) return;
    _initSidebar();
    _initTabs();
    _initPasswordPanel();
    _initAccountPanel();
    await _loadProfile();
    _initProfileForm();
});

// ── Sidebar ────────────────────────────────────────────────────────
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

// ── Tab switching ──────────────────────────────────────────────────
function _initTabs() {
    document.querySelectorAll('.stab').forEach(tab =>
        tab.addEventListener('click', () => {
            document.querySelectorAll('.stab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('panel' + _cap(tab.dataset.tab))?.classList.add('active');
        })
    );
}
function _cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

// ══════════════════════════════════════════════════════════════════
//  PROFILE
// ══════════════════════════════════════════════════════════════════

async function _loadProfile() {
    try {
        const res             = await Api.get(CONFIG.ENDPOINTS.PROFILE);
        const { data, error } = await Api.parse(res);
        if (error || !data) {
            // Fallback to cached user
            _profile = Auth.getUser() || {};
        } else {
            _profile = data;
            Auth.saveUser(data);
        }
    } catch {
        _profile = Auth.getUser() || {};
    }
    _populateProfileUI();
}

function _populateProfileUI() {
    const u    = _profile;
    const name = u.name || u.username || u.email?.split('@')[0] || 'Staff';
    const av   = _avatar(name);

    // Topbar & Sidebar
    _setText('sidebarName', name);
    _setText('topbarName',  name);
    _setImg('sidebarAvatar', av);
    _setImg('topbarAvatar',  av);

    // Avatar block
    _setImg('profileAvatar', av);
    _setText('avatarName',   name);
    _setText('avatarEmail',  u.email || '—');

    // Read-only fields
    _setText('roEmail', u.email || '—');

    // Editable form fields
    _setVal('fName',       u.name       || '');
    _setVal('fUsername',   u.username   || '');
    _setVal('fDepartment', u.department || '');

    // Snapshot for reset
    _origProfile = { name: u.name||'', username: u.username||'', department: u.department||'' };

    // Account tab
    _setText('acUserId',  u.id       || '—');
    _setText('acUsername',u.username || '—');
    _setText('acEmail',   u.email    || '—');
    _setText('acDept',    u.department || '—');
}

function _initProfileForm() {
    const form = document.getElementById('profileForm');
    form?.addEventListener('submit', async e => {
        e.preventDefault();
        if (!_validateProfileForm()) return;

        const btn     = document.getElementById('profileSaveBtn');
        const payload = {
            name:       _getVal('fName').trim(),
            username:   _getVal('fUsername').trim(),
            department: _getVal('fDepartment').trim(),
        };

        _setBtnLoading(btn, true);
        _clearAlert();

        try {
            const res             = await Api.patch(CONFIG.ENDPOINTS.PROFILE, payload);
            const { data, error } = await Api.parse(res);

            if (error) {
                _showAlert(_extractErr(error), 'error');
                _highlightApiErrors(error);
            } else {
                _profile = data || { ..._profile, ...payload };
                Auth.saveUser(_profile);
                _populateProfileUI();
                _showAlert('Profile updated successfully!', 'success');
            }
        } catch {
            _showAlert('Network error. Could not save profile.', 'error');
        } finally {
            _setBtnLoading(btn, false);
        }
    });

    document.getElementById('profileResetBtn')?.addEventListener('click', () => {
        _setVal('fName',       _origProfile.name);
        _setVal('fUsername',   _origProfile.username);
        _setVal('fDepartment', _origProfile.department);
        _clearFieldErrors();
    });
}

function _validateProfileForm() {
    let ok = true;

    const name = _getVal('fName').trim();
    if (!name) { _setFieldError('fNameErr', 'Full name is required.'); ok = false; }
    else _clearFieldErr('fNameErr');

    const username = _getVal('fUsername').trim();
    if (!username) { _setFieldError('fUsernameErr', 'Username is required.'); ok = false; }
    else if (!/^[a-zA-Z0-9_]{3,60}$/.test(username)) {
        _setFieldError('fUsernameErr', 'Only letters, numbers and underscores (3-60 chars).');
        ok = false;
    } else _clearFieldErr('fUsernameErr');

    _clearFieldErr('fDepartmentErr');
    return ok;
}

function _highlightApiErrors(err) {
    if (!err || typeof err !== 'object') return;
    const map = { name:'fNameErr', username:'fUsernameErr', department:'fDepartmentErr' };
    for (const [key, errId] of Object.entries(map)) {
        const msg = err[key];
        if (msg) _setFieldError(errId, Array.isArray(msg) ? msg[0] : msg);
    }
}

// ══════════════════════════════════════════════════════════════════
//  PASSWORD
// ══════════════════════════════════════════════════════════════════

function _initPasswordPanel() {
    // Toggle visibility buttons
    document.querySelectorAll('.pw-toggle').forEach(btn =>
        btn.addEventListener('click', () => {
            const inp  = document.getElementById(btn.dataset.target);
            if (!inp) return;
            const show = inp.type === 'password';
            inp.type   = show ? 'text' : 'password';
            btn.querySelector('i').className = `fas fa-${show ? 'eye-slash' : 'eye'}`;
        })
    );

    // Live strength checker
    const newPw    = document.getElementById('fNewPw');
    const confirmPw= document.getElementById('fConfirmPw');
    newPw?.addEventListener('input', () => {
        _updateStrength(newPw.value);
        _updateReqs(newPw.value, confirmPw?.value || '');
    });
    confirmPw?.addEventListener('input', () => {
        _updateReqs(newPw?.value || '', confirmPw.value);
    });

    // Clear
    document.getElementById('pwClearBtn')?.addEventListener('click', () => {
        ['fOldPw','fNewPw','fConfirmPw'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.value = ''; el.type = 'password'; }
        });
        document.querySelectorAll('.pw-toggle i').forEach(i => i.className = 'fas fa-eye');
        _clearFieldErrors();
        document.getElementById('pwStrengthWrap').style.display = 'none';
        document.querySelectorAll('.req-item').forEach(r => r.classList.remove('met'));
    });

    // Submit
    document.getElementById('passwordForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        if (!_validatePasswordForm()) return;

        const btn = document.getElementById('pwSaveBtn');
        _setBtnLoading(btn, true);
        _clearAlert();

        try {
            const res = await Api.post(CONFIG.ENDPOINTS.CHANGE_PASSWORD, {
                old_password:          _getVal('fOldPw'),
                new_password:          _getVal('fNewPw'),
                new_password_confirm:  _getVal('fConfirmPw'),
            });
            const { error } = await Api.parse(res);

            if (error) {
                _showAlert(_extractErr(error), 'error');
                if (error?.old_password) _setFieldError('fOldPwErr', Array.isArray(error.old_password) ? error.old_password[0] : error.old_password);
            } else {
                _showAlert('Password changed successfully! Please log in again.', 'success');
                setTimeout(() => Auth.logout(), 2200);
            }
        } catch {
            _showAlert('Network error. Could not update password.', 'error');
        } finally {
            _setBtnLoading(btn, false);
        }
    });
}

function _validatePasswordForm() {
    let ok = true;

    const old = _getVal('fOldPw');
    if (!old) { _setFieldError('fOldPwErr', 'Current password is required.'); ok = false; }
    else _clearFieldErr('fOldPwErr');

    const npw = _getVal('fNewPw');
    if (!npw || npw.length < 6) { _setFieldError('fNewPwErr', 'New password must be at least 6 characters.'); ok = false; }
    else _clearFieldErr('fNewPwErr');

    const cpw = _getVal('fConfirmPw');
    if (npw !== cpw) { _setFieldError('fConfirmPwErr', 'Passwords do not match.'); ok = false; }
    else _clearFieldErr('fConfirmPwErr');

    return ok;
}

// Strength & requirements ──────────────────────────────────────────
function _updateStrength(pw) {
    const wrap  = document.getElementById('pwStrengthWrap');
    const fill  = document.getElementById('psFill');
    const label = document.getElementById('psLabel');
    if (!fill || !label) return;

    if (!pw) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'flex';

    let score = 0;
    if (pw.length >= 6)  score++;
    if (pw.length >= 10) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^a-zA-Z0-9]/.test(pw)) score++;

    const levels = [
        { cls:'weak',   pct:'20%',  txt:'Weak'   },
        { cls:'weak',   pct:'35%',  txt:'Weak'   },
        { cls:'fair',   pct:'55%',  txt:'Fair'   },
        { cls:'good',   pct:'75%',  txt:'Good'   },
        { cls:'strong', pct:'100%', txt:'Strong' },
    ];
    const l = levels[Math.min(score, 4)];
    fill.className  = `ps-fill ${l.cls}`;
    fill.style.width = l.pct;
    label.className  = `ps-label ${l.cls}`;
    label.textContent = l.txt;
}

function _updateReqs(pw, cpw) {
    _reqMet('reqLen',   pw.length >= 6);
    _reqMet('reqUpper', /[A-Z]/.test(pw));
    _reqMet('reqNum',   /[0-9]/.test(pw));
    _reqMet('reqMatch', pw.length >= 1 && pw === cpw);
}

function _reqMet(id, met) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('met', met);
    el.querySelector('i').className = met ? 'fas fa-check-circle' : 'fas fa-circle';
}

// ══════════════════════════════════════════════════════════════════
//  ACCOUNT
// ══════════════════════════════════════════════════════════════════

function _initAccountPanel() {
    document.getElementById('acLogoutBtn')?.addEventListener('click', () => {
        if (confirm('Are you sure you want to logout?')) Auth.logout();
    });
    document.getElementById('clearSessionBtn')?.addEventListener('click', () => {
        if (confirm('This will clear all local session data and log you out. Continue?')) {
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = '../../' + CONFIG.ROUTES.LOGIN;
        }
    });
}

// ══════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════

let _alertTimer;
function _showAlert(msg, type = 'info') {
    const w = document.getElementById('alertContainer'); if (!w) return;
    const icons = { error:'exclamation-circle', success:'check-circle', info:'info-circle' };
    w.innerHTML = `<div class="alert alert-${type}"><i class="fas fa-${icons[type]||'info-circle'}"></i><span>${_esc(msg)}</span></div>`;
    clearTimeout(_alertTimer);
    _alertTimer = setTimeout(() => { w.innerHTML = ''; }, 5000);
}
function _clearAlert() {
    const w = document.getElementById('alertContainer'); if (w) w.innerHTML = '';
}

function _setFieldError(id, msg)  { const e = document.getElementById(id); if (e) { e.textContent = msg; e.closest('.field-group')?.querySelector('.field-input')?.classList.add('error'); } }
function _clearFieldErr(id)       { const e = document.getElementById(id); if (e) { e.textContent = ''; e.closest('.field-group')?.querySelector('.field-input')?.classList.remove('error'); } }
function _clearFieldErrors()      { document.querySelectorAll('.field-error').forEach(e => { e.textContent = ''; e.closest?.('.field-group')?.querySelector('.field-input')?.classList.remove('error'); }); }

function _setBtnLoading(btn, on) {
    if (!btn) return;
    btn.disabled = on;
    btn.querySelector('.btn-text')?.classList.toggle('hidden', on);
    btn.querySelector('.btn-loader')?.classList.toggle('hidden', !on);
}

function _extractErr(err) {
    if (!err) return 'Something went wrong.';
    if (typeof err === 'string') return err;
    if (err.error)   return err.error;
    if (err.detail)  return err.detail;
    if (err.message) return err.message;
    const v = Object.values(err);
    if (!v.length) return 'Something went wrong.';
    return Array.isArray(v[0]) ? v[0][0] : String(v[0]);
}

function _avatar(n) { return `https://ui-avatars.com/api/?name=${encodeURIComponent(n||'?')}&background=6366f1&color=fff&size=80`; }
function _setText(id, v)   { const e = document.getElementById(id); if (e) e.textContent = String(v ?? ''); }
function _setImg(id, src)  { const e = document.getElementById(id); if (e) e.src = src; }
function _getVal(id)       { return document.getElementById(id)?.value ?? ''; }
function _setVal(id, v)    { const e = document.getElementById(id); if (e) e.value = v; }
function _esc(s) {
    return String(s ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
