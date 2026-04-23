/**
 * js/teacher/socket.js
 * Teacher Socket handler for monitoring
 */

const TeacherSocket = {
  socket: null,
  sessionId: null,

  init(sessionId) {
    this.sessionId = sessionId;
    const token = auth.getToken();

    this.socket = io('http://localhost:5000', {
      auth: { token }
    });

    this.socket.on('connect', () => {
      console.log('Teacher connected to socket');
      this.socket.emit('exam:join', { sessionId });
    });

    // Proxy all monitoring events to the Monitor controller
    const events = [
      'exam:studentJoined',
      'exam:studentProgress',
      'exam:suspiciousActivity',
      'exam:studentOffline'
    ];

    events.forEach(event => {
      this.socket.on(event, (data) => {
        if (window.Monitor) {
          Monitor.handleSocketEvent(event, data);
        }
      });
    });
  },

  startExam(duration) {
    this.socket.emit('exam:start', { sessionId: this.sessionId, durationMinutes: duration });
  },

  pauseExam() {
    this.socket.emit('exam:pause', { sessionId: this.sessionId });
  },

  resumeExam() {
    this.socket.emit('exam:resume', { sessionId: this.sessionId });
  },

  forceEnd() {
    this.socket.emit('exam:forceEnd', { sessionId: this.sessionId });
  }
};

window.TeacherSocket = TeacherSocket;
