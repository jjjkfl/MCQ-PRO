/**
 * js/student/proctor.js
 * Strict Exam Proctoring — Camera + Security Enforcement
 */

const Proctor = {
  sessionId: null,
  tabSwitchCount: 0,
  maxSwitches: 3,
  cameraStream: null,
  cameraActive: false,
  violations: [],

  init(sessionId) {
    this.sessionId = sessionId;
    this.tabSwitchCount = 0;
    this.violations = [];

    // ─── 1. Camera Enforcement ───
    this.startCamera();

    // ─── 2. Tab Switch Detection ───
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.handleTabSwitch();
    });

    // ─── 3. Window Blur (alt-tab, clicking other windows) ───
    window.addEventListener('blur', () => {
      this.handleTabSwitch();
    });

    // ─── 4. Copy/Paste/Cut Prevention ───
    ['copy', 'paste', 'cut'].forEach(evt => {
      document.addEventListener(evt, (e) => {
        e.preventDefault();
        this.logViolation('copy-paste', `Attempted ${evt}`);
        notifications.warn('⚠️ Copy/Paste is disabled during exams.');
      });
    });

    // ─── 5. Right-Click Prevention ───
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.logViolation('right-click', 'Context menu blocked');
    });

    // ─── 6. DevTools Detection ───
    this.detectDevTools();

    // ─── 7. Print Screen / Screenshot Block ───
    document.addEventListener('keydown', (e) => {
      // Block PrintScreen
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        this.logViolation('screenshot', 'PrintScreen key blocked');
        notifications.error('🚫 Screenshots are not allowed!');
      }
      // Block Ctrl+Shift+I (DevTools)
      if (e.ctrlKey && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        this.logViolation('devtools', 'DevTools shortcut blocked');
      }
      // Block Ctrl+Shift+J (Console)
      if (e.ctrlKey && e.shiftKey && e.key === 'J') {
        e.preventDefault();
      }
      // Block Ctrl+U (View Source)
      if (e.ctrlKey && e.key === 'u') {
        e.preventDefault();
      }
      // Block F12
      if (e.key === 'F12') {
        e.preventDefault();
        this.logViolation('devtools', 'F12 blocked');
      }
      // Block Ctrl+S (Save)
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
      }
    });

    // ─── 8. Text Selection Prevention ───
    document.addEventListener('selectstart', (e) => {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
      }
    });

    // ─── 9. Drag Prevention ───
    document.addEventListener('dragstart', (e) => e.preventDefault());

    // ─── 10. Fullscreen Enforcement ───
    this.enforceFullscreen();

    // Monitor fullscreen exit
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        this.logViolation('fullscreen-exit', 'Exited fullscreen');
        this.enforceFullscreen();
      }
    });
  },

  /* ─── Camera System ────────────────────────────────────────────── */
  async startCamera() {
    const container = document.getElementById('proctor-camera');
    if (!container) return;

    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 160, height: 120, facingMode: 'user' },
        audio: false
      });

      const video = document.createElement('video');
      video.srcObject = this.cameraStream;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.id = 'proctor-video';

      container.innerHTML = '';
      container.appendChild(video);
      container.classList.add('camera-active');
      this.cameraActive = true;

      // Camera status indicator
      this.updateCameraStatus(true);

      // Monitor camera stream — auto-detect if student covers/stops camera
      this.monitorCamera(video);

    } catch (err) {
      console.error('Camera access denied:', err);
      this.cameraActive = false;
      this.updateCameraStatus(false);
      container.innerHTML = `
        <div class="camera-denied">
          <span style="font-size: 24px;">🚫</span>
          <p style="font-size: 11px; margin-top: 6px;">Camera Required</p>
        </div>
      `;

      // Show mandatory camera warning
      this.showCameraWarning();
    }
  },

  monitorCamera(video) {
    // Check every 5 seconds if camera is still active
    setInterval(() => {
      if (!this.cameraStream) return;
      const tracks = this.cameraStream.getVideoTracks();
      if (tracks.length === 0 || tracks[0].readyState === 'ended') {
        this.cameraActive = false;
        this.updateCameraStatus(false);
        this.logViolation('camera-off', 'Camera was turned off');
        notifications.error('⚠️ Camera disconnected! Please reconnect.');
      }
    }, 5000);
  },

  updateCameraStatus(active) {
    const indicator = document.getElementById('camera-status-dot');
    if (indicator) {
      indicator.className = active ? 'status-dot active' : 'status-dot inactive';
      indicator.title = active ? 'Camera Active' : 'Camera Off';
    }
    const label = document.getElementById('camera-status-label');
    if (label) {
      label.textContent = active ? 'LIVE' : 'OFF';
      label.className = active ? 'camera-label live' : 'camera-label off';
    }
  },

  showCameraWarning() {
    if (typeof Modal !== 'undefined') {
      Modal.show('camera-required', `
        <div style="text-align: center; padding: 16px;">
          <div style="font-size: 48px; margin-bottom: 16px;">📷</div>
          <h3 style="font-weight: 600; margin-bottom: 12px;">Camera Access Required</h3>
          <p class="p-dim" style="font-size: 13px; margin-bottom: 20px;">
            This exam requires your webcam to be active for proctoring. 
            Please allow camera access in your browser settings and reload.
          </p>
          <button onclick="Proctor.startCamera(); Modal.close();" 
                  class="btn btn-primary" style="width: 100%;">
            🔄 Retry Camera Access
          </button>
        </div>
      `, { title: '🔒 Security Requirement' });
    }
  },

  /* ─── Tab Switch Handler ───────────────────────────────────────── */
  handleTabSwitch() {
    this.tabSwitchCount++;
    this.logViolation('tab-switch', `Switch #${this.tabSwitchCount}`);

    if (typeof ExamSocket !== 'undefined') ExamSocket.sendTabSwitch();

    const remaining = this.maxSwitches - this.tabSwitchCount;

    if (this.tabSwitchCount >= this.maxSwitches) {
      notifications.error('🚫 Maximum tab switches reached! Auto-submitting exam...');
      this.updateSecurityBar();
      setTimeout(() => {
        if (typeof ExamEngine !== 'undefined') ExamEngine.submit();
      }, 2000);
    } else {
      notifications.warn(`⚠️ Tab switch detected! (${remaining} warning${remaining > 1 ? 's' : ''} left before auto-submit)`);
      this.updateSecurityBar();
    }
  },

  /* ─── DevTools Detection ───────────────────────────────────────── */
  detectDevTools() {
    // Method: check window outer vs inner size difference
    const check = () => {
      const threshold = 160;
      const widthDiff = window.outerWidth - window.innerWidth > threshold;
      const heightDiff = window.outerHeight - window.innerHeight > threshold;
      if (widthDiff || heightDiff) {
        this.logViolation('devtools-open', 'DevTools may be open');
      }
    };
    setInterval(check, 3000);
  },

  /* ─── Fullscreen Enforcement ───────────────────────────────────── */
  enforceFullscreen() {
    if (document.fullscreenElement) return;

    if (typeof Modal !== 'undefined') {
      Modal.show('fullscreen', `
        <div style="text-align: center; padding: 16px;">
          <div style="font-size: 48px; margin-bottom: 16px;">🖥️</div>
          <h3 style="font-weight: 600; margin-bottom: 12px;">Fullscreen Mode Required</h3>
          <p class="p-dim" style="font-size: 13px; margin-bottom: 20px;">
            This exam must be taken in fullscreen mode to ensure integrity.
          </p>
          <button onclick="Proctor.enableFullscreen()" 
                  class="btn btn-primary" style="width: 100%;">
            Enable Fullscreen
          </button>
        </div>
      `, { title: '🔒 Security Requirement' });
    }
  },

  enableFullscreen() {
    document.documentElement.requestFullscreen().then(() => {
      if (typeof Modal !== 'undefined') Modal.close();
    }).catch(() => {
      notifications.error('Could not enable fullscreen. Please try manually (F11).');
    });
  },

  /* ─── Violation Logger ─────────────────────────────────────────── */
  logViolation(type, detail) {
    const violation = {
      type,
      detail,
      timestamp: new Date().toISOString()
    };
    this.violations.push(violation);
    console.warn(`[Proctor] Violation: ${type} — ${detail}`);

    // Send to server via socket
    if (typeof ExamSocket !== 'undefined' && ExamSocket.socket) {
      ExamSocket.socket.emit('exam:violation', {
        sessionId: this.sessionId,
        violation
      });
    }
  },

  /* ─── Security Status Bar ──────────────────────────────────────── */
  updateSecurityBar() {
    const bar = document.getElementById('security-status');
    if (!bar) return;

    const switchesLeft = Math.max(0, this.maxSwitches - this.tabSwitchCount);
    const level = switchesLeft >= 2 ? 'secure' : switchesLeft >= 1 ? 'warning' : 'danger';

    bar.innerHTML = `
      <div class="security-pills">
        <div class="sec-pill ${this.cameraActive ? 'good' : 'bad'}">
          📷 ${this.cameraActive ? 'Camera ON' : 'Camera OFF'}
        </div>
        <div class="sec-pill ${document.fullscreenElement ? 'good' : 'bad'}">
          🖥️ ${document.fullscreenElement ? 'Fullscreen' : 'Windowed'}
        </div>
        <div class="sec-pill ${level}">
          ⚠️ ${switchesLeft}/${this.maxSwitches} warnings left
        </div>
      </div>
    `;
  },

  /* ─── Cleanup ──────────────────────────────────────────────────── */
  destroy() {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
      this.cameraStream = null;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }
};

window.Proctor = Proctor;
