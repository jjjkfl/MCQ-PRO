/**
 * js/teacher/teacher.js
 * Teacher Dashboard Controller
 */

const TeacherDashboard = {
  async init() {
    if (!auth.checkAuth()) return;
    Navbar.render('nav-container', 'dashboard');
    
    const params = new URLSearchParams(window.location.search);
    if (params.has('sessionId')) {
      if (params.has('view') && params.get('view') === 'analytics') {
        this.switchView('analytics');
        Analytics.init(params.get('sessionId'));
      } else {
        this.switchView('monitor');
        Monitor.init();
      }
    } else {
      this.switchView('dashboard');
      await this.loadStats();
      await this.loadRecentSessions();
      await this.loadMCQBanks();
    }
  },

  switchView(viewName) {
    utils.$all('.view').forEach(v => v.style.display = 'none');
    utils.$(`#view-${viewName}`).style.display = 'block';
  },

  async loadStats() {
    try {
      const { data } = await api.get('/portal/teacher/dashboard');
      const stats = data.stats;
      
      document.getElementById('stat-active').innerText = stats.activeSessions;
      document.getElementById('stat-total-exams').innerText = stats.totalSessions;
      document.getElementById('stat-total-students').innerText = stats.totalStudents;
      document.getElementById('stat-banks').innerText = stats.totalMCQBanks;
    } catch (err) {
      notifications.error(err.message || 'Failed to load dashboard');
    }
  },

  async loadRecentSessions() {
    const list = document.getElementById('recent-sessions');
    try {
      const { data } = await api.get('/portal/teacher/sessions?limit=5');
      
      if (data.length === 0) {
        list.innerHTML = '<tr><td colspan="5" class="p-dim" style="text-align:center">No sessions created yet</td></tr>';
        return;
      }

      list.innerHTML = data.map(s => `
        <tr>
          <td>${s.title || s.examId}</td>
          <td>${utils.formatDate(s.scheduledStart || s.startTime)}</td>
          <td><span class="status-pill ${s.status === 'active' ? 'status-online' : 'status-offline'}">${s.status.toUpperCase()}</span></td>
          <td>${(s.submittedStudents || []).length} Students</td>
          <td style="display:flex; gap:8px;">
            <button onclick="TeacherDashboard.goToMonitor('${s._id}')" class="btn btn-outline" style="padding: 6px 12px; font-size: 12px;">Monitor</button>
            <button onclick="TeacherDashboard.goToAnalytics('${s._id}')" class="btn btn-outline" style="padding: 6px 12px; font-size: 12px;">Results</button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      console.error(err);
    }
  },

  async loadMCQBanks() {
    const container = document.getElementById('mcq-banks-grid');
    try {
      const { data } = await api.get('/portal/teacher/mcq');
      
      if (data.length === 0) {
        container.innerHTML = '<p class="p-dim">No MCQ banks found. Upload a PDF to get started.</p>';
        return;
      }

      container.innerHTML = data.map(bank => `
        <div class="glass-card animate-fade-in">
          <div class="flex-between" style="margin-bottom: 16px;">
            <div style="padding: 8px; background: rgba(0, 113, 227, 0.1); border-radius: 8px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <button onclick="ExamManager.showCreateSession('${bank._id}')" class="btn btn-primary" style="padding: 6px 12px; font-size: 11px;">Create Exam</button>
          </div>
          <h4 style="font-weight: 600; margin-bottom: 4px;">${bank.title || 'Question'}</h4>
          <p class="p-dim" style="font-size: 12px;">${bank.subject || 'General'} • ${bank.questions ? bank.questions.length : 1} Questions</p>
        </div>
      `).join('');
    } catch (err) {
      console.error(err);
    }
  },

  goToMonitor(sessionId) {
    const url = new URL(window.location);
    url.searchParams.set('sessionId', sessionId);
    url.searchParams.delete('view');
    window.history.pushState({}, '', url);
    this.init();
  },

  goToAnalytics(sessionId) {
    const url = new URL(window.location);
    url.searchParams.set('sessionId', sessionId);
    url.searchParams.set('view', 'analytics');
    window.history.pushState({}, '', url);
    this.init();
  }
};

document.addEventListener('DOMContentLoaded', () => TeacherDashboard.init());
window.TeacherDashboard = TeacherDashboard;
