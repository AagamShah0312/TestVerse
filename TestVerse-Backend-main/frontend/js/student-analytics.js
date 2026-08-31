// Student Analytics Page JavaScript Logic

if (!Auth.requireAuth()) {
  throw new Error('Unauthorized');
}

// Load analytics data
async function loadAnalytics() {
  const statsGrid = document.getElementById('stats-grid');
  const chart = document.getElementById('performance-chart');
  
  try {
    const data = await API.getStudentAnalytics();
    
    // Render stats
    const improvementClass = data.improvement >= 0 ? 'positive' : 'negative';
    const improvementIcon = data.improvement >= 0 ? '↗' : '↘';
    
    statsGrid.innerHTML = `
      <div class="stat-card primary">
        <h3>${data.total_exams}</h3>
        <p>Total Exams</p>
      </div>
      <div class="stat-card success">
        <h3>${data.pass_rate}%</h3>
        <p>Pass Rate</p>
      </div>
      <div class="stat-card">
        <h3>${data.average_score}%</h3>
        <p>Average Score</p>
      </div>
      <div class="stat-card warning">
        <h3>${data.total_points}</h3>
        <p>Total Points</p>
      </div>
      <div class="stat-card">
        <h3>${data.badge_count}</h3>
        <p>Badges Earned</p>
      </div>
      <div class="stat-card">
        <div class="improvement-indicator ${improvementClass}">
          ${improvementIcon} ${Math.abs(data.improvement)}%
        </div>
        <p style="margin-top: var(--space-2);">Improvement</p>
      </div>
    `;
    
    // Render chart
    if (data.recent_results && data.recent_results.length > 0) {
      const maxScore = 100;
      chart.innerHTML = data.recent_results.map(r => {
        const height = (r.percentage / maxScore) * 180;
        const barClass = r.is_passed ? 'passed' : 'failed';
        const title = r.exam__title.length > 12 ? r.exam__title.substring(0, 12) + '…' : r.exam__title;
        return `
          <div class="bar-item">
            <div class="bar-value">${Math.round(r.percentage)}%</div>
            <div class="bar ${barClass}" style="height: ${height}px;"></div>
            <div class="bar-label" title="${Utils.escapeHtml(r.exam__title)}">${Utils.escapeHtml(title)}</div>
          </div>
        `;
      }).join('');
    } else {
      chart.innerHTML = '<p class="text-center text-muted" style="width: 100%;">No exam data yet. Complete some exams to see your trend!</p>';
    }
    
  } catch (error) {
    console.error('Error loading analytics:', error);
    statsGrid.innerHTML = '<p class="text-danger">Failed to load analytics</p>';
    chart.innerHTML = '<p class="text-danger">Failed to load chart</p>';
  }
}

// Load badges
async function loadBadges() {
  const grid = document.getElementById('badges-grid');
  
  try {
    const response = await API.getUserBadges();
    const badges = response.results || response || [];
    
    if (badges.length === 0) {
      grid.innerHTML = '<p class="text-muted">No badges earned yet. Keep taking exams to earn badges!</p>';
      return;
    }
    
    grid.innerHTML = badges.map(ub => `
      <div class="badge-card">
        <div class="badge-icon">${ub.badge.icon}</div>
        <div class="badge-name">${Utils.escapeHtml(ub.badge.name)}</div>
        <div class="badge-date">${Utils.formatDate(ub.earned_at)}</div>
      </div>
    `).join('');
    
  } catch (error) {
    console.error('Error loading badges:', error);
    grid.innerHTML = '<p class="text-muted">Failed to load badges</p>';
  }
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  loadAnalytics();
  loadBadges();
});