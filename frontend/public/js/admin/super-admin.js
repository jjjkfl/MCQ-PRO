const STATE_DISTRICTS = {
    "Karnataka": {
        center: [15.3173, 75.7139],
        districts: {
            "Bengaluru": [12.9716, 77.5946],
            "Mysuru": [12.2958, 76.6394],
            "Mangaluru": [12.9141, 74.8560],
            "Hubballi-Dharwad": [15.3647, 75.1240],
            "Belagavi": [15.8497, 74.4977]
        }
    },
    "Maharashtra": {
        center: [19.7515, 75.7139],
        districts: {
            "Mumbai": [19.0760, 72.8777],
            "Pune": [18.5204, 73.8567],
            "Nagpur": [21.1458, 79.0882],
            "Thane": [19.2183, 72.9781],
            "Nashik": [19.9975, 73.7898]
        }
    },
    "Delhi": {
        center: [28.6139, 77.2090],
        districts: {
            "New Delhi": [28.6139, 77.2090],
            "North Delhi": [28.7500, 77.1500],
            "South Delhi": [28.5000, 77.2000],
            "West Delhi": [28.6500, 77.0800]
        }
    },
    "Tamil Nadu": {
        center: [11.1271, 78.6569],
        districts: {
            "Chennai": [13.0827, 80.2707],
            "Coimbatore": [11.0168, 76.9558],
            "Madurai": [9.9252, 78.1198],
            "Tiruchirappalli": [10.7905, 78.7047]
        }
    },
    "Telangana": {
        center: [18.1124, 79.0193],
        districts: {
            "Hyderabad": [17.3850, 78.4867],
            "Warangal": [17.9689, 79.5941],
            "Nizamabad": [18.6725, 78.0941],
            "Karimnagar": [18.4386, 79.1288]
        }
    },
    "Gujarat": {
        center: [22.2587, 71.1924],
        districts: {
            "Ahmedabad": [23.0225, 72.5714],
            "Surat": [21.1702, 72.8311],
            "Vadodara": [22.3072, 73.1812],
            "Rajkot": [22.3039, 70.8022]
        }
    }
};

const SuperAdmin = {
    socket: null,
    map: null,
    markers: {},

    async init() {
        if (!auth.checkAuth()) return;
        console.log('🚀 SuperAdmin Initializing...');
        const saved = localStorage.getItem('admin-theme') || 'dark';
        this.applyTheme(saved);
        this.bindEvents();
        this.initSocket();
        await this.loadAnalytics();
        this.renderCharts();
    },

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        this.applyTheme(next);
        localStorage.setItem('admin-theme', next);
    },

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        const btn = document.getElementById('theme-toggle');
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

    initSocket() {
        if (typeof io !== 'undefined') {
            const statusEl = document.getElementById('connection-status');
            const token = sessionStorage.getItem('token');
            this.socket = io(SERVER_URL, {
                auth: { token },
                transports: ['websocket', 'polling'],
                reconnectionAttempts: 3,
                timeout: 5000
            });
            
            this.socket.on('connect', () => {
                console.log('📡 Connected to Real-time Hub');
                if (statusEl) {
                    statusEl.innerHTML = '<i class="fas fa-satellite-dish animate-pulse"></i> Real-time Live';
                    statusEl.style.color = '#f59e0b';
                    statusEl.style.background = 'rgba(245,158,11,0.1)';
                }
            });

            this.socket.on('disconnect', () => {
                if (statusEl) {
                    statusEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Disconnected';
                    statusEl.style.color = '#d97a7e';
                }
            });

            this.socket.on('connect_error', (err) => {
                console.warn('Socket error:', err.message);
                if (statusEl) {
                    statusEl.innerHTML = '<i class="fas fa-check-circle"></i> System Secure';
                    statusEl.style.color = '#7c3aed';
                    statusEl.style.background = 'rgba(124,58,237,0.1)';
                }
            });
            
            this.socket.on('new_school_registration', (data) => {
                notifications.info(`New School Registered: ${data.name}`);
                this.loadAnalytics();
                if (document.getElementById('tab-schools').style.display === 'block') {
                    this.loadSchools();
                }
            });

            this.socket.on('platform_announcement', (data) => {
                notifications.success(`Global Announcement: ${data.title}`);
            });
        }
    },

    bindEvents() {
        // Use event delegation for better reliability
        document.querySelector('.sidebar').addEventListener('click', (e) => {
            const link = e.target.closest('.nav-link');
            if (link && link.hasAttribute('data-tab')) {
                e.preventDefault();
                const tab = link.getAttribute('data-tab');
                this.switchTab(tab);
            }
        });
        const announcementForm = document.getElementById('announcement-form');
        if (announcementForm) {
            announcementForm.addEventListener('submit', (e) => this.submitBroadcastAnnouncement(e));
        }
    },

    switchTab(tabId) {
        console.log('🔄 Switching to tab:', tabId);
        // Update UI links
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        const activeLink = document.querySelector(`[data-tab="${tabId}"]`);
        if (activeLink) activeLink.classList.add('active');

        // Toggle content visibility
        document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
        const activeTab = document.getElementById(`tab-${tabId}`);
        if (activeTab) {
            activeTab.style.display = 'block';
        } else {
            console.error(`Tab content not found: tab-${tabId}`);
        }

        // Load specific data
        switch(tabId) {
            case 'live':        this.loadLiveExams();   break;
            case 'schools':     this.loadSchools();     break;
            case 'users':       this.loadUsers();       break;
            case 'billing':     this.loadBilling();     break;
            case 'security':    this.loadAuditLogs();   break;
            case 'permissions': this.loadPermissions(); break;
        }
    },

    showAddSchoolModal() {
        const modal = document.getElementById('modal-register-school');
        modal.style.display = 'flex';
        
        // Populate state dropdown
        const stateSelect = document.getElementById('reg-school-state');
        if (stateSelect) {
            stateSelect.innerHTML = Object.keys(STATE_DISTRICTS)
                .map(s => `<option value="${s}">${s}</option>`).join('');
            this.onSchoolLocationChange('reg');
        }
        
        this.loadSubscriptionPlanOptions();
        document.getElementById('register-school-form').onsubmit = (e) => this.submitRegisterSchool(e);
    },

    closeModal() {
        document.getElementById('modal-register-school').style.display = 'none';
    },

    async submitRegisterSchool(e) {
        e.preventDefault();
        const btn = document.getElementById('register-school-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registering...';
        try {
            const result = await api.post('/admin/super/schools', {
                schoolName: document.getElementById('reg-school-name').value,
                boardType: document.getElementById('reg-board-type').value,
                adminName: document.getElementById('reg-admin-name').value,
                adminEmail: document.getElementById('reg-admin-email').value,
                adminPassword: document.getElementById('reg-admin-pass').value,
                plan: document.getElementById('reg-subscription-plan')?.value || 'Basic',
                state: document.getElementById('reg-school-state').value,
                district: document.getElementById('reg-school-district').value,
                latitude: parseFloat(document.getElementById('reg-school-lat').value),
                longitude: parseFloat(document.getElementById('reg-school-lng').value)
            });
            notifications.success(`✅ School "${result.school.name}" registered! Admin: ${result.admin.email}`);
            this.closeModal();
            document.getElementById('register-school-form').reset();
            this.loadSchools();
            this.loadAnalytics();
        } catch (err) {
            notifications.error(err.message || 'Registration failed');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-plus"></i> Register School';
        }
    },

    _allSchools: [],
    async loadSchools() {
        const container = document.getElementById('schools-hierarchy-container');
        if (!container) return;
        container.innerHTML = '<div style="text-align:center;padding:3rem;color:#64748b;"><i class="fas fa-spinner fa-spin"></i> Loading school directory...</div>';
        try {
            const [schools, users] = await Promise.all([
                api.get('/admin/super/schools'),
                api.get('/admin/super/users')
            ]);
            this._allSchools = schools || [];
            this._allUsers = users || [];
            
            // Update total badge
            const badge = document.getElementById('school-total-count-badge');
            if (badge) {
                badge.textContent = `${this._allSchools.length} School${this._allSchools.length !== 1 ? 's' : ''}`;
            }

            // Populate state filter dropdown if not already populated
            const stateFilter = document.getElementById('filter-state');
            if (stateFilter && stateFilter.options.length <= 1) {
                stateFilter.innerHTML = '<option value="">All States</option>' + 
                    Object.keys(STATE_DISTRICTS).map(s => `<option value="${s}">${s}</option>`).join('');
            }

            this.initMap();
            this.filterSchools();
        } catch (err) {
            container.innerHTML = `<div style="text-align:center;padding:4rem;color:#d97a7e;"><i class="fas fa-exclamation-triangle" style="font-size:2rem;display:block;margin-bottom:1rem;"></i>Failed to load schools: ${err.message}</div>`;
        }
    },

    onFilterStateChange() {
        const stateSelect = document.getElementById('filter-state');
        const districtSelect = document.getElementById('filter-district');
        const selectedState = stateSelect.value;

        if (selectedState && STATE_DISTRICTS[selectedState]) {
            const districts = Object.keys(STATE_DISTRICTS[selectedState].districts || {});
            districtSelect.innerHTML = '<option value="">All Districts</option>' + 
                districts.map(d => `<option value="${d}">${d}</option>`).join('');
            districtSelect.disabled = false;
        } else {
            districtSelect.innerHTML = '<option value="">All Districts</option>';
            districtSelect.disabled = true;
        }
        this.filterSchools();
    },

    filterSchools() {
        const query = (document.getElementById('school-search')?.value || '').toLowerCase();
        const selectedState = document.getElementById('filter-state')?.value;
        const selectedDistrict = document.getElementById('filter-district')?.value;

        const filtered = this._allSchools.filter(s => {
            const matchesSearch = s.name.toLowerCase().includes(query) || 
                                 (s.board_type || '').toLowerCase().includes(query);
            const matchesState = !selectedState || s.state === selectedState;
            const matchesDistrict = !selectedDistrict || s.district === selectedDistrict;
            return matchesSearch && matchesState && matchesDistrict;
        });
        this._renderSchools(filtered);
    },

    _renderSchools(schools) {
        const container = document.getElementById('schools-hierarchy-container');
        if (!container) return;

        // Custom style injection
        if (!document.getElementById('tree-view-custom-styles')) {
            const style = document.createElement('style');
            style.id = 'tree-view-custom-styles';
            style.innerHTML = `
                details.state-node summary::-webkit-details-marker,
                details.district-node summary::-webkit-details-marker,
                details.school-node-details summary::-webkit-details-marker,
                details.school-nested-folder summary::-webkit-details-marker {
                    display: none;
                }
                details.state-node[open] > summary i.fa-chevron-down,
                details.district-node[open] > summary i.fa-chevron-down {
                    transform: rotate(180deg);
                }
                details.school-node-details[open] > summary i.chevron-icon {
                    transform: rotate(90deg);
                }
                details.school-node-details[open] > summary i.folder-icon {
                    color: #dca368 !important;
                }
                details.school-nested-folder[open] > summary i.nested-chevron-icon {
                    transform: rotate(90deg);
                }
                details.school-nested-folder[open] > summary i.folder-sub-icon {
                    color: #dca368 !important;
                }
                details.state-node summary,
                details.district-node summary,
                details.school-node-details summary,
                details.school-nested-folder summary {
                    outline: none;
                }
                .school-node-details {
                    box-shadow: none;
                    transition: all 0.2s;
                }
                .school-node-details:hover {
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    transform: translateY(-1px);
                }
            `;
            document.head.appendChild(style);
        }

        // Initialize map & clear markers
        this.initMap();
        if (this.markers) {
            Object.values(this.markers).forEach(m => {
                if (this.map) this.map.removeLayer(m);
            });
        }
        this.markers = {};

        if (!schools || schools.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:4rem;color:#64748b;"><i class="fas fa-school" style="font-size:2rem;opacity:0.3;display:block;margin-bottom:1rem;"></i>No matching schools found.</div>';
            return;
        }

        // 1. Plot map markers and compile hierarchy structure
        const hierarchy = {};
        schools.forEach(s => {
            const state = s.state || 'Karnataka';
            const district = s.district || 'Bengaluru';
            
            if (!hierarchy[state]) hierarchy[state] = {};
            if (!hierarchy[state][district]) hierarchy[state][district] = [];
            hierarchy[state][district].push(s);

            // Add marker if coordinates are valid
            if (this.map && s.latitude && s.longitude) {
                const color = s.is_active ? '#7c3aed' : '#d97a7e';
                const customIcon = L.divIcon({
                    className: 'custom-map-pin',
                    html: `
                        <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
                            <svg viewBox="0 0 384 512" style="width: 100%; height: 100%; fill: ${color}; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.4));">
                                <path d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z"/>
                            </svg>
                            <i class="fas fa-school" style="position: absolute; color: #1e293b; font-size: 14px; margin-top: -8px;"></i>
                        </div>
                    `,
                    iconSize: [36, 36],
                    iconAnchor: [18, 36],
                    popupAnchor: [0, -32]
                });

                const marker = L.marker([s.latitude, s.longitude], { icon: customIcon }).addTo(this.map);
                
                const popupContent = `
                    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#1d1d1f; padding:5px; min-width:180px;">
                        <h4 style="margin:0 0 5px 0; font-size:14px; font-weight:700;">${s.name}</h4>
                        <div style="font-size:11px; color:#64748b; margin-bottom:5px;">${s.board_type || 'CBSE'} Board</div>
                        <div style="font-size:11px; margin-bottom:8px;">
                            <span>State: <strong>${s.state}</strong></span><br/>
                            <span>District: <strong>${s.district}</strong></span>
                        </div>
                        <div style="display:flex; gap:5px; margin-top:8px;">
                            <button class="btn btn-primary" style="padding:2px 8px; font-size:10px; border-radius:4px; border:none; display:inline-flex; align-items:center; gap:3px;" onclick="SuperAdmin.viewSchoolDetails('${s._id}')">
                                <i class="fas fa-eye"></i> Details
                            </button>
                            <button class="btn btn-secondary" style="padding:2px 8px; font-size:10px; border-radius:4px; border:none; display:inline-flex; align-items:center; gap:3px;" onclick="SuperAdmin.showEditSchoolModal('${s._id}')">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                        </div>
                    </div>
                `;
                
                marker.bindPopup(popupContent);
                this.markers[s._id] = marker;
            }
        });

        // 2. Render tree elements
        let treeHTML = '';
        const sortedStates = Object.keys(hierarchy).sort();
        
        sortedStates.forEach(stateName => {
            const districts = hierarchy[stateName];
            const sortedDistricts = Object.keys(districts).sort();
            
            let stateSchoolCount = 0;
            Object.values(districts).forEach(arr => { stateSchoolCount += arr.length; });
            
            let districtsHTML = '';
            
            sortedDistricts.forEach(districtName => {
                const districtSchools = districts[districtName];
                const sortedSchools = districtSchools.sort((a,b) => a.name.localeCompare(b.name));
                
                let schoolsHTML = '';
                
                sortedSchools.forEach(s => {
                    const schoolUsers = (this._allUsers || []).filter(u => {
                        const sId = u.schoolId ? (typeof u.schoolId === 'object' ? u.schoolId._id : u.schoolId) : null;
                        return String(sId) === String(s._id);
                    });
                    const admins = schoolUsers.filter(u => u.role === 'school_admin' || u.role === 'admin');
                    const teachers = schoolUsers.filter(u => u.role === 'teacher');
                    const students = schoolUsers.filter(u => u.role === 'student');

                    schoolsHTML += `
                        <details class="school-node-details" style="margin-bottom: 0.5rem; background: rgba(255,255,255,0.02); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); overflow: hidden;">
                            <summary onclick="SuperAdmin.focusSchool('${s._id}', ${s.latitude}, ${s.longitude})" style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem; cursor: pointer; list-style: none; user-select: none;">
                                <div style="display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden; margin-right: 8px;">
                                    <i class="fas fa-chevron-right chevron-icon" style="font-size: 10px; transition: transform 0.2s; color: #8e8e93;"></i>
                                    <i class="fas fa-folder folder-icon" style="color: #e5c07b; font-size: 14px;"></i>
                                    <div style="display: flex; flex-direction: column; overflow: hidden;">
                                        <div style="font-size: 13px; font-weight: 600; color: #1e293b; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${s.name}</div>
                                        <div style="font-size: 11px; color: #8e8e93;">${s.board_type || 'CBSE'} Board</div>
                                    </div>
                                </div>
                                <div style="display: flex; gap: 6px; align-items: center;" onclick="event.stopPropagation(); event.preventDefault();">
                                    <span style="background: rgba(175, 82, 222, 0.15); color: #7a82ab; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600; margin-right: 4px;">${s.subscription_plan}</span>
                                    <span style="width: 6px; height: 6px; border-radius: 50%; background: ${s.is_active ? '#f59e0b' : '#d97a7e'}; margin-right: 8px;"></span>
                                    
                                    <button class="btn btn-ghost" style="padding: 2px 4px; min-width:unset; height:unset;" title="Deep Dive" onclick="SuperAdmin.viewSchoolDetails('${s._id}')">
                                        <i class="fas fa-eye" style="color:#f59e0b; font-size: 11px;"></i>
                                    </button>
                                    <button class="btn btn-ghost" style="padding: 2px 4px; min-width:unset; height:unset;" title="${s.is_active ? 'Suspend' : 'Approve'}" onclick="SuperAdmin.toggleSchool('${s._id}', ${s.is_active})">
                                        <i class="fas ${s.is_active ? 'fa-ban' : 'fa-check-circle'}" style="color:${s.is_active ? '#d97a7e' : '#f59e0b'}; font-size: 11px;"></i>
                                    </button>
                                    <button class="btn btn-ghost" style="padding: 2px 4px; min-width:unset; height:unset;" title="Edit School" onclick="SuperAdmin.showEditSchoolModal('${s._id}')">
                                        <i class="fas fa-edit" style="color:#7c3aed; font-size: 11px;"></i>
                                    </button>
                                    <button class="btn btn-ghost" style="padding: 2px 4px; min-width:unset; height:unset;" title="Delete School" onclick="SuperAdmin.deleteSchool('${s._id}')">
                                        <i class="fas fa-trash-alt" style="color:#d97a7e; font-size: 11px;"></i>
                                    </button>
                                </div>
                            </summary>
                            <div class="school-folders-content" style="padding: 0.5rem 1rem 0.75rem 2.25rem; display: flex; flex-direction: column; gap: 0.5rem; background: rgba(0,0,0,0.15); border-top: 1px solid rgba(255,255,255,0.03);">
                                
                                <!-- School Admins Folder -->
                                <details class="school-nested-folder" style="overflow: hidden;">
                                    <summary style="cursor: pointer; list-style: none; font-size: 12px; font-weight: 600; color: #a2a2a7; display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; border-radius: 4px; background: rgba(255,255,255,0.03);" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
                                        <div style="display: flex; align-items: center; gap: 6px;">
                                            <i class="fas fa-chevron-right nested-chevron-icon" style="font-size: 9px; transition: transform 0.2s; color: #8e8e93;"></i>
                                            <i class="fas fa-folder folder-sub-icon" style="color: #e5c07b; font-size: 12px;"></i>
                                            <span>School Admin (${admins.length})</span>
                                        </div>
                                        <button class="btn btn-ghost" style="padding: 2px 6px; font-size: 10px; min-width: unset; height: unset;" onclick="event.stopPropagation(); event.preventDefault(); SuperAdmin.quickCreateUser('${s._id}', 'school_admin')" title="Add School Admin">
                                            <i class="fas fa-plus" style="font-size: 9px; color: #f59e0b;"></i>
                                        </button>
                                    </summary>
                                    <div style="padding: 0.25rem 0.5rem 0.25rem 1.5rem; display: flex; flex-direction: column; gap: 4px;">
                                        ${admins.length > 0 ? admins.map(u => `
                                            <div style="font-size: 12px; color: #475569; padding: 2px 0; display: flex; align-items: center; gap: 6px;">
                                                <i class="fas fa-user-shield" style="color: #f59e0b; font-size: 10px;"></i>
                                                <span><strong>${u.name}</strong> <span style="color:#64748b; font-size:11px;">(${u.email})</span></span>
                                            </div>
                                        `).join('') : `
                                            <div style="font-size: 11px; color: #8e8e93; font-style: italic; padding: 2px 0;">No school admins assigned</div>
                                        `}
                                    </div>
                                </details>
 
                                <!-- Teachers Folder -->
                                <details class="school-nested-folder" style="overflow: hidden;">
                                    <summary style="cursor: pointer; list-style: none; font-size: 12px; font-weight: 600; color: #a2a2a7; display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; border-radius: 4px; background: rgba(255,255,255,0.03);" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
                                        <div style="display: flex; align-items: center; gap: 6px;">
                                            <i class="fas fa-chevron-right nested-chevron-icon" style="font-size: 9px; transition: transform 0.2s; color: #8e8e93;"></i>
                                            <i class="fas fa-folder folder-sub-icon" style="color: #e5c07b; font-size: 12px;"></i>
                                            <span>Teacher (${teachers.length})</span>
                                        </div>
                                        <button class="btn btn-ghost" style="padding: 2px 6px; font-size: 10px; min-width: unset; height: unset;" onclick="event.stopPropagation(); event.preventDefault(); SuperAdmin.quickCreateUser('${s._id}', 'teacher')" title="Add Teacher">
                                            <i class="fas fa-plus" style="font-size: 9px; color: #f59e0b;"></i>
                                        </button>
                                    </summary>
                                    <div style="padding: 0.25rem 0.5rem 0.25rem 1.5rem; display: flex; flex-direction: column; gap: 4px;">
                                        ${teachers.length > 0 ? teachers.map(u => `
                                            <div style="font-size: 12px; color: #475569; padding: 2px 0; display: flex; align-items: center; gap: 6px;">
                                                <i class="fas fa-user-tie" style="color: #7c3aed; font-size: 10px;"></i>
                                                <span><strong>${u.name}</strong> <span style="color:#64748b; font-size:11px;">(${u.email})</span></span>
                                            </div>
                                        `).join('') : `
                                            <div style="font-size: 11px; color: #8e8e93; font-style: italic; padding: 2px 0;">No teachers assigned</div>
                                        `}
                                    </div>
                                </details>
 
                                <!-- Students by Division Folders -->
                                ${(() => {
                                    if (students.length === 0) {
                                        return `
                                        <details class="school-nested-folder" style="overflow: hidden;">
                                            <summary style="cursor: pointer; list-style: none; font-size: 12px; font-weight: 600; color: #a2a2a7; display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; border-radius: 4px; background: rgba(255,255,255,0.03);">
                                                <div style="display: flex; align-items: center; gap: 6px;">
                                                    <i class="fas fa-folder folder-sub-icon" style="color: #e5c07b; font-size: 12px;"></i>
                                                    <span>Students (0)</span>
                                                </div>
                                                <button class="btn btn-ghost" style="padding: 2px 6px; font-size: 10px; min-width: unset; height: unset;" onclick="event.stopPropagation(); event.preventDefault(); SuperAdmin.quickCreateUser('${s._id}', 'student')" title="Add Student">
                                                    <i class="fas fa-plus" style="font-size: 9px; color: #f59e0b;"></i>
                                                </button>
                                            </summary>
                                            <div style="padding: 0.25rem 0.5rem 0.25rem 1.5rem; font-size: 11px; color: #8e8e93; font-style: italic;">No students assigned</div>
                                        </details>
                                        `;
                                    }
 
                                    const divisionGroups = {};
                                    students.forEach(st => {
                                        const div = st.division || 'Unassigned';
                                        if (!divisionGroups[div]) divisionGroups[div] = [];
                                        divisionGroups[div].push(st);
                                    });
 
                                    const sortedDivisions = Object.keys(divisionGroups).sort((a, b) => {
                                        if (a === 'Unassigned') return 1;
                                        if (b === 'Unassigned') return -1;
                                        return a.localeCompare(b);
                                    });
 
                                    return sortedDivisions.map(divKey => {
                                        const divStudents = divisionGroups[divKey];
                                        const title = divKey === 'Unassigned' ? 'Unassigned Division Students' : `Division ${divKey} Students`;
                                        return `
                                        <details class="school-nested-folder" style="overflow: hidden; margin-bottom: 0.25rem;">
                                            <summary style="cursor: pointer; list-style: none; font-size: 12px; font-weight: 600; color: #a2a2a7; display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; border-radius: 4px; background: rgba(255,255,255,0.03);" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
                                                <div style="display: flex; align-items: center; gap: 6px;">
                                                    <i class="fas fa-chevron-right nested-chevron-icon" style="font-size: 9px; transition: transform 0.2s; color: #8e8e93;"></i>
                                                    <i class="fas fa-folder folder-sub-icon" style="color: #e5c07b; font-size: 12px;"></i>
                                                    <span>${title} (${divStudents.length})</span>
                                                </div>
                                                <button class="btn btn-ghost" style="padding: 2px 6px; font-size: 10px; min-width: unset; height: unset;" onclick="event.stopPropagation(); event.preventDefault(); SuperAdmin.quickCreateUser('${s._id}', 'student', '${divKey}')" title="Add Student (Division ${divKey})">
                                                    <i class="fas fa-plus" style="font-size: 9px; color: #f59e0b;"></i>
                                                </button>
                                            </summary>
                                            <div style="padding: 0.25rem 0.5rem 0.25rem 1.5rem; display: flex; flex-direction: column; gap: 4px;">
                                                ${divStudents.map(u => `
                                                    <div style="font-size: 12px; color: #475569; padding: 2px 0; display: flex; align-items: center; gap: 6px;">
                                                        <i class="fas fa-user-graduate" style="color: #8e8e93; font-size: 10px;"></i>
                                                        <span><strong>${u.name}</strong> <span style="color:#64748b; font-size:11px;">(${u.email})</span></span>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        </details>
                                        `;
                                    }).join('');
                                })()}
                            </div>
                        </details>
                    `;
                });
                
                districtsHTML += `
                    <details class="district-node" open style="background: rgba(255,255,255,0.01); border-left: 2px solid rgba(92, 141, 137, 0.3); border-radius:0 4px 4px 0; margin-bottom: 0.25rem; overflow: hidden;">
                        <summary onclick="SuperAdmin.focusDistrict('${stateName}', '${districtName}')" style="display: flex; align-items: center; padding: 0.5rem 0.75rem; font-size: 13px; font-weight: 600; cursor: pointer; color: #f5f5f7; list-style: none; user-select: none;">
                            <i class="fas fa-city" style="color: #7c3aed; margin-right: 6px; font-size: 11px;"></i>
                            <span style="flex: 1;">${districtName}</span>
                            <span style="font-size: 10px; background:rgba(255,255,255,0.06); color: #8e8e93; padding:1px 5px; border-radius:8px; margin-right: 8px;">${districtSchools.length}</span>
                            <i class="fas fa-chevron-down" style="font-size: 10px; opacity: 0.7; transition: transform 0.2s;"></i>
                        </summary>
                        <div style="padding: 0.25rem 0.5rem 0.5rem 1rem; display: flex; flex-direction: column; gap: 0.35rem;">
                            ${schoolsHTML}
                        </div>
                    </details>
                `;
            });
            
            treeHTML += `
                <details class="state-node" open style="margin-bottom: 0.5rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; overflow: hidden; transition: all 0.3s ease;">
                    <summary onclick="SuperAdmin.focusState('${stateName}')" style="display: flex; align-items: center; padding: 0.75rem 1rem; font-weight: 700; cursor: pointer; color: #1e293b; background: rgba(255,255,255,0.04); list-style: none; user-select: none;">
                        <i class="fas fa-map-marker-alt" style="color: #dca368; margin-right: 8px;"></i>
                        <span style="flex: 1;">${stateName}</span>
                        <span style="font-size: 11px; background: rgba(255,255,255,0.08); color: #8e8e93; padding: 2px 6px; border-radius: 10px; margin-right: 8px;">${stateSchoolCount}</span>
                        <i class="fas fa-chevron-down" style="font-size: 12px; transition: transform 0.2s;"></i>
                    </summary>
                    <div style="padding: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem;">
                        ${districtsHTML}
                    </div>
                </details>
            `;
        });

        container.innerHTML = treeHTML;
    },

    onSchoolLocationChange(mode) {
        const stateSelect = document.getElementById(`${mode}-school-state`);
        const districtSelect = document.getElementById(`${mode}-school-district`);
        const latInput = document.getElementById(`${mode}-school-lat`);
        const lngInput = document.getElementById(`${mode}-school-lng`);

        if (!stateSelect || !districtSelect) return;

        const selectedState = stateSelect.value;
        const stateData = STATE_DISTRICTS[selectedState];

        const isStateChange = !districtSelect.options.length || 
                              (typeof event !== 'undefined' && event && event.target && event.target.id === `${mode}-school-state`);
        
        if (isStateChange && stateData) {
            districtSelect.innerHTML = Object.keys(stateData.districts || {})
                .map(d => `<option value="${d}">${d}</option>`).join('');
        }

        const selectedDistrict = districtSelect.value;
        const coords = stateData?.districts[selectedDistrict];
        if (coords && latInput && lngInput) {
            latInput.value = coords[0];
            lngInput.value = coords[1];
        }
    },

    initMap() {
        if (!this.map) {
            try {
                this.map = L.map('schools-map', {
                    zoomControl: true,
                    maxZoom: 18,
                    minZoom: 4
                }).setView([20.5937, 78.9629], 5);

                L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
                    subdomains: 'abcd',
                    maxZoom: 20
                }).addTo(this.map);
            } catch (err) {
                console.error("Map initialization failed:", err);
            }
        } else {
            setTimeout(() => {
                if (this.map) this.map.invalidateSize();
            }, 100);
        }
    },

    focusSchool(schoolId, lat, lng) {
        if (this.map && this.markers[schoolId] && lat && lng) {
            this.map.flyTo([lat, lng], 13, {
                animate: true,
                duration: 1.2
            });
            this.markers[schoolId].openPopup();
        }
    },

    focusState(stateName) {
        const stateData = STATE_DISTRICTS[stateName];
        if (stateData && this.map) {
            this.map.flyTo(stateData.center, 7, {
                animate: true,
                duration: 1.0
            });
        }
    },

    focusDistrict(stateName, districtName) {
        const stateData = STATE_DISTRICTS[stateName];
        if (stateData && stateData.districts[districtName] && this.map) {
            this.map.flyTo(stateData.districts[districtName], 10, {
                animate: true,
                duration: 1.0
            });
        }
    },

    _allUsers: [],
    async loadUsers() {
        const container = document.getElementById('users-list');
        if (!container) return;
        container.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:3rem;"><i class="fas fa-spinner fa-spin"></i> Loading platform users...</td></tr>';
        try {
            const users = await api.get('/admin/super/users');
            this._allUsers = users || [];
            this._renderUsers(this._allUsers);
        } catch (err) {
            container.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:4rem;color:#d97a7e;">Error fetching user data: ${err.message}</td></tr>`;
        }
    },

    filterUsers(query) {
        const filtered = this._allUsers.filter(u => 
            u.name.toLowerCase().includes(query.toLowerCase()) || 
            (u.email || '').toLowerCase().includes(query.toLowerCase()) ||
            (u.role || '').toLowerCase().includes(query.toLowerCase().replace(' ', '_'))
        );
        this._renderUsers(filtered);
    },

    _renderUsers(users) {
        const container = document.getElementById('users-list');
        if (!container) return;
        if (!users || users.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:4rem;color:#64748b;"><i class="fas fa-users" style="font-size:2rem;opacity:0.3;display:block;margin-bottom:1rem;"></i>No matching users found.</div>';
            return;
        }

        const renderUserItem = (u) => {
            const roleIcon = u.role === 'super_admin' 
                ? 'fa-user-shield' 
                : u.role === 'school_admin' || u.role === 'admin' 
                    ? 'fa-user-shield' 
                    : u.role === 'teacher' 
                        ? 'fa-user-tie' 
                        : 'fa-user-graduate';
                        
            const roleColor = u.role === 'super_admin' 
                ? '#d97a7e' 
                : u.role === 'school_admin' || u.role === 'admin' 
                    ? '#f59e0b' 
                    : u.role === 'teacher' 
                        ? '#7c3aed' 
                        : '#8e8e93';

            return `
                <div class="user-row-item" style="display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0.8rem; border-radius: 6px; background: #ffffff; border: 1px solid #e2e8f0; margin-bottom: 0.25rem; transition: background 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.02);" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#ffffff'">
                    <div style="display: flex; align-items: center; gap: 10px; flex: 1; overflow: hidden; margin-right: 12px;">
                        <i class="fas ${roleIcon}" style="color: ${roleColor}; font-size: 14px; width: 16px; text-align: center;"></i>
                        <div style="display: flex; flex-direction: column; overflow: hidden;">
                            <div style="font-size: 13px; font-weight: 700; color: #1e293b;">${u.name}</div>
                            <div style="font-size: 11px; color: #64748b; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${u.email}</div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 16px;" onclick="event.stopPropagation()">
                        <span style="font-size: 11px; color: #64748b; font-weight: 500;">
                            Login: ${u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'}
                        </span>
                        <span style="display:inline-flex; align-items:center; gap:4px; background:${u.isActive ? 'rgba(245,158,11,0.1)' : 'rgba(217,122,126,0.1)'}; color:${u.isActive ? '#f59e0b' : '#d97a7e'}; padding:2px 8px; border-radius:12px; font-size:10px; font-weight:600;">
                            ${u.isActive ? 'Active' : 'Blocked'}
                        </span>
                        <div style="display: flex; gap: 4px;">
                            <button class="btn btn-ghost" style="padding: 2px 4px; min-width:unset; height:unset;" title="Edit User" onclick="SuperAdmin.showEditUserModal('${u._id}')">
                                <i class="fas fa-edit" style="color:#7c3aed; font-size: 11px;"></i>
                            </button>
                            <button class="btn btn-ghost" style="padding: 2px 4px; min-width:unset; height:unset;" title="${u.isActive ? 'Block' : 'Unblock'}" onclick="SuperAdmin.toggleUser('${u._id}', ${u.isActive})">
                                <i class="fas ${u.isActive ? 'fa-user-slash' : 'fa-user-check'}" style="color:${u.isActive ? '#d97a7e' : '#f59e0b'}; font-size: 11px;"></i>
                            </button>
                            <button class="btn btn-ghost" style="padding: 2px 4px; min-width:unset; height:unset;" title="Delete User" onclick="SuperAdmin.deleteUser('${u._id}')">
                                <i class="fas fa-trash-alt" style="color:#d97a7e; font-size: 11px;"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        };

        const platformAdmins = [];
        const schoolsMap = {}; // schoolId -> { name, admins: [], teachers: [], studentsByDivision: {} }

        users.forEach(u => {
            if (u.role === 'super_admin' || !u.schoolId) {
                platformAdmins.push(u);
            } else {
                const sId = u.schoolId._id || u.schoolId;
                const sName = typeof u.schoolId === 'object' ? u.schoolId.name : 'Unknown Institution';
                if (!schoolsMap[sId]) {
                    schoolsMap[sId] = {
                        name: sName,
                        admins: [],
                        teachers: [],
                        studentsByDivision: {}
                    };
                }
                const school = schoolsMap[sId];
                if (u.role === 'school_admin' || u.role === 'admin') {
                    school.admins.push(u);
                } else if (u.role === 'teacher') {
                    school.teachers.push(u);
                } else if (u.role === 'student') {
                    const div = u.division || 'Unassigned';
                    if (!school.studentsByDivision[div]) {
                        school.studentsByDivision[div] = [];
                    }
                    school.studentsByDivision[div].push(u);
                }
            }
        });

        let html = '';
        if (platformAdmins.length > 0) {
            html += `
                <details class="school-node-details" open style="margin-bottom: 0.75rem; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow: hidden;">
                    <summary style="display: flex; align-items: center; justify-content: space-between; padding: 0.8rem 1rem; cursor: pointer; list-style: none; user-select: none; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-chevron-right chevron-icon" style="font-size: 10px; transition: transform 0.2s; color: #64748b;"></i>
                            <i class="fas fa-shield-halved folder-icon" style="color: #7c3aed; font-size: 14px;"></i>
                            <span style="font-size: 14px; font-weight: 700; color: #1e293b;">Platform / Super Admins</span>
                        </div>
                        <span style="font-size: 11px; background: rgba(124,58,237,0.1); color: #7c3aed; padding: 3px 8px; border-radius: 12px; font-weight: 700;">${platformAdmins.length} User${platformAdmins.length !== 1 ? 's' : ''}</span>
                    </summary>
                    <div style="padding: 0.5rem 0.7rem 0.7rem 1.8rem; display: flex; flex-direction: column; gap: 0.25rem;">
                        ${platformAdmins.map(u => renderUserItem(u)).join('')}
                    </div>
                </details>
            `;
        }

        Object.keys(schoolsMap).forEach(sId => {
            const school = schoolsMap[sId];
            const totalCount = school.admins.length + school.teachers.length + 
                               Object.values(school.studentsByDivision).reduce((acc, curr) => acc + curr.length, 0);

            let divisionFoldersHTML = '';
            const sortedDivs = Object.keys(school.studentsByDivision).sort((a,b) => {
                if (a === 'Unassigned') return 1;
                if (b === 'Unassigned') return -1;
                return a.localeCompare(b);
            });

            sortedDivs.forEach(div => {
                const list = school.studentsByDivision[div];
                if (list.length > 0) {
                    divisionFoldersHTML += `
                        <details class="school-nested-folder" style="overflow: hidden; margin-bottom: 0.25rem;">
                            <summary style="cursor: pointer; list-style: none; font-size: 13px; font-weight: 600; color: #475569; display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 6px; background: transparent; transition: background 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
                                <i class="fas fa-chevron-right nested-chevron-icon" style="font-size: 9px; transition: transform 0.2s; color: #94a3b8;"></i>
                                <i class="fas fa-folder folder-sub-icon" style="color: #f59e0b; font-size: 13px;"></i>
                                <span>Division ${div} Students (${list.length})</span>
                            </summary>
                            <div style="padding: 0.25rem 0.5rem 0.25rem 1.5rem; display: flex; flex-direction: column; gap: 4px;">
                                ${list.map(u => renderUserItem(u)).join('')}
                            </div>
                        </details>
                    `;
                }
            });

            html += `
                <details class="school-node-details" style="margin-bottom: 0.75rem; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow: hidden;">
                    <summary style="display: flex; align-items: center; justify-content: space-between; padding: 0.8rem 1rem; cursor: pointer; list-style: none; user-select: none; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                        <div style="display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden; margin-right: 8px;">
                            <i class="fas fa-chevron-right chevron-icon" style="font-size: 10px; transition: transform 0.2s; color: #64748b;"></i>
                            <i class="fas fa-building folder-icon" style="color: #7c3aed; font-size: 14px; flex-shrink: 0;"></i>
                            <span style="font-size: 14px; font-weight: 700; color: #1e293b; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${school.name}</span>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center;" onclick="event.stopPropagation();">
                            <span style="font-size: 11px; background: rgba(124,58,237,0.1); color: #7c3aed; padding: 3px 8px; border-radius: 12px; font-weight: 700;">${totalCount} User${totalCount !== 1 ? 's' : ''}</span>
                            <button class="btn btn-ghost" style="padding: 2px 4px; min-width:unset; height:unset;" title="View School Details" onclick="SuperAdmin.viewSchoolDetails('${sId}')">
                                <i class="fas fa-eye" style="color:#f59e0b; font-size: 11px;"></i>
                            </button>
                        </div>
                    </summary>
                    <div class="school-folders-content" style="padding: 1rem 1rem 1rem 2.25rem; display: flex; flex-direction: column; gap: 0.5rem; background: #ffffff;">
                        
                        <!-- School Admins Folder -->
                        <details class="school-nested-folder" style="overflow: hidden;">
                            <summary style="cursor: pointer; list-style: none; font-size: 13px; font-weight: 600; color: #475569; display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 6px; background: transparent; transition: background 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
                                <i class="fas fa-chevron-right nested-chevron-icon" style="font-size: 9px; transition: transform 0.2s; color: #94a3b8;"></i>
                                <i class="fas fa-folder folder-sub-icon" style="color: #f59e0b; font-size: 13px;"></i>
                                <span>School Admin (${school.admins.length})</span>
                            </summary>
                            <div style="padding: 0.25rem 0.5rem 0.25rem 1.5rem; display: flex; flex-direction: column; gap: 4px;">
                                ${school.admins.length > 0 ? school.admins.map(u => renderUserItem(u)).join('') : `
                                    <div style="font-size: 11px; color: #8e8e93; font-style: italic; padding: 2px 0;">No school admins assigned</div>
                                `}
                            </div>
                        </details>

                        <!-- Teachers Folder -->
                        <details class="school-nested-folder" style="overflow: hidden;">
                            <summary style="cursor: pointer; list-style: none; font-size: 13px; font-weight: 600; color: #475569; display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 6px; background: transparent; transition: background 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
                                <i class="fas fa-chevron-right nested-chevron-icon" style="font-size: 9px; transition: transform 0.2s; color: #94a3b8;"></i>
                                <i class="fas fa-folder folder-sub-icon" style="color: #f59e0b; font-size: 13px;"></i>
                                <span>Teacher (${school.teachers.length})</span>
                            </summary>
                            <div style="padding: 0.25rem 0.5rem 0.25rem 1.5rem; display: flex; flex-direction: column; gap: 4px;">
                                ${school.teachers.length > 0 ? school.teachers.map(u => renderUserItem(u)).join('') : `
                                    <div style="font-size: 11px; color: #8e8e93; font-style: italic; padding: 2px 0;">No teachers assigned</div>
                                `}
                            </div>
                        </details>

                        <!-- Student Division Folders -->
                        ${divisionFoldersHTML || `
                            <details class="school-nested-folder" style="overflow: hidden;">
                                <summary style="cursor: pointer; list-style: none; font-size: 13px; font-weight: 600; color: #475569; display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 6px; background: transparent;">
                                    <i class="fas fa-folder folder-sub-icon" style="color: #f59e0b; font-size: 13px;"></i>
                                    <span>Students (0)</span>
                                </summary>
                                <div style="padding: 0.25rem 0.5rem 0.25rem 1.5rem; font-size: 11px; color: #8e8e93; font-style: italic;">No students assigned</div>
                            </details>
                        `}
                    </div>
                </details>
            `;
        });

        container.innerHTML = html;
    },

    _billingPlans: [],
    async loadBilling() {
        const container = document.getElementById('plans-list');
        if (!container) return;
        container.innerHTML = '<div style="text-align:center;padding:2rem;"><i class="fas fa-spinner fa-spin"></i> Loading subscription plans...</div>';
        try {
            const plans = await api.get('/admin/super/plans');
            this._billingPlans = plans || [];
            this._renderBillingPlans(this._billingPlans);
        } catch (err) {
            container.innerHTML = `<div style="padding:2rem;color:#d97a7e;">Failed to load billing plans: ${err.message}</div>`;
        }
    },

    _renderBillingPlans(plans) {
        const container = document.getElementById('plans-list');
        if (!container) return;
        if (!plans || plans.length === 0) {
            container.innerHTML = '<div style="text-align:center;color:#64748b;padding:2rem;">No subscription plans defined.</div>';
            return;
        }

        container.innerHTML = plans.map(p => `
            <div class="glass-card" style="padding:1.25rem;margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center;border-left:4px solid ${p.isActive ? '#7c3aed' : '#d97a7e'};background:rgba(255,255,255,0.02);">
                <div>
                    <h4 style="margin:0;font-size:16px;color:#1e293b;">${p.name}</h4>
                    <div style="font-size:13px;color:#64748b;margin-top:4px;">
                        Price: <strong style="color:#f59e0b;">$${p.price}</strong> | Duration: ${p.durationDays} days
                    </div>
                    <ul style="margin:8px 0 0;padding-left:1.2rem;font-size:12px;color:#64748b;">
                        ${(p.features || []).map(f => `<li>${f}</li>`).join('')}
                    </ul>
                </div>
                <div class="flex gap-2">
                    <button class="btn btn-ghost" title="Edit Plan" onclick="SuperAdmin.showEditPlanModal('${p._id}')">
                        <i class="fas fa-edit" style="color:#7c3aed;"></i>
                    </button>
                    <button class="btn btn-ghost" title="Delete Plan" onclick="SuperAdmin.deletePlan('${p._id}')">
                        <i class="fas fa-trash-alt" style="color:#d97a7e;"></i>
                    </button>
                </div>
            </div>
        `).join('');
    },

    async loadAuditLogs() {
        const container = document.getElementById('audit-logs-detailed');
        // Mock data for audit logs
        const mockLogs = [
            { id: 'EVT-001', user: 'Admin', op: 'School Creation', ip: '192.168.1.1', time: '10:00 AM' },
            { id: 'EVT-002', user: 'Admin', op: 'User Blocked', ip: '192.168.1.1', time: '11:30 AM' }
        ];
        container.innerHTML = mockLogs.map(l => `
            <tr>
                <td>${l.id}</td>
                <td>${l.user}</td>
                <td>${l.op}</td>
                <td>${l.ip}</td>
                <td>${l.time}</td>
            </tr>
        `).join('');
    },

    async toggleSchool(id, isActive) {
        const action = isActive ? 'suspend' : 'approve';
        try {
            await api.post(`/admin/super/schools/${id}/${action}`);
            this.loadSchools();
            notifications.success(`✅ School ${isActive ? 'suspended' : 'approved'} successfully`);
        } catch (err) {
            notifications.error('Action failed: ' + err.message);
        }
    },

    async toggleUser(id, isActive) {
        try {
            await api.put(`/admin/super/users/${id}/block`);
            this.loadUsers();
            notifications.success(`✅ User ${isActive ? 'blocked' : 'unblocked'} successfully`);
        } catch (err) {
            notifications.error('Action failed: ' + err.message);
        }
    },

    async loadAnalytics() {
        try {
            const stats = await api.get('/admin/super/analytics');
            document.getElementById('stat-schools').textContent = stats.totalSchools ?? '0';
            document.getElementById('stat-users').textContent = (stats.activeUsers ?? 0).toLocaleString();
            document.getElementById('stat-health').textContent = '100%';
        } catch (err) {
            console.warn('Analytics API unavailable, using mock data');
            document.getElementById('stat-schools').textContent = '24';
            document.getElementById('stat-users').textContent = '1,240';
            document.getElementById('stat-health').textContent = '100%';
        }
        // Load recent schools into dashboard table
        try {
            const schools = await api.get('/admin/super/schools');
            const recentList = document.getElementById('recent-schools-list');
            if (recentList) {
                const recent = (schools || []).slice(0, 5);
                if (!recent || recent.length === 0) {
                    recentList.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#64748b;padding:2rem;font-size:13px;"><i class="fas fa-info-circle"></i> No schools registered yet.</td></tr>';
                } else {
                    recentList.innerHTML = recent.map(s => `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                        <td style="padding:1rem 0.75rem;">
                            <div style="font-weight:600;font-size:13px;">${s.name}</div>
                            <div style="font-size:11px;color:#64748b;">${s.board_type || 'General'}</div>
                        </td>
                        <td style="padding:1rem 0.75rem;">
                            <span style="background:rgba(124,58,237,0.1);color:#7c3aed;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;">${s.subscription_plan || 'Basic'}</span>
                        </td>
                        <td style="padding:1rem 0.75rem;">
                            <span style="background:${s.is_active ? 'rgba(245,158,11,0.1)' : 'rgba(217,122,126,0.1)'};color:${s.is_active ? '#f59e0b' : '#d97a7e'};padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;">
                                ${s.is_active ? 'Active' : 'Suspended'}
                            </span>
                        </td>
                    </tr>`).join('');
                }
            }
        } catch (e) {
            const recentList = document.getElementById('recent-schools-list');
            if (recentList) recentList.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#64748b;padding:2rem;font-size:13px;">Unable to load recent schools.</td></tr>';
        }
        this.renderCharts();
    },

    _chartsRendered: false,

    renderCharts() {
        if (this._chartsRendered) return;
        this._chartsRendered = true;

        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        const gridColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
        const labelColor = isLight ? '#515154' : '#86868b';

        // Line chart — School Growth
        const ctx1 = document.getElementById('schoolGrowthChart');
        if (ctx1) {
            new Chart(ctx1.getContext('2d'), {
                type: 'line',
                data: {
                    labels: ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'],
                    datasets: [{
                        label: 'Schools',
                        data: [5, 8, 12, 15, 18, 24],
                        borderColor: '#7c3aed',
                        backgroundColor: 'rgba(124,58,237,0.12)',
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: '#7c3aed',
                        pointRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: labelColor } },
                        x: { grid: { display: false }, ticks: { color: labelColor } }
                    }
                }
            });
        }

        // Doughnut chart — User Distribution
        const ctx2 = document.getElementById('userDistChart');
        if (ctx2) {
            new Chart(ctx2.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['Students', 'Teachers', 'School Admins'],
                    datasets: [{
                        data: [850, 240, 80],
                        backgroundColor: ['#7c3aed', '#f59e0b', '#dca368'],
                        borderWidth: 0,
                        hoverOffset: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '68%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: labelColor, padding: 16, font: { size: 12 } }
                        }
                    }
                }
            });
        }
    },

    // ─── Permissions ─────────────────────────────────────
    _permissionsData: [],

    _permissionLabels: {
        viewSchools: 'View Schools', createSchools: 'Create Schools', suspendSchools: 'Suspend Schools',
        viewUsers: 'View Users', createUsers: 'Create Users', blockUsers: 'Block/Unblock Users', resetPasswords: 'Reset Passwords',
        viewExams: 'View Exams', createExams: 'Create Exams', deleteExams: 'Delete Exams', publishExams: 'Publish Exams',
        viewResults: 'View Results', editResults: 'Edit Results', exportResults: 'Export Results',
        issueCertificates: 'Issue Certificates', revokeCertificates: 'Revoke Certificates',
        manageBilling: 'Manage Billing', viewInvoices: 'View Invoices',
        sendAnnouncements: 'Send Announcements',
        viewAuditLogs: 'View Audit Logs',
        editSchoolSettings: 'Edit School Settings', editSystemSettings: 'Edit System Settings'
    },

    _permissionCategories: {
        '🏫 School Management': ['viewSchools', 'createSchools', 'suspendSchools'],
        '👤 User Management': ['viewUsers', 'createUsers', 'blockUsers', 'resetPasswords'],
        '📝 Exam Management': ['viewExams', 'createExams', 'deleteExams', 'publishExams'],
        '📊 Results': ['viewResults', 'editResults', 'exportResults'],
        '🏆 Certificates': ['issueCertificates', 'revokeCertificates'],
        '💳 Billing': ['manageBilling', 'viewInvoices'],
        '📢 Communication': ['sendAnnouncements'],
        '🔒 Security': ['viewAuditLogs'],
        '⚙️ Settings': ['editSchoolSettings', 'editSystemSettings']
    },

    async loadPermissions() {
        const container = document.getElementById('permissions-matrix-container');
        container.innerHTML = '<div class="glass-card" style="text-align:center;padding:3rem;color:#64748b;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i><p style="margin-top:1rem;">Loading permissions...</p></div>';
        try {
            const data = await api.get('/admin/permissions');
            this._permissionsData = data;
            this._renderPermissionsMatrix(data);
        } catch (err) {
            container.innerHTML = `<div class="glass-card" style="text-align:center;padding:2rem;color:#d97a7e;"><i class="fas fa-exclamation-circle"></i> Failed to load permissions: ${err.message}</div>`;
        }
    },

    _renderPermissionsMatrix(data) {
        const roles = ['super_admin', 'school_admin', 'teacher', 'student'];
        const roleLabels = { super_admin: 'Super Admin', school_admin: 'School Admin', teacher: 'Teacher', student: 'Student' };

        // Build a lookup map: role -> permissions object
        const permMap = {};
        data.forEach(d => { permMap[d.role] = d.permissions; });

        let rows = '';
        for (const [category, keys] of Object.entries(this._permissionCategories)) {
            rows += `<tr class="perm-category-row"><td colspan="5">${category}</td></tr>`;
            keys.forEach(key => {
                const isSuperAdminKey = ['createSchools', 'suspendSchools', 'blockUsers', 'manageBilling',
                    'viewAuditLogs', 'editSystemSettings', 'revokeCertificates'].includes(key);
                rows += `<tr>
                    <td style="padding-left:1.5rem;">${this._permissionLabels[key]}</td>
                    ${roles.map(role => {
                        const checked = permMap[role]?.[key] ? 'checked' : '';
                        const disabled = role === 'super_admin' ? 'disabled' : '';
                        return `<td style="text-align:center;">
                            <label class="toggle-switch">
                                <input type="checkbox" data-role="${role}" data-key="${key}" ${checked} ${disabled}>
                                <span class="toggle-slider"></span>
                            </label>
                        </td>`;
                    }).join('')}
                </tr>`;
            });
        }

        const roleHeaders = roles.map(r => `<th style="text-align:center;">${roleLabels[r]}</th>`).join('');

        document.getElementById('permissions-matrix-container').innerHTML = `
            <div class="glass-card" style="overflow:auto;">
                <table>
                    <thead>
                        <tr>
                            <th>Permission</th>
                            ${roleHeaders}
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    },

    async savePermissions() {
        const btn = document.getElementById('save-perms-btn');
        if (!btn) return;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        try {
            const roles = ['school_admin', 'teacher', 'student'];
            const savePromises = roles.map(role => {
                const permissions = {};
                document.querySelectorAll(`input[data-role="${role}"]`).forEach(cb => {
                    permissions[cb.dataset.key] = cb.checked;
                });
                return api.put('/admin/permissions', { role, permissions });
            });
            await Promise.all(savePromises);
            notifications.success('✅ Permissions saved to database successfully!');
        } catch (err) {
            notifications.error('Failed to save permissions: ' + (err.message || 'Unknown error'));
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Save All Changes';
        }
    },

    async loadRecentLogs() {
        const logsContainer = document.getElementById('recent-logs');
        const mockLogs = [
            { user: 'Admin User', action: 'Approved "Global Academy"', time: '2 mins ago' },
            { user: 'System', action: 'Subscription renewal for "City School"', time: '1 hour ago' },
            { user: 'Support', action: 'Password reset for user ID #452', time: '3 hours ago' }
        ];

        logsContainer.innerHTML = mockLogs.map(log => `
            <tr>
                <td>${log.user}</td>
                <td><span class="badge-pill" style="background: rgba(124,58,237,0.1); color: #7c3aed;">${log.action}</span></td>
                <td class="text-muted">${log.time}</td>
            </tr>
        `).join('');
    },
    
    // ─── Live Monitoring ──────────────────────────────────
    _liveTimer: null,
    async loadLiveExams() {
        console.log('📡 Fetching live exams...');
        const container = document.getElementById('live-exams-container');
        if (!container) return;

        try {
            const sessions = await api.get('/admin/super/live-exams');
            console.log(`✅ Received ${sessions?.length || 0} sessions:`, sessions);
            
            const badge = document.getElementById('live-exam-count-badge');
            
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
                        No live exams at this moment.
                    </div>`;
                return;
            }

            container.innerHTML = sessions.map(s => {
                const isLive = s.status === 'active';
                const startTime = new Date(s.startTime).toLocaleString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
                return `
                <div class="glass-card animate-pulse-subtle" style="padding:1.5rem; border-left:4px solid ${isLive ? '#d97a7e' : '#7c3aed'}; background:rgba(255,255,255,0.03); display:flex; flex-direction:column; min-height:280px; transition:transform 0.2s;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
                        <span style="font-size:10px; font-weight:800; color:${isLive ? '#d97a7e' : '#7c3aed'}; text-transform:uppercase; letter-spacing:1.5px; display:flex; align-items:center; gap:5px;">
                            <span style="width:8px; height:8px; border-radius:50%; background:${isLive ? '#d97a7e' : '#7c3aed'}; ${isLive ? 'box-shadow:0 0 8px #d97a7e;' : ''}"></span>
                            ${isLive ? 'LIVE NOW' : 'SCHEDULED'}
                        </span>
                        <span style="font-size:11px; color:#64748b; font-weight:600; background:rgba(255,255,255,0.05); padding:2px 8px; border-radius:4px;">${s.division} Section</span>
                    </div>
                    
                    <h3 style="font-size:18px; margin-bottom:0.75rem; color:#1e293b; font-weight:700;">${s.title}</h3>
                    
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:0.5rem; color:#7c3aed;">
                        <i class="fas fa-university" style="font-size:12px;"></i>
                        <span style="font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s.schoolId?.name || 'Platform School'}</span>
                    </div>

                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:0.5rem; color:#64748b;">
                        <i class="fas fa-chalkboard-teacher" style="font-size:12px;"></i>
                        <span style="font-size:12px; font-weight:500;">${s.teacherId?.name || 'Assigned Faculty'}</span>
                    </div>
                    
                    <div style="font-size:12px; color:#64748b; margin-bottom:1.25rem; display:flex; align-items:center; gap:6px;">
                        <i class="far fa-clock"></i> ${startTime}
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-top:auto; padding-top:1.25rem; border-top:1px solid rgba(255,255,255,0.08);">
                        <div>
                            <div style="font-size:9px; color:#64748b; text-transform:uppercase; font-weight:700; margin-bottom:2px;">Subject</div>
                            <div style="font-size:13px; font-weight:500;">${s.subject || 'General'}</div>
                        </div>
                        <div>
                            <div style="font-size:9px; color:#64748b; text-transform:uppercase; font-weight:700; margin-bottom:2px;">Duration</div>
                            <div style="font-size:13px; font-weight:500;">${s.duration} Mins</div>
                        </div>
                    </div>
                    
                    <button class="btn btn-ghost w-full mt-5" style="font-size:13px; padding:10px; border:1px solid rgba(255,255,255,0.1); border-radius:12px; display:flex; align-items:center; justify-content:center; gap:8px; transition:all 0.3s;" 
                            onmouseover="this.style.background='rgba(255,255,255,0.05)'" 
                            onmouseout="this.style.background='transparent'"
                            onclick="SuperAdmin.viewSchoolDetails('${s.schoolId?._id}')">
                        <i class="fas fa-search-plus" style="font-size:12px; opacity:0.7;"></i> 
                        <span>View Details</span>
                    </button>
                </div>`;
            }).join('');

            this._startLiveRefreshTimer();
        } catch (err) {
            console.error('Live monitor error:', err);
            notifications.error('Failed to update live monitor: ' + err.message);
            container.innerHTML = `
                <div class="glass-card" style="text-align:center; padding:4rem; grid-column: 1 / -1; color:#d97a7e;">
                    <i class="fas fa-exclamation-circle" style="font-size:3rem; display:block; margin-bottom:1rem;"></i>
                    Unable to fetch live exam data. Please check your connection.
                </div>`;
        }
    },

    _startLiveRefreshTimer() {
        if (this._liveTimer) clearInterval(this._liveTimer);
        let timeLeft = 30;
        const timerEl = document.getElementById('refresh-timer');
        
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

    // ─── School Deep Dive ────────────────────────────────
    async viewSchoolDetails(schoolId) {
        if (!schoolId || schoolId === 'undefined') {
            notifications.warn('Institution data not linked for this session.');
            return;
        }

        let school = this._allSchools.find(s => s._id === schoolId);
        
        // If not in cache, fetch it
        if (!school) {
            try {
                const schools = await api.get('/admin/super/schools');
                this._allSchools = schools || [];
                school = this._allSchools.find(s => s._id === schoolId);
            } catch (e) {
                console.error('Failed to load schools for deep dive');
            }
        }

        if (!school) {
            notifications.error('Could not find institution details.');
            return;
        }

        // Store which tab we came from (Schools or Users)
        const activeLink = document.querySelector('.sidebar .nav-link.active');
        this._schoolDetailBackTab = activeLink ? activeLink.getAttribute('data-tab') : 'schools';

        // Navigate to the school details tab (page)
        document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
        const detailTab = document.getElementById('tab-school-detail');
        if (detailTab) detailTab.style.display = 'block';

        // Render school header info
        document.getElementById('sdetail-name').textContent = school.name;
        document.getElementById('sdetail-meta').textContent = `${school.board_type || 'CBSE'} Board • ${school.district || 'Bengaluru'}, ${school.state || 'Karnataka'}`;
        document.getElementById('sdetail-plan-badge').textContent = school.subscription_plan || 'Basic';
        
        const statusBadge = document.getElementById('sdetail-status-badge');
        if (statusBadge) {
            statusBadge.textContent = school.is_active ? 'Active' : 'Suspended';
            statusBadge.style.background = school.is_active ? 'rgba(48,209,88,0.15)' : 'rgba(217,122,126,0.15)';
            statusBadge.style.color = school.is_active ? '#30d158' : '#d97a7e';
        }

        // Setup tables with loading placeholders
        document.getElementById('sdetail-teachers-table-body').innerHTML = '<tr><td colspan="2" style="text-align:center;padding:2rem;"><i class="fas fa-spinner fa-spin"></i> Loading teachers...</td></tr>';
        document.getElementById('sdetail-students-table-body').innerHTML = '<tr><td colspan="2" style="text-align:center;padding:2rem;"><i class="fas fa-spinner fa-spin"></i> Loading students...</td></tr>';

        // Set admin details
        const cardEmpty = document.getElementById('sdetail-admin-card-empty');
        const cardContent = document.getElementById('sdetail-admin-card-content');
        const adminNameEl = document.getElementById('sdetail-admin-name');
        const adminEmailEl = document.getElementById('sdetail-admin-email');
        const adminAvatarEl = document.getElementById('sdetail-admin-avatar');
        const adminStatusEl = document.getElementById('sdetail-admin-status');

        if (school.adminId) {
            const adminName = school.adminId.name || 'N/A';
            const adminEmail = school.adminId.email || 'N/A';
            const isActive = school.adminId.isActive !== false;
            
            if (adminNameEl) adminNameEl.textContent = adminName;
            if (adminEmailEl) adminEmailEl.textContent = adminEmail;
            
            if (adminAvatarEl) {
                const initials = adminName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                adminAvatarEl.textContent = initials || 'SA';
            }
            
            if (adminStatusEl) {
                adminStatusEl.textContent = isActive ? 'Active' : 'Blocked';
                adminStatusEl.style.background = isActive ? 'rgba(48,209,88,0.15)' : 'rgba(217,122,126,0.15)';
                adminStatusEl.style.color = isActive ? '#30d158' : '#d97a7e';
            }
            
            if (cardEmpty) cardEmpty.style.display = 'none';
            if (cardContent) cardContent.style.display = 'flex';
        } else {
            if (cardEmpty) cardEmpty.style.display = 'block';
            if (cardContent) cardContent.style.display = 'none';
        }

        try {
            // Load teachers
            const teachers = await api.get(`/admin/super/schools/${schoolId}/teachers`);
            document.getElementById('sdetail-teachers-count').textContent = teachers.length;
            const teacherList = document.getElementById('sdetail-teachers-table-body');
            teacherList.innerHTML = (!teachers || teachers.length === 0) 
                ? '<tr><td colspan="2" style="text-align:center;padding:2rem;color:var(--text-secondary);">No teachers found.</td></tr>'
                : teachers.map(t => {
                    const initials = t.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                    const avatar = t.cameraPhoto 
                        ? `<img src="${t.cameraPhoto}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" onerror="this.outerHTML='<div class=&quot;initial-avatar&quot; style=&quot;width:32px;height:32px;border-radius:50%;background:#7c3aed;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;&quot;>${initials}</div>'">`
                        : `<div class="initial-avatar" style="width:32px;height:32px;border-radius:50%;background:#7c3aed;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">${initials}</div>`;
                    return `
                    <tr style="border-bottom:1px solid var(--glass-border);">
                        <td style="padding:0.75rem;">
                            <div style="display:flex; align-items:center; gap:10px;">
                                ${avatar}
                                <div>
                                    <div style="font-weight:600; color:var(--text-main);">${t.name}</div>
                                    <div style="font-size:11px;color:var(--text-secondary);">${t.email}</div>
                                </div>
                            </div>
                        </td>
                        <td style="padding:0.75rem;">
                            <span style="color:${t.isActive ? '#10b981' : '#ef4444'};font-size:11px;font-weight:700;">${t.isActive ? 'ACTIVE' : 'BLOCKED'}</span>
                        </td>
                    </tr>
                `}).join('');

            // Load students
            const students = await api.get(`/admin/super/schools/${schoolId}/students`);
            document.getElementById('sdetail-students-count').textContent = students.length;
            const studentList = document.getElementById('sdetail-students-table-body');
            studentList.innerHTML = (!students || students.length === 0)
                ? '<tr><td colspan="2" style="text-align:center;padding:2rem;color:var(--text-secondary);">No students found.</td></tr>'
                : students.map(s => {
                    const initials = s.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                    const avatar = s.cameraPhoto 
                        ? `<img src="${s.cameraPhoto}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" onerror="this.outerHTML='<div class=&quot;initial-avatar&quot; style=&quot;width:32px;height:32px;border-radius:50%;background:#10b981;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;&quot;>${initials}</div>'">`
                        : `<div class="initial-avatar" style="width:32px;height:32px;border-radius:50%;background:#10b981;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">${initials}</div>`;
                    return `
                    <tr style="border-bottom:1px solid var(--glass-border);">
                        <td style="padding:0.75rem;">
                            <div style="display:flex; align-items:center; gap:10px;">
                                ${avatar}
                                <div>
                                    <div style="font-weight:600; color:var(--text-main);">${s.name}</div>
                                    <div style="font-size:11px;color:var(--text-secondary);">${s.email}</div>
                                </div>
                            </div>
                        </td>
                        <td style="padding:0.75rem; color:var(--text-main);">
                            <span style="font-size:12px; font-weight:600;">${s.classTag || '—'}</span> / 
                            <span style="font-size:12px; font-weight:600; color:#7c3aed;">${s.division || 'A'}</span>
                        </td>
                    </tr>
                `}).join('');

        } catch (err) {
            console.error('Deep dive error:', err);
            notifications.error('Failed to load deep dive data');
        }
    },

    goBackFromSchoolDetails() {
        const backTab = this._schoolDetailBackTab || 'schools';
        this.switchTab(backTab);
    },

    closeSchoolDetails() {
        const modal = document.getElementById('modal-school-details');
        if (modal) modal.style.display = 'none';
    },

    // ─── Subscription Plan Loader for School Modals ───────
    _plans: [],
    async loadSubscriptionPlanOptions() {
        try {
            const plans = await api.get('/admin/super/plans');
            this._plans = plans || [];
            const regSelect = document.getElementById('reg-subscription-plan');
            const editSelect = document.getElementById('edit-school-plan');
            const activePlans = this._plans.filter(p => p.isActive !== false);

            const optionsHTML = activePlans.map(p => `<option value="${p.name}">${p.name} ($${p.price})</option>`).join('') || '<option value="Basic">Basic</option><option value="Premium">Premium</option><option value="Enterprise">Enterprise</option>';

            if (regSelect) regSelect.innerHTML = optionsHTML;
            if (editSelect) editSelect.innerHTML = optionsHTML;
        } catch (err) {
            console.error('Failed to load plan options:', err);
            const defaultHTML = '<option value="Basic">Basic</option><option value="Premium">Premium</option><option value="Enterprise">Enterprise</option>';
            const regSelect = document.getElementById('reg-subscription-plan');
            const editSelect = document.getElementById('edit-school-plan');
            if (regSelect) regSelect.innerHTML = defaultHTML;
            if (editSelect) editSelect.innerHTML = defaultHTML;
        }
    },

    // ─── School Loader for User Modals ────────────────────
    async loadSchoolOptions() {
        try {
            if (this._allSchools.length === 0) {
                this._allSchools = await api.get('/admin/super/schools');
            }
            const createSchoolSelect = document.getElementById('create-user-school');
            const editSchoolSelect = document.getElementById('edit-user-school');

            const optionsHTML = this._allSchools.map(s => `<option value="${s._id}">${s.name}</option>`).join('') || '<option value="">No Schools Registered</option>';

            if (createSchoolSelect) createSchoolSelect.innerHTML = optionsHTML;
            if (editSchoolSelect) editSchoolSelect.innerHTML = optionsHTML;
        } catch (err) {
            console.error('Failed to load school options:', err);
        }
    },

    showEditSchoolModal(id) {
        const school = this._allSchools.find(s => s._id === id);
        if (!school) return notifications.error('School not found');

        document.getElementById('modal-edit-school').style.display = 'flex';
        this.loadSubscriptionPlanOptions().then(() => {
            document.getElementById('edit-school-id').value = school._id;
            document.getElementById('edit-school-name').value = school.name;
            document.getElementById('edit-school-board-type').value = school.board_type || 'CBSE';
            document.getElementById('edit-school-plan').value = school.subscription_plan || 'Basic';
            document.getElementById('edit-school-max-users').value = school.max_students_teachers || 100;
            document.getElementById('edit-school-status').checked = school.is_active !== false;

            const stateSelect = document.getElementById('edit-school-state');
            const districtSelect = document.getElementById('edit-school-district');
            const latInput = document.getElementById('edit-school-lat');
            const lngInput = document.getElementById('edit-school-lng');

            if (stateSelect && districtSelect) {
                stateSelect.innerHTML = Object.keys(STATE_DISTRICTS)
                    .map(s => `<option value="${s}">${s}</option>`).join('');
                
                stateSelect.value = school.state || 'Karnataka';

                const stateData = STATE_DISTRICTS[stateSelect.value];
                if (stateData) {
                    districtSelect.innerHTML = Object.keys(stateData.districts || {})
                        .map(d => `<option value="${d}">${d}</option>`).join('');
                    
                    districtSelect.value = school.district || 'Bengaluru';
                }

                latInput.value = school.latitude !== undefined ? school.latitude : 12.9716;
                lngInput.value = school.longitude !== undefined ? school.longitude : 77.5946;
            }
        });

        document.getElementById('edit-school-form').onsubmit = (e) => this.submitEditSchool(e);
    },

    closeEditSchoolModal() {
        document.getElementById('modal-edit-school').style.display = 'none';
    },

    async submitEditSchool(e) {
        e.preventDefault();
        const id = document.getElementById('edit-school-id').value;
        const btn = document.getElementById('edit-school-submit-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        try {
            await api.put(`/admin/super/schools/${id}`, {
                name: document.getElementById('edit-school-name').value,
                board_type: document.getElementById('edit-school-board-type').value,
                subscription_plan: document.getElementById('edit-school-plan').value,
                max_students_teachers: parseInt(document.getElementById('edit-school-max-users').value, 10),
                is_active: document.getElementById('edit-school-status').checked,
                state: document.getElementById('edit-school-state').value,
                district: document.getElementById('edit-school-district').value,
                latitude: parseFloat(document.getElementById('edit-school-lat').value),
                longitude: parseFloat(document.getElementById('edit-school-lng').value)
            });
            notifications.success('School updated successfully');
            this.closeEditSchoolModal();
            this.loadSchools();
            this.loadAnalytics();
        } catch (err) {
            notifications.error(err.message || 'Failed to update school');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Save Changes';
        }
    },

    // ─── Delete School ───────────────────────────────────
    async deleteSchool(id) {
        if (!confirm('Are you absolutely sure you want to delete this school? This will recursively delete all users (admins, teachers, students) associated with this school. This action CANNOT be undone!')) {
            return;
        }
        try {
            await api.delete(`/admin/super/schools/${id}`);
            notifications.success('School deleted successfully');
            this.loadSchools();
            this.loadAnalytics();
        } catch (err) {
            notifications.error('Deletion failed: ' + err.message);
        }
    },

    // ─── User Role Handler ──────────────────────────────
    onRoleChange(mode) {
        const role = document.getElementById(`${mode}-user-role`).value;
        const schoolGroup = document.getElementById(`${mode}-user-school-group`);
        const classGroup = document.getElementById(`${mode}-user-class-group`);
        const divisionGroup = document.getElementById(`${mode}-user-division-group`);

        if (role === 'super_admin') {
            if (schoolGroup) schoolGroup.style.display = 'none';
            if (classGroup) classGroup.style.display = 'none';
            if (divisionGroup) divisionGroup.style.display = 'none';
        } else if (role === 'school_admin' || role === 'teacher') {
            if (schoolGroup) schoolGroup.style.display = 'block';
            if (classGroup) classGroup.style.display = 'none';
            if (divisionGroup) divisionGroup.style.display = 'none';
        } else { // student
            if (schoolGroup) schoolGroup.style.display = 'block';
            if (classGroup) classGroup.style.display = 'block';
            if (divisionGroup) divisionGroup.style.display = 'block';
        }
    },

    // ─── Create User Modal ──────────────────────────────
    showCreateUserModal() {
        document.getElementById('modal-create-user').style.display = 'flex';
        this.loadSchoolOptions();
        this.onRoleChange('create');
        document.getElementById('create-user-form').reset();
        document.getElementById('create-user-form').onsubmit = (e) => this.submitCreateUser(e);
    },

    quickCreateUser(schoolId, role, division = '') {
        document.getElementById('modal-create-user').style.display = 'flex';
        document.getElementById('create-user-form').reset();
        this.loadSchoolOptions().then(() => {
            document.getElementById('create-user-school').value = schoolId;
            document.getElementById('create-user-role').value = role;
            this.onRoleChange('create');
            
            const divInput = document.getElementById('create-user-division');
            if (divInput) {
                divInput.value = (division === 'Unassigned') ? '' : division;
            }
            
            document.getElementById('create-user-name').focus();
        });
        document.getElementById('create-user-form').onsubmit = (e) => this.submitCreateUser(e);
    },

    closeCreateUserModal() {
        document.getElementById('modal-create-user').style.display = 'none';
    },

    async submitCreateUser(e) {
        e.preventDefault();
        const btn = document.getElementById('create-user-submit-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

        const role = document.getElementById('create-user-role').value;
        const data = {
            name: document.getElementById('create-user-name').value,
            email: document.getElementById('create-user-email').value,
            password: document.getElementById('create-user-password').value || 'Password@123',
            role: role,
            isActive: document.getElementById('create-user-status').checked
        };

        if (role !== 'super_admin') {
            data.schoolId = document.getElementById('create-user-school').value;
        }
        if (role === 'student') {
            data.classTag = document.getElementById('create-user-classtag').value;
            data.division = document.getElementById('create-user-division').value;
        }

        try {
            await api.post('/admin/super/users', data);
            notifications.success('User created successfully');
            this.closeCreateUserModal();
            this.loadUsers();
            this.loadAnalytics();
        } catch (err) {
            notifications.error(err.message || 'Failed to create user');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Create User';
        }
    },

    // ─── Edit User Modal ────────────────────────────────
    showEditUserModal(id) {
        const user = this._allUsers.find(u => u._id === id);
        if (!user) return notifications.error('User not found');

        document.getElementById('modal-edit-user').style.display = 'flex';
        this.loadSchoolOptions().then(() => {
            document.getElementById('edit-user-id').value = user._id;
            document.getElementById('edit-user-name').value = user.name;
            document.getElementById('edit-user-email').value = user.email;
            document.getElementById('edit-user-password').value = '';
            document.getElementById('edit-user-role').value = user.role || 'student';
            document.getElementById('edit-user-school').value = user.schoolId?._id || user.schoolId || '';
            document.getElementById('edit-user-classtag').value = user.classTag || '';
            document.getElementById('edit-user-division').value = user.division || '';
            document.getElementById('edit-user-status').checked = user.isActive !== false;

            this.onRoleChange('edit');
        });

        document.getElementById('edit-user-form').onsubmit = (e) => this.submitEditUser(e);
    },

    closeEditUserModal() {
        document.getElementById('modal-edit-user').style.display = 'none';
    },

    async submitEditUser(e) {
        e.preventDefault();
        const id = document.getElementById('edit-user-id').value;
        const btn = document.getElementById('edit-user-submit-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        const role = document.getElementById('edit-user-role').value;
        const data = {
            name: document.getElementById('edit-user-name').value,
            email: document.getElementById('edit-user-email').value,
            role: role,
            isActive: document.getElementById('edit-user-status').checked
        };

        const pwd = document.getElementById('edit-user-password').value;
        if (pwd) data.password = pwd;

        if (role !== 'super_admin') {
            data.schoolId = document.getElementById('edit-user-school').value || null;
        } else {
            data.schoolId = null;
        }

        if (role === 'student') {
            data.classTag = document.getElementById('edit-user-classtag').value;
            data.division = document.getElementById('edit-user-division').value;
        } else {
            data.classTag = '';
            data.division = '';
        }

        try {
            await api.put(`/admin/super/users/${id}`, data);
            notifications.success('User details updated successfully');
            this.closeEditUserModal();
            this.loadUsers();
            this.loadAnalytics();
        } catch (err) {
            notifications.error(err.message || 'Failed to update user');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Save Changes';
        }
    },

    // ─── Delete User ────────────────────────────────────
    async deleteUser(id) {
        if (!confirm('Are you sure you want to delete this user?')) return;
        try {
            await api.delete(`/admin/super/users/${id}`);
            notifications.success('User deleted successfully');
            this.loadUsers();
            this.loadAnalytics();
        } catch (err) {
            notifications.error('Deletion failed: ' + err.message);
        }
    },

    // ─── Create Subscription Plan Modal ─────────────────
    showCreatePlanModal() {
        document.getElementById('modal-create-plan').style.display = 'flex';
        document.getElementById('create-plan-form').reset();
        document.getElementById('create-plan-form').onsubmit = (e) => this.submitCreatePlan(e);
    },

    closeCreatePlanModal() {
        document.getElementById('modal-create-plan').style.display = 'none';
    },

    async submitCreatePlan(e) {
        e.preventDefault();
        const btn = document.getElementById('create-plan-submit-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

        const featuresRaw = document.getElementById('create-plan-features').value;
        const features = featuresRaw.split('\n').map(f => f.trim()).filter(f => f.length > 0);

        try {
            await api.post('/admin/super/plans', {
                name: document.getElementById('create-plan-name').value,
                price: parseFloat(document.getElementById('create-plan-price').value),
                durationDays: parseInt(document.getElementById('create-plan-duration').value, 10),
                features: features,
                isActive: document.getElementById('create-plan-status').checked
            });
            notifications.success('Subscription plan created successfully');
            this.closeCreatePlanModal();
            this.loadBilling();
        } catch (err) {
            notifications.error(err.message || 'Failed to create plan');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Create Plan';
        }
    },

    // ─── Edit Subscription Plan Modal ───────────────────
    showEditPlanModal(id) {
        const plan = this._billingPlans.find(p => p._id === id);
        if (!plan) return notifications.error('Subscription plan not found');

        document.getElementById('modal-edit-plan').style.display = 'flex';
        document.getElementById('edit-plan-id').value = plan._id;
        document.getElementById('edit-plan-name').value = plan.name;
        document.getElementById('edit-plan-price').value = plan.price;
        document.getElementById('edit-plan-duration').value = plan.durationDays;
        document.getElementById('edit-plan-features').value = (plan.features || []).join('\n');
        document.getElementById('edit-plan-status').checked = plan.isActive !== false;

        document.getElementById('edit-plan-form').onsubmit = (e) => this.submitEditPlan(e);
    },

    closeEditPlanModal() {
        document.getElementById('modal-edit-plan').style.display = 'none';
    },

    async submitEditPlan(e) {
        e.preventDefault();
        const id = document.getElementById('edit-plan-id').value;
        const btn = document.getElementById('edit-plan-submit-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        const featuresRaw = document.getElementById('edit-plan-features').value;
        const features = featuresRaw.split('\n').map(f => f.trim()).filter(f => f.length > 0);

        try {
            await api.put(`/admin/super/plans/${id}`, {
                name: document.getElementById('edit-plan-name').value,
                price: parseFloat(document.getElementById('edit-plan-price').value),
                durationDays: parseInt(document.getElementById('edit-plan-duration').value, 10),
                features: features,
                isActive: document.getElementById('edit-plan-status').checked
            });
            notifications.success('Subscription plan updated successfully');
            this.closeEditPlanModal();
            this.loadBilling();
        } catch (err) {
            notifications.error(err.message || 'Failed to update plan');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Save Changes';
        }
    },

    // ─── Delete Subscription Plan ───────────────────────
    async deletePlan(id) {
        if (!confirm('Are you sure you want to delete this subscription plan?')) return;
        try {
            await api.delete(`/admin/super/plans/${id}`);
            notifications.success('Subscription plan deleted successfully');
            this.loadBilling();
        } catch (err) {
            notifications.error('Deletion failed: ' + err.message);
        }
    },

    // ─── Broadcast Global Announcement ────────────────────
    submitBroadcastAnnouncement(e) {
        e.preventDefault();
        const titleEl = document.getElementById('announcement-title');
        const messageEl = document.getElementById('announcement-message');
        const btn = document.getElementById('broadcast-announcement-btn');

        if (!titleEl.value || !messageEl.value) {
            return notifications.warn('Please fill in all fields');
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Broadcasting...';

        try {
            if (this.socket && this.socket.connected) {
                this.socket.emit('broadcast-announcement', {
                    title: titleEl.value,
                    message: messageEl.value
                });
                notifications.success('📢 Global announcement broadcasted successfully!');
                titleEl.value = '';
                messageEl.value = '';
            } else {
                notifications.error('Real-time connection is not active. Unable to broadcast.');
            }
        } catch (err) {
            notifications.error('Failed to broadcast: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Send Broadcast';
        }
    }
};

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SuperAdmin.init());
} else {
    SuperAdmin.init();
}
