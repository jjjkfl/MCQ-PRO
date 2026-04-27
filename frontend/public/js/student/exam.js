/**
 * js/student/exam.js
 * Exam Engine — Color-coded progress, image support, strict proctoring integration
 */

const ReadinessCheck = {
  checks: { camera: false, fullscreen: false, consent: false },

  async allowCamera() {
    try {
      await Proctor.startCamera();
      this.checks.camera = true;
      document.getElementById('check-camera').classList.add('done');
      document.getElementById('btn-allow-camera').innerText = '✅ Active';
      document.getElementById('btn-allow-camera').disabled = true;
      this.validate();
    } catch (err) {
      console.error('[Readiness] Camera Error:', err);
      let msg = `Camera error: ${err.message}.`;
      if (err.name === 'NotAllowedError' || err.message.toLowerCase().includes('denied')) {
        msg = "🚫 Camera Access Denied! Please click the 'Lock' or 'Camera' icon in your browser's address bar (at the top) and change 'Block' to 'Allow', then refresh the page.";
      }
      notifications.error(msg, { duration: 10000 });
    }
  },

  async enterFullscreen() {
    try {
      await document.documentElement.requestFullscreen();
      this.checks.fullscreen = true;
      document.getElementById('check-fullscreen').classList.add('done');
      document.getElementById('btn-enter-fullscreen').innerText = '✅ Fullscreen';
      document.getElementById('btn-enter-fullscreen').disabled = true;
      this.validate();
    } catch (err) {
      notifications.error('Fullscreen is required for security.');
    }
  },

  updateConsent() {
    this.checks.consent = document.getElementById('consent-checkbox').checked;
    if (this.checks.consent) {
      document.getElementById('check-consent').classList.add('done');
    } else {
      document.getElementById('check-consent').classList.remove('done');
    }
    this.validate();
  },

  validate() {
    const canStart = this.checks.camera && this.checks.fullscreen && this.checks.consent;
    document.getElementById('btn-start-exam').disabled = !canStart;
  },

  async startExam() {
    document.getElementById('readiness-view').style.display = 'none';
    document.getElementById('main-exam-content').style.display = 'grid';

    // Resume original exam flow
    await ExamEngine.loadExam();
    ExamEngine.setupProctoring();
    ExamSocket.init(ExamEngine.sessionId);

    // Ensure proctoring uses the existing camera and stays in fullscreen
    Proctor.updateSecurityBar();
  }
};

window.ReadinessCheck = ReadinessCheck;

const ExamEngine = {
  sessionId: null,
  questions: [],
  currentIdx: 0,
  answers: {},       // { questionId: selectedOption }
  visited: new Set(), // Track visited question indices
  startTime: null,

  async init() {
    const params = new URLSearchParams(window.location.search);
    this.sessionId = params.get('sessionId');

    if (!this.sessionId) {
      notifications.error('No exam session found.');
      setTimeout(() => window.location.href = '/index.html', 2000);
      return;
    }

    // Wait for student to pass Readiness Check
    console.log('[ExamEngine] Waiting for Readiness Check...');

    // Monitor for fullscreen exit during check
    document.addEventListener('fullscreenchange', () => {
      const view = document.getElementById('readiness-view');
      if (!document.fullscreenElement && view && view.style.display !== 'none') {
        document.getElementById('check-fullscreen').classList.remove('done');
        document.getElementById('btn-enter-fullscreen').innerText = 'Enter';
        document.getElementById('btn-enter-fullscreen').disabled = false;
        ReadinessCheck.checks.fullscreen = false;
        ReadinessCheck.validate();
      }
    });
  },

  async loadExam() {
    try {
      const result = await api.get(`/portal/student/exams/${this.sessionId}`);
      if (!result.success) throw new Error(result.message);

      this.questions = result.data.questions;
      this.startTime = Date.now();

      if (!this.questions || this.questions.length === 0) {
        document.getElementById('question-area').innerHTML = `
          <div style="text-align:center; padding:60px;">
            <p style="font-size:18px; font-weight:600;">No questions available for this exam.</p>
            <p class="p-dim" style="margin-top:8px;">Please contact your teacher.</p>
          </div>`;
        return;
      }

      // Mark first question as visited
      this.visited.add(0);

      // Update exam title
      const titleEl = document.getElementById('exam-title');
      const subtitleEl = document.getElementById('exam-subtitle');
      if (titleEl) titleEl.textContent = result.data.title || 'Live Examination';
      if (subtitleEl) subtitleEl.textContent = `${this.questions.length} Questions`;

      this.renderQuestion();
      this.renderProgress();
      this.updateCounters();

      // Start timer
      const duration = (result.data.durationMinutes || 60) * 60;
      ExamTimer.start(duration, () => this.autoSubmit());

      // Init security bar
      setTimeout(() => Proctor.updateSecurityBar(), 1000);

    } catch (err) {
      console.error('Exam load error:', err);
      notifications.error('Failed to load exam: ' + err.message);
      document.getElementById('question-area').innerHTML = `
        <div style="text-align:center; padding:60px;">
          <p style="font-size:18px; font-weight:600; color:#ff3b30;">Failed to Load Exam</p>
          <p class="p-dim" style="margin-top:8px;">${err.message}</p>
          <button onclick="window.location.href='/index.html'" class="btn btn-outline" style="margin-top:20px;">Return to Dashboard</button>
        </div>`;
    }
  },

  renderQuestion() {
    const q = this.questions[this.currentIdx];
    const container = document.getElementById('question-area');
    const selectedAnswer = this.answers[q._id];

    container.innerHTML = `
      <div class="animate-fade-in">
        <div class="exam-q-header">
          <p class="p-dim" style="font-size: 13px;">Question ${this.currentIdx + 1} of ${this.questions.length}</p>
          <div class="exam-q-badges">
            ${q.marks ? `<span class="q-marks-badge">${q.marks} Mark${q.marks > 1 ? 's' : ''}</span>` : ''}
          </div>
        </div>

        <h2 style="font-size: 20px; font-weight: 500; margin: 20px 0 24px; line-height: 1.6; color: #1e293b;">
          ${this._escapeHtml(q.questionText)}
        </h2>

        ${q.image ? `
          <div class="exam-image-container">
            <img src="${q.image}" alt="Question Image" class="exam-question-image"
                 onclick="ExamEngine._zoomImage(this.src)"
                 onerror="this.parentElement.style.display='none'">
            <p class="p-dim" style="font-size: 11px; margin-top: 6px; text-align: center;">
              Click image to enlarge
            </p>
          </div>` : ''}

        <div class="options-list">
          ${q.options.map(opt => `
            <div class="option-item ${selectedAnswer === opt.label ? 'selected' : ''}" 
                 onclick="ExamEngine.selectOption('${q._id}', '${opt.label}')">
              <div class="option-label">${opt.label}</div>
              <div class="option-content-wrapper">
                <div class="option-text">${this._escapeHtml(opt.text)}</div>
                ${opt.image ? `
                  <div class="option-image-container">
                    <img src="${opt.image}" alt="Option Image" class="exam-option-image"
                         onclick="event.stopPropagation(); ExamEngine._zoomImage(this.src)"
                         onerror="this.parentElement.style.display='none'">
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>

        ${selectedAnswer ? `
          <div style="margin-top: 16px; text-align: right;">
            <button onclick="ExamEngine.clearAnswer('${q._id}')" class="btn-clear-answer">
              ✕ Clear Selection
            </button>
          </div>
        ` : ''}
      </div>
    `;

    this.updateNavButtons();
    this.renderProgress();
    this.updateCounters();
  },

  selectOption(qId, label) {
    this.answers[qId] = label;
    this.renderQuestion();
    ExamSocket.sendAnswer(this.currentIdx, label);
  },

  clearAnswer(qId) {
    delete this.answers[qId];
    this.renderQuestion();
  },

  /* ─── Color-Coded Progress ─────────────────────────────────────── */
  renderProgress() {
    const container = document.getElementById('exam-progress');
    if (!container) return;

    const answered = Object.keys(this.answers).length;
    const total = this.questions.length;
    const skipped = this.visited.size - answered;
    const notVisited = total - this.visited.size;

    container.innerHTML = `
      <div class="progress-legend">
        <div class="legend-item"><span class="legend-dot answered"></span> Answered (${answered})</div>
        <div class="legend-item"><span class="legend-dot skipped"></span> Skipped (${skipped < 0 ? 0 : skipped})</div>
        <div class="legend-item"><span class="legend-dot not-visited"></span> Not Visited (${notVisited})</div>
        <div class="legend-item"><span class="legend-dot current"></span> Current</div>
      </div>
      <div class="question-grid">
        ${this.questions.map((q, i) => {
      let status = 'not-visited';
      if (i === this.currentIdx) status = 'current';
      else if (this.answers[q._id]) status = 'answered';
      else if (this.visited.has(i)) status = 'skipped';

      return `
            <div class="q-dot ${status}" onclick="ExamEngine.goTo(${i})" title="Q${i + 1}">
              ${i + 1}
            </div>
          `;
    }).join('')}
      </div>
    `;
  },

  updateCounters() {
    const answered = Object.keys(this.answers).length;
    const counterEl = document.getElementById('question-counter');
    if (counterEl) counterEl.textContent = `${answered}/${this.questions.length} Answered`;
    const bigEl = document.getElementById('answered-count');
    if (bigEl) bigEl.textContent = answered;
  },

  updateNavButtons() {
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');

    if (prevBtn) prevBtn.disabled = this.currentIdx === 0;

    if (nextBtn) {
      if (this.currentIdx === this.questions.length - 1) {
        nextBtn.textContent = '✅ Finish Exam';
        nextBtn.className = 'btn btn-finish';
        nextBtn.onclick = () => this.confirmSubmit();
      } else {
        nextBtn.textContent = 'Next →';
        nextBtn.className = 'btn btn-primary';
        nextBtn.onclick = () => this.next();
      }
    }
  },

  next() {
    if (this.currentIdx < this.questions.length - 1) {
      this.currentIdx++;
      this.visited.add(this.currentIdx);
      this.renderQuestion();
    }
  },

  prev() {
    if (this.currentIdx > 0) {
      this.currentIdx--;
      this.visited.add(this.currentIdx);
      this.renderQuestion();
    }
  },

  goTo(idx) {
    this.currentIdx = idx;
    this.visited.add(idx);
    this.renderQuestion();
  },

  async confirmSubmit() {
    const answered = Object.keys(this.answers).length;
    const unanswered = this.questions.length - answered;
    const msg = unanswered > 0
      ? `⚠️ You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}.\n\nAre you sure you want to submit?`
      : '✅ All questions answered. Finalize your exam?';

    if (confirm(msg)) {
      await this.submit();
    }
  },

  isSubmitting: false,

  async submit() {
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    try {
      const payload = {
        sessionId: this.sessionId,
        answers: Object.entries(this.answers).map(([qId, label]) => ({
          questionId: qId,
          selectedOption: label
        })),
        timeTaken: Math.floor((Date.now() - this.startTime) / 1000),
        violations: Proctor.violations.length
      };

      const result = await api.post('/portal/student/exams/submit', payload);

      // Cleanup proctor
      Proctor.destroy();
      ExamTimer.stop();

      // Clear any security blur/filter effects
      document.body.style.filter = '';

      // Exit fullscreen gracefully
      if (document.fullscreenElement) {
        try { await document.exitFullscreen(); } catch (e) { }
      }

      if (!result.success) throw new Error(result.message);

      const d = result.data;

      // Show score summary overlay
      document.getElementById('question-area').innerHTML = `
        <div style="text-align:center; padding:48px 20px;" class="animate-fade-in">
          <div style="font-size:56px; margin-bottom:16px;">🎉</div>
          <h2 style="font-weight:700; font-size:24px; margin-bottom:8px; color:#1e293b;">Exam Submitted!</h2>
          <p style="color:#64748b; margin-bottom:28px;">Your answers have been graded.</p>
          
          <div style="display:flex; justify-content:center; gap:32px; margin-bottom:32px;">
            <div>
              <div style="font-size:36px; font-weight:700; color:${d.isPassed ? '#16a34a' : '#dc2626'};">${d.percentage}%</div>
              <div style="font-size:12px; color:#94a3b8;">Score</div>
            </div>
            <div>
              <div style="font-size:36px; font-weight:700; color:#2563eb;">${d.correctCount}/${d.totalQuestions}</div>
              <div style="font-size:12px; color:#94a3b8;">Correct</div>
            </div>
          </div>

          <p style="font-size:14px; margin-bottom:24px; color:${d.isPassed ? '#16a34a' : '#dc2626'}; font-weight:600;">
            ${d.isPassed ? '✅ PASSED' : '❌ FAILED'}
          </p>

          <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
            <a href="/result.html?resultId=${d.resultId}" class="btn btn-primary" style="text-decoration:none;">
              📋 View All Answers
            </a>
            <a href="/index.html" class="btn btn-outline" style="text-decoration:none;">
              🏠 Home
            </a>
            <button onclick="auth.logout()" class="btn btn-outline" style="color:#dc2626; border-color:#fecaca;">
              🚪 Logout
            </button>
          </div>
        </div>
      `;

      // Hide nav buttons
      const nav = document.querySelector('.exam-nav');
      if (nav) nav.style.display = 'none';
      const progress = document.getElementById('exam-progress');
      if (progress) progress.style.display = 'none';

      notifications.success('✅ Exam submitted successfully!');

    } catch (err) {
      notifications.error('Submission failed: ' + err.message);
    }
  },

  autoSubmit() {
    notifications.warn('⏰ Time is up! Submitting your exam...');
    this.submit();
  },

  setupProctoring() {
    Proctor.init(this.sessionId);
  },

  _zoomImage(src) {
    const overlay = document.createElement('div');
    overlay.className = 'image-zoom-overlay';
    overlay.innerHTML = `
      <div class="image-zoom-backdrop" onclick="this.parentElement.remove()"></div>
      <div class="image-zoom-content">
        <img src="${src}" alt="Zoomed Image">
        <button class="image-zoom-close" onclick="this.closest('.image-zoom-overlay').remove()">✕</button>
      </div>
    `;
    document.body.appendChild(overlay);
  },

  _escapeHtml(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }
};

window.ExamEngine = ExamEngine;
