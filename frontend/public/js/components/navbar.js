/**
 * js/components/navbar.js
 * Dynamic Navbar Component
 */

const Navbar = {
  render(containerId, activeLink = '') {
    const user = auth.getUser();
    if (!user) return;

    const container = document.getElementById(containerId);
    if (!container) return;

    const navHtml = `
      <nav class="flex-between" style="padding: 20px 0; border-bottom: 1px solid var(--border); margin-bottom: 40px;">
        <div class="flex-center" style="gap: 24px;">
          <div style="font-weight: 700; font-size: 20px; letter-spacing: -0.5px; margin-right: 12px;">MCQ<span style="color: var(--primary)">PRO</span></div>
          <div class="flex-center" style="gap: 20px;">
            ${user.role === 'student' ? `
              <a href="/index.html" class="${activeLink === 'dashboard' ? 'active' : ''}" style="font-size: 13px; font-weight: 600;">Dashboard</a>
              <a href="/index.html?view=courses" class="${activeLink === 'courses' ? 'active' : ''}" style="font-size: 13px; font-weight: 600;">My Courses</a>
              <a href="/index.html?view=forum" class="${activeLink === 'forum' ? 'active' : ''}" style="font-size: 13px; font-weight: 600;">Discussion Forum</a>
              <a href="/index.html?view=exam-results" class="${activeLink === 'results' ? 'active' : ''}" style="font-size: 13px; font-weight: 600;">Exam Results</a>
            ` : `
              <a href="/teacher.html" class="${activeLink === 'dashboard' ? 'active' : ''}" style="font-size: 13px; font-weight: 600;">Dashboard</a>
              <a href="/teacher.html?view=materials" class="${activeLink === 'materials' ? 'active' : ''}" style="font-size: 13px; font-weight: 600;">Courses Mgmt</a>
              <a href="/teacher.html?view=students" class="${activeLink === 'students' ? 'active' : ''}" style="font-size: 13px; font-weight: 600;">Students</a>
              <a href="/teacher.html?view=forum" class="${activeLink === 'forum' ? 'active' : ''}" style="font-size: 13px; font-weight: 600;">Forum</a>
              <a href="/teacher.html?view=analytics-all" class="${activeLink === 'analytics' ? 'active' : ''}" style="font-size: 13px; font-weight: 600;">Global Analytics</a>
            `}
          </div>
        </div>
        <div class="flex-center" style="gap: 16px;">
          <button onclick="document.body.toggleAttribute('data-theme', document.body.hasAttribute('data-theme') ? '' : 'dark')" class="btn btn-outline" style="padding: 8px; border-radius: 50%;">🌓</button>
          <div style="text-align: right">
            <div style="font-size: 13px; font-weight: 600;">${user.name}</div>
            <div style="font-size: 11px; opacity: 0.5;">${user.role.toUpperCase()}</div>
          </div>
          <button onclick="auth.logout()" class="btn btn-outline" style="padding: 8px 16px; font-size: 12px;">Logout</button>
        </div>
      </nav>
    `;

    container.innerHTML = navHtml;
    // Highlight active link
    const links = container.querySelectorAll('a');
    links.forEach(l => {
      if (l.classList.contains('active')) l.style.color = 'var(--primary)';
      else l.style.color = 'var(--text-main)';
      l.style.opacity = l.classList.contains('active') ? '1' : '0.6';
    });
  }
};

window.Navbar = Navbar;
