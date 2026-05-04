/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║        PROCTOR v2.0 - Camera + Audio + Security               ║
 * ╠═══════════════════════════════════════════════════════════════╣
 * ║  ✅ Camera & Audio Monitoring (NO RECORDING)                    ║
 * ║  ✅ Face Mesh (468-point landmarks)                            ║
 * ║  ✅ Hand Tracking (21-point skeleton)                          ║
 * ║  ✅ Gaze & Head Pose Estimation                                ║
 * ║  ✅ Object Detection (phone, book, etc.)                      ║
 * ║  ✅ Tab Switch Detection                                       ║
 * ║  ✅ Copy/Paste Prevention                                       ║
 * ║  ✅ Fullscreen Enforcement                                     ║
 * ║  ✅ Screen Capture Block                                       ║
 * ║  ✅ Keyboard & Right-Click Block                               ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const Proctor = {
  version: '2.0',
  sessionId: null,

  // Streams
  cameraStream: null,
  audioStream: null,
  cameraActive: false,
  audioActive: false,

  // ML Models
  faceDetector: null,
  handsDetector: null,
  objectModel: null,
  faceModelsLoaded: false,
  handsModelsLoaded: false,

  // Detection State
  faceVisible: true,
  noFaceCount: 0,
  maxNoFace: 5,
  lookingAwayCount: 0,
  maxLookingAway: 8,
  multipleFacesCount: 0,
  maxMultipleFaces: 2,

  // Audio
  audioContext: null,
  audioAnalyser: null,
  audioThreshold: 0.012,
  audioCooldown: false,

  // Security
  tabSwitchCount: 0,
  maxTabSwitches: 3,

  // Intervals
  detectionInterval: null,
  cameraMonitorInterval: null,
  audioInterval: null,
  clipboardInterval: null,

  // Flags
  isDestroyed: false,
  fullscreenRequired: true,

  // Violations
  violations: [],

  // Canvas refs
  _video: null,
  _canvas: null,
  _ctx: null,

  /* ═══════════════════════════════════════ INIT ══════════════════ */
  init(sessionId) {
    if (this.isDestroyed === false && this.sessionId) {
      console.warn('[PROCTOR] Already initialized. Call destroy() first.');
      return;
    }

    this.sessionId = sessionId || 'session_' + Date.now();
    this._resetState();
    this._setupSurveillance();
    this._installSecurityMeasures();

    console.log(`%c[PROCTOR v${this.version}] Starting...`, 'color:#10b981;font-weight:bold');

    // Start async
    this._asyncInit();
  },

  _resetState() {
    this.isDestroyed = false;
    this.tabSwitchCount = 0;
    this.violations = [];
    this.noFaceCount = 0;
    this.lookingAwayCount = 0;
    this.multipleFacesCount = 0;
    this.cameraActive = false;
    this.audioActive = false;
    this.faceVisible = true;
    this.faceModelsLoaded = false;
    this.handsModelsLoaded = false;
    this.mobileWarningGiven = false;
    this.mobileImmunityUntil = 0;
  },

  async _asyncInit() {
    this.startCamera();
    this.startAudioMonitor();

    // Load ML models
    await this._loadModels();
  },

  /* ═════════════════════════════════ CAMERA ═════════════════════ */
  async startCamera() {
    const container = this._getContainer();
    if (!container) return;

    try {
      if (!this.cameraStream) {
        this.cameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user'
          },
          audio: false
        });
      }

      this._setupVideoElement(container);
      this.cameraActive = true;
      this._updateCameraStatusUI(true);
      this._startCameraMonitor();

    } catch (err) {
      console.error('[PROCTOR] Camera error:', err.message);
      this.cameraActive = false;
      this._showCameraError(container, err.message);
      this._updateCameraStatusUI(false);
      this._logViolation('camera-denied', err.message);
    }
  },

  _getContainer() {
    const readinessView = document.getElementById('readiness-view');
    const isExamStarted = readinessView && readinessView.style.display === 'none';

    if (isExamStarted) {
      return document.getElementById('proctor-camera')
        || document.getElementById('camera-preview-box')
        || document.querySelector('.camera-container');
    }

    return document.getElementById('camera-preview-box')
      || document.getElementById('proctor-camera')
      || document.querySelector('.camera-container');
  },

  _setupVideoElement(container) {
    const header = container.querySelector('.camera-header');
    container.innerHTML = '';
    if (header) container.appendChild(header);
    container.style.position = 'relative';

    const video = document.createElement('video');
    video.id = 'proctor-video';
    video.srcObject = this.cameraStream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.width = 640;
    video.height = 480;
    video.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 8px;
      transform: scaleX(-1);
    `;

    const canvas = document.createElement('canvas');
    canvas.id = 'proctor-canvas';
    canvas.width = 640;
    canvas.height = 480;
    canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 10;
      transform: scaleX(-1);
    `;

    const badge = document.createElement('div');
    badge.id = 'cam-live-badge';
    badge.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      background: #10b981;
      color: white;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      z-index: 15;
    `;
    badge.innerHTML = '● LIVE';

    container.appendChild(video);
    container.appendChild(canvas);
    container.appendChild(badge);

    this._video = video;
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');

    video.onloadedmetadata = () => {
      console.log('[PROCTOR] Camera ready');
      video.play().catch(e => console.warn('Autoplay prevented:', e));
      if (this.faceModelsLoaded) {
        this._startDetectionLoop();
      }
    };
  },

  _showCameraError(container, message) {
    container.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 300px;
        background: #1a1a2e;
        border-radius: 8px;
        color: #ef4444;
        padding: 20px;
      ">
        <span style="font-size: 48px;">📷</span>
        <div style="font-weight: 600; font-size: 14px; margin-top: 12px;">Camera Required</div>
        <div style="font-size: 12px; color: #888; margin-top: 8px;">${message}</div>
        <button onclick="Proctor.startCamera()" style="
          margin-top: 16px;
          padding: 10px 24px;
          background: #10b981;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
        ">Enable Camera</button>
      </div>
    `;
  },

  _startCameraMonitor() {
    if (this.cameraMonitorInterval) clearInterval(this.cameraMonitorInterval);

    this.cameraMonitorInterval = setInterval(() => {
      if (this.isDestroyed) {
        clearInterval(this.cameraMonitorInterval);
        return;
      }

      if (!this.cameraStream) {
        this._handleCameraFailure('Stream lost');
        return;
      }

      const tracks = this.cameraStream.getVideoTracks();
      if (!tracks.length || tracks[0].readyState === 'ended') {
        this._handleCameraFailure('Camera disconnected');
      }
    }, 3000);
  },

  _handleCameraFailure(reason) {
    this.cameraActive = false;
    this._updateCameraStatusUI(false);
    this._logViolation('camera-off', reason);
    this._notify('error', `🚫 Camera: ${reason}`);
  },

  _updateCameraStatusUI(active) {
    const dot = document.getElementById('camera-status-dot');
    const label = document.getElementById('camera-status-label');

    if (dot) dot.className = active ? 'status-dot active' : 'status-dot inactive';
    if (label) {
      label.textContent = active ? 'LIVE' : 'OFF';
      label.style.color = active ? '#10b981' : '#ef4444';
    }
  },

  /* ═══════════════════════════════ AUDIO ══════════════════════════ */
  async startAudioMonitor() {
    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const source = this.audioContext.createMediaStreamSource(this.audioStream);
      this.audioAnalyser = this.audioContext.createAnalyser();
      this.audioAnalyser.fftSize = 512;
      this.audioAnalyser.smoothingTimeConstant = 0.8;
      source.connect(this.audioAnalyser);

      this.audioActive = true;
      console.log('[PROCTOR] Audio monitor active');
      this._startAudioAnalysis();

    } catch (err) {
      console.warn('[PROCTOR] Audio unavailable:', err.message);
      this.audioActive = false;
    }
  },

  _startAudioAnalysis() {
    const buffer = new Float32Array(this.audioAnalyser.frequencyBinCount);
    let sustainedCount = 0;

    this.audioInterval = setInterval(() => {
      if (this.isDestroyed) {
        clearInterval(this.audioInterval);
        return;
      }

      this.audioAnalyser.getFloatTimeDomainData(buffer);

      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        sum += buffer[i] * buffer[i];
      }
      const rms = Math.sqrt(sum / buffer.length);

      this._updateAudioBar(rms);

      if (rms > this.audioThreshold) {
        sustainedCount++;

        if (sustainedCount >= 3 && !this.audioCooldown) {
          this._logViolation('audio', `Audio detected (RMS: ${rms.toFixed(4)})`);
          this.audioCooldown = true;

          setTimeout(() => {
            this.audioCooldown = false;
            sustainedCount = 0;
          }, 6000);
        }
      } else {
        sustainedCount = Math.max(0, sustainedCount - 1);
      }

    }, 400);
  },

  _updateAudioBar(rms) {
    const bar = document.getElementById('audio-level-bar');
    if (!bar) return;

    const pct = Math.min(100, (rms / this.audioThreshold) * 50);
    bar.style.width = `${pct}%`;
    bar.style.background = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#10b981';
  },

  /* ═══════════════════════════ ML MODELS ══════════════════════════ */
  async preloadModels() {
    if (this._preloadPromise) return this._preloadPromise;
    console.log('[PROCTOR] Preloading ML models in parallel...');
    this._preloadPromise = Promise.all([
      this._loadFaceMesh(),
      this._loadHands(),
      this._loadObjectDetection()
    ]).then(() => console.log('[PROCTOR] All models preloaded successfully.'));
    return this._preloadPromise;
  },

  async _loadModels() {
    try {
      await this.preloadModels();
    } catch (e) {
      console.error('[PROCTOR] Model loading error:', e);
    }
  },

  async _loadFaceMesh() {
    if (this.faceDetector) {
      this.faceModelsLoaded = true;
      if (this._video && this._video.readyState >= 2) this._startDetectionLoop();
      return;
    }

    if (typeof faceLandmarksDetection === 'undefined') {
      await this._waitFor(() => typeof faceLandmarksDetection !== 'undefined', 30000);
    }

    if (typeof faceLandmarksDetection === 'undefined') {
      throw new Error('Face detection library not loaded');
    }

    try {
      this.faceDetector = await faceLandmarksDetection.createDetector(
        faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
        { runtime: 'tfjs', refineLandmarks: true, maxFaces: 2 }
      );

      this.faceModelsLoaded = true;
      console.log('[PROCTOR] Face Mesh loaded (468 landmarks)');

      if (this._video && this._video.readyState >= 2) {
        this._startDetectionLoop();
      }
    } catch (e) {
      console.error('[PROCTOR] Face Mesh failed:', e);
    }
  },

  async _loadHands() {
    if (this.handsDetector) {
      this.handsModelsLoaded = true;
      return;
    }

    if (typeof handPoseDetection === 'undefined') {
      await this._waitFor(() => typeof handPoseDetection !== 'undefined', 30000);
    }

    if (typeof handPoseDetection === 'undefined') {
      throw new Error('Hand detection library not loaded');
    }

    try {
      this.handsDetector = await handPoseDetection.createDetector(
        handPoseDetection.SupportedModels.MediaPipeHands,
        { runtime: 'tfjs', modelType: 'lite', maxHands: 2 }
      );

      this.handsModelsLoaded = true;
      console.log('[PROCTOR] Hand tracking loaded (21 landmarks × 2 hands)');
    } catch (e) {
      console.error('[PROCTOR] Hand detection failed:', e);
    }
  },

  async _loadObjectDetection() {
    if (this.objectModel) return;

    if (typeof cocoSsd === 'undefined') {
      await this._waitFor(() => typeof cocoSsd !== 'undefined', 30000);
    }

    if (typeof cocoSsd === 'undefined') {
      throw new Error('Object detection library not loaded');
    }

    try {
      this.objectModel = await cocoSsd.load(); // Default model is more accurate
      console.log('[PROCTOR] Object detection loaded');
    } catch (e) {
      console.error('[PROCTOR] Object detection failed:', e);
    }
  },

  _waitFor(condition, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (condition()) resolve();
        else if (Date.now() - start > timeout) reject(new Error('Timeout'));
        else setTimeout(check, 500);
      };
      check();
    });
  },

  /* ══════════════════════════ DETECTION LOOP ═════════════════════ */
  _startDetectionLoop() {
    if (this.detectionInterval) clearInterval(this.detectionInterval);
    if (!this._video || !this._canvas || !this._ctx) return;

    console.log('[PROCTOR] Detection loop started');

    const loop = async () => {
      if (this.isDestroyed) return;
      if (!this.cameraActive || this._video.readyState < 2) return;

      try {
        const ctx = this._ctx;
        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

        // AI status
        ctx.fillStyle = this.faceModelsLoaded ? '#10b981' : '#ef4444';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(this.faceModelsLoaded ? '● AI ACTIVE' : '○ LOADING', 10, 18);

        if (!this.faceDetector) return;

        // Run detections
        await this._detectObjects(ctx);
        const faces = await this._detectFaces(ctx);
        await this._detectHands(ctx);

        // Update UI
        this._updateUI(faces?.length || 0);
        this.updateNavigationLock();

      } catch (e) {
        console.warn('[PROCTOR] Frame error:', e.message);
      }
    };

    this.detectionInterval = setInterval(loop, 500);
    loop();
  },

  /* ──────────── Object Detection ──────────── */
  async _detectObjects(ctx) {
    if (!this.objectModel) return;

    try {
      const objects = await this.objectModel.detect(this._video);
      const BANNED = ['cell phone', 'mobile phone', 'phone', 'book', 'laptop', 'remote', 'tablet', 'tv', 'monitor'];

      objects.forEach(obj => {
        const isBanned = BANNED.some(b => obj.class.toLowerCase().includes(b.split(' ')[0]));
        const [x, y, w, h] = obj.bbox;
        const label = obj.class.charAt(0).toUpperCase() + obj.class.slice(1);

        if (isBanned && obj.score > 0.35) {
          if (!this.mobileWarningGiven) {
            this.mobileWarningGiven = true;
            this._handleViolation('object', `Banned object: ${label}`);
            if (typeof notifications !== 'undefined') {
              notifications.error(`⚠️ ${label.toUpperCase()} DETECTED. FINAL WARNING. NEXT OFFENSE WILL TERMINATE EXAM.`, { duration: 10000 });
            }
            this.mobileImmunityUntil = Date.now() + 5000;
          } else if (Date.now() > this.mobileImmunityUntil) {
            this._handleViolation('object-critical', `Repeated use of: ${label}. Terminating exam.`);
            if (typeof ExamEngine !== 'undefined') {
              ExamEngine.submit(true);
            }
          }

          ctx.strokeStyle = '#ff0000';
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, w, h);
          ctx.fillStyle = '#ff0000';
          ctx.font = 'bold 12px monospace';
          ctx.fillText(`⛔ ${label}`, x + 4, y + 16);
          
        } else if (obj.class !== 'person' && obj.score > 0.3) {
          // Draw a yellow debug box for non-banned objects to see what the AI is thinking
          ctx.strokeStyle = '#eab308';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);
          ctx.fillStyle = '#eab308';
          ctx.font = '10px monospace';
          ctx.fillText(`? ${label} (${Math.round(obj.score * 100)}%)`, x + 4, y + 12);
        }
      });
    } catch (e) {
      console.warn('[PROCTOR] Object detection error', e);
    }
  },

  /* ──────────── Face Detection ──────────── */
  async _detectFaces(ctx) {
    let faces = [];

    try {
      faces = await this.faceDetector.estimateFaces(this._video, { flipHorizontal: false });
    } catch (e) {
      console.error('[PROCTOR] Face estimation error:', e);
      return [];
    }

    if (faces.length === 0) {
      this._renderNoFaceWarning(ctx);
      this.noFaceCount++;
      this.faceVisible = false;

      if (this.noFaceCount >= this.maxNoFace) {
        this._handleViolation('no-face', 'No face detected');
        this.noFaceCount = 0;
      }
      return [];
    }

    this.noFaceCount = 0;
    this.faceVisible = true;

    // Multiple faces
    if (faces.length > 1) {
      this.multipleFacesCount++;
      if (this.multipleFacesCount >= this.maxMultipleFaces) {
        this._handleViolation('multiple-faces', `${faces.length} persons detected`);
        this.multipleFacesCount = 0;
      }
    } else {
      this.multipleFacesCount = Math.max(0, this.multipleFacesCount - 1);
    }

    faces.forEach((face, idx) => {
      const kp = face.keypoints;
      const isPrimary = idx === 0;

      // Draw mesh
      this._drawFaceMesh(ctx, kp, isPrimary);

      // Analyze
      const gaze = this._analyzeGaze(kp);
      const headPose = this._getHeadPose(kp);
      const eyeStatus = this._getEyeStatus(kp);
      const mouthOpen = this._isMouthOpen(kp);

      // Gaze violation
      if (!gaze) {
        this.lookingAwayCount++;
        if (this.lookingAwayCount >= this.maxLookingAway) {
          this._handleViolation('gaze', 'Not looking at screen');
          this.lookingAwayCount = 0;
        }
      } else {
        this.lookingAwayCount = Math.max(0, this.lookingAwayCount - 1);
      }

      // Head pose violation
      // DISABLED: User requested no head turn notifications
      /*
      if (Math.abs(headPose.yaw) > 35) {
        this._handleViolation('head-turn', `Head turn: ${headPose.yaw.toFixed(1)}°`);
      }
      if (headPose.pitch > 25 || headPose.pitch < -30) {
        this._handleViolation('head-tilt', `Head tilt: ${headPose.pitch.toFixed(1)}°`);
      }
      */

      // Render overlay
      this._renderFaceOverlay(ctx, face, { gaze, headPose, eyeStatus, mouthOpen }, isPrimary);
    });

    return faces;
  },

  _renderNoFaceWarning(ctx) {
    const w = this._canvas.width;
    const h = this._canvas.height;

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.strokeRect(50, 50, w - 100, h - 100);

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⚠️ NO FACE DETECTED', w / 2, h / 2);
    ctx.textAlign = 'left';
  },

  _drawFaceMesh(ctx, kp, isPrimary) {
    const color = isPrimary ? '#00ff00' : '#ff4444';

    kp.forEach((point, i) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 1.5, 0, Math.PI * 2);

      let c = color;
      if (isPrimary) {
        if ((i >= 33 && i <= 133) || (i >= 362 && i <= 263)) c = '#00ffff'; // Eyes
        else if (i >= 61 && i <= 291) c = '#ffff00'; // Mouth
        else if (i >= 1 && i <= 10) c = '#ff00ff'; // Nose
      }

      ctx.fillStyle = c;
      ctx.fill();
    });

    // Draw irises if available
    if (kp.length > 477 && kp[468] && kp[473]) {
      this._drawIris(ctx, kp[468], '#00ffff');
      this._drawIris(ctx, kp[473], '#00ffff');
    }
  },

  _drawIris(ctx, iris, color) {
    ctx.beginPath();
    ctx.arc(iris.x, iris.y, 6, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  },

  _renderFaceOverlay(ctx, face, analysis, isPrimary) {
    const { x, y, width: w, height: h } = face.box;
    const color = isPrimary ? '#00ff88' : '#ff4444';

    ctx.shadowBlur = 4;
    ctx.shadowColor = '#000';
    ctx.font = 'bold 11px monospace';

    const lines = [
      `[${isPrimary ? 'PRIMARY' : 'EXTRA'}]`,
      `[EYES]   ${analysis.eyeStatus}`,
      `[MOUTH]  ${analysis.mouthOpen ? 'OPEN' : 'CLOSED'}`,
      `[YAW]    ${analysis.headPose.yaw.toFixed(1)}°`,
      `[PITCH]  ${analysis.headPose.pitch.toFixed(1)}°`,
      `[GAZE]   ${analysis.gaze ? 'OK ✅' : 'AWAY ⚠️'}`,
    ];

    lines.forEach((line, i) => {
      const oy = y - (lines.length - i) * 14 - 8;
      ctx.fillStyle = '#000';
      ctx.fillText(line, x + 1, oy + 1);
      ctx.fillStyle = color;
      ctx.fillText(line, x, oy);
    });

    ctx.shadowBlur = 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  },

  _getHeadPose(kp) {
    try {
      const nose = kp[1];
      const leftEar = kp[234];
      const rightEar = kp[454];
      const leftEye = kp[33];
      const rightEye = kp[263];

      const leftDist = Math.abs(nose.x - leftEar.x);
      const rightDist = Math.abs(nose.x - rightEar.x);
      const yawRatio = (rightDist - leftDist) / (leftDist + rightDist + 0.001);
      const yaw = yawRatio * 100;

      const earMidY = (leftEar.y + rightEar.y) / 2;
      const faceHeight = Math.abs(kp[152].y - earMidY) || 1;
      const pitch = ((nose.y - earMidY) / faceHeight - 0.4) * 120;

      const dy = rightEye.y - leftEye.y;
      const dx = rightEye.x - leftEye.x + 0.001;
      const roll = Math.atan2(dy, dx) * (180 / Math.PI);

      return { yaw, pitch, roll };
    } catch (e) {
      return { yaw: 0, pitch: 0, roll: 0 };
    }
  },

  _analyzeGaze(kp) {
    if (kp.length > 477 && kp[468] && kp[473]) {
      const leftIris = kp[468];
      const rightIris = kp[473];

      const leftWidth = Math.abs(kp[133].x - kp[33].x) || 1;
      const rightWidth = Math.abs(kp[263].x - kp[362].x) || 1;

      const leftRatio = (leftIris.x - kp[33].x) / leftWidth;
      const rightRatio = (rightIris.x - kp[362].x) / rightWidth;
      const avgRatio = (leftRatio + rightRatio) / 2;

      return avgRatio >= 0.2 && avgRatio <= 0.8;
    }

    const pose = this._getHeadPose(kp);
    return Math.abs(pose.yaw) < 30 && Math.abs(pose.roll) < 20;
  },

  _isMouthOpen(kp) {
    const top = kp[13];
    const bottom = kp[14];
    if (!top || !bottom) return false;

    const vertical = Math.abs(top.y - bottom.y);
    const horizontal = Math.abs(top.x - bottom.x) || 1;

    return (vertical / horizontal) > 0.15;
  },

  _getEyeStatus(kp) {
    const lU = kp[159], lL = kp[145];
    const rU = kp[386], rL = kp[374];

    if (!lU || !lL || !rU || !rL) return 'UNKNOWN';

    const lOpen = Math.abs(lU.y - lL.y) > 2;
    const rOpen = Math.abs(rU.y - rL.y) > 2;

    if (!lOpen && !rOpen) return 'CLOSED';
    if (!lOpen) return 'LEFT CLOSED';
    if (!rOpen) return 'RIGHT CLOSED';
    return 'OPEN';
  },

  /* ──────────── Hand Detection ──────────── */
  async _detectHands(ctx) {
    if (!this.handsDetector || !this.handsModelsLoaded) return;

    try {
      const hands = await this.handsDetector.estimateHands(this._video, { flipHorizontal: false });

      hands.forEach(hand => {
        this._processHand(ctx, hand);
      });
    } catch (e) {
      console.warn('[PROCTOR] Hand detection error');
    }
  },

  _processHand(ctx, hand) {
    const kp = hand.keypoints;
    const side = hand.handedness || 'Unknown';

    this._drawHandSkeleton(ctx, kp, side);

    const gesture = this._classifyGesture(kp);

    const suspicious = {
      'WRITING': 'Writing gesture',
      'PHONE_HOLD': 'Phone holding',
      'EAR_TOUCH': 'Ear touch'
    };

    // Hand gestures disabled per user request
    // if (suspicious[gesture]) {
    //   this._handleViolation('hand', suspicious[gesture]);
    // }

    // Wrist label text disabled per user request to reduce UI clutter
    /*
    const wrist = kp[0];
    ctx.font = 'bold 11px monospace';
    ctx.shadowBlur = 3;
    ctx.shadowColor = '#000';

    const label = `${side} ${gesture}`;
    ctx.fillStyle = '#000';
    ctx.fillText(label, wrist.x + 1, wrist.y - 5);
    ctx.fillStyle = gesture === 'OPEN' ? '#00ff88' : '#ffcc00';
    ctx.fillText(label, wrist.x, wrist.y - 6);
    ctx.shadowBlur = 0;
    */
  },

  _drawHandSkeleton(ctx, kp, side) {
    const CONNECTIONS = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17]
    ];

    const color = side === 'Left' ? '#ff9f43' : '#54a0ff';

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    CONNECTIONS.forEach(([a, b]) => {
      if (!kp[a] || !kp[b]) return;
      ctx.beginPath();
      ctx.moveTo(kp[a].x, kp[a].y);
      ctx.lineTo(kp[b].x, kp[b].y);
      ctx.stroke();
    });

    kp.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, i === 0 ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? '#ffffff' : color;
      ctx.fill();
    });
  },

  _classifyGesture(kp) {
    if (!kp || kp.length < 21) return 'UNKNOWN';

    const tips = [4, 8, 12, 16, 20];
    const pips = [3, 6, 10, 14, 18];

    const extended = tips.map((t, i) => {
      const tip = kp[t];
      const pip = kp[pips[i]];
      return tip && pip && tip.y < pip.y - 15;
    });

    const extCount = extended.filter(Boolean).length;

    if (extCount >= 4) return 'OPEN';
    if (extCount === 0) return 'FIST';
    if (extended[1] && !extended[2] && !extended[3] && !extended[4]) return 'WRITING';
    if (extended[0] && extended[4] && !extended[1] && !extended[2] && !extended[3]) return 'PHONE_HOLD';
    if (extended[1] && !extended[0] && !extended[2] && !extended[3] && !extended[4]) return 'POINTING';

    return 'PARTIAL';
  },

  /* ══════════════════════════ UI UPDATES ═════════════════════════ */
  _updateUI(faceCount) {
    const dot = document.getElementById('camera-status-dot');
    const label = document.getElementById('camera-status-label');

    if (dot && label) {
      dot.className = faceCount === 1 ? 'status-dot active'
        : faceCount > 1 ? 'status-dot warning'
          : 'status-dot inactive';

      label.textContent = faceCount === 1 ? 'Face Detected'
        : faceCount > 1 ? `${faceCount} Persons!`
          : 'No Face';
      label.style.color = faceCount === 1 ? '#10b981'
        : faceCount > 1 ? '#ef4444'
          : '#6b7280';
    }

    // Alert overlay
    this._updateAlertOverlay(faceCount);

    // Security bar
    this.updateSecurityBar();
  },

  _updateAlertOverlay(faceCount) {
    const container = document.getElementById('proctor-camera');
    if (!container) return;

    let overlay = container.querySelector('.cam-alert-overlay');

    if (faceCount === 0) {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'cam-alert-overlay';
        overlay.style.cssText = `
          position: absolute;
          inset: 0;
          background: rgba(239, 68, 68, 0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 13px;
          font-weight: 800;
          text-align: center;
          z-index: 5;
          pointer-events: none;
          border: 3px solid #ef4444;
          border-radius: 8px;
        `;
        overlay.innerHTML = '<div>⚠️ NO FACE<br>DETECTED</div>';
        container.appendChild(overlay);
      }
    } else if (overlay) {
      overlay.remove();
    }
  },

  updateSecurityBar() {
    const bar = document.getElementById('security-status');
    if (!bar) return;

    const warningsLeft = Math.max(0, this.maxTabSwitches - this.tabSwitchCount);
    const warnLevel = warningsLeft >= 2 ? 'good' : warningsLeft === 1 ? 'warning' : 'danger';

    bar.innerHTML = `
      <div class="security-pills">
        <span class="sec-pill ${this.cameraActive ? 'good' : 'bad'}">📷 ${this.cameraActive ? 'ON' : 'OFF'}</span>
        <span class="sec-pill ${this.audioActive ? 'good' : 'bad'}">🎤 ${this.audioActive ? 'ON' : 'OFF'}</span>
        <span class="sec-pill ${document.fullscreenElement ? 'good' : 'bad'}">🖥️ ${document.fullscreenElement ? 'FS' : 'WINDOW'}</span>
        <span class="sec-pill ${warnLevel}">⚠️ ${warningsLeft}</span>
      </div>
    `;
  },

  updateNavigationLock() {
    const nextBtn = document.getElementById('next-btn');
    if (!nextBtn) return;

    if (!this.faceVisible || !this.cameraActive) {
      nextBtn.disabled = true;
      nextBtn.style.opacity = '0.4';
      nextBtn.style.cursor = 'not-allowed';
      nextBtn.innerHTML = '⚠️ Face Required';
    } else {
      nextBtn.disabled = false;
      nextBtn.style.opacity = '1';
      nextBtn.style.cursor = 'pointer';

      if (typeof ExamEngine !== 'undefined' && ExamEngine.questions) {
        const isLast = ExamEngine.currentIdx >= ExamEngine.questions.length - 1;
        nextBtn.innerHTML = isLast ? '✅ Finish' : 'Next →';
      } else {
        nextBtn.innerHTML = 'Next →';
      }
    }
  },

  /* ══════════════════════════ SURVEILLANCE ═════════════════════════ */
  _setupSurveillance() {
    // Tab visibility
    document.addEventListener('visibilitychange', () => {
      if (this.isDestroyed) return;
      if (document.hidden) this._onTabHidden();
    });

    // Window blur
    window.addEventListener('blur', () => {
      if (this.isDestroyed) return;
      this._onTabHidden();
      document.body.style.filter = 'blur(30px)';
    });

    window.addEventListener('focus', () => {
      if (this.isDestroyed) return;
      document.body.style.filter = '';
    });

    // Fullscreen change
    document.addEventListener('fullscreenchange', () => {
      if (this.isDestroyed || !this.fullscreenRequired) return;
      if (!document.fullscreenElement) {
        this._logViolation('fullscreen', 'Exited fullscreen');
        this.enforceFullscreen();
      }
      this.updateSecurityBar();
    });

    // Copy/Paste/Cut
    ['copy', 'paste', 'cut'].forEach(evt => {
      document.addEventListener(evt, e => {
        if (this.isDestroyed) return;
        e.preventDefault();
        this._handleViolation('clipboard', `${evt} blocked`);
      });
    });

    // Context menu
    document.addEventListener('contextmenu', e => {
      if (this.isDestroyed) return;
      e.preventDefault();
      this._logViolation('right-click', 'Context menu blocked');
    });

    // Selection (except inputs)
    document.addEventListener('selectstart', e => {
      if (this.isDestroyed) return;
      const tag = e.target.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault();
      }
    });

    // Drag
    document.addEventListener('dragstart', e => {
      if (this.isDestroyed) return;
      e.preventDefault();
    });
  },

  _onTabHidden() {
    this.tabSwitchCount++;
    const left = Math.max(0, this.maxTabSwitches - this.tabSwitchCount);

    this._logViolation('tab-switch', `Tab switch ${this.tabSwitchCount}/${this.maxTabSwitches}`);

    if (typeof ExamSocket !== 'undefined' && ExamSocket.socket?.connected) {
      ExamSocket.socket.emit('exam:violation', {
        sessionId: this.sessionId,
        type: 'tab-switch',
        count: this.tabSwitchCount
      });
    }

    this.updateSecurityBar();

    if (this.tabSwitchCount >= this.maxTabSwitches) {
      this._terminateExam('Maximum warnings exceeded');
    } else {
      this._notify('warn', `⚠️ Tab switch ${this.tabSwitchCount}/${this.maxTabSwitches}. ${left} left.`);
    }
  },

  /* ══════════════════════════ SECURITY MEASURES ═════════════════════ */
  _installSecurityMeasures() {
    this._installKeyboardGuard();
    this._startClipboardWiper();
    this._installAntiPrint();
    this._blockScreenCapture();
  },

  _installKeyboardGuard() {
    const handler = (e) => {
      if (this.isDestroyed) return;

      const { key, code, ctrlKey, shiftKey, metaKey } = e;

      // PrintScreen
      if (code === 'PrintScreen') {
        e.preventDefault();
        e.stopPropagation();
        this._blockScreenshot();
        this._logViolation('screenshot', 'PrintScreen blocked');
        this._notify('error', '🚫 Screenshots disabled');
      }

      // Snipping tool
      if (metaKey && shiftKey && (key === 's' || key === 'S')) {
        e.preventDefault();
        this._logViolation('screenshot', 'Snipping tool blocked');
      }

      // macOS screenshots
      if (metaKey && shiftKey && ['3', '4', '5'].includes(key)) {
        e.preventDefault();
        this._logViolation('screenshot', 'macOS screenshot blocked');
      }

      // Meta key combos
      if (metaKey && !['Meta', 'Shift', 'Control', 'Alt'].includes(key)) {
        e.preventDefault();
      }

      // DevTools shortcuts
      if (ctrlKey && shiftKey && ['I', 'J', 'C', 'K'].includes(key.toUpperCase())) {
        e.preventDefault();
        this._logViolation('devtools', 'DevTools shortcut blocked');
      }
      if (key === 'F12') {
        e.preventDefault();
        this._logViolation('devtools', 'F12 blocked');
      }

      // Block Ctrl+U, Ctrl+P, etc.
      if (ctrlKey && ['u', 'p', 's', 't', 'n', 'w'].includes(key.toLowerCase())) {
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handler, true);
    document.addEventListener('keyup', (e) => {
      if (e.code === 'PrintScreen') this._clearClipboard();
    }, true);
  },

  _blockScreenshot() {
    this._clearClipboard();
    document.body.style.filter = 'blur(50px)';
    setTimeout(() => { document.body.style.filter = ''; }, 2000);
  },

  _clearClipboard() {
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText('');
      }
    } catch (e) { }
  },

  _startClipboardWiper() {
    if (this.clipboardInterval) clearInterval(this.clipboardInterval);

    this.clipboardInterval = setInterval(() => {
      if (this.isDestroyed) {
        clearInterval(this.clipboardInterval);
        return;
      }
      this._clearClipboard();
    }, 1500);
  },

  _installAntiPrint() {
    const style = document.createElement('style');
    style.id = 'proctor-anti-print';
    style.textContent = `
      @media print {
        body, body * {
          visibility: hidden !important;
          display: none !important;
        }
      }
      * {
        -webkit-user-select: none;
        -moz-user-select: none;
        user-select: none;
      }
      input, textarea {
        -webkit-user-select: text;
        -moz-user-select: text;
        user-select: text;
      }
    `;
    document.head.appendChild(style);
  },

  _blockScreenCapture() {
    if (navigator.mediaDevices?.getDisplayMedia) {
      navigator.mediaDevices.getDisplayMedia = () => {
        this._handleViolation('screen-share', 'Screen share blocked');
        this._notify('error', '🚫 Screen sharing is prohibited');
        return Promise.reject(new Error('Screen capture disabled'));
      };
    }
  },

  /* ══════════════════════════ FULLSCREEN ═════════════════════════ */
  enforceFullscreen() {
    if (this.isDestroyed || document.fullscreenElement) return;

    const overlay = document.createElement('div');
    overlay.id = 'proctor-fs-modal';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.95);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      font-family: system-ui;
    `;
    overlay.innerHTML = `
      <div style="
        background: #1a1a2e;
        padding: 40px;
        border-radius: 16px;
        text-align: center;
        max-width: 400px;
        color: white;
      ">
        <div style="font-size: 64px;">🖥️</div>
        <h3 style="margin: 20px 0 12px; font-size: 22px;">Fullscreen Required</h3>
        <p style="margin: 0 0 24px; opacity: 0.7; font-size: 14px;">
          This exam must be taken in fullscreen mode.
        </p>
        <button id="proctor-fs-btn" style="
          background: #10b981;
          color: white;
          border: none;
          padding: 14px 32px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
        ">Enable Fullscreen</button>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('proctor-fs-btn').onclick = () => {
      this.enableFullscreen();
      overlay.remove();
    };
  },

  enableFullscreen() {
    const el = document.documentElement;
    const request = el.requestFullscreen
      || el.webkitRequestFullscreen
      || el.msRequestFullscreen;

    if (request) {
      request.call(el).catch(() => {
        this._notify('error', 'Fullscreen failed. Press F11 manually.');
      });
    }
  },

  /* ══════════════════════════ VIOLATIONS ═════════════════════════ */
  _handleViolation(type, message) {
    const v = { type, message, timestamp: new Date().toISOString() };
    this.violations.push(v);
    console.warn(`[PROCTOR] ⛔ ${type}: ${message}`);

    // Flash border
    const cam = document.getElementById('proctor-camera');
    if (cam) {
      cam.style.borderColor = '#ef4444';
      cam.style.boxShadow = '0 0 20px rgba(239,68,68,0.5)';
      setTimeout(() => {
        cam.style.borderColor = '';
        cam.style.boxShadow = '';
      }, 2000);
    }

    // Send to server
    this._sendViolation(v);
    this._notify('error', message);
  },

  _logViolation(type, detail) {
    this._handleViolation(type, detail);
  },

  _sendViolation(violation) {
    if (typeof ExamSocket !== 'undefined' && ExamSocket.socket?.connected) {
      ExamSocket.socket.emit('exam:violation', violation);
    }
  },

  _notify(level, message) {
    if (typeof notifications !== 'undefined' && notifications) {
      if (typeof notifications[level] === 'function') {
        notifications[level](message);
      } else if (typeof notifications.error === 'function') {
        notifications.error(message);
      }
    } else {
      console.log(`%c${message}`, level === 'error' ? 'color:#ef4444;font-weight:bold;' : 'color:#f59e0b;');
    }
  },

  _terminateExam(reason) {
    if (this.isDestroyed) return;

    this.isDestroyed = true;
    this._logViolation('terminated', reason);

    setTimeout(() => {
      if (typeof ExamEngine !== 'undefined' && ExamEngine.submit) {
        ExamEngine.submit(true);
      } else if (typeof window.submitExam === 'function') {
        window.submitExam(true);
      }
    }, 1000);
  },

  /* ══════════════════════════ DESTROY ═══════════════════════════ */
  destroy() {
    console.log('[PROCTOR] Destroying...');

    this.isDestroyed = true;
    this.fullscreenRequired = false;

    // Clear intervals
    ['detectionInterval', 'cameraMonitorInterval', 'audioInterval', 'clipboardInterval'].forEach(key => {
      if (this[key]) {
        clearInterval(this[key]);
        this[key] = null;
      }
    });

    // Stop streams
    [this.cameraStream, this.audioStream].forEach(stream => {
      if (stream) {
        stream.getTracks().forEach(track => {
          track.enabled = false;
          track.stop();
        });
      }
    });

    // Close audio context
    if (this.audioContext?.state !== 'closed') {
      this.audioContext.close();
    }

    // Reset DOM
    document.body.style.filter = '';
    document.querySelectorAll('.cam-alert-overlay, #proctor-fs-modal').forEach(el => el.remove());

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { });
    }

    const antiPrint = document.getElementById('proctor-anti-print');
    if (antiPrint) antiPrint.remove();

    // Clear refs
    this.cameraStream = null;
    this.audioStream = null;
    this.audioContext = null;
    this.audioAnalyser = null;
    this.faceDetector = null;
    this.handsDetector = null;
    this.objectModel = null;
    this._video = null;
    this._canvas = null;
    this._ctx = null;

    console.log('[PROCTOR] Destroyed.');
  },

  /* ══════════════════════════ GETTERS ═══════════════════════════ */
  getViolations() {
    return [...this.violations];
  },

  getStatus() {
    return {
      version: this.version,
      sessionId: this.sessionId,
      cameraActive: this.cameraActive,
      audioActive: this.audioActive,
      modelsLoaded: {
        face: this.faceModelsLoaded,
        hands: this.handsModelsLoaded
      },
      violationCount: this.violations.length,
      tabSwitchCount: this.tabSwitchCount,
      isDestroyed: this.isDestroyed
    };
  }
};

window.Proctor = Proctor;
