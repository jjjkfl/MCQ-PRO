/**
 * js/teacher/teacher.js
 * Teacher Dashboard Controller
 */

const TeacherDashboard = {
  courses: [],
  banks: [],
  sessions: [],
  async init() {
    if (!auth.checkAuth()) return;
    if (this._pollingInterval) clearInterval(this._pollingInterval);
    this.bindSidebarNav();
    this.highlightSidebar('dashboard');

    // Set teacher name in welcome header
    const user = auth.getUser();
    const nameEl = document.getElementById('teacher-name');
    if (nameEl && user && user.name) nameEl.textContent = user.name;

    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');

    if (view === 'analytics-all') {
      this.highlightSidebar('analytics');
      this.switchView('analytics-all');
      this.loadAllAnalytics();
    } else if (params.has('sessionId')) {
      if (view === 'analytics') {
        this.highlightSidebar('analytics');
        this.switchView('analytics');
        Analytics.init(params.get('sessionId'));
      } else {
        this.highlightSidebar('dashboard');
        this.switchView('monitor');
        Monitor.init();
      }
    } else {
      const viewMap = {
        'materials': () => this.loadMaterials(),
        'students': () => this.loadStudentsView(),
        'forum': () => this.loadForum()
      };

      this.highlightSidebar(view || 'dashboard');
      this.switchView(view || 'dashboard');

      if (viewMap[view]) {
        viewMap[view]();
      } else {
        await this.loadDashboardData();
        await this.loadMCQBanks();

        // Real-time polling every 5 seconds
        if (this._pollingInterval) clearInterval(this._pollingInterval);
        this._pollingInterval = setInterval(() => {
          this.loadDashboardData();
          this.loadMCQBanks();
        }, 5000);
      }
    }
  },

  switchView(viewName) {
    utils.$all('.view').forEach(v => v.style.display = 'none');
    utils.$(`#view-${viewName}`).style.display = 'block';
  },

  async loadDashboardData() {
    try {
      const { data } = await api.get('/portal/teacher/dashboard');
      const { stats, recentSessions, recentResults, courses } = data;

        this.courses = courses || [];
        this.sessions = recentSessions || [];

        // Render Drive Buttons in Header
        this.renderDriveActions(this.courses);

        // Helper to update with pulse
      const updateStat = (id, val) => {
        const el = document.getElementById(id);
        if (el && el.innerText != val) {
          el.innerText = val;
          el.classList.remove('real-time-update');
          void el.offsetWidth; // trigger reflow
          el.classList.add('real-time-update');
        }
      };

      // Update stats
      updateStat('stat-active', stats.activeSessions);
      updateStat('stat-total-exams', stats.totalSessions);
      updateStat('stat-total-students', stats.totalStudents);
      updateStat('stat-banks', stats.totalMCQBanks);

      // Render Sessions
      this.renderSessions(recentSessions);

      // Render Results
      this.renderResults(recentResults);
    } catch (err) {
      console.error(err.message || 'Failed to load dashboard');
    }
  },
  
  renderDriveActions(courses) {
    const container = document.querySelector('.dashboard-actions');
    if (!container) return;

    // Remove old drive buttons if any
    container.querySelectorAll('.btn-drive-link').forEach(b => b.remove());

    if (courses.length === 0) return;

    courses.forEach(course => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary btn-drive-link';
      btn.style.cssText = 'background: #4285f4; color: #fff; border-color: #4285f4; display: flex; align-items: center; gap: 8px;';
      
      if (course.driveLink) {
        btn.innerHTML = `<i class="fab fa-google-drive"></i> ${course.courseName} Drive`;
        btn.onclick = () => window.open(course.driveLink, '_blank');
      } else {
        btn.innerHTML = `<i class="fas fa-link"></i> Set ${course.courseName} Drive`;
        btn.onclick = () => this.showEditDriveModal(course._id, course.courseName);
      }
      
      // Add context menu / long press for editing if drive exists
      if (course.driveLink) {
        btn.oncontextmenu = (e) => {
          e.preventDefault();
          this.showEditDriveModal(course._id, course.courseName);
        };
        btn.title = 'Right-click to edit drive link';
      }
      
      // Insert before the upload button (the primary button)
      const uploadBtn = container.querySelector('.btn-primary');
      if (uploadBtn) {
        container.insertBefore(btn, uploadBtn);
      } else {
        container.appendChild(btn);
      }
    });
  },

  showEditDriveModal(courseId, courseName) {
    const course = this.courses.find(c => String(c._id) === String(courseId));
    Modal.show('edit-drive', `
      <form onsubmit="TeacherDashboard.handleUpdateDrive(event, '${courseId}')">
        <div class="form-group">
          <label>Google Drive / Resource Link for <strong>${courseName}</strong></label>
          <input type="url" name="driveLink" class="form-control" placeholder="https://drive.google.com/..." value="${course?.driveLink || ''}" required>
          <p class="p-dim" style="font-size:12px; margin-top:8px;">This link will appear as a quick-access button on your dashboard. Right-click the button later to edit.</p>
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%;">Save Drive Link</button>
      </form>
    `, { title: 'Configure Course Drive' });
  },

  async handleUpdateDrive(event, courseId) {
    event.preventDefault();
    const driveLink = new FormData(event.target).get('driveLink');
    try {
      const res = await api.request(`/portal/teacher/courses/${courseId}/drive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveLink })
      });

      if (res.success) {
        notifications.success('Course Drive link updated');
        Modal.close();
        await this.loadDashboardData();
      }
    } catch (err) {
      notifications.error('Failed to update drive link: ' + err.message);
    }
  },

  renderSessions(sessions) {
    const list = document.getElementById('recent-sessions');
    if (sessions.length === 0) {
      list.innerHTML = '<tr><td colspan="5" class="p-dim" style="text-align:center">No sessions created yet</td></tr>';
      return;
    }

    list.innerHTML = sessions.map(s => `
      <tr>
        <td>
          ${s.title || s.examId} 
          ${s.division ? `<span class="p-dim" style="font-size:12px; margin-left:8px;">(Div ${s.division})</span>` : ''}
        </td>
        <td>${utils.formatDate(s.scheduledStart || s.startTime)}</td>
        <td><span class="status-pill ${s.status === 'active' ? 'active' : 'inactive'}">${s.status.toUpperCase()}</span></td>
        <td>${s.submissions || 0} Students</td>
        <td style="display:flex; gap:8px;">
          <button onclick="ExamManager.showEditSession('${s._id}')" class="btn btn-outline" style="padding: 6px 12px; font-size: 12px;">Edit</button>
          <button onclick="TeacherDashboard.goToMonitor('${s._id}')" class="btn btn-outline" style="padding: 6px 12px; font-size: 12px;">Monitor</button>
          <button onclick="TeacherDashboard.goToAnalytics('${s._id}')" class="btn btn-outline" style="padding: 6px 12px; font-size: 12px;">Results</button>
          <button onclick="TeacherDashboard.deleteSession('${s._id}')" class="btn btn-outline" style="padding: 6px 12px; font-size: 12px; color:#ef4444;"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join('');
  },

  async deleteSession(sessionId) {
    if (!confirm('Are you sure you want to delete this session?')) return;
    try {
      const res = await api.delete(`/portal/teacher/sessions/${sessionId}`);
      if (res.success) {
        notifications.success('Session deleted');
        this.loadDashboardData();
        this.loadMCQBanks();
      }
    } catch (e) {
      notifications.error('Failed to delete session');
    }
  },

  async deleteMCQBank(bankId) {
    if (!confirm('Are you sure you want to delete this MCQ bank?')) return;
    try {
      const res = await api.delete(`/portal/teacher/mcq-banks/${bankId}`);
      if (res.success) {
        notifications.success('MCQ Bank deleted');
        this.loadDashboardData();
        this.loadMCQBanks();
      }
    } catch (e) {
      notifications.error('Failed to delete MCQ Bank');
    }
  },

  renderResults(results) {
    const list = document.getElementById('recent-results');
    if (!results || results.length === 0) {
      list.innerHTML = '<tr><td colspan="4" class="p-dim" style="text-align:center">No submissions yet</td></tr>';
      return;
    }

    list.innerHTML = results.map(r => `
      <tr>
        <td><strong>${r.studentName}</strong></td>
        <td>${r.examTitle}</td>
        <td style="font-weight:700; color:${r.score >= 50 ? 'var(--success)' : 'var(--danger)'}">${r.score}%</td>
        <td>${utils.formatDate(r.submittedAt)}</td>
      </tr>
    `).join('');
  },

  async loadMCQBanks() {
    const container = document.getElementById('mcq-banks-grid');
    try {
      const { data } = await api.get('/portal/teacher/mcq-banks');
      this.banks = data || [];

      if (data.length === 0) {
        container.innerHTML = '<p class="p-dim">No MCQ banks found. Upload a PDF to get started.</p>';
        return;
      }

      container.innerHTML = data.map(bank => `
        <div class="mcq-bank-card animate-slide-up" onclick="TeacherDashboard.previewMCQBank('${bank._id}')">
          <div class="mcq-bank-header">
            <div class="mcq-bank-icon">
              <i class="fas fa-file-medical"></i>
            </div>
            <div class="mcq-bank-info">
              <h4 class="mcq-bank-title">${bank.title || 'Untitled Bank'}</h4>
              <p class="mcq-bank-course">${bank.subject || 'General Academic'}</p>
            </div>
          </div>
          <div class="mcq-bank-stats">
            <div class="mcq-bank-stat">
              <div class="mcq-bank-stat-value">${bank.questions ? bank.questions.length : 0}</div>
              <div class="mcq-bank-stat-label">MCQs</div>
            </div>
            <div class="mcq-bank-stat">
              <div class="mcq-bank-stat-value">${bank.usageCount || 0}</div>
              <div class="mcq-bank-stat-label">Used</div>
            </div>
          </div>
          <div class="mcq-bank-actions">
            <button onclick="event.stopPropagation(); ExamManager.showCreateSession('${bank._id}')" class="btn btn-primary btn-sm">Create Exam</button>
            <button onclick="event.stopPropagation(); TeacherDashboard.editMCQBank('${bank._id}')" class="btn btn-secondary btn-sm"><i class="fas fa-edit"></i></button>
            <button onclick="event.stopPropagation(); TeacherDashboard.deleteMCQBank('${bank._id}')" class="btn btn-secondary btn-sm" style="color: var(--danger);"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.error(err);
    }
  },

  async loadAllAnalytics() {
    try {
      const { data } = await api.get('/portal/teacher/results/general-analytics');

      const container = document.getElementById('global-analytics-stats');
      container.innerHTML = `
        <div class="metrics-grid">
          <div class="glass-card">
            <p class="p-dim">Total Submissions</p>
            <div class="metric-value">${data.totalSubmissions}</div>
          </div>
          <div class="glass-card">
            <p class="p-dim">Average Score</p>
            <div class="metric-value">${data.avgScore}%</div>
          </div>
          <div class="glass-card">
            <p class="p-dim">Overall Pass Rate</p>
            <div class="metric-value" style="color: var(--primary)">${data.passRate}%</div>
          </div>
        </div>
      `;

      if (typeof Charts !== 'undefined') {
        Charts.renderGrades('global-grade-chart', data.gradeBreakdown);
      }
    } catch (err) {
      notifications.error('Failed to load global analytics: ' + err.message);
    }
  },

  goToMonitor(sessionId) {
    const url = new URL(window.location);
    url.searchParams.set('sessionId', sessionId);
    url.searchParams.delete('view');
    window.history.pushState({}, '', url);
    this.init();
  },

  goToAnalytics(sessionId) {
    const url = new URL(window.location);
    url.searchParams.set('sessionId', sessionId);
    url.searchParams.set('view', 'analytics');
    window.history.pushState({}, '', url);
    this.init();
  },

  previewMCQBank(bankId) {
    const bank = this.banks.find((b) => String(b._id) === String(bankId));
    if (!bank) return notifications.error('MCQ bank not found');

    Modal.show('preview-bank', `
      <div class="preview-container">
        <div style="margin-bottom:16px;">
          <h3 class="h3">${bank.title}</h3>
          <p class="p-dim">${bank.subject || 'General'} • ${(bank.questions || []).length} Questions</p>
        </div>
        <div class="preview-scroll" style="max-height:60vh; overflow:auto; display:grid; gap:16px;">
          ${(bank.questions || []).map((q, idx) => `
            <div class="glass-card" style="padding:16px;">
              <div class="preview-q-header" style="margin-bottom:10px;">
                <strong>Q${idx + 1}</strong>
                <span class="answer-badge">Answer: ${q.correctAnswer || '-'}</span>
              </div>
              <div style="font-weight:600; margin-bottom:10px;">${q.questionText || 'Untitled question'}</div>
              <div class="preview-options">
                ${(q.options || []).map((opt) => `
                  <div class="preview-option ${opt.label === q.correctAnswer ? 'correct' : ''}">
                    <span class="opt-label">${opt.label}</span>
                    <span>${opt.text}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('') || '<p class="p-dim">No questions found.</p>'}
        </div>
      </div>
    `, { title: 'MCQ Bank Preview' });
  },

  editMCQBank(bankId) {
    const bank = this.banks.find((b) => String(b._id) === String(bankId));
    if (!bank) return notifications.error('MCQ bank not found');

    Modal.show('edit-bank', `
      <form id="edit-bank-form" onsubmit="TeacherDashboard.handleEditMCQBank(event, '${bank._id}')">
        <div class="form-group">
          <label>Bank Title</label>
          <input type="text" name="title" class="form-control" value="${(bank.title || '').replace(/"/g, '&quot;')}" required>
        </div>
        <div class="form-group">
          <label>Subject</label>
          <input type="text" name="subject" class="form-control" value="${(bank.subject || '').replace(/"/g, '&quot;')}" required>
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%;">Save Changes</button>
      </form>
    `, { title: 'Edit MCQ Bank' });
  },

  async handleEditMCQBank(event, bankId) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const payload = Object.fromEntries(formData.entries());
    try {
      await api.put(`/portal/teacher/mcq-banks/${bankId}`, payload);
      notifications.success('MCQ bank updated');
      Modal.close();
      await this.loadDashboardData();
      await this.loadMCQBanks();
    } catch (err) {
      notifications.error(err.message || 'Failed to update MCQ bank');
    }
  },

  // ─── Materials Management ───────────────────────────────────────────

  async loadMaterials() {
    const body = document.getElementById('materials-table-body');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="4" class="p-dim" style="text-align:center">Loading curriculum content...</td></tr>';

    try {
      // Need to load courses first to show labels
      if (this.courses.length === 0) await this.loadDashboardData();

      // We'll iterate through all courses or provide a filter. 
      // For now, let's just fetch all materials for all courses this teacher manages.
      const materials = [];
      for (const course of this.courses) {
        const res = await api.get(`/portal/edu/courses/${course._id}/materials`);
        if (res.success) materials.push(...res.data.map(m => ({ ...m, courseName: course.courseName })));
      }

      if (materials.length === 0) {
        body.innerHTML = '<tr><td colspan="4" class="p-dim" style="text-align:center">No materials found. Click upload to add one.</td></tr>';
        return;
      }

      body.innerHTML = materials.map(m => `
        <tr>
          <td><strong>${m.title}</strong></td>
          <td>${m.courseName}</td>
          <td><span class="badge badge-med">${m.type.toUpperCase()}</span></td>
          <td style="display:flex; gap:8px;">
            <a href="${m.url}" target="_blank" class="btn btn-outline" style="padding:4px 8px; text-decoration:none; color:var(--primary);">View</a>
            <button onclick="TeacherDashboard.deleteMaterial('${m._id}')" class="btn btn-outline" style="color:#ef4444; padding:4px 8px;">Delete</button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      notifications.error('Failed to load materials');
    }
  },

  showUploadMaterial() {
    if (this.courses.length === 0) return notifications.error('No courses available to upload to.');

    Modal.show('upload-material', `
      <form id="upload-material-form" onsubmit="TeacherDashboard.handleUploadMaterial(event)">
        <div class="form-group">
          <label>Course</label>
          <select name="courseId" class="form-control" required>
            ${this.courses.map(c => `<option value="${c._id}">${c.courseName}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Material Title</label>
          <input type="text" name="title" class="form-control" placeholder="e.g., Mathematics Lecture Notes" required>
        </div>
        <div class="form-group">
          <label>Target Grade</label>
          <select name="targetClass" class="form-control" required>
            <option value="Grade 6">Grade 6</option>
            <option value="Grade 7">Grade 7</option>
            <option value="Grade 8">Grade 8</option>
            <option value="Grade 9">Grade 9</option>
            <option value="Grade 10">Grade 10</option>
          </select>
        </div>
        <div class="form-group">
          <label>Subject</label>
          <select name="subject" class="form-control" required>
            <option value="Mathematics">Mathematics</option>
            <option value="Science">Science</option>
            <option value="English">English</option>
            <option value="Social Studies">Social Studies</option>
            <option value="Physics">Physics</option>
            <option value="Chemistry">Chemistry</option>
            <option value="Biology">Biology</option>
            <option value="History">History</option>
            <option value="Geography">Geography</option>
            <option value="Computer Science">Computer Science</option>
          </select>
        </div>
        <div class="form-group">
          <label>Target Division</label>
          <select name="targetDivision" class="form-control">
            <option value="All">All Divisions</option>
            <option value="A">Division A</option>
            <option value="B">Division B</option>
            <option value="C">Division C</option>
            <option value="D">Division D</option>
          </select>
        </div>
        <div class="form-group">
          <label>Type</label>
          <select name="type" class="form-control" onchange="TeacherDashboard.toggleMaterialInput(this.value)">
            <option value="link">External Link / Drive</option>
            <option value="pdf">Document (PDF)</option>
            <option value="note">Study Note (Docx/Text)</option>
            <option value="video">Video Link</option>
          </select>
        </div>
        <div class="form-group" id="material-url-group">
          <label>Resource URL</label>
          <input type="url" name="url" class="form-control" placeholder="https://..." required>
        </div>
        <div class="form-group" id="material-file-group" style="display:none;">
          <label>Upload File (PDF / Word)</label>
          <input type="file" name="file" class="form-control" accept=".pdf,.doc,.docx">
        </div>
        <div class="form-group">
          <label>Description (Optional)</label>
          <textarea name="description" class="form-control" rows="2"></textarea>
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%;">Upload & Distribute</button>
      </form>
    `, { title: 'Upload Course Material' });
    
    // Set initial visibility correctly
    this.toggleMaterialInput('link');
  },

  toggleMaterialInput(type) {
    const isFile = ['pdf', 'note'].includes(type);
    const fileGroup = document.getElementById('material-file-group');
    const urlGroup = document.getElementById('material-url-group');
    const urlInput = urlGroup?.querySelector('input');
    const fileInput = fileGroup?.querySelector('input');

    if (fileGroup && urlGroup) {
      fileGroup.style.display = isFile ? 'block' : 'none';
      urlGroup.style.display = isFile ? 'none' : 'block';
      
      // Update requirements
      if (urlInput) urlInput.required = !isFile;
      if (fileInput) fileInput.required = isFile;
    }
  },

  async handleUploadMaterial(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    try {
      // Use fetch directly for FormData to avoid API helper issues with multipart
      const res = await fetch('/api/portal/edu/materials', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth.getToken()}`
        },
        body: formData
      }).then(r => r.json());

      if (res.success) {
        notifications.success('Material added and distributed');
        Modal.close();
        this.loadMaterials();
      } else {
        throw new Error(res.message);
      }
    } catch (err) {
      notifications.error('Upload failed: ' + err.message);
    }
  },

  async deleteMaterial(id) {
    if (!confirm('Delete this material?')) return;
    try {
      await api.delete(`/portal/edu/materials/${id}`);
      notifications.success('Material removed');
      this.loadMaterials();
    } catch (err) {
      notifications.error('Failed to delete material');
    }
  },

  // ─── Attendance ─────────────────────────────────────────────────────

  async loadStudentsView() {
    const select = document.getElementById('attendance-session-select');
    const headerDiv = document.querySelector('#view-students header div[style]');
    if (!select) return;

    // Add buttons if not exists
    if (headerDiv && !document.getElementById('btn-manual-att')) {
      headerDiv.insertAdjacentHTML('afterbegin', `
        <button id="btn-manual-att" class="btn btn-outline" onclick="TeacherDashboard.showManualAttendance()">+ Manual Attendance</button>
        <button id="btn-add-student" class="btn btn-primary" onclick="TeacherDashboard.showAddStudentModal()">+ Add New Student</button>
      `);
    }

    // Load sessions into select
    if (this.sessions.length === 0) await this.loadDashboardData();
    select.innerHTML = '<option value="">Select Session...</option>' +
      this.sessions.map(s => `<option value="${s._id}">${s.title || s.examId}</option>`).join('');

    // Load master roster
    this.loadStudentRoster();
  },

  async loadStudentRoster() {
    const body = document.getElementById('student-roster-table-body');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="5" class="p-dim" style="text-align:center">Loading student roster...</td></tr>';

    try {
      const { data: students } = await api.get('/portal/teacher/students');
      if (students.length === 0) {
        body.innerHTML = '<tr><td colspan="5" class="p-dim" style="text-align:center">No students found in your courses.</td></tr>';
        return;
      }

      body.innerHTML = students.map(s => `
        <tr>
          <td><strong>${s.name}</strong></td>
          <td>${s.email}</td>
          <td><span class="badge badge-med">Div ${s.division}</span></td>
          <td style="font-weight:600; color:var(--primary)">${s.totalAttendance || 0} Sessions</td>
          <td>
            <button onclick="TeacherDashboard.showEditStudentModal('${s._id}')" class="btn btn-outline" style="padding:4px 8px; font-size:11px;">Edit</button>
            <button onclick="TeacherDashboard.handleDeleteStudent('${s._id}')" class="btn btn-outline" style="padding:4px 8px; font-size:11px; color:var(--danger); border-color:rgba(239, 68, 68, 0.2);">Delete</button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      notifications.error('Failed to load roster');
    }
  },

  async showAddStudentModal() {
    if (this.courses.length === 0) await this.loadDashboardData();

    Modal.show('add-student', `
      <form onsubmit="TeacherDashboard.handleAddStudent(event)">
        <div class="form-group">
          <label>Full Name</label>
          <input type="text" name="name" class="form-control" placeholder="e.g. John Doe" required>
        </div>
        <div class="form-group">
          <label>Email Address</label>
          <input type="email" name="email" class="form-control" placeholder="student@example.com" required>
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" name="password" class="form-control" placeholder="Minimal 6 characters" required minlength="6">
        </div>
        <div class="form-group">
          <label>Assign to Course</label>
          <select name="courseId" class="form-control" required>
            ${this.courses.map(c => `<option value="${c._id}">${c.courseName}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Division</label>
          <select name="division" class="form-control" required>
            <option value="A">Division A</option>
            <option value="B">Division B</option>
            <option value="C">Division C</option>
            <option value="D">Division D</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%;">Create Student Account</button>
      </form>
    `, { title: 'Register New Student' });
  },

  async handleAddStudent(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target).entries());
    try {
      await api.post('/portal/teacher/students', data);
      notifications.success('Student account created successfully');
      Modal.close();
      this.loadStudentRoster();
    } catch (err) {
      notifications.error('Registration failed: ' + err.message);
    }
  },

  async showEditStudentModal(id) {
    try {
      // Need a way to get details. Could fetch all or fetch single.
      // Fetching all for now since it's cached in UI or just fetch fresh.
      const { data: students } = await api.get('/portal/teacher/students');
      const s = students.find(x => x._id === id);
      if (!s) return notifications.error('Student not found');

      if (this.courses.length === 0) await this.loadDashboardData();

      Modal.show('edit-student', `
        <form onsubmit="TeacherDashboard.handleEditStudent(event, '${id}')">
          <div class="form-group">
            <label>Full Name</label>
            <input type="text" name="name" class="form-control" value="${s.name}" required>
          </div>
          <div class="form-group">
            <label>Email Address</label>
            <input type="email" name="email" class="form-control" value="${s.email}" required>
          </div>
          <div class="form-group">
            <label>Assign to Course</label>
            <select name="courseId" class="form-control" required>
              ${this.courses.map(c => `<option value="${c._id}" ${c._id === s.courseId ? 'selected' : ''}>${c.courseName}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Division</label>
            <select name="division" class="form-control" required>
              <option value="A" ${s.division === 'A' ? 'selected' : ''}>Division A</option>
              <option value="B" ${s.division === 'B' ? 'selected' : ''}>Division B</option>
              <option value="C" ${s.division === 'C' ? 'selected' : ''}>Division C</option>
              <option value="D" ${s.division === 'D' ? 'selected' : ''}>Division D</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;">Update Student Profile</button>
        </form>
      `, { title: 'Edit Student Profile' });
    } catch (err) {
      notifications.error('Failed to load student details');
    }
  },

  async handleEditStudent(event, id) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target).entries());
    try {
      await api.request(`/portal/teacher/students/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      notifications.success('Student profile updated');
      Modal.close();
      this.loadStudentRoster();
    } catch (err) {
      notifications.error('Update failed: ' + err.message);
    }
  },

  async handleDeleteStudent(id) {
    if (!confirm('Are you sure you want to permanently delete this student? All academic records for this student will be lost.')) return;
    try {
      await api.delete(`/portal/teacher/students/${id}`);
      notifications.success('Student deleted');
      this.loadStudentRoster();
    } catch (err) {
      notifications.error('Delete failed: ' + err.message);
    }
  },

  async showManualAttendance() {
    const sessionId = document.getElementById('attendance-session-select').value;
    if (!sessionId) return notifications.error('Please select a session first');

    try {
      const { data: students } = await api.get('/portal/teacher/students');

      Modal.show('manual-attendance', `
        <form onsubmit="TeacherDashboard.handleManualAttendance(event, '${sessionId}')">
          <div class="form-group">
            <label>Select Student</label>
            <select name="studentId" class="form-control" required>
              ${students.map(s => `<option value="${s._id}">${s.name} (${s.email})</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Status</label>
            <select name="status" class="form-control">
              <option value="present">Present</option>
              <option value="absent">Absent</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;">Mark Attendance</button>
        </form>
      `, { title: 'Manual Attendance Entry' });
    } catch (err) {
      notifications.error('Failed to load students');
    }
  },

  async handleManualAttendance(event, sessionId) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target).entries());
    try {
      await api.post('/portal/edu/attendance', { ...data, sessionId });
      notifications.success('Attendance marked manually');
      Modal.close();
      this.loadAttendance(sessionId);
      this.loadStudentRoster(); // Sync the master roster count
    } catch (err) {
      notifications.error('Failed to mark attendance');
    }
  },

  async loadAttendance(sessionId) {
    if (!sessionId) return;
    const body = document.getElementById('attendance-table-body');
    body.innerHTML = '<tr><td colspan="5" class="p-dim" style="text-align:center">Loading attendance records...</td></tr>';

    try {
      const { data } = await api.get(`/portal/edu/attendance/${sessionId}`);
      const students = data || [];

      if (students.length === 0) {
        body.innerHTML = '<tr><td colspan="5" class="p-dim" style="text-align:center">No students have joined this session yet.</td></tr>';
        return;
      }

      body.innerHTML = students.map(att => `
        <tr>
          <td><strong>${att.studentId?.name || 'Unknown'}</strong></td>
          <td>${att.studentId?.email || '-'}</td>
          <td>
            <span class="status-pill ${att.status === 'present' ? 'status-online' : 'status-offline'}">
              ${att.status.toUpperCase()}
            </span>
          </td>
          <td>${new Date(att.markedAt).toLocaleTimeString()}</td>
          <td style="display:flex; gap:8px;">
            <button onclick="TeacherDashboard.markAttendanceStatus('${sessionId}', '${att.studentId?._id}', 'present')" class="btn btn-outline" style="padding:4px 8px; font-size:11px;">Present</button>
            <button onclick="TeacherDashboard.markAttendanceStatus('${sessionId}', '${att.studentId?._id}', 'absent')" class="btn btn-outline" style="padding:4px 8px; font-size:11px;">Absent</button>
            <button onclick="TeacherDashboard.deleteAttendanceRecord('${att._id}', '${sessionId}')" class="btn btn-outline" style="padding:4px 8px; font-size:11px; color:#ef4444;"><i class="fas fa-trash"></i></button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      notifications.error('Failed to load attendance');
    }
  },

  async markAttendanceStatus(sessionId, studentId, status) {
    try {
      await api.post('/portal/edu/attendance', { sessionId, studentId, status });
      notifications.success(`Status updated to ${status}`);
      this.loadAttendance(sessionId);
      this.loadStudentRoster(); // Sync the master roster count
    } catch (err) {
      notifications.error('Failed to update status');
    }
  },

  async deleteAttendanceRecord(id, sessionId) {
    if (!confirm('Remove this attendance record?')) return;
    try {
      await api.delete(`/portal/edu/attendance/${id}`);
      notifications.success('Record removed');
      this.loadAttendance(sessionId);
    } catch (err) {
      notifications.error('Failed to delete record');
    }
  },

  loadForum() {
    const container = document.getElementById('teacher-forum-container');
    container.innerHTML = `
      <div class="glass-card" style="margin-bottom:24px;">
        <h3 class="h3">Forum Management</h3>
        <p class="p-dim">Teachers can monitor discussions and guide student queries.</p>
      </div>
      <div id="forum-content-mount"></div>
    `;
    const mount = document.getElementById('forum-content-mount');
    this.loadForumThreads(mount);
  },

  async loadForumThreads(container) {
    try {
      const res = await api.get('/portal/edu/forum/threads');
      const threads = res.data || [];
      if (threads.length === 0) {
        container.innerHTML = '<div class="glass-card" style="text-align:center; padding: 40px;"><p class="p-dim">No forum discussions available yet.</p></div>';
        return;
      }
      container.innerHTML = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 24px;">' +
        threads.map(t => `
        <div class="glass-card animate-slide-up" style="cursor: pointer;">
          <h4 class="h3" style="font-size:16px; margin-bottom: 8px;">${t.title}</h4>
          <p class="p-dim" style="margin-bottom: 16px;">${(t.content || '').substring(0, 100)}...</p>
          <div style="font-size: 12px; color: var(--primary); font-weight: 600;">
             By: ${t.authorId ? t.authorId.name : 'Student'} • ${new Date(t.createdAt).toLocaleDateString()}
          </div>
        </div>
      `).join('') + '</div>';
    } catch (e) {
      container.innerHTML = '<p class="p-dim" style="color:var(--danger)">Failed to load forum threads.</p>';
    }
  },

  async broadcastAnnouncement() {
    if (this.courses.length === 0) return notifications.error('No courses available to broadcast to.');

    Modal.show('announcement', `
      <div class="form-group">
        <label>Course</label>
        <select id="ann-courseId" class="form-control">
          ${this.courses.map(c => `<option value="${c._id}">${c.courseName}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Announcement Title</label>
        <input type="text" id="ann-title" class="form-control" placeholder="Flash: Important update">
      </div>
      <div class="form-group">
        <label>Message Content</label>
        <textarea id="ann-content" class="form-control" rows="4"></textarea>
      </div>
      <button onclick="TeacherDashboard.sendAnnouncement()" class="btn btn-primary" style="width:100%;">Broadcast to Students</button>
    `, { title: 'Broadcast Announcement' });
  },

  async sendAnnouncement() {
    const courseId = document.getElementById('ann-courseId').value;
    const title = document.getElementById('ann-title').value;
    const content = document.getElementById('ann-content').value;
    if (!courseId || !title || !content) return;

    try {
      // Emit via socket for real-time
      if (window.TeacherSocket && TeacherSocket.socket) {
        TeacherSocket.socket.emit('broadcast-announcement', { title, content, courseId });
      }
      // Save to DB
      await api.post('/portal/edu/announcements', { courseId, title, content });
      notifications.success('Announcement broadcasted');
      Modal.close();
    } catch (err) {
      notifications.error('Failed to send announcement');
    }
  },

  bindSidebarNav() {
    document.querySelectorAll('.sidebar .nav-item[data-action]').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        const viewMap = {
          'overview': 'dashboard',
          'courses': 'materials',
          'students': 'students',
          'forum': 'forum',
          'analytics': 'analytics-all'
        };
        const viewId = viewMap[action] || 'dashboard';

        const url = new URL(window.location);
        url.searchParams.set('view', viewId);
        url.searchParams.delete('sessionId');
        window.history.pushState({}, '', url);
        this.init();
      });
    });
  },

  highlightSidebar(viewName) {
    document.querySelectorAll('.sidebar .nav-item').forEach(n => n.classList.remove('active'));

    const mapping = {
      'dashboard': 'overview',
      'materials': 'courses',
      'students': 'students',
      'forum': 'forum',
      'analytics-all': 'analytics',
      'analytics': 'analytics'
    };

    const action = mapping[viewName] || 'overview';
    const navItem = document.querySelector(`.sidebar .nav-item[data-action="${action}"]`);
    if (navItem) navItem.classList.add('active');
  }
};

document.addEventListener('DOMContentLoaded', () => TeacherDashboard.init());
window.TeacherDashboard = TeacherDashboard;

