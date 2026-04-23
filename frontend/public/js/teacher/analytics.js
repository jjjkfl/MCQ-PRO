/**
 * js/teacher/analytics.js
 * Exam Data Analytics — Results view with stats + student results table
 */

const Analytics = {
  async init(sessionId) {
    try {
      const { data } = await api.get(`/portal/teacher/sessions/${sessionId}/results`);
      this.renderOverview(data.stats, data.sessionTitle);
      this.renderResultsTable(data.results);
      this.renderCharts(data.stats);
    } catch (err) {
      console.error('Analytics error:', err);
      notifications.error('Failed to load analytics: ' + (err.message || ''));
    }
  },

  renderOverview(stats, title) {
    const container = document.getElementById('analytics-overview');
    const passRate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : '0.0';
    
    container.innerHTML = `
      <div style="margin-bottom: 24px;">
        <h2 class="h2">${title || 'Session'} — Results</h2>
        <p class="p-dim">${stats.total} student${stats.total !== 1 ? 's' : ''} submitted</p>
      </div>
      <div class="metrics-grid">
        <div class="glass-card metric-card">
          <p class="p-dim">Pass Rate</p>
          <div class="metric-value">${passRate}%</div>
          <p class="p-dim" style="font-size:12px">${stats.passed || 0} of ${stats.total || 0} Passed</p>
        </div>
        <div class="glass-card metric-card">
          <p class="p-dim">Average Score</p>
          <div class="metric-value">${stats.avgPercent || 0}%</div>
        </div>
        <div class="glass-card metric-card">
          <p class="p-dim">Highest Score</p>
          <div class="metric-value" style="color: var(--success)">${stats.highScore || 0}%</div>
        </div>
        <div class="glass-card metric-card">
          <p class="p-dim">Lowest Score</p>
          <div class="metric-value" style="color: var(--danger)">${stats.lowScore || 0}%</div>
        </div>
      </div>
    `;
  },

  renderResultsTable(results) {
    // Insert a table after the overview
    const overview = document.getElementById('analytics-overview');
    
    // Remove old table if exists
    const oldTable = document.getElementById('results-table-section');
    if (oldTable) oldTable.remove();

    if (!results || results.length === 0) {
      const section = document.createElement('div');
      section.id = 'results-table-section';
      section.innerHTML = `
        <div class="glass-card" style="margin-top: 24px; padding: 40px; text-align: center;">
          <p class="p-dim">No student submissions yet.</p>
        </div>
      `;
      overview.after(section);
      return;
    }

    const formatTime = (s) => {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${m}m ${sec}s`;
    };

    const section = document.createElement('div');
    section.id = 'results-table-section';
    section.innerHTML = `
      <div class="glass-card" style="margin-top: 24px;">
        <h3 class="h3" style="margin-bottom: 20px;">Student Results</h3>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Student</th>
                <th>Score</th>
                <th>Correct</th>
                <th>Time</th>
                <th>Violations</th>
                <th>Grade</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${results.map((r, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>
                    <div style="font-weight:600">${r.studentName}</div>
                    <div class="p-dim" style="font-size:11px">${r.studentEmail}</div>
                  </td>
                  <td style="font-weight:700; color:${r.isPassed ? 'var(--success)' : 'var(--danger)'}">${r.score}%</td>
                  <td>${r.correctCount}/${r.totalQuestions}</td>
                  <td>${formatTime(r.timeTaken)}</td>
                  <td>
                    ${r.violations > 0 
                      ? `<span class="status-pill status-warning">⚠️ ${r.violations}</span>` 
                      : '<span class="p-dim">0</span>'}
                  </td>
                  <td><strong>${r.grade}</strong></td>
                  <td>
                    <span class="status-pill ${r.isPassed ? 'status-online' : 'status-offline'}">
                      ${r.isPassed ? 'PASSED' : 'FAILED'}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    overview.after(section);
  },

  renderCharts(stats) {
    if (typeof Charts !== 'undefined') {
      Charts.renderGrades('grade-distribution-chart', stats.gradeBreakdown);
    }
  }
};

window.Analytics = Analytics;
