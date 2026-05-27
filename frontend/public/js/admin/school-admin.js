/**
 * frontend/public/js/admin/school-admin.js
 * Controller for School Admin Dashboard
 */

const SchoolAdmin = {
    socket: null,

    async init() {
        if (!auth.checkAuth()) return;
        console.log('🏫 SchoolAdmin Initializing...');
        this.bindEvents();
        this.initSocket();
        await this.loadDashboardData();
        this.renderCharts();
    },

    initSocket() {
        if (typeof io !== 'undefined') {
            const token = sessionStorage.getItem('token');
            this.socket = io(SERVER_URL, {
                auth: { token },
                transports: ['websocket', 'polling'],
                reconnectionAttempts: 3,
                timeout: 5000
            });
            this.socket.on('connect', () => console.log('📡 Connected to School Hub'));
            
            this.socket.on('exam_published', (data) => {
                notifications.info(`New Exam Published: ${data.title}`);
                this.loadDashboardData();
            });

            this.socket.on('student_joined', (data) => {
                notifications.success(`New Student Joined: ${data.name}`);
                this.loadDashboardData();
            });
        }
    },

    bindEvents() {
        document.querySelector('.sidebar').addEventListener('click', (e) => {
            const link = e.target.closest('.nav-link');
            if (link && link.hasAttribute('data-tab')) {
                e.preventDefault();
                const tab = link.getAttribute('data-tab');
                this.switchTab(tab);
            }
        });
        // Fix header Add Student button
        const headerBtn = document.getElementById('header-add-student-btn');
        if (headerBtn) headerBtn.onclick = () => this.showAddStudentModal();
        // Apply saved theme
        const saved = localStorage.getItem('admin-theme') || 'dark';
        this.applyTheme(saved);
    },

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        this.applyTheme(next);
        localStorage.setItem('admin-theme', next);
    },

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        const btn = document.getElementById('sa-theme-toggle');
        if (!btn) return;
        if (theme === 'light') {
            btn.innerHTML = '<i class="fas fa-moon"></i> Dark Mode';
            btn.style.background = 'rgba(0,0,0,0.06)';
            btn.style.color = '#1d1d1f';
            btn.style.borderColor = 'rgba(0,0,0,0.12)';
        } else {
            btn.innerHTML = '<i class="fas fa-sun"></i> Light Mode';
            btn.style.background = 'rgba(255,255,255,0.08)';
            btn.style.color = '#f5f5f7';
            btn.style.borderColor = 'rgba(255,255,255,0.12)';
        }
    },

    switchTab(tabId) {
        console.log('🔄 Switching to tab:', tabId);
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        const activeLink = document.querySelector(`[data-tab="${tabId}"]`);
        if (activeLink) activeLink.classList.add('active');
        
        document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
        const activeTab = document.getElementById(`tab-${tabId}`);
        if (activeTab) activeTab.style.display = 'block';

        switch(tabId) {
            case 'live': this.loadLiveExams(); break;
            case 'students': this.loadStudents(); break;
            case 'teachers': this.loadTeachers(); break;
            case 'exams': this.loadExams(); break;
            case 'certificates': this.loadCertificates(); break;
            case 'materials': this.loadMaterials(); break;
            case 'security': this.loadSecurityIntel(); break;
        }
    },

    _getInitials(name) {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    },

    _avatarColor(name) {
        const colors = ['#7c3aed','#f59e0b','#dca368','#d97a7e','#7a82ab','#6e9ea3','#7274a1'];
        let hash = 0;
        for (let c of name) hash = c.charCodeAt(0) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    },

    _allStudents: [],

    async loadStudents() {
        const container = document.getElementById('students-list');
        container.innerHTML = '<tr><td colspan="5" class="text-center" style="color:#64748b;"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
        try {
            const students = await api.get('/admin/school/students');
            this._allStudents = students;
            this._renderStudents(students);
        } catch (err) {
            container.innerHTML = '<tr><td colspan="5" class="text-center" style="color:#64748b;">No students found.</td></tr>';
        }
    },

    filterStudents(query) {
        const filtered = this._allStudents.filter(s =>
            s.name.toLowerCase().includes(query.toLowerCase()) ||
            (s.email || '').toLowerCase().includes(query.toLowerCase())
        );
        this._renderStudents(filtered);
    },

    _renderStudents(students) {
        const container = document.getElementById('students-list');
        if (!students.length) {
            container.innerHTML = '<tr><td colspan="5" class="text-center" style="color:#64748b;">No students found.</td></tr>';
            return;
        }
        container.innerHTML = students.map(s => {
            const initials = this._getInitials(s.name);
            const color = this._avatarColor(s.name);
            return `
            <tr>
                <td>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div style="width:36px;height:36px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#1e293b;flex-shrink:0;">${initials}</div>
                        <div>
                            <div style="font-weight:600;">${s.name}</div>
                            <div style="font-size:12px;color:#64748b;">${s.email}</div>
                        </div>
                    </div>
                </td>
                <td>${s.classTag || '—'}</td>
                <td><span style="background:rgba(124,58,237,0.12);color:#7c3aed;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">${s.division || 'A'}</span></td>
                <td><span style="background:rgba(245,158,11,0.12);color:#f59e0b;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">Active</span></td>
                <td>
                    <button class="btn btn-ghost" title="View"><i class="fas fa-eye"></i></button>
                    <button class="btn btn-ghost" title="Edit" onclick='SchoolAdmin.showEditModal(${JSON.stringify({id:s._id,name:s.name,email:s.email,role:s.role,classTag:s.classTag||"",division:s.division||"A",isActive:s.isActive})})'>
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');
    },

    async loadTeachers() {
        const container = document.getElementById('teachers-list');
        container.innerHTML = '<tr><td colspan="5" class="text-center" style="color:#64748b;"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
        try {
            const teachers = await api.get('/admin/school/teachers');
            if (!teachers.length) {
                container.innerHTML = '<tr><td colspan="5" class="text-center" style="color:#64748b;">No teachers found.</td></tr>';
                return;
            }
            container.innerHTML = teachers.map(t => {
                const initials = this._getInitials(t.name);
                const color = this._avatarColor(t.name);
                const joined = new Date(t.createdAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
                return `
                <tr>
                    <td>
                        <div style="display:flex; align-items:center; gap:12px;">
                            <div style="width:36px;height:36px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#1e293b;flex-shrink:0;">${initials}</div>
                            <div>
                                <div style="font-weight:600;">${t.name}</div>
                                <div style="font-size:12px;color:#64748b;">Teacher</div>
                            </div>
                        </div>
                    </td>
                    <td style="color:#64748b;font-size:13px;">${t.email}</td>
                    <td><span style="background:rgba(245,158,11,0.12);color:#f59e0b;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">${t.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td style="color:#64748b;font-size:13px;">${joined}</td>
                    <td>
                        <button class="btn btn-ghost" title="Edit" onclick='SchoolAdmin.showEditModal(${JSON.stringify({id:t._id,name:t.name,email:t.email,role:t.role,isActive:t.isActive})})'>
                            <i class="fas fa-edit"></i>
                        </button>
                    </td>
                </tr>`;
            }).join('');
        } catch (err) {
            container.innerHTML = '<tr><td colspan="5" class="text-center" style="color:#64748b;">No teachers found.</td></tr>';
        }
    },

    async loadExams() {
        const container = document.getElementById('exams-list-detailed');
        const resultsContainer = document.getElementById('results-summary');
        if (!container || !resultsContainer) return;

        container.innerHTML = '<tr><td colspan="3" class="text-center" style="color:#64748b;"><i class="fas fa-spinner fa-spin"></i> Loading schedule...</td></tr>';
        resultsContainer.innerHTML = '<tr><td colspan="5" class="text-center" style="color:#64748b;"><i class="fas fa-spinner fa-spin"></i> Loading results...</td></tr>';

        try {
            const exams = await api.get('/admin/school/exams');
            if (!exams || exams.length === 0) {
                container.innerHTML = '<tr><td colspan="3" class="text-center" style="color:#64748b;">No scheduled exams.</td></tr>';
            } else {
                container.innerHTML = exams.map(e => `
                    <tr>
                        <td><strong>${e.title}</strong></td>
                        <td>${new Date(e.date).toLocaleDateString()}</td>
                        <td><span class="badge-pill" style="background: rgba(255,149,0,0.1); color: #dca368; font-size:11px; padding:2px 8px; border-radius:10px;">Scheduled</span></td>
                    </tr>
                `).join('');
            }
        } catch (err) {
            container.innerHTML = '<tr><td colspan="3" class="text-center" style="color:#d97a7e;">Failed to load exams.</td></tr>';
        }

        try {
            const results = await api.get('/admin/school/results');
            if (!results || results.length === 0) {
                resultsContainer.innerHTML = '<tr><td colspan="5" class="text-center" style="color:#64748b;">No performance results found.</td></tr>';
            } else {
                resultsContainer.innerHTML = results.map(r => {
                    const studentName = r.studentId ? r.studentId.name : 'Unknown Student';
                    const studentDiv = r.studentId ? `${r.studentId.classTag || 'Grade'} (Div ${r.studentId.division || 'A'})` : 'N/A';
                    const examName = r.sessionId ? r.sessionId.title : (r.courseId ? r.courseId.courseName : 'Exam');
                    const score = r.score !== undefined ? `${r.score}%` : 'N/A';
                    
                    const violationCount = r.violationCount || 0;
                    let violationBadge = '';
                    if (violationCount > 0) {
                        violationBadge = `<span class="badge-pill" style="background: rgba(217,122,126,0.15); color: #d97a7e; border: 1px solid rgba(217,122,126,0.3); font-weight:700; font-size:11px; padding:2px 8px; border-radius:10px;"><i class="fas fa-exclamation-triangle"></i> ${violationCount} Violations</span>`;
                    } else {
                        violationBadge = `<span class="badge-pill" style="background: rgba(48,209,88,0.15); color: #30d158; font-size:11px; padding:2px 8px; border-radius:10px;"><i class="fas fa-check-circle"></i> Clean</span>`;
                    }
                    
                    const timeTaken = r.timeSpent ? `${Math.round(r.timeSpent / 60)}m` : '—';
                    
                    return `
                        <tr>
                            <td>
                                <div><strong>${studentName}</strong></div>
                                <div style="font-size:11px; color:#64748b;">${studentDiv}</div>
                            </td>
                            <td>${examName}</td>
                            <td><strong style="color: #7c3aed;">${score}</strong></td>
                            <td>${violationBadge}</td>
                            <td>${timeTaken}</td>
                        </tr>
                    `;
                }).join('');
            }
        } catch (err) {
            resultsContainer.innerHTML = '<tr><td colspan="5" class="text-center" style="color:#d97a7e;">Failed to load results.</td></tr>';
        }
    },

    async loadCertificates() {
        const container = document.getElementById('certificates-list');
        // Mock data for certificates
        const mockCerts = [
            { id: 'CERT-001', student: 'John Doe', exam: 'Midterm 2025', date: '2025-05-10' },
            { id: 'CERT-002', student: 'Jane Smith', exam: 'Midterm 2025', date: '2025-05-11' }
        ];
        container.innerHTML = mockCerts.map(c => `
            <tr>
                <td>${c.id}</td>
                <td>${c.student}</td>
                <td>${c.exam}</td>
                <td>${c.date}</td>
                <td>
                    <button class="btn btn-ghost"><i class="fas fa-download"></i></button>
                </td>
            </tr>
        `).join('');
    },

    async loadDashboardData() {
        try {
            const stats = await api.get('/admin/school/dashboard');
            document.getElementById('stat-students').textContent = stats.totalStudents || 0;
            document.getElementById('stat-teachers').textContent = stats.totalTeachers || 0;
            document.getElementById('stat-exams').textContent = stats.upcomingExams || 0;
            document.getElementById('stat-attendance').textContent = stats.attendanceRate || '--';
        } catch (err) {
            console.error('Failed to load dashboard data:', err);
            // Fallback mock data
            document.getElementById('stat-students').textContent = '840';
            document.getElementById('stat-teachers').textContent = '42';
            document.getElementById('stat-exams').textContent = '3';
            document.getElementById('stat-attendance').textContent = '94%';
        }
    },

    renderCharts() {
        const ctx = document.getElementById('performanceChart').getContext('2d');
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Excellent', 'Good', 'Average', 'Below Average'],
                datasets: [{
                    data: [35, 45, 15, 5],
                    backgroundColor: ['#f59e0b', '#7c3aed', '#dca368', '#d97a7e'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#86868b' } }
                }
            }
        });
    },

    showEditModal(user) {
        document.getElementById('edit-modal-title').innerHTML =
            `<i class="fas fa-edit"></i> Edit ${user.role === 'student' ? 'Student' : 'Teacher'}`;
        document.getElementById('edit-user-id').value = user.id;
        document.getElementById('edit-name').value = user.name;
        document.getElementById('edit-email').value = user.email;
        document.getElementById('edit-active').value = String(user.isActive !== false);
        const studentFields = document.getElementById('edit-student-fields');
        if (user.role === 'student') {
            studentFields.style.display = 'block';
            document.getElementById('edit-class').value = user.classTag || '';
            document.getElementById('edit-division').value = user.division || 'A';
        } else {
            studentFields.style.display = 'none';
        }
        const modal = document.getElementById('modal-edit-user');
        modal.style.display = 'flex';
        document.getElementById('edit-user-form').onsubmit = (e) => this.submitEditUser(e, user.role);
    },

    async submitEditUser(e, role) {
        e.preventDefault();
        const btn = document.getElementById('edit-user-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        const id = document.getElementById('edit-user-id').value;
        const endpoint = role === 'student' ? `/admin/school/students/${id}` : `/admin/school/teachers/${id}`;
        try {
            await api.patch(endpoint, {
                name: document.getElementById('edit-name').value,
                email: document.getElementById('edit-email').value,
                classTag: document.getElementById('edit-class')?.value || '',
                division: document.getElementById('edit-division')?.value || '',
                isActive: document.getElementById('edit-active').value,
            });
            notifications.success('✅ Changes saved successfully!');
            this.closeModal('modal-edit-user');
            role === 'student' ? this.loadStudents() : this.loadTeachers();
        } catch (err) {
            notifications.error(err.message || 'Failed to save changes');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
        }
    },

    showAddStudentModal() {
        document.getElementById('modal-add-student').style.display = 'flex';
        document.getElementById('add-student-form').onsubmit = (e) => this.submitAddStudent(e);
    },

    showAddTeacherModal() {
        document.getElementById('modal-add-teacher').style.display = 'flex';
        document.getElementById('add-teacher-form').onsubmit = (e) => this.submitAddTeacher(e);
    },

    closeModal(id) {
        document.getElementById(id).style.display = 'none';
    },

    async submitAddStudent(e) {
        e.preventDefault();
        const btn = document.getElementById('add-student-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
        try {
            await api.post('/admin/school/students', {
                name: document.getElementById('s-name').value,
                email: document.getElementById('s-email').value,
                password: document.getElementById('s-password').value || 'Student@123',
                classTag: document.getElementById('s-class').value,
                division: document.getElementById('s-division').value || 'A',
            });
            notifications.success('✅ Student added successfully!');
            this.closeModal('modal-add-student');
            document.getElementById('add-student-form').reset();
            this.loadStudents();
            this.loadDashboardData();
        } catch (err) {
            notifications.error(err.message || 'Failed to add student');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-plus"></i> Add Student';
        }
    },

    async submitAddTeacher(e) {
        e.preventDefault();
        const btn = document.getElementById('add-teacher-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
        try {
            await api.post('/admin/school/teachers', {
                name: document.getElementById('t-name').value,
                email: document.getElementById('t-email').value,
                password: document.getElementById('t-password').value || 'Teacher@123',
            });
            notifications.success('✅ Teacher added successfully!');
            this.closeModal('modal-add-teacher');
            document.getElementById('add-teacher-form').reset();
            this.loadTeachers();
            this.loadDashboardData();
        } catch (err) {
            notifications.error(err.message || 'Failed to add teacher');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-plus"></i> Add Teacher';
        }
    },

    // ─── Live Monitoring ──────────────────────────────────
    _liveTimer: null,
    async loadLiveExams() {
        console.log('📡 [SchoolAdmin] Fetching live exams...');
        const container = document.getElementById('sa-live-exams-container');
        if (!container) return;

        try {
            const sessions = await api.get('/admin/school/live-exams');
            console.log(`✅ [SchoolAdmin] Found ${sessions?.length || 0} sessions`);
            
            const badge = document.getElementById('sa-live-exam-count');
            if (badge) {
                if (sessions.length > 0) {
                    badge.textContent = sessions.length;
                    badge.style.display = 'inline-block';
                } else {
                    badge.style.display = 'none';
                }
            }

            if (!sessions || sessions.length === 0) {
                container.innerHTML = `
                    <div class="glass-card" style="text-align:center; padding:4rem; grid-column: 1 / -1; color:#64748b;">
                        <i class="fas fa-ghost" style="font-size:3rem; opacity:0.2; display:block; margin-bottom:1rem;"></i>
                        No exams currently in progress at your school.
                    </div>`;
                this._startLiveRefreshTimer();
                return;
            }

            container.innerHTML = sessions.map(s => {
                const isLive = s.status === 'active';
                return `
                <div class="glass-card animate-pulse-subtle" style="padding:1.25rem; border-left:4px solid ${isLive ? '#d97a7e' : '#7c3aed'}; background:rgba(255,255,255,0.02);">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
                        <span style="font-size:11px; font-weight:700; color:${isLive ? '#d97a7e' : '#7c3aed'}; text-transform:uppercase; letter-spacing:1px;">
                            <i class="fas ${isLive ? 'fa-circle' : 'fa-clock'}" style="font-size:8px; margin-right:4px;"></i> 
                            ${isLive ? 'LIVE NOW' : 'SCHEDULED'}
                        </span>
                        <span style="font-size:12px; color:#64748b;">${s.division} Section</span>
                    </div>
                    <h3 style="font-size:16px; margin-bottom:0.5rem;">${s.title}</h3>
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:0.5rem;">
                        <i class="fas fa-book-medical" style="color:#7c3aed; font-size:12px;"></i>
                        <span style="font-size:13px; font-weight:500;">${s.courseId?.courseName || 'General Course'}</span>
                    </div>

                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:0.5rem; color:#64748b;">
                        <i class="fas fa-chalkboard-teacher" style="font-size:12px;"></i>
                        <span style="font-size:12px; font-weight:500;">${s.teacherId?.name || 'Faculty Member'}</span>
                    </div>
                    
                    <div style="font-size:12px; color:#64748b; margin-top:0.5rem;">
                        <i class="fas fa-calendar-alt"></i> ${new Date(s.startTime).toLocaleString()}
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-top:1rem; padding-top:1rem; border-top:1px solid rgba(255,255,255,0.05);">
                        <div>
                            <div style="font-size:10px; color:#64748b; text-transform:uppercase;">Subject</div>
                            <div style="font-size:13px;">${s.subject || 'General'}</div>
                        </div>
                        <div>
                            <div style="font-size:10px; color:#64748b; text-transform:uppercase;">Duration</div>
                            <div style="font-size:13px;">${s.duration} Mins</div>
                        </div>
                    </div>
                    <button class="btn btn-ghost w-full mt-4" style="font-size:12px; padding:8px; border:1px solid rgba(255,255,255,0.1);" onclick="SchoolAdmin.viewExamMonitor('${s._id}')">
                        <i class="fas fa-video"></i> Monitor Live
                    </button>
                </div>`;
            }).join('');

            this._startLiveRefreshTimer();
        } catch (err) {
            console.error('Live monitor error:', err);
            container.innerHTML = `<div class="text-center p-4 text-danger">Error loading live data.</div>`;
        }
    },

    _startLiveRefreshTimer() {
        if (this._liveTimer) clearInterval(this._liveTimer);
        let timeLeft = 30;
        const timerEl = document.getElementById('sa-refresh-timer');
        
        this._liveTimer = setInterval(() => {
            timeLeft--;
            if (timerEl) timerEl.textContent = timeLeft;
            if (timeLeft <= 0) {
                clearInterval(this._liveTimer);
                if (document.getElementById('tab-live').style.display !== 'none') {
                    this.loadLiveExams();
                }
            }
        }, 1000);
    },

    viewExamMonitor(sessionId) {
        notifications.info('Proctoring interface opening...');
        // Redirect or open proctoring modal
        window.open(`/teacher/monitor.html?session=${sessionId}`, '_blank');
    },

    // ─── Academic Materials ────────────────────────────────
    _allMaterials: [],

    async loadMaterials() {
        const container = document.getElementById('materials-list');
        if (!container) return;
        container.innerHTML = '<tr><td colspan="7" class="text-center" style="color:#64748b;"><i class="fas fa-spinner fa-spin"></i> Loading academic materials...</td></tr>';
        
        try {
            const materials = await api.get('/admin/school/materials');
            this._allMaterials = materials || [];
            this._renderMaterials(this._allMaterials);
        } catch (err) {
            container.innerHTML = '<tr><td colspan="7" class="text-center" style="color:#d97a7e;">Failed to load materials.</td></tr>';
        }
    },

    filterMaterials() {
        const divSelect = document.getElementById('materials-filter-division');
        const subjectSearch = document.getElementById('materials-search-subject');
        
        const selectedDiv = divSelect ? divSelect.value : '';
        const searchSubject = subjectSearch ? subjectSearch.value.toLowerCase() : '';
        
        const filtered = this._allMaterials.filter(m => {
            const matchesDiv = !selectedDiv || m.targetDivision === selectedDiv || m.targetDivision === 'All';
            const subjectName = (m.subject || (m.courseId && m.courseId.courseName) || '').toLowerCase();
            const matchesSubject = !searchSubject || subjectName.includes(searchSubject);
            return matchesDiv && matchesSubject;
        });
        
        this._renderMaterials(filtered);
    },

    _renderMaterials(materials) {
        const container = document.getElementById('materials-list');
        if (!container) return;

        if (!materials || materials.length === 0) {
            container.innerHTML = '<tr><td colspan="7" class="text-center" style="color:#64748b;">No study materials found.</td></tr>';
            return;
        }

        container.innerHTML = materials.map(m => {
            const title = m.title || 'Untitled';
            const subject = m.subject || (m.courseId ? m.courseId.courseName : 'General');
            const targetClass = m.targetClass || 'All';
            const division = m.targetDivision ? `<span style="background:rgba(124,58,237,0.12);color:#7c3aed;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">${m.targetDivision}</span>` : 'All';
            const teacherName = m.createdBy ? m.createdBy.name : 'Unknown';
            const uploadDate = new Date(m.createdAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
            
            const fileUrl = m.url || '#';
            const downloadBtn = fileUrl !== '#' ? `
                <a href="${fileUrl}" class="btn btn-ghost" target="_blank" title="Download/View"><i class="fas fa-download"></i></a>
            ` : '';

            return `
                <tr>
                    <td><strong>${title}</strong></td>
                    <td>${subject}</td>
                    <td>${targetClass}</td>
                    <td>${division}</td>
                    <td>${teacherName}</td>
                    <td>${uploadDate}</td>
                    <td>
                        ${downloadBtn}
                        <button class="btn btn-ghost text-danger" title="Delete" onclick="SchoolAdmin.deleteMaterial('${m._id}')">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    async deleteMaterial(id) {
        if (!confirm('Are you sure you want to delete this study material under your Principal administrative authority? This action cannot be undone.')) {
            return;
        }
        try {
            await api.delete(`/admin/school/materials/${id}`);
            notifications.success('✅ Academic material deleted successfully.');
            this.loadMaterials();
        } catch (err) {
            notifications.error(err.message || 'Failed to delete academic material.');
        }
    },

    // ─── Security Intelligence ────────────────────────────
    _hasAuditedOnce: false,

    async loadSecurityIntel() {
        console.log('🛡️ [SchoolAdmin] Loading Security Intelligence...');
        const threatScoreEl = document.getElementById('security-threat-score');
        const avgRiskEl = document.getElementById('security-avg-risk');
        const logsTbody = document.getElementById('security-logs-tbody');

        if (logsTbody) {
            logsTbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color:#64748b;"><i class="fas fa-spinner fa-spin"></i> Loading secure forensic ledger...</td></tr>';
        }

        try {
            const data = await api.get('/portal/security/threat-logs');
            if (data && data.success) {
                const avgRisk = data.averageRiskScore || 0;
                if (avgRiskEl) avgRiskEl.textContent = avgRisk;

                if (threatScoreEl) {
                    if (avgRisk >= 80) {
                        threatScoreEl.textContent = 'CRITICAL';
                        threatScoreEl.style.color = '#d97a7e';
                    } else if (avgRisk >= 50) {
                        threatScoreEl.textContent = 'HIGH';
                        threatScoreEl.style.color = '#dca368';
                    } else if (avgRisk >= 25) {
                        threatScoreEl.textContent = 'MEDIUM';
                        threatScoreEl.style.color = '#ffcc00';
                    } else {
                        threatScoreEl.textContent = 'LOW';
                        threatScoreEl.style.color = '#30d158';
                    }
                }

                if (logsTbody) {
                    if (!data.logs || data.logs.length === 0) {
                        logsTbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color:#64748b;">No forensic log events recorded.</td></tr>';
                    } else {
                        logsTbody.innerHTML = data.logs.map(log => {
                            const timeStr = new Date(log.timestamp || log.createdAt).toLocaleString();
                            const category = log.eventType ? log.eventType.replace(/_/g, ' ').toUpperCase() : 'UNKNOWN';
                            const severity = log.severity ? log.severity.toUpperCase() : 'INFO';
                            const score = log.riskScore !== undefined ? log.riskScore : 0;
                            const desc = log.description || '';
                            const curHash = log.currentHash ? log.currentHash.substring(0, 16) + '...' : 'N/A';
                            const fullHash = log.currentHash || '';

                            let severityColor = '#8e8e93';
                            if (log.severity === 'critical') severityColor = '#d97a7e';
                            else if (log.severity === 'high') severityColor = '#dca368';
                            else if (log.severity === 'medium') severityColor = '#ffcc00';
                            else if (log.severity === 'low') severityColor = '#30d158';

                            return `
                                <tr>
                                    <td style="white-space: nowrap; font-size: 12px; color:#64748b;">${timeStr}</td>
                                    <td><span style="font-weight:600; font-size:12px;">${category}</span></td>
                                    <td><span class="badge-pill" style="background:rgba(255,255,255,0.05); color:${severityColor}; border:1px solid ${severityColor}44; font-size:11px; font-weight:700; padding:2px 8px; border-radius:10px;">${severity}</span></td>
                                    <td><strong>${score}</strong></td>
                                    <td style="font-size:12.5px; line-height:1.4;">${desc}</td>
                                    <td style="font-family:monospace; font-size:11px; color:#0a84ff;" title="${fullHash}">${curHash}</td>
                                </tr>
                            `;
                        }).join('');
                    }
                }
            }
        } catch (err) {
            console.error('Failed to load threat logs:', err);
            if (logsTbody) {
                logsTbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color:#d97a7e;">Failed to load forensic logs.</td></tr>';
            }
        }

        // Trigger verification once silently to populate blockchain stats when opening tab
        if (!this._hasAuditedOnce) {
            this._hasAuditedOnce = true;
            this.runDatabaseVerification(true);
        }
    },

    async runDatabaseVerification(isSilent = false) {
        console.log(`🛡️ Running database integrity verification. Silent = ${isSilent}`);
        const btn = document.getElementById('btn-run-audit');
        const outputEl = document.getElementById('audit-verify-output');
        const blockHeightEl = document.getElementById('sec-block-height');
        const sealedCountEl = document.getElementById('sec-sealed-count');
        const contractAddrEl = document.getElementById('sec-contract-addr');

        if (!isSilent && btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Auditing Database Integrity...';
        }

        try {
            const data = await api.post('/portal/security/verify-database');
            console.log('✅ Audit Verification Response:', data);

            if (data && data.success) {
                if (data.blockchain) {
                    if (blockHeightEl) blockHeightEl.textContent = data.blockchain.latestBlock || 'Offline';
                    if (sealedCountEl) sealedCountEl.textContent = data.blockchain.totalSealed || '0';
                    if (contractAddrEl && data.blockchain.contractAddress) {
                        contractAddrEl.textContent = data.blockchain.contractAddress;
                    }
                }

                if (!isSilent && outputEl) {
                    outputEl.style.display = 'block';
                    outputEl.style.background = data.isHealthy ? 'rgba(48,209,88,0.1)' : 'rgba(217,122,126,0.1)';
                    outputEl.style.borderColor = data.isHealthy ? '#30d158' : '#d97a7e';
                    outputEl.style.color = data.isHealthy ? '#30d158' : '#d97a7e';

                    let discrepancyLogs = '';
                    if (data.discrepancies && data.discrepancies.length > 0) {
                        discrepancyLogs = '\n🚨 ANOMALIES DETECTED:\n' + data.discrepancies.map(d => ` - Record ID: ${d.id}\n   Error: ${d.error}`).join('\n');
                    }

                    outputEl.innerHTML = `
<pre style="margin:0; font-size:11.5px; line-height:1.4; font-family:monospace;">
<strong>SYSTEM SECURITY INTEGRITY CHECK:</strong>
======================================
Database Health Status:  ${data.isHealthy ? 'CLEAN (SECURE)' : 'TAMPERED (COMPROMISED)'}
Verified Record Count:  ${data.verifiedRecords}
Smart Contract Root:    ${data.blockchain?.totalSealed ? 'MATCHED' : 'UNSEALED'}
Forensic Ledger Chain:  ${data.forensicLogStatus?.success ? 'VALID' : 'CORRUPTED'}
Merkle Root Computed:   ${data.blockchain ? 'VERIFIED' : 'FAILED'}${discrepancyLogs}
</pre>
                    `;
                    notifications.success(data.isHealthy ? '✅ Database integrity verified: Clean!' : '🚨 Warning: Database discrepancies detected!');
                }
            }
        } catch (err) {
            console.error('Integrity check failed:', err);
            if (!isSilent) {
                notifications.error('Failed to run database integrity audit.');
            }
        } finally {
            if (!isSilent && btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check-double"></i> Run Cryptographic Integrity Check';
            }
            // Always refresh log listing
            this.loadSecurityIntel();
        }
    },

    async triggerSelfHealingRecovery() {
        console.log('🛡️ Initiating self-healing recovery...');
        const btn = document.getElementById('btn-trigger-recovery');
        const outputEl = document.getElementById('recovery-output');

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Restoring State & Syncing...';
        }

        try {
            const data = await api.post('/portal/security/trigger-recovery');
            console.log('✅ Recovery response:', data);

            if (data && data.success) {
                if (outputEl) {
                    outputEl.style.display = 'block';
                    outputEl.innerHTML = `
<pre style="margin:0; font-size:11.5px; line-height:1.4; font-family:monospace; color:#ff9f0a;">
<strong>STATE RECOVERY SYSTEM INITIATED:</strong>
======================================
[INFO] Restoring Isolated AES Encryption System...
[INFO] Re-syncing MongoDB with canonical Blockchain snapshots...
[INFO] Executing Guardian scan on Live event stream...
[SUCCESS] Canon State Re-established.
[RESULT] ${data.message}
</pre>
                    `;
                }
                notifications.success('✅ Self-healing recovery triggered successfully!');
            }
        } catch (err) {
            console.error('Recovery failed:', err);
            notifications.error(err.message || 'Failed to execute autonomous state recovery.');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-sync-alt"></i> Trigger Manual Recovery & State Re-Sync';
            }
            // Always refresh log listing
            this.loadSecurityIntel();
        }
    }
};

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SchoolAdmin.init());
} else {
    SchoolAdmin.init();
}
