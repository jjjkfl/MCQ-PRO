/**
 * js/shared/auth.js
 * Authentication and Session Management
 */

const auth = {
  /**
   * Login user and save token
   */
  async login(email, password, requiredRole) {
    try {
      const payload = { email, password };
      if (requiredRole) {
        payload.requiredRole = requiredRole;
      }
      const result = await api.post('/auth/login', payload);
      this.setSession(result.accessToken, result.user);
      this.redirectByRole(result.user.role);
    } catch (error) {
      throw error;
    }
  },

  /**
   * Register user
   */
  async register(userData) {
    try {
      const result = await api.post('/auth/register', userData);
      this.setSession(result.accessToken, result.user);
      this.redirectByRole(result.user.role);
    } catch (error) {
      throw error;
    }
  },

  setSession(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  },

  getUser() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },

  getToken() {
    return localStorage.getItem('token');
  },

  isAuthenticated() {
    return !!this.getToken();
  },

  logout() {
    const user = this.getUser();
    let role = user ? user.role : null;
    if (!role) {
      const path = window.location.pathname;
      if (path.includes('super-admin')) role = 'super_admin';
      else if (path.includes('school-admin')) role = 'school_admin';
      else if (path.includes('teacher')) role = 'teacher';
      else if (path.includes('student') || path.includes('index.html') || path === '/' || path.includes('exam')) role = 'student';
    }

    localStorage.removeItem('token');
    localStorage.removeItem('user');

    if (role === 'super_admin') {
      window.location.href = '/login/super';
    } else if (role === 'school_admin') {
      window.location.href = '/login/school';
    } else if (role === 'teacher') {
      window.location.href = '/login/teacher';
    } else if (role === 'student') {
      window.location.href = '/login/student';
    } else {
      window.location.href = '/login.html';
    }
  },

  redirectByRole(role) {
    if (role === 'teacher') {
      window.location.href = '/teacher.html';
    } else if (role === 'super_admin') {
      window.location.href = '/super-admin.html';
    } else if (role === 'school_admin') {
      window.location.href = '/school-admin.html';
    } else if (role === 'admin') {
      window.location.href = '/admin.html';
    } else {
      window.location.href = '/index.html';
    }
  },

  /**
   * Route protection check with role-based redirection
   */
  checkAuth() {
    if (!this.isAuthenticated()) {
      const path = window.location.pathname;
      if (path.includes('super-admin')) {
        window.location.href = '/login/super';
      } else if (path.includes('school-admin')) {
        window.location.href = '/login/school';
      } else if (path.includes('teacher')) {
        window.location.href = '/login/teacher';
      } else if (path.includes('student') || path.includes('index.html') || path === '/' || path.includes('exam')) {
        window.location.href = '/login/student';
      } else {
        window.location.href = '/login.html';
      }
      return false;
    }

    const user = this.getUser();
    if (!user) {
      this.logout();
      return false;
    }

    const path = window.location.pathname;

    // Prevent unauthorized access to admin dashboards
    if (path.includes('super-admin') && user.role !== 'super_admin') {
      this.redirectByRole(user.role);
      return false;
    }

    if (path.includes('school-admin') && user.role !== 'school_admin') {
      this.redirectByRole(user.role);
      return false;
    }

    // Prevent student from accessing teacher dashboard
    if (path.includes('teacher') && user.role !== 'teacher') {
      this.redirectByRole(user.role);
      return false;
    }

    // Prevent teacher/admin from accessing student dashboard
    if ((path === '/' || path.includes('index.html') || path === '/student' || path === '/student/')
      && user.role !== 'student') {
      this.redirectByRole(user.role);
      return false;
    }

    return true;
  }
};

window.auth = auth;
