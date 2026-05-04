/**
 * js/teacher/examManager.js
 * Session and Exam Management
 */

const ExamManager = {
  showCreateSession(bankId) {
    const courses = (window.TeacherDashboard && window.TeacherDashboard.courses) || [];
    const courseOptions = courses.map(c => `<option value="${c._id}">${c.courseName}</option>`).join('');

    Modal.show('create-session', `
      <form id="create-session-form" onsubmit="ExamManager.handleCreate(event, '${bankId}')">
        <div class="form-group">
          <label>Exam Title</label>
          <input type="text" name="title" class="form-control" placeholder="Midterm Exam 2024" required>
        </div>
        <div class="form-group">
          <label>Target Course</label>
          <select name="courseId" class="form-control" required>
            ${courseOptions || '<option disabled selected>No courses assigned</option>'}
          </select>
        </div>
        <div class="form-group">
          <label>Scheduled Start</label>
          <input type="datetime-local" name="scheduledStart" class="form-control" required>
        </div>
        <div class="flex-between" style="gap: 16px;">
          <div class="form-group" style="flex: 1">
            <label>Duration (Mins)</label>
            <input type="number" name="durationMinutes" class="form-control" value="60" required>
          </div>
          <div class="form-group" style="flex: 1">
            <label>Target Division</label>
            <select name="division" class="form-control" required>
              <option value="A">Division A</option>
              <option value="B">Division B</option>
              <option value="C">Division C</option>
              <option value="D">Division D</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label style="display:flex; align-items:center; gap:8px;">
            <input type="checkbox" name="shuffleQuestions"> Shuffle Questions
          </label>
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 12px;">Create Session</button>
      </form>
    `, { title: 'Create Exam Session' });
  },

  showEditSession(sessionId) {
    const sessions = (window.TeacherDashboard && window.TeacherDashboard.sessions) || [];
    const courses = (window.TeacherDashboard && window.TeacherDashboard.courses) || [];
    const session = sessions.find((s) => String(s._id) === String(sessionId));
    if (!session) {
      notifications.error('Session not found');
      return;
    }

    const courseOptions = courses.map(c => {
      const selected = String(c._id) === String(session.courseId) ? 'selected' : '';
      return `<option value="${c._id}" ${selected}>${c.courseName}</option>`;
    }).join('');

    const localDate = session.startTime
      ? new Date(session.startTime).toISOString().slice(0, 16)
      : '';

    Modal.show('edit-session', `
      <form id="edit-session-form" onsubmit="ExamManager.handleEdit(event, '${session._id}')">
        <div class="form-group">
          <label>Exam Title</label>
          <input type="text" name="title" class="form-control" value="${(session.title || '').replace(/"/g, '&quot;')}" required>
        </div>
        <div class="form-group">
          <label>Target Course</label>
          <select name="courseId" class="form-control" disabled>
            ${courseOptions || '<option disabled selected>No courses assigned</option>'}
          </select>
        </div>
        <div class="form-group">
          <label>Scheduled Start</label>
          <input type="datetime-local" name="scheduledStart" class="form-control" value="${localDate}" required>
        </div>
        <div class="flex-between" style="gap: 16px;">
          <div class="form-group" style="flex: 1">
            <label>Duration (Mins)</label>
            <input type="number" name="durationMinutes" class="form-control" value="${session.duration || 60}" required>
          </div>
          <div class="form-group" style="flex: 1">
            <label>Target Division</label>
            <select name="division" class="form-control" required>
              <option value="A" ${session.division === 'A' ? 'selected' : ''}>Division A</option>
              <option value="B" ${session.division === 'B' ? 'selected' : ''}>Division B</option>
              <option value="C" ${session.division === 'C' ? 'selected' : ''}>Division C</option>
              <option value="D" ${session.division === 'D' ? 'selected' : ''}>Division D</option>
            </select>
          </div>
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 12px;">Update Session</button>
      </form>
    `, { title: 'Edit Exam Session' });
  },

  async handleCreate(event, bankId) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const payload = Object.fromEntries(formData.entries());
    payload.mcqBankId = bankId;
    payload.shuffleQuestions = formData.get('shuffleQuestions') === 'on';

    try {
      await api.post('/portal/teacher/sessions', payload);
      notifications.success('Exam session created successfully!');
      Modal.close();
      if (typeof TeacherDashboard !== 'undefined') {
        TeacherDashboard.loadDashboardData();
        TeacherDashboard.loadMCQBanks();
      }
    } catch (err) {
      notifications.error(err.message);
    }
  },

  async handleEdit(event, sessionId) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const payload = Object.fromEntries(formData.entries());

    try {
      await api.request(`/portal/teacher/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      notifications.success('Exam session updated successfully!');
      Modal.close();
      if (typeof TeacherDashboard !== 'undefined') {
        await TeacherDashboard.loadDashboardData();
      }
    } catch (err) {
      notifications.error(err.message || 'Failed to update session');
    }
  },

  async updateStatus(sessionId, status) {
    try {
      await api.patch(`/portal/teacher/sessions/${sessionId}/status`, { status });
      notifications.success(`Session ${status}`);
      location.reload();
    } catch (err) {
      notifications.error(err.message);
    }
  }
};

window.ExamManager = ExamManager;
