/**
 * js/teacher/teacher.js
 * Teacher Dashboard Controller
 */

const TeacherDashboard = {
  async init() {
    if (!auth.checkAuth()) return;
    Navbar.render('nav-container', 'dashboard');
    
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');

    if (view === 'analytics-all') {
      Navbar.render('nav-container', 'analytics');
      this.switchView('analytics-all');
      this.loadAllAnalytics();
    } else if (params.has('sessionId')) {
      if (view === 'analytics') {
        Navbar.render('nav-container', 'analytics');
        this.switchView('analytics');
        Analytics.init(params.get('sessionId'));
      } else {
        Navbar.render('nav-container', 'dashboard');
        this.switchView('monitor');
        Monitor.init();
      }
    } else {
      Navbar.render('nav-container', 'dashboard');
      this.switchView('dashboard');
      await this.loadDashboardData();
      await this.loadMCQBanks();
      
      // Real-time polling every 5 seconds
      if (this._pollingInterval) clearInterval(this._pollingInterval);
      this._pollingInterval = setInterval(() => this.loadDashboardData(), 5000);
    }
  },

  switchView(viewName) {
    utils.$all('.view').forEach(v => v.style.display = 'none');
    utils.$(`#view-${viewName}`).style.display = 'block';
  },

  async loadDashboardData() {
    try {
      const { data } = await api.get('/portal/teacher/dashboard');
      const { stats, recentSessions, recentResults } = data;
      
      // Helper to update with pulse
      const updateStat = (id, val) => {
        const el = document.getElementById(id);
        if (el && el.innerText != val) {
          el.innerText = val;
          el.classList.remove('real-time-update');
          void el.offsetWidth; // trigger reflow
          el.classList.add('real-time-update');
        }
      };

      // Update stats
      updateStat('stat-active', stats.activeSessions);
      updateStat('stat-total-exams', stats.totalSessions);
      updateStat('stat-total-students', stats.totalStudents);
      updateStat('stat-banks', stats.totalMCQBanks);

      // Render Sessions
      this.renderSessions(recentSessions);
      
      // Render Results
      this.renderResults(recentResults);
    } catch (err) {
      console.error(err.message || 'Failed to load dashboard');
    }
  },

  renderSessions(sessions) {
    const list = document.getElementById('recent-sessions');
    if (sessions.length === 0) {
      list.innerHTML = '<tr><td colspan="5" class="p-dim" style="text-align:center">No sessions created yet</td></tr>';
      return;
    }

    list.innerHTML = sessions.map(s => `
      <tr>
        <td>
          ${s.title || s.examId} 
          ${s.division ? `<span class="p-dim" style="font-size:12px; margin-left:8px;">(Div ${s.division})</span>` : ''}
        </td>
        <td>${utils.formatDate(s.scheduledStart || s.startTime)}</td>
        <td><span class="status-pill ${s.status === 'active' ? 'status-online' : 'status-offline'}">${s.status.toUpperCase()}</span></td>
        <td>${s.submissions || 0} Students</td>
        <td style="display:flex; gap:8px;">
          <button onclick="TeacherDashboard.goToMonitor('${s._id}')" class="btn btn-outline" style="padding: 6px 12px; font-size: 12px;">Monitor</button>
          <button onclick="TeacherDashboard.goToAnalytics('${s._id}')" class="btn btn-outline" style="padding: 6px 12px; font-size: 12px;">Results</button>
        </td>
      </tr>
    `).join('');
  },

  renderResults(results) {
    const list = document.getElementById('recent-results');
    if (!results || results.length === 0) {
      list.innerHTML = '<tr><td colspan="4" class="p-dim" style="text-align:center">No submissions yet</td></tr>';
      return;
    }

    list.innerHTML = results.map(r => `
      <tr>
        <td><strong>${r.studentName}</strong></td>
        <td>${r.examTitle}</td>
        <td style="font-weight:700; color:${r.score >= 50 ? 'var(--success)' : 'var(--danger)'}">${r.score}%</td>
        <td>${utils.formatDate(r.submittedAt)}</td>
      </tr>
    `).join('');
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

  async loadAllAnalytics() {
    try {
      const { data } = await api.get('/portal/teacher/analytics');
      
      const container = document.getElementById('global-analytics-stats');
      container.innerHTML = `
        <div class="metrics-grid">
          <div class="glass-card">
            <p class="p-dim">Total Submissions</p>
            <div class="metric-value">${data.totalSubmissions}</div>
          </div>
          <div class="glass-card">
            <p class="p-dim">Average Score</p>
            <div class="metric-value">${data.avgScore}%</div>
          </div>
          <div class="glass-card">
            <p class="p-dim">Overall Pass Rate</p>
            <div class="metric-value" style="color: var(--primary)">${data.passRate}%</div>
          </div>
        </div>
      `;

      if (typeof Charts !== 'undefined') {
        Charts.renderGrades('global-grade-chart', data.gradeBreakdown);
      }
    } catch (err) {
      notifications.error('Failed to load global analytics');
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
