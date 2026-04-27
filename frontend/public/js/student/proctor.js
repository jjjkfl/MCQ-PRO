/**
 * js/student/proctor.js
 * Strict Exam Proctoring — Camera + Security Enforcement
 */

const Proctor = {
  sessionId: null,
  tabSwitchCount: 0,
  maxSwitches: 5, // Allow 5 warnings before termination
  cameraStream: null,
  cameraActive: false,
  violations: [],
  isDestroyed: false,
  faceModelsLoaded: false,
  noFaceViolationCount: 0,
  maxNoFaceSequence: 3, // Alert after 3 consecutive failures (approx 6s)
  detectionInterval: null,

  init(sessionId) {
    this.sessionId = sessionId;
    this.tabSwitchCount = 0;
    this.violations = [];
    this.isDestroyed = false;

    // ─── 1. Camera & Machine Learning Enforcement ───
    this.initFaceDetection().then(() => {
      this.startCamera();
    });

    // ─── 2. Tab Switch Detection (Immediate Violation) ───
    document.addEventListener('visibilitychange', () => {
      if (this.isDestroyed) return;
      if (document.hidden) this.handleTabSwitch();
    });

    // ─── 3. Window Blur (Immediate Violation) ───
    window.addEventListener('blur', () => {
      if (this.isDestroyed) return;
      this.handleTabSwitch();
    });

    // ─── 4. Copy/Paste/Cut Prevention ───
    ['copy', 'paste', 'cut'].forEach(evt => {
      document.addEventListener(evt, (e) => {
        if (this.isDestroyed) return;
        e.preventDefault();
        this.logViolation('copy-paste', `Attempted ${evt}`);
        notifications.error('🚫 Security Violation: Copy/Paste is strictly disabled.');
      });
    });

    // ─── 5. Right-Click Prevention ───
    document.addEventListener('contextmenu', (e) => {
      if (this.isDestroyed) return;
      e.preventDefault();
      this.logViolation('right-click', 'Context menu blocked');
    });

    // ─── 6. DevTools Detection ───
    this.detectDevTools();

    // ─── 7. MAXIMUM Screenshot / Screen Capture Prevention ───
    document.addEventListener('keydown', (e) => {
      if (this.isDestroyed) return;

      // Block PrintScreen (all variants) — blur screen instantly
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
        e.preventDefault();
        e.stopImmediatePropagation();
        try { navigator.clipboard.writeText(''); } catch (err) { }
        document.body.style.filter = 'blur(30px)';
        setTimeout(() => { document.body.style.filter = ''; }, 1500);
        this.logViolation('screenshot', 'PrintScreen blocked & screen blurred');
        notifications.error('🚫 VIOLATION: Screenshot attempt detected and blocked!');
      }

      // Block Snipping Tools: Win+Shift+S
      if (e.shiftKey && (e.metaKey || e.key === 'Meta') && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        try { navigator.clipboard.writeText(''); } catch (err) { }
        this.logViolation('screenshot', 'Windows Snipping Tool blocked');
        notifications.error('🚫 VIOLATION: Snipping Tool is strictly prohibited!');
      }

      // Block macOS screenshots: Cmd+Shift+3/4/5
      if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        try { navigator.clipboard.writeText(''); } catch (err) { }
        this.logViolation('screenshot', 'macOS screenshot blocked');
        notifications.error('🚫 VIOLATION: Screenshots are disabled!');
      }

      // Block ALL Meta/Windows key combinations (Win+G Game Bar, Win+PrtSc, etc.)
      if (e.metaKey && e.key !== 'Meta') {
        e.preventDefault();
        e.stopImmediatePropagation();
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
      // Block Ctrl+Shift+C (Inspector)
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
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
      // Block Ctrl+P (Print)
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        this.logViolation('shortcut', 'Ctrl+P (Print) blocked');
      }
      // Block Ctrl+W (Close Tab)
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        this.logViolation('shortcut', 'Ctrl+W blocked');
      }
      // Block Ctrl+T (New Tab)
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault();
        this.logViolation('shortcut', 'Ctrl+T blocked');
      }
      // Block Ctrl+Tab (Switch Tab)
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        this.logViolation('shortcut', 'Ctrl+Tab blocked');
      }
      // Block Alt+Tab hint
      if (e.altKey && e.key === 'Tab') {
        this.logViolation('shortcut', 'Alt+Tab attempted');
      }
      // Block Ctrl+S (Save)
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
      }
      // Block Ctrl+A (Select All)
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
      }
    });

    // Flush clipboard on keyup (captures PrintScreen release)
    document.addEventListener('keyup', (e) => {
      if (this.isDestroyed) return;
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
        try { navigator.clipboard.writeText(''); } catch (err) { }
      }
    });

    // ─── 7b. Continuous Clipboard Wiper (every 2 seconds) ───
    this._clipboardWiper = setInterval(() => {
      if (this.isDestroyed) { clearInterval(this._clipboardWiper); return; }
      try { navigator.clipboard.writeText(''); } catch (err) { }
    }, 2000);

    // ─── 7c. Screen Blur on Window Blur (defeats external screenshot apps) ───
    window.addEventListener('blur', () => {
      if (this.isDestroyed) return;
      document.body.style.filter = 'blur(30px)';
    });
    window.addEventListener('focus', () => {
      if (this.isDestroyed) return;
      document.body.style.filter = '';
    });

    // ─── 7d. CSS Print & Screen-Capture Blackout ───
    const antiScreenStyle = document.createElement('style');
    antiScreenStyle.textContent = `
      @media print { body { display: none !important; } }
      body { -webkit-touch-callout: none; }
    `;
    document.head.appendChild(antiScreenStyle);

    // ─── 8. Text Selection Prevention ───
    document.addEventListener('selectstart', (e) => {
      if (this.isDestroyed) return;
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
      }
    });

    // ─── 9. Drag Prevention ───
    document.addEventListener('dragstart', (e) => {
      if (this.isDestroyed) return;
      e.preventDefault();
    });

    // ─── 10. Fullscreen Enforcement ───
    this.enforceFullscreen();

    // Monitor fullscreen exit
    document.addEventListener('fullscreenchange', () => {
      if (this.isDestroyed) return;
      if (!document.fullscreenElement) {
        this.logViolation('fullscreen-exit', 'Exited fullscreen');
        this.enforceFullscreen();
      }
    });
  },

  /* ─── Camera System ────────────────────────────────────────────── */
  async startCamera() {
    const container = document.getElementById('proctor-camera');
    const previewContainer = document.getElementById('camera-preview-box');

    // Logic: If the readiness view is hidden, use the proctor sidebar.
    // Otherwise, use the preview container if it exists.
    const readinessView = document.getElementById('readiness-view');
    const isExamStarted = readinessView && readinessView.style.display === 'none';
    const target = (isExamStarted ? container : previewContainer) || container;

    if (!target) return;

    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          facingMode: 'user'
        },
        audio: false
      });

      const video = document.createElement('video');
      video.srcObject = this.cameraStream;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.id = 'proctor-video';
      video.width = 320;
      video.height = 240;

      target.innerHTML = '';
      target.appendChild(video);
      if (previewContainer) previewContainer.style.display = 'block';

      container.classList.add('camera-active');
      this.cameraActive = true;

      // Camera status indicator
      this.updateCameraStatus(true);

      // Start Face Detection Loop if models are ready
      if (this.faceModelsLoaded) {
        this.startDetectionLoop(video);
      }

      // Monitor camera stream
      this.monitorCamera(video);


      return this.cameraStream;

    } catch (err) {
      console.error('Camera access denied:', err);
      this.cameraActive = false;
      this.updateCameraStatus(false);

      const errorHTML = `
        <div class="camera-denied">
          <span style="font-size: 24px;">🚫</span>
          <p style="font-size: 11px; margin-top: 6px;">Camera Required</p>
        </div>
      `;
      target.innerHTML = errorHTML;
      throw err;
    }
  },


  monitorCamera(video) {
    // Check every 3 seconds if camera is still active
    setInterval(() => {
      if (this.isDestroyed) return;
      if (!this.cameraStream) return;
      const tracks = this.cameraStream.getVideoTracks();
      if (tracks.length === 0 || tracks[0].readyState === 'ended' || !tracks[0].enabled) {
        this.cameraActive = false;
        this.updateCameraStatus(false);
        this.logViolation('camera-off', 'Camera was disconnected or turned off');
        notifications.error('🚫 Security Violation: Camera tracking lost! Exam terminated.');

        setTimeout(() => {
          if (typeof ExamEngine !== 'undefined') ExamEngine.submit();
        }, 1500);
      }
    }, 3000);
  },

  /* ─── Machine Learning Face Detection ────────────────────────── */
  async initFaceDetection() {
    try {
      console.log('[Proctor] Initializing ML Face Detection Models...');

      // Load from local /models directory (using TinyFaceDetector for performance)
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models')
      ]);

      this.faceModelsLoaded = true;
      console.log('[Proctor] ML Models Loaded Successfully.');

      // If camera is already active, start loop now
      const video = document.getElementById('proctor-video');
      if (video && this.faceModelsLoaded) {
        this.startDetectionLoop(video);
      }
    } catch (err) {
      console.error('[Proctor] ML Model Loading Failed:', err);
      // Fallback: Continue without ML but log it
      this.logViolation('ml-failed', 'Face detection models failed to load');
    }
  },

  startDetectionLoop(video) {
    if (this.detectionInterval) clearInterval(this.detectionInterval);

    console.log('[Proctor] Starting Strong ML Face Detection Loop...');

    // Config for "Strong and Accurate"
    const MIN_CONFIDENCE = 0.6; // Higher threshold to avoid false positives
    const MIN_FACE_SIZE = 80;   // Minimum width/height in pixels

    this.detectionInterval = setInterval(async () => {
      if (this.isDestroyed || !this.faceModelsLoaded || !this.cameraActive) return;

      try {
        // Detect faces with landmarks for accuracy
        const detections = await faceapi.detectAllFaces(
          video,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: MIN_CONFIDENCE })
        ).withFaceLandmarks(true);

        // Filter valid faces (minimum size to avoid background people)
        const validFaces = detections.filter(d =>
          d.detection.box.width > MIN_FACE_SIZE && d.detection.box.height > MIN_FACE_SIZE
        );

        const faceCount = validFaces.length;
        this.updateFaceStatus(faceCount);

        if (faceCount === 0) {
          this.noFaceViolationCount++;
          if (this.noFaceViolationCount >= this.maxNoFaceSequence) {
            this.handleDetectionViolation('no-face', 'No person detected in camera frame.');
          }
        } else if (faceCount > 1) {
          this.noFaceViolationCount = 0;
          // IMMEDIATE CRITICAL VIOLATION for multiple faces
          this.handleDetectionViolation('multiple-faces', `🚨 CRITICAL: ${faceCount} persons detected!`);
        } else {
          // Exactly one face - Accurate check
          this.noFaceViolationCount = 0;

          // Simple "Looking Away" detection via landmarks
          const landmarks = validFaces[0].landmarks;
          this.checkLookingAway(landmarks);
        }

      } catch (err) {
        console.warn('[Proctor] Face Detection Frame Error:', err);
      }
    }, 1000); // Check every 1 second for "Strong" monitoring
  },

  checkLookingAway(landmarks) {
    // Get eye positions and nose tip
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    const nose = landmarks.getNose();

    // Very simple yaw approximation: 
    // If the horizontal distance from nose to left eye vs nose to right eye is highly asymmetric
    const leftDist = Math.abs(nose[0].x - leftEye[0].x);
    const rightDist = Math.abs(nose[0].x - rightEye[3].x);
    const ratio = Math.max(leftDist, rightDist) / Math.min(leftDist, rightDist);

    if (ratio > 3.0) { // Threshold for "Significant turn"
      this.logViolation('looking-away', 'Student may be looking away from the screen');
    }
  },

  updateFaceStatus(count) {
    const bar = document.getElementById('security-status');
    if (!bar) return;

    let statusHtml = '';
    if (count === 1) {
      statusHtml = '<div class="sec-pill good"><i class="fas fa-user-check"></i> Face Detected</div>';
    } else if (count === 0) {
      statusHtml = '<div class="sec-pill danger"><i class="fas fa-user-slash"></i> Searching...</div>';
    } else {
      statusHtml = `<div class="sec-pill bad"><i class="fas fa-users"></i> ${count} Persons Detected!</div>`;
    }

    // Update or Append face status to security bar
    const existing = bar.querySelector('.face-status-pill');
    if (existing) {
      existing.outerHTML = `<div class="face-status-pill">${statusHtml}</div>`;
    } else {
      const pills = bar.querySelector('.security-pills');
      if (pills) {
        const div = document.createElement('div');
        div.className = 'face-status-pill';
        div.innerHTML = statusHtml;
        pills.appendChild(div);
      }
    }
  },

  handleDetectionViolation(type, msg) {
    this.logViolation(type, msg);
    notifications.error(msg);

    // For multiple faces, we might want to shake the screen or show a red border
    const camBox = document.getElementById('proctor-camera');
    if (camBox) {
      camBox.style.borderColor = 'var(--danger)';
      setTimeout(() => {
        if (this.cameraActive) camBox.style.borderColor = 'var(--success)';
      }, 2000);
    }
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
          <h3 style="font-weight: 600; margin-bottom: 12px;">Mandatory Camera Required</h3>
          <p class="p-dim" style="font-size: 13px; margin-bottom: 20px;">
            This exam is strictly proctored. You MUST have a working camera enabled to proceed.
            Disabling the camera during the exam will result in immediate termination.
          </p>
          <button onclick="location.reload()" 
                  class="btn btn-primary" style="width: 100%;">
            🔄 Enable Camera & Reload
          </button>
        </div>
      `, { title: '🔒 Security Requirement', closable: false });
    }
  },

  /* ─── Tab Switch Handler ───────────────────────────────────────── */
  handleTabSwitch() {
    if (this.isDestroyed) return;
    this.tabSwitchCount++;
    const switchesLeft = Math.max(0, this.maxSwitches - this.tabSwitchCount);
    this.logViolation('tab-switch', `Security Violation: Tab/Window Switch Detected. Checks remaining: ${switchesLeft}`);

    if (typeof ExamSocket !== 'undefined') ExamSocket.sendTabSwitch();

    this.updateSecurityBar();

    if (this.tabSwitchCount >= this.maxSwitches) {
      notifications.error('🚫 Security Violation: Maximum tab switches exceeded! Exam terminated.');
      setTimeout(() => {
        if (typeof ExamEngine !== 'undefined') ExamEngine.submit();
      }, 1500);
    } else {
      notifications.warn(`⚠️ Warning: Tab switching is restricted! You have ${switchesLeft} warnings left before termination.`);
    }
  },

  /* ─── DevTools Detection ───────────────────────────────────────── */
  detectDevTools() {
    // Method: check window outer vs inner size difference
    const check = () => {
      if (this.isDestroyed) return;
      const threshold = 160;
      const widthDiff = window.outerWidth - window.innerWidth > threshold;
      const heightDiff = window.outerHeight - window.innerHeight > threshold;
      if (widthDiff || heightDiff) {
        this.logViolation('devtools-open', 'DevTools may be open');
        notifications.error('🚫 Security Violation: DevTools detected! Termination imminent.');
        setTimeout(() => {
          if (typeof ExamEngine !== 'undefined') ExamEngine.submit();
        }, 3000);
      }
    };
    setInterval(check, 3000);
  },

  /* ─── Fullscreen Enforcement ───────────────────────────────────── */
  enforceFullscreen() {
    if (this.isDestroyed) return;
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
    this.isDestroyed = true;
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
      this.cameraStream = null;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { });
    }
  }
};

window.Proctor = Proctor;
