/**
 * TestVerse — Student Analytics Page
 *
 * Endpoints (all GET, from config.js):
 *   CONFIG.ENDPOINTS.ANALYTICS          /api/v1/auth/analytics/
 *   CONFIG.ENDPOINTS.EXAMS_MY_RESULTS   /api/v1/exams/my-results/
 *   CONFIG.ENDPOINTS.BADGES             /api/v1/auth/badges/
 *   CONFIG.ENDPOINTS.POINTS             /api/v1/auth/points/
 *   CONFIG.ENDPOINTS.NOTIF_COUNT        /api/v1/auth/notifications/count/
 *
 * Analytics response fields (from dashboard.js usage):
 *   passed_exams | pass_count, failed_exams | fail_count
 *   total_exams  | total, average_score | avg_score
 *   by_subject   | category_breakdown  → [{ subject, avg_score, count }]
 *   streak, best_score, total_questions_answered, ...
 *
 * my-results response fields:
 *   exam_title | exam.title, obtained_marks | obtained_score | score
 *   total_marks | total_score, passing_marks, submitted_at | created_at
 *   time_taken_seconds, exam_type | exam.exam_type, is_pending | status
 */
'use strict';

// ══════════════════════════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════════════════════════
const TYPE_COLORS = [
    '#6366f1','#22c55e','#f59e0b','#ef4444',
    '#14b8a6','#8b5cf6','#ec4899','#0ea5e9',
];
const CIRC = 2 * Math.PI * 50;  // r=50  donut circumference

// ══════════════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════════════
let _analytics = null;
let _results   = [];
let _trendMode = 'line';
let _period    = 'all';    // 'all' | '7' | '30' | '90'

// ══════════════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireAuth()) return;
    _initSidebar();
    _populateUser();
    _wireControls();
    await _loadAll();
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
        overlay?.classList.remove('show');
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
        const el = document.getElementById(id); if (el) el.src = avatar;
    });
    _setText('analyticsSubtitle', `${name}'s performance overview`);
}

// ══════════════════════════════════════════════════════════════════
//  CONTROLS WIRING
// ══════════════════════════════════════════════════════════════════
function _wireControls() {
    document.getElementById('refreshBtn')?.addEventListener('click', _loadAll);

    // Period select
    document.getElementById('periodSelect')?.addEventListener('change', e => {
        _period = e.target.value;
        _applyPeriodAndRedraw();
    });

    // Trend line/bar toggle
    document.querySelectorAll('.an-tab-btn[data-chart]').forEach(btn =>
        btn.addEventListener('click', () => {
            document.querySelectorAll('.an-tab-btn[data-chart]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _trendMode = btn.dataset.chart === 'trend-bar' ? 'bar' : 'line';
            _drawTrend(_getFilteredResults());
        })
    );
}

// ══════════════════════════════════════════════════════════════════
//  LOAD ALL DATA
// ══════════════════════════════════════════════════════════════════
async function _loadAll() {
    await Promise.allSettled([
        _loadAnalytics(),
        _loadResults(),
        _loadBadges(),
        _loadPoints(),
        _loadNotifCount(),
    ]);
}

// ── Analytics endpoint ─────────────────────────────────────────────
async function _loadAnalytics() {
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.ANALYTICS);
        const { data, error } = await Api.parse(res);
        if (!error && data) _analytics = data;
    } catch { /* use results fallback */ }
}

// ── Results endpoint (main data source for charts) ─────────────────
async function _loadResults() {
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.EXAMS_MY_RESULTS);
        const { data, error } = await Api.parse(res);
        if (!error && data) {
            _results = Array.isArray(data) ? data : (data.results ?? []);
        }
    } catch { _results = []; }

    // After both analytics + results loaded, render everything
    _renderAll();
}

// ── Badges ─────────────────────────────────────────────────────────
async function _loadBadges() {
    const wrap    = document.getElementById('badgesWrap');
    const loading = document.getElementById('badgesLoading');
    if (!wrap) return;
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.BADGES);
        const { data, error } = await Api.parse(res);
        loading?.remove();
        if (error || !data) { wrap.innerHTML = _badgeEmpty('Could not load badges'); return; }
        const badges = Array.isArray(data) ? data : (data.results ?? data.badges ?? []);
        _setText('badgeCountChip', badges.length || '0');
        if (!badges.length) { wrap.innerHTML = _badgeEmpty('No badges yet — keep attempting exams!'); return; }
        wrap.innerHTML = badges.slice(0, 12).map(b => {
            const icon  = b.icon || 'fas fa-medal';
            const name  = b.name || b.badge_name || 'Badge';
            const desc  = b.description || '';
            const color = b.color || '#6366f1';
            return `<div class="badge-item" title="${_esc(desc)}">
                <i class="${_esc(icon)}" style="color:${_esc(color)}"></i>
                <span class="badge-name">${_esc(name)}</span>
                ${desc ? `<span class="badge-desc">${_esc(desc)}</span>` : ''}
            </div>`;
        }).join('');
    } catch {
        loading?.remove();
        wrap.innerHTML = _badgeEmpty('Failed to load badges');
    }
}
function _badgeEmpty(msg) {
    return `<div class="badge-empty"><i class="fas fa-medal"></i><span>${_esc(msg)}</span></div>`;
}

// ── Points ─────────────────────────────────────────────────────────
async function _loadPoints() {
    const wrap    = document.getElementById('pointsWrap');
    const loading = document.getElementById('pointsLoading');
    if (!wrap) return;
    try {
        const res = await Api.get(CONFIG.ENDPOINTS.POINTS);
        const { data, error } = await Api.parse(res);
        loading?.remove();
        if (error || !data) { _renderPointsFallback(wrap); return; }
        _renderPoints(wrap, data);
    } catch {
        loading?.remove();
        _renderPointsFallback(wrap);
    }
}

function _renderPoints(wrap, data) {
    const total     = data.total_points ?? data.points ?? data.score ?? 0;
    const streak    = data.current_streak ?? data.streak ?? 0;
    const best_st   = data.best_streak ?? data.longest_streak ?? 0;
    const rank      = data.rank ?? data.global_rank ?? null;
    const next_lvl  = data.next_level_points ?? data.points_to_next_level ?? null;
    const level     = data.level ?? data.current_level ?? null;
    const prog_pct  = next_lvl && total ? Math.min(100, Math.round((total / next_lvl) * 100)) : 0;

    wrap.innerHTML = `
    <div class="points-hero">
        <div class="ph-icon"><i class="fas fa-star"></i></div>
        <div class="ph-body">
            <span class="ph-val">${_fmt(total)}</span>
            <span class="ph-label">Total Points${level ? ' · Level ' + level : ''}</span>
        </div>
    </div>
    <div class="streak-row">
        <div class="streak-item fire">
            <span class="streak-val">${streak}</span>
            <span class="streak-lbl">🔥 Streak</span>
        </div>
        <div class="streak-item">
            <span class="streak-val">${best_st}</span>
            <span class="streak-lbl">Best Streak</span>
        </div>
        ${rank != null ? `<div class="streak-item">
            <span class="streak-val">#${rank}</span>
            <span class="streak-lbl">Global Rank</span>
        </div>` : ''}
    </div>
    ${next_lvl ? `
    <div class="points-prog-wrap">
        <div class="pp-labels">
            <span>${_fmt(total)} pts</span>
            <span>Next level: ${_fmt(next_lvl)} pts</span>
        </div>
        <div class="pp-track">
            <div class="pp-fill" data-w="${prog_pct}" style="width:0%"></div>
        </div>
    </div>` : ''}`;

    requestAnimationFrame(() => {
        wrap.querySelector('.pp-fill[data-w]')?.style &&
            (wrap.querySelector('.pp-fill[data-w]').style.width = prog_pct + '%');
    });
}

function _renderPointsFallback(wrap) {
    // Build from results data
    const total = _results.length * 10; // rough fallback
    const streak = _analytics?.streak ?? 0;
    wrap.innerHTML = `
    <div class="points-hero">
        <div class="ph-icon"><i class="fas fa-star"></i></div>
        <div class="ph-body">
            <span class="ph-val">${_fmt(total)}</span>
            <span class="ph-label">Estimated Points</span>
        </div>
    </div>
    <div class="streak-row">
        <div class="streak-item fire">
            <span class="streak-val">${streak}</span>
            <span class="streak-lbl">🔥 Streak</span>
        </div>
    </div>`;
}

// ── Notif count ────────────────────────────────────────────────────
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
//  MAIN RENDER ORCHESTRATOR
// ══════════════════════════════════════════════════════════════════
function _renderAll() {
    const filtered = _getFilteredResults();
    _renderKPIs(filtered);
    _drawTrend(filtered);
    _drawDonut(filtered);
    _renderSubjectBars(filtered);
    _renderTimeBars(filtered);
    _renderTypeBreakdown(filtered);
    _renderAttemptsTable(filtered);
}

function _applyPeriodAndRedraw() {
    const filtered = _getFilteredResults();
    _renderKPIs(filtered);
    _drawTrend(filtered);
    _drawDonut(filtered);
    _renderSubjectBars(filtered);
    _renderTimeBars(filtered);
    _renderTypeBreakdown(filtered);
    _renderAttemptsTable(filtered);
}

// ── Period filter ──────────────────────────────────────────────────
function _getFilteredResults() {
    if (_period === 'all') return _results;
    const days = parseInt(_period, 10);
    const cutoff = Date.now() - days * 86_400_000;
    return _results.filter(r => {
        const d = new Date(r.submitted_at || r.created_at || 0).getTime();
        return d >= cutoff;
    });
}

// ══════════════════════════════════════════════════════════════════
//  KPI CARDS
// ══════════════════════════════════════════════════════════════════
function _renderKPIs(results) {
    const grid = document.getElementById('kpiGrid');
    if (!grid) return;

    const total    = results.length;
    const scored   = results.filter(r => _scoreOf(r) != null);
    const passed   = scored.filter(r => _statusOf(r) === 'pass').length;
    const failed   = scored.filter(r => _statusOf(r) === 'fail').length;

    const scores   = scored.map(r => _pctOf(r)).filter(v => v != null);
    const avg      = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : null;
    const best     = scores.length ? Math.round(Math.max(...scores)) : null;
    const passRate = total > 0 ? Math.round(((passed)/Math.max(scored.length,1))*100) : 0;

    // From analytics endpoint (may override)
    const totalQ   = _analytics?.total_questions_answered ?? _analytics?.questions_answered ?? null;
    const streak   = _analytics?.streak ?? _analytics?.current_streak ?? null;

    const cards = [
        { icon: 'fas fa-clipboard-list', cls: 'ki-violet',  val: total,                    lbl: 'Total Attempted' },
        { icon: 'fas fa-check-circle',   cls: 'ki-success', val: passed,                   lbl: 'Passed' },
        { icon: 'fas fa-times-circle',   cls: 'ki-danger',  val: failed,                   lbl: 'Failed' },
        { icon: 'fas fa-percentage',     cls: 'ki-blue',    val: avg != null ? avg+'%':'—', lbl: 'Avg Score' },
        { icon: 'fas fa-trophy',         cls: 'ki-amber',   val: best != null ? best+'%':'—',lbl: 'Best Score' },
        ...(passRate != null ? [{ icon: 'fas fa-chart-pie', cls: 'ki-teal', val: passRate+'%', lbl: 'Pass Rate' }] : []),
        ...(totalQ   != null ? [{ icon: 'fas fa-question', cls: 'ki-purple', val: _fmt(totalQ), lbl: 'Questions Answered' }] : []),
        ...(streak   != null ? [{ icon: 'fas fa-fire',     cls: 'ki-amber', val: streak, lbl: 'Current Streak' }] : []),
    ].slice(0, 5);

    grid.innerHTML = cards.map(c => `
    <div class="kpi-card">
        <div class="kpi-icon ${c.cls}"><i class="${c.icon}"></i></div>
        <div class="kpi-body">
            <span class="kpi-val">${c.val}</span>
            <span class="kpi-lbl">${c.lbl}</span>
        </div>
    </div>`).join('');
}

// ══════════════════════════════════════════════════════════════════
//  SCORE TREND CHART (pure SVG, no library)
// ══════════════════════════════════════════════════════════════════
function _drawTrend(results) {
    const svg    = document.getElementById('trendChart');
    const empty  = document.getElementById('trendEmpty');
    const labEl  = document.getElementById('trendLabels');
    const loading= document.getElementById('trendLoading');
    if (!svg) return;

    loading?.classList.add('hidden');

    const sorted = [...results]
        .filter(r => _pctOf(r) != null)
        .sort((a,b) => new Date(a.submitted_at||a.created_at||0) - new Date(b.submitted_at||b.created_at||0))
        .slice(-20);

    if (sorted.length < 2) {
        svg.classList.add('hidden');
        empty?.classList.remove('hidden');
        if (labEl) labEl.innerHTML = '';
        return;
    }
    svg.classList.remove('hidden');
    empty?.classList.add('hidden');

    const W = 700, H = 200, PAD_L = 36, PAD_R = 12, PAD_T = 14, PAD_B = 10;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width',  '100%');
    svg.setAttribute('height', '220');

    const vals   = sorted.map(r => _pctOf(r));
    const minV   = Math.max(0, Math.min(...vals) - 10);
    const maxV   = Math.min(100, Math.max(...vals) + 10);
    const rangeV = maxV - minV || 1;
    const n      = sorted.length;
    const xStep  = (W - PAD_L - PAD_R) / (n - 1);

    const px = i => PAD_L + i * xStep;
    const py = v => PAD_T + (H - PAD_T - PAD_B) * (1 - (v - minV) / rangeV);

    const points = sorted.map((r, i) => ({ x: px(i), y: py(_pctOf(r)), val: _pctOf(r), r }));

    let html = `
    <defs>
        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="#6366f1" stop-opacity="0.18"/>
            <stop offset="100%" stop-color="#6366f1" stop-opacity="0.01"/>
        </linearGradient>
    </defs>`;

    // Y-axis grid lines
    [0, 25, 50, 75, 100].forEach(tick => {
        if (tick < minV - 5 || tick > maxV + 5) return;
        const y = py(tick);
        html += `<line class="trend-grid-line" x1="${PAD_L}" y1="${y}" x2="${W-PAD_R}" y2="${y}"/>`;
        html += `<text class="trend-y-label" x="${PAD_L - 4}" y="${y+3}" text-anchor="end">${tick}</text>`;
    });

    if (_trendMode === 'bar') {
        const bw = Math.min(28, xStep * 0.6);
        const botY = py(minV);
        points.forEach(p => {
            const barH = botY - p.y;
            const color = p.val >= 75 ? '#22c55e' : p.val >= 50 ? '#6366f1' : '#ef4444';
            html += `<rect class="trend-bar-rect"
                x="${p.x - bw/2}" y="${p.y}" width="${bw}" height="${Math.max(barH,2)}"
                fill="${color}" rx="3"
                data-val="${Math.round(p.val)}"
                data-name="${_esc(_examName(p.r))}"
            >
                <title>${_esc(_examName(p.r))}: ${Math.round(p.val)}%</title>
            </rect>`;
        });
    } else {
        // Area fill
        const areaD = `M${points[0].x},${py(minV)} ` +
            points.map(p => `L${p.x},${p.y}`).join(' ') +
            ` L${points[points.length-1].x},${py(minV)} Z`;
        html += `<path class="trend-area" d="${areaD}"/>`;

        // Line
        const lineD = points.map((p,i) => `${i===0?'M':'L'}${p.x},${p.y}`).join(' ');
        html += `<path class="trend-line" d="${lineD}"/>`;

        // Dots
        points.forEach(p => {
            const color = p.val >= 75 ? '#22c55e' : p.val >= 50 ? '#6366f1' : '#ef4444';
            html += `<circle class="trend-point"
                cx="${p.x}" cy="${p.y}" r="4" fill="${color}"
                stroke="#fff" stroke-width="2">
                <title>${_esc(_examName(p.r))}: ${Math.round(p.val)}%</title>
            </circle>`;
        });
    }

    svg.innerHTML = html;

    // X-axis labels
    if (labEl) {
        labEl.innerHTML = '';
        const step = Math.max(1, Math.floor(sorted.length / 8));
        sorted.forEach((r, i) => {
            const span = document.createElement('span');
            span.className = 'trend-label';
            span.textContent = (i % step === 0 || i === sorted.length-1)
                ? _shortDate(r.submitted_at || r.created_at)
                : '';
            labEl.appendChild(span);
        });
    }
}

// ══════════════════════════════════════════════════════════════════
//  PASS / FAIL DONUT
// ══════════════════════════════════════════════════════════════════
function _drawDonut(results) {
    const loading  = document.getElementById('donutLoading');
    const chart    = document.getElementById('donutChart');
    const legend   = document.getElementById('donutLegend');
    const pctEl    = document.getElementById('donutPct');
    if (!chart) return;
    loading?.classList.add('hidden');
    chart.classList.remove('hidden');

    const scored   = results.filter(r => _scoreOf(r) != null || _statusOf(r) !== 'pending');
    const pass     = results.filter(r => _statusOf(r) === 'pass').length;
    const fail     = results.filter(r => _statusOf(r) === 'fail').length;
    const pend     = results.filter(r => _statusOf(r) === 'pending').length;
    const total    = results.length || 1;
    const passRate = Math.round((pass / total) * 100);

    const passPct  = (pass / total) * 100;
    const failPct  = (fail / total) * 100;
    const pendPct  = (pend / total) * 100;

    const passArc  = (passPct / 100) * CIRC;
    const failArc  = (failPct / 100) * CIRC;
    const pendArc  = (pendPct / 100) * CIRC;

    const passOffset = 0;
    const failOffset = -(passArc);
    const pendOffset = -(passArc + failArc);

    const set = (id, arc, offset) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.strokeDasharray  = `${arc} ${CIRC - arc}`;
        el.style.strokeDashoffset = offset;
    };
    set('donutPass', passArc, passOffset);
    set('donutFail', failArc, failOffset);
    set('donutPend', pendArc, pendOffset);

    if (pctEl) pctEl.textContent = passRate + '%';

    if (legend) legend.innerHTML = [
        { cls:'pass', label:'Passed',  val: pass },
        { cls:'fail', label:'Failed',  val: fail },
        ...(pend ? [{ cls:'pend', label:'Pending', val: pend }] : []),
    ].map(item => `
    <div class="dl-item">
        <span class="dl-name"><span class="dl-dot ${item.cls}"></span>${item.label}</span>
        <span class="dl-val">${item.val}</span>
    </div>`).join('');
}

// ══════════════════════════════════════════════════════════════════
//  SUBJECT BREAKDOWN BARS
// ══════════════════════════════════════════════════════════════════
function _renderSubjectBars(results) {
    const wrap    = document.getElementById('subjectBars');
    const loading = document.getElementById('subjectLoading');
    if (!wrap) return;
    loading?.remove();

    // Use analytics.by_subject if available, else derive from results
    let subjects = _analytics?.by_subject || _analytics?.category_breakdown || [];

    if (!subjects.length) {
        // Derive from results using exam_type as grouping
        const map = {};
        results.forEach(r => {
            const key   = r.exam_type || r.exam?.exam_type || r.subject || 'General';
            const pct   = _pctOf(r);
            if (pct == null) return;
            if (!map[key]) map[key] = { sum: 0, cnt: 0 };
            map[key].sum += pct; map[key].cnt++;
        });
        subjects = Object.entries(map).map(([name, d]) => ({
            subject: name, avg_score: d.sum / d.cnt, count: d.cnt,
        }));
    }

    if (!subjects.length) {
        wrap.innerHTML = `<div class="chart-loading"><span style="color:#94a3b8">Complete exams to see subject breakdown</span></div>`;
        return;
    }

    subjects = [...subjects].sort((a,b) =>
        (b.avg_score||b.average_score||0) - (a.avg_score||a.average_score||0)
    );

    wrap.innerHTML = subjects.slice(0, 8).map(s => {
        const name  = s.subject || s.category || s.name || 'General';
        const score = Math.round(s.avg_score ?? s.average_score ?? s.score ?? 0);
        const count = s.count ?? s.total ?? '';
        const fillCls = score >= 75 ? 'good' : score >= 50 ? 'mid' : 'bad';
        return `<div class="sb-row">
            <div class="sb-label">
                <span class="sb-meta">
                    ${_esc(name)}
                    ${count ? `<span class="sb-count">(${count})</span>` : ''}
                </span>
                <span>${score}%</span>
            </div>
            <div class="sb-track">
                <div class="sb-fill ${fillCls}" data-w="${score}" style="width:0%"></div>
            </div>
        </div>`;
    }).join('');

    requestAnimationFrame(() =>
        wrap.querySelectorAll('.sb-fill[data-w]').forEach(el => {
            el.style.width = el.dataset.w + '%';
        })
    );
}

// ══════════════════════════════════════════════════════════════════
//  TIME TAKEN BARS
// ══════════════════════════════════════════════════════════════════
function _renderTimeBars(results) {
    const wrap    = document.getElementById('timeBars');
    const loading = document.getElementById('timeLoading');
    if (!wrap) return;
    loading?.remove();

    const timed = results
        .filter(r => r.time_taken_seconds != null)
        .sort((a,b) => new Date(b.submitted_at||b.created_at||0) - new Date(a.submitted_at||a.created_at||0))
        .slice(0, 8);

    if (!timed.length) {
        wrap.innerHTML = `<div class="chart-loading"><span style="color:#94a3b8">No time data available</span></div>`;
        return;
    }

    wrap.innerHTML = timed.map(r => {
        const name     = _examName(r);
        const taken    = r.time_taken_seconds;
        const allowed  = (r.duration ?? r.exam?.duration ?? 60) * 60;
        const pct      = Math.min(100, Math.round((taken / allowed) * 100));
        const takenStr = _fmtDur(taken);
        const allowStr = _fmtDur(allowed);
        const fillColor= pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#6366f1';
        return `<div class="tb-row">
            <div class="tb-label">
                <span class="tb-label-name" title="${_esc(name)}">${_esc(name)}</span>
                <span class="tb-label-time">${takenStr} / ${allowStr}</span>
            </div>
            <div class="tb-track">
                <div class="tb-fill-used" data-w="${pct}" style="width:0%;background:${fillColor}"></div>
            </div>
        </div>`;
    }).join('');

    requestAnimationFrame(() =>
        wrap.querySelectorAll('.tb-fill-used[data-w]').forEach(el => {
            el.style.width = el.dataset.w + '%';
        })
    );
}

// ══════════════════════════════════════════════════════════════════
//  EXAM TYPE BREAKDOWN
// ══════════════════════════════════════════════════════════════════
function _renderTypeBreakdown(results) {
    const wrap    = document.getElementById('typeBreakdown');
    const loading = document.getElementById('typeLoading');
    if (!wrap) return;
    loading?.remove();

    const map = {};
    results.forEach(r => {
        const t = r.exam_type || r.exam?.exam_type || 'General';
        map[t] = (map[t] || 0) + 1;
    });

    const entries = Object.entries(map).sort((a,b) => b[1]-a[1]);
    if (!entries.length) {
        wrap.innerHTML = `<div class="chart-loading"><span style="color:#94a3b8">No data</span></div>`;
        return;
    }

    const max = entries[0][1];
    wrap.innerHTML = entries.slice(0, 8).map(([type, cnt], i) => {
        const pct   = Math.round((cnt / max) * 100);
        const color = TYPE_COLORS[i % TYPE_COLORS.length];
        return `<div class="et-row">
            <span class="et-name" title="${_esc(type)}">${_esc(type)}</span>
            <div class="et-track">
                <div class="et-fill" data-w="${pct}" style="width:0%;background:${color}"></div>
            </div>
            <span class="et-cnt">${cnt}</span>
        </div>`;
    }).join('');

    requestAnimationFrame(() =>
        wrap.querySelectorAll('.et-fill[data-w]').forEach(el => {
            el.style.width = el.dataset.w + '%';
        })
    );
}

// ══════════════════════════════════════════════════════════════════
//  RECENT ATTEMPTS TABLE
// ══════════════════════════════════════════════════════════════════
function _renderAttemptsTable(results) {
    const wrap    = document.getElementById('attemptsTableWrap');
    const loading = document.getElementById('attemptsLoading');
    if (!wrap) return;
    loading?.remove();

    const recent = [...results]
        .sort((a,b) => new Date(b.submitted_at||b.created_at||0) - new Date(a.submitted_at||a.created_at||0))
        .slice(0, 10);

    if (!recent.length) {
        wrap.innerHTML = `
        <table class="attempts-table">
            <tbody><tr class="at-empty-row"><td colspan="7">
                <i class="fas fa-clipboard-list"></i>
                No exam attempts yet
            </td></tr></tbody>
        </table>`;
        return;
    }

    const rows = recent.map(r => {
        const name    = _examName(r);
        const pct     = _pctOf(r);
        const status  = _statusOf(r);
        const score   = _scoreOf(r);
        const total   = r.total_marks ?? r.total_score ?? 100;
        const pctNum  = pct ?? 0;
        const scoreCls= pctNum >= 75 ? 'high' : pctNum >= 50 ? 'mid' : 'low';
        const barColor= pctNum >= 75 ? '#22c55e' : pctNum >= 50 ? '#6366f1' : '#ef4444';
        const type    = r.exam_type || r.exam?.exam_type || '';
        const date    = r.submitted_at || r.created_at;
        const time    = r.time_taken_seconds != null ? _fmtDur(r.time_taken_seconds) : '—';
        const badgeLbl= status === 'pass' ? 'Passed' : status === 'fail' ? 'Failed' : 'Pending';

        return `<tr>
            <td><span class="at-exam-name" title="${_esc(name)}">${_esc(name)}</span></td>
            <td class="at-score-cell ${status !== 'pending' ? scoreCls : ''}">
                ${pct != null ? Math.round(pct) + '%' : '—'}
            </td>
            <td>
                <div class="at-mini-bar">
                    <div class="at-bar-track">
                        <div class="at-bar-fill" style="width:${pct??0}%;background:${barColor};height:100%;border-radius:9999px;"></div>
                    </div>
                    <span style="font-size:.75rem;color:#94a3b8;white-space:nowrap">
                        ${score != null ? score+'/'+total : '—'}
                    </span>
                </div>
            </td>
            <td><span class="at-badge ${status}">${badgeLbl}</span></td>
            <td>${type ? `<span class="at-type-chip">${_esc(type)}</span>` : '—'}</td>
            <td class="at-date">${time}</td>
            <td class="at-date">${date ? _fmtDate(date) : '—'}</td>
        </tr>`;
    }).join('');

    wrap.innerHTML = `
    <table class="attempts-table">
        <thead>
            <tr>
                <th>Exam</th>
                <th>Score %</th>
                <th>Marks</th>
                <th>Result</th>
                <th>Type</th>
                <th>Time Taken</th>
                <th>Date</th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>`;
}

// ══════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════
function _statusOf(r) {
    if (r.is_pending || r.status === 'pending' || r.result_status === 'pending') return 'pending';
    if (r.passed === true  || r.status === 'pass'  || r.result_status === 'pass')  return 'pass';
    if (r.passed === false || r.status === 'fail'  || r.result_status === 'fail')  return 'fail';
    const s = _scoreOf(r), p = r.passing_marks ?? r.passing_score;
    if (s != null && p != null) return s >= p ? 'pass' : 'fail';
    const pct = _pctOf(r);
    if (pct != null) return pct >= 40 ? 'pass' : 'fail';
    return 'pending';
}

function _scoreOf(r) {
    return r.score ?? r.obtained_marks ?? r.obtained_score ?? r.marks_obtained ?? null;
}

function _pctOf(r) {
    if (r.percentage != null) return parseFloat(r.percentage);
    const s = _scoreOf(r);
    const t = r.total_marks ?? r.total_score ?? r.max_marks;
    if (s != null && t && t > 0) return (s / t) * 100;
    return null;
}

function _examName(r) {
    return r.exam_title || r.exam?.title || r.exam_name || r.title || 'Untitled Exam';
}

function _fmt(n) {
    return Number(n).toLocaleString('en-IN');
}

function _fmtDur(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function _fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}

function _shortDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short' });
}

function _setText(id, val) {
    const el = document.getElementById(id); if (el) el.textContent = String(val ?? '');
}

function _esc(s) {
    return String(s ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
