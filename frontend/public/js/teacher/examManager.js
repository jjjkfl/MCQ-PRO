/**
 * js/teacher/examManager.js
 * Session and Exam Management
 */

const ExamManager = {
  showCreateSession(bankId) {
    Modal.show('create-session', `
      <form id="create-session-form" onsubmit="ExamManager.handleCreate(event, '${bankId}')">
        <div class="input-group">
          <label>Exam Title</label>
          <input type="text" name="title" class="input-control" placeholder="Midterm Exam 2024" required>
        </div>
        <div class="input-group">
          <label>Scheduled Start</label>
          <input type="datetime-local" name="scheduledStart" class="input-control" required>
        </div>
        <div class="flex-between" style="gap: 16px;">
          <div class="input-group" style="flex: 1">
            <label>Duration (Mins)</label>
            <input type="number" name="durationMinutes" class="input-control" value="60" required>
          </div>
          <div class="input-group" style="flex: 1">
            <label>Passing Score (%)</label>
            <input type="number" name="passingScore" class="input-control" value="50" required>
          </div>
        </div>
        <div class="input-group">
          <label style="display:flex; align-items:center; gap:8px;">
            <input type="checkbox" name="shuffleQuestions"> Shuffle Questions
          </label>
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 12px;">Create Session</button>
      </form>
    `, { title: 'Create Exam Session' });
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
      TeacherDashboard.loadRecentSessions();
    } catch (err) {
      notifications.error(err.message);
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
