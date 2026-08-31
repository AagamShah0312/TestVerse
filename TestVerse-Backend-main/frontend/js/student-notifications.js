// Student Notifications Page JavaScript Logic

if (!Auth.requireAuth()) {
  throw new Error('Unauthorized');
}

let allNotifications = [];
let currentTab = 'all';

// Get icon for notification type
function getNotificationIcon(type) {
  const icons = {
    exam_published: { class: 'exam', svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
    exam_reminder: { class: 'exam', svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' },
    result_published: { class: 'result', svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' },
    announcement: { class: 'announcement', svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/></svg>' },
    branch_assigned: { class: 'branch', svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>' }
  };
  return icons[type] || icons.announcement;
}

// Switch tabs
function switchTab(tab) {
  currentTab = tab;
  
  document.querySelectorAll('.notification-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  
  document.querySelector(`[onclick="switchTab('${tab}')"]`).classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');
  
  if (tab === 'announcements') {
    loadAnnouncements();
  } else {
    renderNotifications();
  }
}

// Load notifications
async function loadNotifications() {
  const list = document.getElementById('notification-list');
  
  try {
    const response = await API.getNotifications();
    allNotifications = response.results || response || [];
    
    renderNotifications();
    updateBadge();
    
  } catch (error) {
    console.error('Error loading notifications:', error);
    list.innerHTML = `
      <div class="error-state" style="padding: 2rem;">
        <p class="text-muted">Failed to load notifications</p>
        <button class="btn btn-secondary btn-sm" onclick="loadNotifications()">Retry</button>
      </div>
    `;
  }
}

// Render notifications
function renderNotifications() {
  const allList = document.getElementById('notification-list');
  const unreadList = document.getElementById('unread-list');
  
  const filtered = currentTab === 'unread' 
    ? allNotifications.filter(n => !n.is_read)
    : allNotifications;
  
  const html = filtered.length === 0
    ? `<div class="text-center text-muted" style="padding: 2rem;">No notifications</div>`
    : filtered.map(n => {
        const icon = getNotificationIcon(n.type);
        const timeAgo = Utils.formatDate(n.created_at);
        return `
          <div class="notification-item ${n.is_read ? '' : 'unread'}" onclick="markAsRead('${n.id}')">
            <div class="notification-icon ${icon.class}">${icon.svg}</div>
            <div class="notification-content">
              <div class="notification-title">${Utils.escapeHtml(n.title)}</div>
              <div class="notification-message">${Utils.escapeHtml(n.message)}</div>
              <div class="notification-time">${timeAgo}</div>
            </div>
          </div>
        `;
      }).join('');
  
  if (currentTab === 'unread') {
    unreadList.innerHTML = html;
  } else {
    allList.innerHTML = html;
  }
}

// Load announcements
async function loadAnnouncements() {
  const container = document.getElementById('announcements-container');
  container.innerHTML = '<div class="spinner" style="margin: 2rem auto;"></div>';
  
  try {
    const response = await API.getAnnouncements();
    const announcements = response.results || response || [];
    
    if (announcements.length === 0) {
      container.innerHTML = `<div class="text-center text-muted" style="padding: 2rem;">No announcements</div>`;
      return;
    }
    
    container.innerHTML = announcements.map(a => `
      <div class="announcement-card">
        <h3>${Utils.escapeHtml(a.title)}</h3>
        <p>${Utils.escapeHtml(a.content)}</p>
        <div class="announcement-meta">
          <span>By ${Utils.escapeHtml(a.created_by_name || 'Staff')}</span>
          <span>${Utils.formatDate(a.created_at)}</span>
        </div>
      </div>
    `).join('');
    
  } catch (error) {
    console.error('Error loading announcements:', error);
    container.innerHTML = `<div class="text-center text-muted" style="padding: 2rem;">Failed to load announcements</div>`;
  }
}

// Mark single notification as read
async function markAsRead(notificationId) {
  try {
    await API.markNotificationsRead([notificationId]);
    const notification = allNotifications.find(n => n.id === notificationId);
    if (notification) {
      notification.is_read = true;
    }
    renderNotifications();
    updateBadge();
  } catch (error) {
    console.error('Error marking as read:', error);
  }
}

// Mark all as read
async function markAllAsRead() {
  try {
    await API.markNotificationsRead([], true);
    allNotifications.forEach(n => n.is_read = true);
    renderNotifications();
    updateBadge();
    Utils.showToast('All notifications marked as read', 'success');
  } catch (error) {
    console.error('Error marking all as read:', error);
    Utils.showToast('Failed to mark notifications as read', 'error');
  }
}

// Update badge count
async function updateBadge() {
  try {
    const { unread_count } = await API.getNotificationCount();
    const badge = document.getElementById('notification-badge');
    if (unread_count > 0) {
      badge.textContent = unread_count > 9 ? '9+' : unread_count;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  } catch (error) {
    console.error('Error getting notification count:', error);
  }
}

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  loadNotifications();
});