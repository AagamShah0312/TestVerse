/**
 * TestVerse — Staff Analytics Page
 *
 * Overview mode  : aggregate across ALL exams
 *   - KPIs, Pass/Fail donut, Score distribution, Avg per exam line/bar,
 *     Submissions per exam, Exam type pie, Dept bar, Leaderboard
 *
 * Per-exam mode  : exam selected from dropdown
 *   - KPIs from GET STAFF_EXAM_ANALYTICS(id)
 *   - All charts filtered to that exam
 *   - Extra: Top 10 students bar, Percentile band, Comparison table
 */
'use strict';

// ── Chart instances (destroyed & rebuilt on data change) ───────────
const _charts = {};

// ── State ──────────────────────────────────────────────────────────
let _exams       = [];
let _allResults  = {};   // examId → results[]
let _students    = [];
let _leaderboard = [];
let _selectedId  = '';   // '' = overview

// ── Palette ────────────────────────────────────────────────────────
const C = {
    indigo  : '#6366f1',
    blue    : '#3b82f6',
    green   : '#22c55e',
    amber   : '#f59e0b',
    red     : '#ef4444',
    purple  : '#a855f7',
    sky     : '#0ea5e9',
    pink    : '#ec4899',
    teal    : '#14b8a6',
    orange  : '#f97316',
    MULTI   : ['#6366f1','#3b82f6','#22c55e','#f59e0b','#ef4444','#a855f7','#0ea5e9','#ec4899','#14b8a6','#f97316'],
};

// ── Chart.js Global Defaults ───────────────────────────────────────
Chart.defaults.font.family = "Inter, ui-sans-serif, system-ui, sans-serif";
Chart.defaults.font.size   = 12;
Chart.defaults.color       = '#64748b';
Chart.defaults.plugins.legend.display = false;
Chart.defaults.plugins.tooltip.backgroundColor = '#1e293b';
Chart.defaults.plugins.tooltip.padding         = 10;
Chart.defaults.plugins.tooltip.cornerRadius    = 8;
Chart.defaults.plugins.tooltip.titleFont       = { weight:'700', size:12 };
Chart.defaults.animation.duration              = 500;

// ── Boot ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    if (!Auth.requireStaff()) return;
    _initSidebar();
    _initTopbar();
    _initExamSelector();
    document.getElementById('refreshBtn')?.addEventListener('click', _reload);
    await _loadAll();
});

// ── Topbar ─────────────────────────────────────────────────────────
function _initTopbar() {
    const u    = Auth.getUser(); if (!u) return;
    const name = u.name || u.username || 'Staff';
    const av   = _avatar(name);
    _setText('sidebarName', name); _setText('topbarName', name);
    _setImg('sidebarAvatar', av);  _setImg('topbarAvatar', av);
}

// ── Sidebar ────────────────────────────────────────────────────────
function _initSidebar() {
    const sb  = document.getElementById('sidebar');
    const ov  = document.getElementById('sidebarOverlay');
    const o   = () => { sb?.classList.add('open');    ov?.classList.add('show'); };
    const cl  = () => { sb?.classList.remove('open'); ov?.classList.remove('show'); };
    document.getElementById('menuToggle')?.addEventListener('click', o);
    document.getElementById('sidebarClose')?.addEventListener('click', cl);
    ov?.addEventListener('click', cl);
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Logout from TestVerse?')) Auth.logout();
    });
}

// ── Exam Selector ──────────────────────────────────────────────────
function _initExamSelector() {
    document.getElementById('examSelector')?.addEventListener('change', async e => {
        _selectedId = e.target.value;
        _setText('analyticsScopeLabel',
            _selectedId ? `Showing: ${_exams.find(x => String(x.id) === _selectedId)?.title || ''}` : 'Overview across all exams');
        await _buildCharts();
    });
}

// ── Load All Data ──────────────────────────────────────────────────
async function _reload() {
    document.getElementById('analyticsContent').style.display = 'none';
    document.getElementById('pageLoading').style.display      = 'flex';
    _destroyAllCharts();
    await _loadAll();
}

async function _loadAll() {
    try {
        // Parallel: exams + students + leaderboard
        const [examsRes, studentsRes, lbRes] = await Promise.all([
            Api.get(CONFIG.ENDPOINTS.STAFF_EXAMS),
            Api.get(CONFIG.ENDPOINTS.STAFF_STUDENTS),
            Api.get(CONFIG.ENDPOINTS.LEADERBOARD),
        ]);

        const { data: exData }   = await Api.parse(examsRes);
        const { data: stData }   = await Api.parse(studentsRes);
        const { data: lbData }   = await Api.parse(lbRes);

        _exams      = Array.isArray(exData) ? exData : (exData?.results ?? []);
        _students   = Array.isArray(stData) ? stData : (stData?.results ?? []);
        _leaderboard= Array.isArray(lbData) ? lbData : (lbData?.results ?? []);

        // Populate exam selector
        _populateExamSelector();

        // Load results for every exam in parallel (up to 8 at once)
        const chunks = _chunk(_exams, 8);
        for (const ch of chunks) {
            await Promise.all(ch.map(async ex => {
                try {
                    const r = await Api.get(CONFIG.ENDPOINTS.STAFF_EXAM_RESULTS(ex.id));
                    const { data } = await Api.parse(r);
                    _allResults[ex.id] = Array.isArray(data) ? data : (data?.results ?? []);
                } catch { _allResults[ex.id] = []; }
            }));
        }

        await _buildCharts();

    } catch (err) {
        _showAlert('Network error loading analytics.', 'error');
    } finally {
        document.getElementById('pageLoading').style.display      = 'none';
        document.getElementById('analyticsContent').style.display = '';
    }
}

function _populateExamSelector() {
    const sel = document.getElementById('examSelector');
    if (!sel) return;
    // Keep first "All Exams" option
    while (sel.options.length > 1) sel.remove(1);
    _exams.forEach(e => {
        const o = document.createElement('option');
        o.value = e.id; o.textContent = e.title;
        sel.appendChild(o);
    });
}

// ══════════════════════════════════════════════════════════════════
//  BUILD CHARTS
// ══════════════════════════════════════════════════════════════════

async function _buildCharts() {
    _destroyAllCharts();

    const isOverview = !_selectedId;
    document.getElementById('overviewCharts').style.display      = isOverview ? '' : '';
    document.getElementById('submissionsChartWrap').style.display = isOverview ? '' : 'none';
    document.getElementById('leaderboardSection').style.display   = isOverview ? '' : 'none';
    document.getElementById('examDetailSection').style.display    = isOverview ? 'none' : '';

    if (isOverview) {
        _buildOverview();
        _buildLeaderboard();
    } else {
        await _buildExamDetail(_selectedId);
    }
}

// ──────────────────────────────────────────────────────────────────
//  OVERVIEW MODE
// ──────────────────────────────────────────────────────────────────
function _buildOverview() {
    // Flatten all results
    const all = Object.values(_allResults).flat();

    // ── KPIs ──
    const scores     = all.filter(r => r.percentage != null).map(r => parseFloat(r.percentage));
    const passCount  = all.filter(r => r.status === 'pass').length;
    const failCount  = all.filter(r => r.status === 'fail').length;
    const total      = all.length;
    const avg        = scores.length ? (scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
    const highest    = scores.length ? Math.max(...scores) : 0;
    const passRate   = total ? ((passCount/total)*100).toFixed(1) : '—';
    const failRate   = total ? ((failCount/total)*100).toFixed(1) : '—';

    _setText('kpiValExams',    _exams.length);
    _setText('kpiValStudents', _students.length);
    _setText('kpiValAvg',      scores.length ? avg.toFixed(1)+'%' : '—');
    _setText('kpiValPass',     total ? passRate+'%' : '—');
    _setText('kpiValFail',     total ? failRate+'%' : '—');
    _setText('kpiValHighest',  scores.length ? highest.toFixed(1)+'%' : '—');

    // ── Pass / Fail Donut ──
    _buildPassFailDonut(passCount, failCount, total - passCount - failCount);

    // ── Score Distribution ──
    _buildScoreDist(scores);

    // ── Avg Score per Exam ──
    const examLabels   = _exams.map(e => _truncate(e.title, 18));
    const examAvgs     = _exams.map(e => {
        const res = _allResults[e.id] || [];
        const sc  = res.filter(r => r.percentage != null).map(r => parseFloat(r.percentage));
        return sc.length ? +(sc.reduce((a,b)=>a+b,0)/sc.length).toFixed(1) : 0;
    });
    _buildAvgScoreChart(examLabels, examAvgs);
    _initAvgScoreTabs(examLabels, examAvgs);

    // ── Submissions per Exam ──
    const subCounts = _exams.map(e => (_allResults[e.id] || []).length);
    _buildSubmissionsChart(examLabels, subCounts);

    // ── Exam Type Pie ──
    const typeCounts = {};
    _exams.forEach(e => {
        const t = e.exam_type || 'unknown';
        typeCounts[t] = (typeCounts[t] || 0) + 1;
    });
    _buildDoughnutChart('examTypeChart', Object.keys(typeCounts), Object.values(typeCounts), C.MULTI);

    // ── Dept Bar ──
    const deptCounts = {};
    _students.forEach(s => {
        const d = s.department || 'Unknown';
        deptCounts[d] = (deptCounts[d] || 0) + 1;
    });
    const deptLabels = Object.keys(deptCounts).slice(0,10);
    const deptVals   = deptLabels.map(d => deptCounts[d]);
    _buildBarChart('deptChart', deptLabels, deptVals, C.indigo, 'Students', true);
}

// ──────────────────────────────────────────────────────────────────
//  PER-EXAM DETAIL MODE
// ──────────────────────────────────────────────────────────────────
async function _buildExamDetail(examId) {
    const exam    = _exams.find(e => String(e.id) === String(examId));
    const results = _allResults[examId] || [];

    // ── Try fetching detailed analytics from backend ──
    let analytics = null;
    try {
        const r = await Api.get(CONFIG.ENDPOINTS.STAFF_EXAM_ANALYTICS(examId));
        const { data } = await Api.parse(r);
        analytics = data;
    } catch { /* fallback to computed */ }

    const scores     = results.filter(r => r.percentage != null).map(r => parseFloat(r.percentage));
    const total      = analytics?.total_students ?? results.length;
    const passCount  = analytics?.pass_count     ?? results.filter(r => r.status === 'pass').length;
    const failCount  = analytics?.fail_count     ?? results.filter(r => r.status === 'fail').length;
    const avg        = analytics?.average_score  ?? (scores.length ? (scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1) : 0);
    const highest    = analytics?.highest_score  ?? (scores.length ? Math.max(...scores).toFixed(1) : 0);
    const passRate   = total ? ((passCount/total)*100).toFixed(1) : '—';
    const failRate   = total ? ((failCount/total)*100).toFixed(1) : '—';

    _setText('kpiValExams',    1);
    _setText('kpiValStudents', total);
    _setText('kpiValAvg',      avg ? avg+'%' : '—');
    _setText('kpiValPass',     passRate !== '—' ? passRate+'%' : '—');
    _setText('kpiValFail',     failRate !== '—' ? failRate+'%' : '—');
    _setText('kpiValHighest',  highest ? highest+'%' : '—');

    // ── Pass / Fail Donut ──
    _buildPassFailDonut(passCount, failCount, total - passCount - failCount);

    // ── Score Distribution ──
    _buildScoreDist(scores);

    // ── Avg Score per Exam (just this one) ──
    _buildAvgScoreChart([_truncate(exam?.title || 'Exam', 22)], [parseFloat(avg)]);
    _initAvgScoreTabs([_truncate(exam?.title || 'Exam', 22)], [parseFloat(avg)]);

    // ── Top 10 Students ──
    const sorted  = [...results]
        .filter(r => r.percentage != null)
        .sort((a,b) => parseFloat(b.percentage) - parseFloat(a.percentage))
        .slice(0, 10);
    const topNames  = sorted.map(r => _truncate((r.student?.name || r.student?.email || '?'), 16));
    const topScores = sorted.map(r => parseFloat(r.percentage).toFixed(1));
    _buildHBarChart('topStudentsChart', topNames, topScores, C.indigo, '%');

    // ── Percentile Band ──
    const bands = [
        { label:'90-100', count: scores.filter(s=>s>=90).length },
        { label:'75-90',  count: scores.filter(s=>s>=75&&s<90).length },
        { label:'60-75',  count: scores.filter(s=>s>=60&&s<75).length },
        { label:'40-60',  count: scores.filter(s=>s>=40&&s<60).length },
        { label:'0-40',   count: scores.filter(s=>s<40).length },
    ];
    _buildBarChart(
        'percentileChart',
        bands.map(b=>b.label),
        bands.map(b=>b.count),
        [C.green, C.indigo, C.blue, C.amber, C.red],
        'Students'
    );

    // ── Exam Type (just this exam) ──
    const t = exam?.exam_type || 'unknown';
    _buildDoughnutChart('examTypeChart', [t], [1], [C.indigo]);

    // ── Dept breakdown for this exam ──
    const deptMap = {};
    results.forEach(r => {
        const d = r.student?.department || 'Unknown';
        deptMap[d] = (deptMap[d] || 0) + 1;
    });
    _buildBarChart('deptChart', Object.keys(deptMap), Object.values(deptMap), C.blue, 'Students', true);

    // ── Comparison Table ──
    _buildCompTable(results);
}

// ══════════════════════════════════════════════════════════════════
//  CHART BUILDERS
// ══════════════════════════════════════════════════════════════════

function _buildPassFailDonut(pass, fail, pending) {
    _destroyChart('passFailChart');
    const ctx = document.getElementById('passFailChart')?.getContext('2d');
    if (!ctx) return;

    // Legend
    document.getElementById('donutLegend').innerHTML = `
        <span class="legend-item"><span class="legend-dot" style="background:${C.green}"></span>Pass</span>
        <span class="legend-item"><span class="legend-dot" style="background:${C.red}"></span>Fail</span>
        <span class="legend-item"><span class="legend-dot" style="background:#e2e8f0"></span>Pending</span>`;

    _charts['passFailChart'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Pass', 'Fail', 'Pending'],
            datasets:[{
                data: [pass, fail, pending],
                backgroundColor:[C.green, C.red, '#e2e8f0'],
                borderWidth:0, hoverOffset:6,
            }]
        },
        options:{
            cutout:'72%',
            plugins:{
                legend:{ display:false },
                tooltip:{ callbacks:{ label: ctx => ` ${ctx.label}: ${ctx.raw}` }},
            },
            layout:{ padding:8 }
        }
    });

    // Footer
    const total = pass + fail + pending;
    document.getElementById('passFailFooter').innerHTML = total
        ? `<span style="font-size:.8rem;color:#64748b;font-weight:600;">Pass rate: <strong style="color:${C.green}">${((pass/total)*100).toFixed(1)}%</strong> &nbsp;·&nbsp; ${total} total submissions</span>`
        : '';
}

function _buildScoreDist(scores) {
    _destroyChart('scoreDistChart');
    const ctx = document.getElementById('scoreDistChart')?.getContext('2d');
    if (!ctx) return;

    const ranges = [
        { label:'0-10',  min:0,  max:10  },
        { label:'10-20', min:10, max:20  },
        { label:'20-30', min:20, max:30  },
        { label:'30-40', min:30, max:40  },
        { label:'40-50', min:40, max:50  },
        { label:'50-60', min:50, max:60  },
        { label:'60-70', min:60, max:70  },
        { label:'70-80', min:70, max:80  },
        { label:'80-90', min:80, max:90  },
        { label:'90-100',min:90, max:101 },
    ];
    const counts = ranges.map(r => scores.filter(s => s >= r.min && s < r.max).length);
    const colors = ranges.map(r => r.min >= 60 ? C.green : r.min >= 40 ? C.amber : C.red);

    _charts['scoreDistChart'] = new Chart(ctx, {
        type:'bar',
        data:{
            labels: ranges.map(r=>r.label),
            datasets:[{
                label:'Students',
                data: counts,
                backgroundColor: colors,
                borderRadius:5, borderSkipped:false,
            }]
        },
        options:{
            responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{display:false} },
            scales:{
                x:{ grid:{display:false}, ticks:{font:{size:11}} },
                y:{ beginAtZero:true, ticks:{stepSize:1, precision:0},
                    grid:{ color:'#f1f5f9' }},
            }
        }
    });
}

function _buildAvgScoreChart(labels, data, type='bar') {
    _destroyChart('avgScoreChart');
    const ctx = document.getElementById('avgScoreChart')?.getContext('2d');
    if (!ctx) return;

    if (type === 'line') {
        _charts['avgScoreChart'] = new Chart(ctx, {
            type:'line',
            data:{
                labels,
                datasets:[{
                    label:'Avg Score %',
                    data,
                    borderColor:C.indigo, backgroundColor:'rgba(99,102,241,.1)',
                    fill:true, tension:.4, pointRadius:5, pointHoverRadius:7,
                    pointBackgroundColor:'#fff', pointBorderColor:C.indigo, pointBorderWidth:2,
                }]
            },
            options:{
                responsive:true, maintainAspectRatio:false,
                plugins:{ legend:{display:false}, tooltip:{callbacks:{label: c=>' '+c.raw+'%'}}},
                scales:{
                    x:{ grid:{display:false} },
                    y:{ min:0, max:100, grid:{color:'#f1f5f9'}, ticks:{callback:v=>v+'%'} }
                }
            }
        });
    } else {
        _charts['avgScoreChart'] = new Chart(ctx, {
            type:'bar',
            data:{
                labels,
                datasets:[{
                    label:'Avg Score %',
                    data,
                    backgroundColor: data.map(v => v >= 60 ? C.indigo : C.amber),
                    borderRadius:6, borderSkipped:false,
                }]
            },
            options:{
                responsive:true, maintainAspectRatio:false,
                plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>' '+c.raw+'%'}}},
                scales:{
                    x:{ grid:{display:false}, ticks:{maxRotation:30} },
                    y:{ min:0, max:100, grid:{color:'#f1f5f9'}, ticks:{callback:v=>v+'%'} }
                }
            }
        });
    }
}

function _initAvgScoreTabs(labels, data) {
    document.querySelectorAll('#avgScoreTabs .ctab').forEach(tab =>
        tab.addEventListener('click', () => {
            document.querySelectorAll('#avgScoreTabs .ctab').forEach(t=>t.classList.remove('active'));
            tab.classList.add('active');
            _buildAvgScoreChart(labels, data, tab.dataset.view);
        })
    );
}

function _buildSubmissionsChart(labels, data) {
    _destroyChart('submissionsChart');
    const ctx = document.getElementById('submissionsChart')?.getContext('2d');
    if (!ctx) return;

    _charts['submissionsChart'] = new Chart(ctx, {
        type:'bar',
        data:{
            labels,
            datasets:[{
                label:'Submissions',
                data,
                backgroundColor:C.sky,
                borderRadius:6, borderSkipped:false,
            }]
        },
        options:{
            responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{display:false} },
            scales:{
                x:{ grid:{display:false}, ticks:{maxRotation:30} },
                y:{ beginAtZero:true, ticks:{stepSize:1, precision:0}, grid:{color:'#f1f5f9'} }
            }
        }
    });
}

function _buildDoughnutChart(canvasId, labels, data, colors) {
    _destroyChart(canvasId);
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;
    _charts[canvasId] = new Chart(ctx, {
        type:'doughnut',
        data:{
            labels,
            datasets:[{ data, backgroundColor:colors, borderWidth:0, hoverOffset:6 }]
        },
        options:{
            cutout:'65%',
            plugins:{
                legend:{ display:true, position:'bottom',
                    labels:{ boxWidth:10, padding:14, font:{size:11}, color:'#475569' }},
                tooltip:{ callbacks:{ label: c => ` ${c.label}: ${c.raw}` }}
            },
            layout:{ padding:8 }
        }
    });
}

function _buildBarChart(canvasId, labels, data, color, labelName, horizontal=false) {
    _destroyChart(canvasId);
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    const bg = Array.isArray(color) ? color : labels.map((_,i)=>C.MULTI[i%C.MULTI.length]);

    _charts[canvasId] = new Chart(ctx, {
        type:'bar',
        data:{
            labels,
            datasets:[{ label:labelName, data, backgroundColor:bg, borderRadius:5, borderSkipped:false }]
        },
        options:{
            indexAxis: horizontal ? 'y' : 'x',
            responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{display:false} },
            scales:{
                x:{ grid:{ color: horizontal ? '#f1f5f9' : 'transparent' }, beginAtZero:true,
                    ticks:{ precision:0 } },
                y:{ grid:{ color: horizontal ? 'transparent' : '#f1f5f9' }, ticks:{font:{size:11}} }
            }
        }
    });
}

function _buildHBarChart(canvasId, labels, data, color, unit='') {
    _destroyChart(canvasId);
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    _charts[canvasId] = new Chart(ctx, {
        type:'bar',
        data:{
            labels,
            datasets:[{
                label:'Score',
                data,
                backgroundColor: data.map(v => parseFloat(v) >= 60 ? C.indigo : C.amber),
                borderRadius:5, borderSkipped:false,
            }]
        },
        options:{
            indexAxis:'y',
            responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>` ${c.raw}${unit}`}}},
            scales:{
                x:{ min:0, max:100, grid:{color:'#f1f5f9'}, ticks:{callback:v=>v+unit} },
                y:{ grid:{display:false} }
            }
        }
    });
}

// ── Comparison Table ───────────────────────────────────────────────
function _buildCompTable(results) {
    const sorted = [...results].sort((a,b) => parseFloat(b.percentage||0) - parseFloat(a.percentage||0));
    let _filtered = sorted;

    function _render(list) {
        const tbody = document.getElementById('compTableBody');
        if (!tbody) return;
        tbody.innerHTML = list.map((r, idx) => {
            const s       = r.student || {};
            const name    = s.name || s.username || s.email || '—';
            const pct     = parseFloat(r.percentage || 0).toFixed(1);
            const fill    = Math.min(100, Math.max(0, parseFloat(pct)));
            const passC   = r.status === 'pass' ? 'pass' : r.status === 'fail' ? 'fail' : 'pending';
            const gradC   = r.grading_status || 'pending';
            const gradLabel={ fully_graded:'Graded', partially_graded:'Partial', pending:'Pending' };

            return `<tr>
                <td style="color:#94a3b8;font-weight:700;">${idx+1}</td>
                <td>
                    <div style="display:flex;align-items:center;gap:.625rem;">
                        <img src="${_avatar(name)}" style="width:28px;height:28px;border-radius:50%;border:2px solid rgba(99,102,241,.2);" alt="">
                        <div>
                            <div style="font-weight:600;color:#1e293b;font-size:.875rem;">${_esc(name)}</div>
                            <div style="font-size:.75rem;color:#94a3b8;">${_esc(s.email||'')}</div>
                        </div>
                    </div>
                </td>
                <td style="font-weight:700;color:#1e293b;">${parseFloat(r.obtained_marks||0).toFixed(1)} / ${parseFloat(r.total_marks||0).toFixed(1)}</td>
                <td style="font-weight:700;color:#6366f1;">${pct}%</td>
                <td><span class="s-badge ${passC}">${passC}</span></td>
                <td><span class="g-badge ${gradC}">${gradLabel[gradC]||gradC}</span></td>
                <td>
                    <div class="inline-bar">
                        <div class="inline-bar-track">
                            <div class="inline-bar-fill ${passC}" style="width:${fill}%"></div>
                        </div>
                        <span class="inline-bar-pct">${pct}%</span>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    _render(_filtered);

    // Search
    let timer;
    const search = document.getElementById('compSearch');
    if (search) {
        search.value = '';
        search.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const q = search.value.toLowerCase();
                _filtered = q
                    ? sorted.filter(r => {
                        const s = r.student || {};
                        return (s.name||s.email||s.username||'').toLowerCase().includes(q);
                      })
                    : sorted;
                _render(_filtered);
            }, 200);
        });
    }
}

// ── Leaderboard ────────────────────────────────────────────────────
function _buildLeaderboard() {
    const wrap = document.getElementById('leaderboardList');
    if (!wrap) return;
    if (!_leaderboard.length) {
        wrap.innerHTML = '<p style="color:#94a3b8;font-size:.875rem;padding:1rem;text-align:center;">No leaderboard data yet.</p>';
        return;
    }
    const medals = ['🥇','🥈','🥉'];
    const classes = ['gold','silver','bronze'];
    wrap.innerHTML = _leaderboard.slice(0,10).map((u,i) => {
        const name = u.name || u.username || '—';
        const cls  = i < 3 ? classes[i] : '';
        const rank = i < 3
            ? `<span class="lb-rank ${cls} lb-rank-medal">${medals[i]}</span>`
            : `<span class="lb-rank">${u.rank || i+1}</span>`;
        return `
        <div class="lb-row ${cls}">
            ${rank}
            <img class="lb-avatar" src="${_avatar(name)}" alt="${_esc(name)}">
            <div class="lb-info">
                <div class="lb-name">${_esc(name)}</div>
                <div class="lb-dept">${_esc(u.department||'—')}</div>
            </div>
            <div>
                <div class="lb-points">${u.total_points ?? 0}</div>
                <span class="lb-points-lbl">pts</span>
            </div>
        </div>`;
    }).join('');
}

// ══════════════════════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════════════════════

function _destroyChart(id) {
    if (_charts[id]) { try { _charts[id].destroy(); } catch{} delete _charts[id]; }
}
function _destroyAllCharts() { Object.keys(_charts).forEach(_destroyChart); }

function _chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i+size));
    return out;
}
function _truncate(s, n) { return s?.length > n ? s.slice(0,n)+'…' : (s||''); }

let _alertTimer;
function _showAlert(msg, type='error') {
    const w = document.getElementById('alertContainer'); if (!w) return;
    const icons = {error:'exclamation-circle',success:'check-circle',info:'info-circle'};
    w.innerHTML = `<div class="alert alert-${type}"><i class="fas fa-${icons[type]}"></i><span>${_esc(msg)}</span></div>`;
    clearTimeout(_alertTimer); _alertTimer = setTimeout(()=>{w.innerHTML='';},5000);
}

function _avatar(n) { return `https://ui-avatars.com/api/?name=${encodeURIComponent(n||'?')}&background=6366f1&color=fff&size=64`; }
function _setText(id,v)  { const e=document.getElementById(id); if(e) e.textContent=String(v??''); }
function _setImg(id,src) { const e=document.getElementById(id); if(e) e.src=src; }
function _esc(s) {
    return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
