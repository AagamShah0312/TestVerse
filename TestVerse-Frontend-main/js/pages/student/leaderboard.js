/**
 * TestVerse — Student Leaderboard Page
 *
 * Endpoints (GET, from config.js):
 *   CONFIG.ENDPOINTS.LEADERBOARD   /api/v1/auth/leaderboard/
 *   CONFIG.ENDPOINTS.NOTIF_COUNT   /api/v1/auth/notifications/count/
 *
 * Leaderboard response fields (from dashboard.js reference):
 *   name | student_name | username | full_name  → display name
 *   average_score                               → main score (%)
 *   total_score                                 → fallback score
 *   student_id | user_id | username             → identity (to match "You")
 *   total_exams | exam_count                    → number of exams
 *   best_score  | highest_score                 → best individual score
 *   rank        | position                      → server-provided rank
 *   points                                      → optional points field
 */
'use strict';

// ── Constants ──────────────────────────────────────────────────────
const PAGE_SIZE = 20;

// ── State ──────────────────────────────────────────────────────────
let _allEntries  = [];   // full leaderboard from API
let _filtered    = [];   // after tab + search filtering
let _me          = null; // Auth.getUser()
let _myIndex     = -1;   // index of current user in _allEntries
let _tab         = 'all';
let _page        = 1;
let _searchQuery = '';

// ══════════════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireAuth()) return;
    _me = Auth.getUser();
    _initSidebar();
    _populateUser();
    _wireControls();
    await Promise.allSettled([_loadLeaderboard(), _loadNotifCount()]);
});

// ── Sidebar ────────────────────────────────────────────────────────
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

// ── User ───────────────────────────────────────────────────────────
function _populateUser() {
    if (!_me) return;
    const name   = _me.name || _me.username || _me.email?.split('@')[0] || 'Student';
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff&size=64`;
    _setText('sidebarName', name);
    _setText('topbarName',  name);
    ['sidebarAvatar','topbarAvatar'].forEach(id => {
        const el = document.getElementById(id); if (el) el.src = avatar;
    });
}

// ── Wire controls ──────────────────────────────────────────────────
function _wireControls() {
    // Refresh
    document.getElementById('refreshBtn')?.addEventListener('click', _loadLeaderboard);

    // Tabs
    document.querySelectorAll('.lb-tab[data-tab]').forEach(btn =>
        btn.addEventListener('click', () => {
            document.querySelectorAll('.lb-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _tab  = btn.dataset.tab;
            _page = 1;
            _applyFilters();
        })
    );

    // Search
    const input = document.getElementById('searchInput');
    const clear = document.getElementById('searchClear');
    input?.addEventListener('input', () => {
        _searchQuery = input.value.trim().toLowerCase();
        clear?.classList.toggle('hidden', !_searchQuery);
        _page = 1;
        _applyFilters();
    });
    clear?.addEventListener('click', () => {
        if (input) input.value = '';
        _searchQuery = '';
        clear.classList.add('hidden');
        _page = 1;
        _applyFilters();
    });

    // Pagination
    document.getElementById('prevBtn')?.addEventListener('click', () => {
        if (_page > 1) { _page--; _renderTable(); }
    });
    document.getElementById('nextBtn')?.addEventListener('click', () => {
        const maxPage = Math.ceil(_filtered.length / PAGE_SIZE);
        if (_page < maxPage) { _page++; _renderTable(); }
    });
}

// ══════════════════════════════════════════════════════════════════
//  LOAD DATA
// ══════════════════════════════════════════════════════════════════
async function _loadLeaderboard() {
    _showLoading(true);
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.LEADERBOARD);
        const { data, error } = await Api.parse(res);

        if (error || !data) { _showEmpty('Leaderboard not available'); return; }

        _allEntries = Array.isArray(data)
            ? data
            : (data.results ?? data.leaderboard ?? data.data ?? []);

        if (!_allEntries.length) {
            _showEmpty('No leaderboard data yet. It will appear after results are published.');
            return;
        }

        // Assign synthetic ranks if not provided
        _allEntries = _allEntries.map((e, i) => ({
            ...e,
            _rank: e.rank ?? e.position ?? (i + 1),
        }));

        // Find current user
        _myIndex = _allEntries.findIndex(e => _isMe(e));

        _showLoading(false);
        _renderMyRankBanner();
        _renderPodium();
        _applyFilters();
    } catch (err) {
        console.error('[leaderboard]', err);
        _showEmpty('Failed to load leaderboard');
    }
}

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
//  MY RANK BANNER
// ══════════════════════════════════════════════════════════════════
function _renderMyRankBanner() {
    const banner = document.getElementById('myRankBanner');
    if (!banner || _myIndex === -1) return;

    const e     = _allEntries[_myIndex];
    const name  = _nameOf(e);
    const score = _scoreOf(e);
    const rank  = e._rank;
    const total = e.total_exams ?? e.exam_count ?? '—';
    const best  = e.best_score ?? e.highest_score ?? null;
    const avatar= `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff&size=80`;

    const rankLabel = rank === 1 ? '🥇 1st Place'
                    : rank === 2 ? '🥈 2nd Place'
                    : rank === 3 ? '🥉 3rd Place'
                    : `#${rank}`;

    const el = document.getElementById('myRankAvatar');
    if (el) el.src = avatar;
    _setText('myRankName',  name);
    _setText('myRankNum',   '#' + rank);
    _setText('myRankScore', score != null ? Math.round(score) + '%' : '—');
    _setText('myRankTotal', total);
    const badgeEl = document.getElementById('myRankBadge');
    if (badgeEl) badgeEl.textContent = rankLabel;

    banner.classList.remove('hidden');
}

// ══════════════════════════════════════════════════════════════════
//  PODIUM  (top 3)
// ══════════════════════════════════════════════════════════════════
function _renderPodium() {
    const wrap = document.getElementById('podiumWrap');
    if (!wrap || _allEntries.length < 1) { wrap?.classList.add('hidden'); return; }

    const top3 = _allEntries.slice(0, 3);
    // Arrange: 2nd | 1st | 3rd (classic podium order)
    const order = [top3[1], top3[0], top3[2]].filter(Boolean);
    const meta  = [
        { pos: 2, cls: 'silver', avCls: 'silver-av', platCls: 'silver', crown: false, medal: '2' },
        { pos: 1, cls: 'gold',   avCls: 'gold-av',   platCls: 'gold',   crown: true,  medal: '1' },
        { pos: 3, cls: 'bronze', avCls: 'bronze-av', platCls: 'bronze', crown: false, medal: '3' },
    ];
    const metaMap = { 1: meta[1], 2: meta[0], 3: meta[2] };

    wrap.innerHTML = `<div class="podium-stage">${order.map(e => {
        const rank = e._rank;
        const m    = metaMap[rank] || meta[2];
        const name = _nameOf(e);
        const score= _scoreOf(e);
        const av   = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${rank===1?'f59e0b':rank===2?'94a3b8':'b45309'}&color=fff&size=80`;
        const isMe = _isMe(e);

        return `
        <div class="podium-slot">
            <div class="pod-avatar-wrap">
                ${m.crown ? `<span class="pod-crown">👑</span>` : ''}
                <img src="${av}" alt="${_esc(name)}" class="pod-avatar ${m.avCls}">
                <span class="pod-medal ${m.cls}">${m.medal}</span>
            </div>
            <div class="pod-name">${_esc(name)}${isMe ? '<span class="lb-me-chip">You</span>' : ''}</div>
            <div class="pod-score">${score != null ? Math.round(score) + '%' : '—'}</div>
            <div class="pod-platform ${m.platCls}">
                <span class="pod-rank-num">${rank}</span>
            </div>
        </div>`;
    }).join('')}</div>`;
}

// ══════════════════════════════════════════════════════════════════
//  FILTER + SEARCH
// ══════════════════════════════════════════════════════════════════
function _applyFilters() {
    let data = [..._allEntries];

    // Tab filter (week / month — filter by last_active or created_at if available)
    if (_tab !== 'all') {
        const days   = _tab === 'week' ? 7 : 30;
        const cutoff = Date.now() - days * 86_400_000;
        const filtered = data.filter(e => {
            const d = new Date(e.last_active || e.updated_at || e.created_at || 0).getTime();
            return d >= cutoff;
        });
        // Only apply if backend returns date fields; otherwise keep all
        if (filtered.length > 0) data = filtered;
    }

    // Search
    if (_searchQuery) {
        data = data.filter(e =>
            _nameOf(e).toLowerCase().includes(_searchQuery) ||
            (e.username || '').toLowerCase().includes(_searchQuery)
        );
    }

    _filtered = data;
    _page     = 1;
    _renderTable();
}

// ══════════════════════════════════════════════════════════════════
//  RENDER TABLE
// ══════════════════════════════════════════════════════════════════
function _renderTable() {
    const card    = document.getElementById('lbTableCard');
    const rowsEl  = document.getElementById('lbRows');
    const countEl = document.getElementById('lbCountTxt');
    if (!card || !rowsEl) return;

    if (!_filtered.length) {
        card.classList.add('hidden');
        _showEmpty(_searchQuery ? `No results for "${_searchQuery}"` : 'No data for this period');
        return;
    }

    document.getElementById('lbEmpty')?.classList.add('hidden');
    card.classList.remove('hidden');

    // Count text
    if (countEl) countEl.textContent = `${_filtered.length} student${_filtered.length !== 1 ? 's' : ''}`;

    // Paginate
    const start   = (_page - 1) * PAGE_SIZE;
    const slice   = _filtered.slice(start, start + PAGE_SIZE);
    const maxPage = Math.ceil(_filtered.length / PAGE_SIZE);
    const maxScore = Math.max(..._filtered.map(e => _scoreOf(e) ?? 0));

    rowsEl.innerHTML = slice.map((e, i) => {
        const globalI = start + i;
        const rank    = e._rank;
        const name    = _nameOf(e);
        const score   = _scoreOf(e);
        const best    = e.best_score ?? e.highest_score ?? score;
        const total   = e.total_exams ?? e.exam_count ?? '—';
        const pct     = score != null ? Math.round(score) : 0;
        const isMe    = _isMe(e);
        const av      = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${_avatarBg(globalI)}&color=fff&size=60`;

        const rankCls = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : 'normal';
        const barCls  = pct >= 75 ? 'top-fill' : pct >= 50 ? '' : 'mid-fill';
        const scoreCls= pct >= 75 ? 'top' : '';
        const barW    = maxScore > 0 ? Math.round((pct / maxScore) * 100) : pct;

        return `
        <div class="lb-row${isMe ? ' is-me' : ''}" style="animation-delay:${Math.min(i * 0.04, 0.4)}s">
            <div class="lb-rank-cell">
                <span class="rank-badge ${rankCls}">${rank}</span>
            </div>
            <div class="lb-student-cell">
                <img src="${av}" alt="${_esc(name)}" class="lb-avatar">
                <span class="lb-student-name">
                    ${_esc(name)}${isMe ? '<span class="lb-me-chip">You</span>' : ''}
                </span>
            </div>
            <div class="lb-score-cell ${scoreCls}">
                ${score != null ? Math.round(score) + '%' : '—'}
            </div>
            <div class="lb-exams-cell">${total}</div>
            <div class="lb-best-cell">
                ${best != null ? (typeof best === 'number' ? Math.round(best) + '%' : best) : '—'}
            </div>
            <div class="lb-bar-cell">
                <div class="lb-bar-track">
                    <div class="lb-bar-fill ${barCls}" data-w="${barW}" style="width:0%"></div>
                </div>
                <span class="lb-bar-pct">${pct}%</span>
            </div>
        </div>`;
    }).join('');

    // Animate bars on next frame
    requestAnimationFrame(() =>
        rowsEl.querySelectorAll('.lb-bar-fill[data-w]').forEach(el => {
            el.style.width = el.dataset.w + '%';
        })
    );

    // Pagination
    _updatePagination(maxPage);
}

function _updatePagination(maxPage) {
    const pag     = document.getElementById('lbPagination');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const pageInfo= document.getElementById('pageInfo');

    if (!pag) return;
    pag.classList.toggle('hidden', maxPage <= 1);
    if (prevBtn) prevBtn.disabled = _page <= 1;
    if (nextBtn) nextBtn.disabled = _page >= maxPage;
    if (pageInfo) pageInfo.textContent = `Page ${_page} of ${maxPage}`;
}

// ══════════════════════════════════════════════════════════════════
//  UI STATE HELPERS
// ══════════════════════════════════════════════════════════════════
function _showLoading(show) {
    document.getElementById('lbLoading')?.classList.toggle('hidden', !show);
    if (show) {
        document.getElementById('lbTableCard')?.classList.add('hidden');
        document.getElementById('lbEmpty')?.classList.add('hidden');
    }
}

function _showEmpty(msg) {
    _showLoading(false);
    document.getElementById('lbTableCard')?.classList.add('hidden');
    const el = document.getElementById('lbEmpty');
    if (!el) return;
    el.classList.remove('hidden');
    const p = el.querySelector('p');
    if (p) p.textContent = msg;
}

// ══════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════
function _isMe(e) {
    if (!_me) return false;
    const myId = _me.id != null ? String(_me.id) : null;
    const entryStudentId = e.student_id != null ? String(e.student_id) : null;
    const entryUserId = e.user_id != null ? String(e.user_id) : null;
    return (
        (myId && (entryStudentId === myId || entryUserId === myId)) ||
        (_me.username && e.username === _me.username) ||
        (_me.email    && e.email === _me.email)
    );
}

function _nameOf(e) {
    return e.name || e.full_name || e.student_name || e.username || e.display_name || 'Student';
}

function _scoreOf(e) {
    const s = e.average_score ?? e.avg_score ?? e.total_score ?? e.score ?? e.points ?? e.total_points ?? null;
    return s != null ? parseFloat(s) : null;
}

const _BG_COLORS = [
    '6366f1','8b5cf6','ec4899','ef4444',
    'f59e0b','22c55e','14b8a6','0ea5e9',
    '64748b','a78bfa','f97316','84cc16',
];
function _avatarBg(i) { return _BG_COLORS[i % _BG_COLORS.length]; }

function _setText(id, val) {
    const el = document.getElementById(id); if (el) el.textContent = String(val ?? '');
}

function _esc(s) {
    return String(s ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
