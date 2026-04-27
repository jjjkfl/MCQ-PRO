/**
 * js/teacher/upload.js
 * DOCX Upload + MCQ Preview Controller
 * Handles file upload, shows extraction progress, displays parsed MCQs with images.
 */

const PDFUpload = {
  selectedFile: null,

  handleUpload(event) {
    const file = event.target.files[0];
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (!file || !allowed.includes(file.type)) {
      notifications.error('Please select a valid PDF or Word (.docx) file.');
      return;
    }

    this.selectedFile = file;

    const isDocx = file.name.toLowerCase().endsWith('.docx');

    Modal.show('upload-details', `
      <div class="upload-form-container">
        <div class="file-preview-badge">
          <span class="file-icon">${isDocx ? '📄' : '📕'}</span>
          <div>
            <strong>${file.name}</strong>
            <span class="p-dim" style="font-size: 12px; display: block;">${(file.size / 1024).toFixed(1)} KB · ${isDocx ? 'Word Document' : 'PDF'}</span>
          </div>
        </div>
        <form id="upload-form" onsubmit="PDFUpload.process(event)" style="margin-top: 20px;">
          <div class="form-group">
            <label>Bank Title</label>
            <input type="text" name="title" class="form-control" placeholder="e.g. Chapter 1: Anatomy Basics" required>
          </div>
          <div class="form-group">
            <label>Subject</label>
            <input type="text" name="subject" class="form-control" placeholder="e.g. General Surgery" required>
          </div>
          ${!isDocx ? `
          <div class="form-group">
            <label>Number of Questions to Extract</label>
            <input type="number" name="numQuestions" class="form-control" value="20" min="5" max="100">
          </div>` : `
          <p class="p-dim" style="font-size: 12px; margin-top: 8px;">
            ✨ DOCX files are parsed structurally — questions, images, and answers are extracted directly.
          </p>`}
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 16px;">
            ${isDocx ? '📋 Extract Questions from DOCX' : '🤖 Start AI Extraction'}
          </button>
        </form>
      </div>
    `, { title: '📤 Upload Document' });

    // Reset file input so the same file can be re-selected
    event.target.value = '';
  },

  async process(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const finalData = new FormData();

    finalData.append('pdf', this.selectedFile);
    finalData.append('title', formData.get('title'));
    finalData.append('subject', formData.get('subject'));
    if (formData.get('numQuestions')) {
      finalData.append('numQuestions', formData.get('numQuestions'));
    }

    // Show processing animation
    Modal.show('processing', `
      <div style="text-align: center; padding: 32px 16px;">
        <div class="upload-spinner"></div>
        <h3 style="margin-top: 24px; font-weight: 600;">Parsing Document...</h3>
        <p class="p-dim" style="font-size: 13px; margin-top: 8px;">
          Extracting questions, options, images, and answers.
        </p>
        <div class="progress-bar-container" style="margin-top: 20px;">
          <div class="progress-bar-fill" id="upload-progress"></div>
        </div>
      </div>
    `, { title: '⏳ Processing' });

    // Animate progress bar
    this._animateProgress();

    try {
      const result = await api.upload('/portal/teacher/mcq-banks/upload', finalData);

      if (result.success) {
        notifications.success(`✅ Extracted ${result.data.questionCount} questions!`);
        this._showPreview(result.data);
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      Modal.close();
      notifications.error(`Extraction failed: ${err.message}`);
    }
  },

  /**
   * Show extracted MCQ preview with images
   */
  _showPreview(data) {
    const questions = data.questions || [];
    const meta = data.meta || {};

    let questionsHtml = questions.map((q, i) => `
      <div class="preview-question glass-card" style="margin-bottom: 16px; padding: 20px;">
        <div class="preview-q-header">
          <span class="q-badge">Q${i + 1}</span>
          ${q.correctAnswer ? `<span class="answer-badge">Answer: ${q.correctAnswer}</span>` : ''}
        </div>
        <p style="font-weight: 500; margin: 12px 0;">${this._escapeHtml(q.questionText)}</p>
        ${q.image ? `
          <div class="preview-image-container">
            <img src="${q.image}" alt="Question ${i + 1} Image" class="preview-image" 
                 onerror="this.style.display='none'">
          </div>` : ''}
        <div class="preview-options">
          ${(q.options || []).map(opt => `
            <div class="preview-option ${opt.label === q.correctAnswer ? 'correct' : ''}">
              <span class="opt-label">${opt.label}</span>
              <span>${this._escapeHtml(opt.text)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    Modal.show('mcq-preview', `
      <div class="preview-container">
        <div class="preview-summary glass-card" style="padding: 20px; margin-bottom: 20px;">
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; text-align: center;">
            <div>
              <div style="font-size: 28px; font-weight: 700; color: var(--primary);">${questions.length}</div>
              <div class="p-dim" style="font-size: 12px;">Questions</div>
            </div>
            <div>
              <div style="font-size: 28px; font-weight: 700; color: var(--success);">
                ${questions.filter(q => q.image).length}
              </div>
              <div class="p-dim" style="font-size: 12px;">With Images</div>
            </div>
            <div>
              <div style="font-size: 28px; font-weight: 700; color: var(--accent);">
                ${meta.model || 'parser'}
              </div>
              <div class="p-dim" style="font-size: 12px;">Engine</div>
            </div>
          </div>
        </div>
        <div class="preview-scroll" style="max-height: 50vh; overflow-y: auto; padding-right: 8px;">
          ${questionsHtml}
        </div>
        <button onclick="Modal.close(); if(typeof TeacherDashboard !== 'undefined') TeacherDashboard.loadMCQBanks();" 
                class="btn btn-primary" style="width: 100%; margin-top: 16px;">
          ✅ Done — Return to Dashboard
        </button>
      </div>
    `, { title: `📋 ${data.title} — ${questions.length} MCQs Extracted` });
  },

  /**
   * Animate progress bar during upload
   */
  _animateProgress() {
    let progress = 0;
    const bar = document.getElementById('upload-progress');
    if (!bar) return;

    const interval = setInterval(() => {
      progress += Math.random() * 8;
      if (progress > 90) progress = 90;
      bar.style.width = progress + '%';
    }, 300);

    // Store interval for cleanup
    this._progressInterval = interval;
  },

  _escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

window.PDFUpload = PDFUpload;
