// Student Leaderboard Page JavaScript Logic

if (!Auth.requireAuth()) {
  throw new Error('Unauthorized');
}

const currentUserId = Auth.getUser()?.id;

async function loadLeaderboard() {
  const podium = document.getElementById('podium');
  const list = document.getElementById('leaderboard-list');
  
  try {
    const data = await API.getLeaderboard();
    const leaderboard = data.leaderboard || [];
    
    // Render podium (top 3)
    if (leaderboard.length >= 3) {
      const medals = ['🥇', '🥈', '🥉'];
      const classes = ['gold', 'silver', 'bronze'];
      podium.innerHTML = leaderboard.slice(0, 3).map((user, i) => `
        <div class="podium-item ${classes[i]}">
          <div class="podium-medal">${medals[i]}</div>
          <div class="podium-name">${Utils.escapeHtml(user.name)}</div>
          <div class="podium-department">${Utils.escapeHtml(user.department || 'N/A')}</div>
          <div class="podium-points">${user.total_points} pts</div>
        </div>
      `).join('');
    } else {
      podium.innerHTML = '<p class="text-muted">Not enough data for podium</p>';
    }
    
    // Render list (all)
    if (leaderboard.length === 0) {
      list.innerHTML = '<p class="text-center text-muted" style="padding: 2rem;">No leaderboard data yet. Start earning points!</p>';
      return;
    }
    
    list.innerHTML = leaderboard.map(user => `
      <div class="leaderboard-item ${user.user_id === currentUserId ? 'current-user' : ''}">
        <div class="rank ${user.rank <= 3 ? 'rank-' + user.rank : ''}">#${user.rank}</div>
        <div class="user-info">
          <span class="user-name">${Utils.escapeHtml(user.name)}</span>
          <span class="user-dept">${Utils.escapeHtml(user.department || 'N/A')}</span>
        </div>
        <div class="badge-count">🏅 ${user.badge_count} badge${user.badge_count !== 1 ? 's' : ''}</div>
        <div class="points-display">${user.total_points}</div>
      </div>
    `).join('');
    
    // Show current user rank if not in list
    if (data.current_user_rank) {
      document.getElementById('your-rank').style.display = 'block';
      document.getElementById('current-rank').textContent = `#${data.current_user_rank}`;
    }
    
  } catch (error) {
    console.error('Error loading leaderboard:', error);
    list.innerHTML = `<p class="text-center text-danger" style="padding: 2rem;">Failed to load leaderboard</p>`;
    podium.innerHTML = '';
  }
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  loadLeaderboard();
});