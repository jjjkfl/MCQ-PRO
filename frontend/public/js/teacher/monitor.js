/**
 * js/teacher/monitor.js
 * Live Exam Monitoring — shows enrolled students and submissions
 */

const Monitor = {
  sessionId: null,
  students: new Map(),

  async init() {
    const params = new URLSearchParams(window.location.search);
    this.sessionId = params.get('sessionId');

    if (!this.sessionId) {
      window.location.href = '/teacher.html';
      return;
    }

    Navbar.render('nav-container');
    await this.loadInitialData();
    TeacherSocket.init(this.sessionId);
  },

  async loadInitialData() {
    try {
      const { data } = await api.get(`/portal/teacher/sessions/${this.sessionId}/monitor`);
      this.renderHeader(data);
      this.renderMonitorView(data);
    } catch (err) {
      console.error('Monitor error:', err);
      notifications.error('Failed to load monitoring data');
    }
  },

  renderHeader(data) {
    document.getElementById('session-title').innerText = `Monitoring: ${data.title || data.sessionId}`;
    document.getElementById('student-count').innerText = `${data.submittedCount} / ${data.enrolledCount || 'N/A'} Submitted — Status: ${(data.status || 'active').toUpperCase()}`;
  },

  renderMonitorView(data) {
    const list = document.getElementById('monitor-list');
    const enrolled = data.enrolled || [];
    const submitted = data.submitted || [];

    // Build a map of submitted results by studentId
    const submitMap = {};
    submitted.forEach(s => { submitMap[s.studentId] = s; });

    if (enrolled.length === 0 && submitted.length === 0) {
      list.innerHTML = `
        <tr>
          <td colspan="5" class="p-dim" style="text-align:center; padding:40px;">
            No students have joined this exam yet.
          </td>
        </tr>
      `;
      return;
    }

    // If we have enrolled students, show them with status
    if (enrolled.length > 0) {
      list.innerHTML = enrolled.map(s => {
        const sub = submitMap[s._id];
        const isOnline = this.students.has(s._id) ? this.students.get(s._id).status === 'online' : false;
        const alertCount = this.students.has(s._id) ? this.students.get(s._id).alerts || 0 : 0;

        return `
          <tr id="student-${s._id}">
            <td>
              <div style="font-weight:600">${s.firstName} ${s.lastName}</div>
              <div class="p-dim" style="font-size:12px">${s.studentId}</div>
            </td>
            <td>
              ${sub 
                ? '<span class="status-pill status-online">SUBMITTED</span>' 
                : isOnline 
                  ? '<span class="status-pill status-online">ONLINE</span>'
                  : '<span class="status-pill status-offline">WAITING</span>'
              }
            </td>
            <td>
              ${sub 
                ? `<strong style="color:var(--success)">${sub.score}%</strong> (${sub.correctCount}/${sub.totalQuestions})` 
                : '<span class="p-dim">—</span>'
              }
            </td>
            <td>
              ${(sub && sub.violations > 0) || alertCount > 0
                ? `<span class="status-pill status-warning">⚠️ ${sub ? sub.violations : alertCount} Alerts</span>` 
                : '<span class="p-dim">None</span>'
              }
            </td>
            <td>
              ${sub 
                ? `<span class="p-dim" style="font-size:11px">${new Date(sub.submittedAt).toLocaleTimeString()}</span>` 
                : '<span class="p-dim">—</span>'
              }
            </td>
          </tr>
        `;
      }).join('');
    } else if (submitted.length > 0) {
      // No enrolled list, but we have submissions — show those
      list.innerHTML = submitted.map((s, i) => `
        <tr>
          <td>
            <div style="font-weight:600">Student ${i + 1}</div>
            <div class="p-dim" style="font-size:12px">${s.studentId}</div>
          </td>
          <td><span class="status-pill status-online">SUBMITTED</span></td>
          <td><strong style="color:var(--success)">${s.score}%</strong> (${s.correctCount}/${s.totalQuestions})</td>
          <td>
            ${s.violations > 0 
              ? `<span class="status-pill status-warning">⚠️ ${s.violations}</span>` 
              : '<span class="p-dim">None</span>'
            }
          </td>
          <td><span class="p-dim" style="font-size:11px">${new Date(s.submittedAt).toLocaleTimeString()}</span></td>
        </tr>
      `).join('');
    }
  },

  handleSocketEvent(event, data) {
    switch(event) {
      case 'exam:studentJoined':
        this.updateStudentStatus(data.userId, 'online');
        break;
      case 'exam:studentProgress':
        this.updateStudentProgress(data.userId, data.answersGiven);
        break;
      case 'exam:suspiciousActivity':
        this.addAlert(data.userId, data.tabSwitches);
        break;
      case 'exam:studentOffline':
        this.updateStudentStatus(data.userId, 'offline');
        break;
    }
  },

  updateStudentStatus(userId, status) {
    const s = this.students.get(userId) || { progress: 0, alerts: 0 };
    s.status = status;
    this.students.set(userId, s);
  },

  addAlert(userId, count) {
    const s = this.students.get(userId) || { status: 'online', progress: 0 };
    s.alerts = count;
    this.students.set(userId, s);
    notifications.warn(`⚠️ Student ${userId}: ${count} tab switches detected`);
  }
};

window.Monitor = Monitor;
