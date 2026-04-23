/**
 * js/student/student.js
 * Scholara Student Dashboard Controller
 */

const StudentDashboard = {
  async init() {
    await this.renderAll();
  },

  async renderAll() {
    try {
      const result = await api.get('/portal/student/dashboard');
      
      if (!result.success) {
        throw new Error(result.message || 'Dashboard load failed');
      }

      const data = result.data;

      this.renderProfile(data.profile);
      this.renderStats(data.profile);
      this.renderSubjectPerformance(data.subjectPerformance);
      this.renderDeadlines(data.tasks);
      this.renderRecentResults(data.recentResults);
      this.renderAvailableExams(data.upcomingExams);
    } catch (err) {
      console.error('Dashboard error:', err);
      
      // If 403 or 401, user has wrong role or expired token
      if (err.message && (err.message.includes('Access denied') || err.message.includes('Insufficient') || err.message.includes('INSUFFICIENT'))) {
        notifications.error('Access denied. Please login as a student.');
        setTimeout(() => auth.logout(), 2000);
        return;
      }

      notifications.error('Failed to load dashboard data: ' + err.message);
    }
  },

  renderProfile(profile) {
    if (!profile) return;
    const nameEl = document.getElementById('prof-name');
    const secEl = document.getElementById('prof-section');
    if (nameEl) nameEl.innerText = (profile.name || 'Student').split(' ')[0];
    if (secEl) secEl.innerText = profile.section || 'Sec 11-A';
  },

  renderStats(profile) {
    if (!profile) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    
    set('stat-gpa', profile.gpa || '0.0');
    set('stat-attendance', (profile.attendance || 0) + '%');
    set('stat-sessions', `${profile.sessionsLogged || 0} / ${profile.totalSessions || 0} sessions`);
    set('stat-rank', (profile.rank || 0) + 'th');
    set('stat-peers', `vs ${profile.totalPeers || 0} Peer Dataset`);
    set('stat-tasks', (profile.tasks || 4));
  },

  renderSubjectPerformance(subjects) {
    const container = document.getElementById('subject-performance-list');
    if (!container) return;
    
    if (!subjects || subjects.length === 0) {
      container.innerHTML = '<p class="p-dim">No subject data available.</p>';
      return;
    }

    container.innerHTML = subjects.map(s => `
      <div class="subject-item">
        <span style="font-weight: 500;">${s.subject}</span>
        <span style="font-weight: 600; color: #2563eb;">${s.score}</span>
      </div>
    `).join('');
  },

  renderDeadlines(tasks) {
    const container = document.getElementById('deadlines-list');
    if (!container) return;

    if (!tasks || tasks.length === 0) {
      container.innerHTML = '<p class="p-dim">No upcoming deadlines.</p>';
      return;
    }

    container.innerHTML = tasks.map(t => `
      <div class="deadline-card">
        <div style="font-size: 11px; color: #2563eb; font-weight: 600; margin-bottom: 4px;">${t.subjectCode || ''}</div>
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px;">${t.title || 'Task'}</div>
        <div class="flex-between">
          <span class="badge badge-med">${t.priority || 'MED'}</span>
          <span class="p-dim" style="font-size: 11px;">${t.deadline ? new Date(t.deadline).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : ''}</span>
        </div>
      </div>
    `).join('');
  },

  renderRecentResults(results) {
    const container = document.getElementById('recent-results-simple');
    if (!container) return;

    if (!results || results.length === 0) {
      container.innerHTML = '<p class="p-dim">No recent results.</p>';
      return;
    }

    container.innerHTML = results.slice(0, 3).map(r => `
      <div style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
        <div style="font-weight: 500; font-size: 14px;">${r.session ? r.session.title : 'Exam'}</div>
        <div class="flex-between" style="margin-top: 4px;">
          <span class="p-dim" style="font-size: 11px;">${r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : ''}</span>
          <span style="font-weight: 600; color: ${r.percentage >= 50 ? '#10b981' : '#ef4444'};">${r.percentage || 0}%</span>
        </div>
      </div>
    `).join('');
  },

  renderAvailableExams(exams) {
    const container = document.getElementById('available-exams');
    if (!container) return;

    if (!exams || exams.length === 0) {
      container.innerHTML = '<p class="p-dim">No live exams scheduled.</p>';
      return;
    }

    container.innerHTML = exams.map(exam => `
      <div class="glass-card" style="padding: 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #e2e8f0;">
        <div>
          <div style="font-weight: 600;">${exam.title || 'Exam'}</div>
          <div class="p-dim" style="font-size: 12px;">${exam.durationMinutes || 60} Mins${exam.scheduledStart ? ' • Starts: ' + new Date(exam.scheduledStart).toLocaleTimeString() : ''}</div>
        </div>
        <button onclick="StudentDashboard.joinExam('${exam._id}')" class="btn btn-primary" style="padding: 8px 16px;">Join</button>
      </div>
    `).join('');
  },

  async joinExam(sessionId) {
    try {
      window.location.href = `/exam.html?sessionId=${sessionId}`;
    } catch (err) {
      notifications.error('Failed to join exam: ' + err.message);
    }
  }
};

window.StudentDashboard = StudentDashboard;
