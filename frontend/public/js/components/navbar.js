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
        <div class="flex-center">
          <div style="font-weight: 700; font-size: 20px; letter-spacing: -0.5px;">SURGICAL<span style="color: var(--primary)">EXAM</span></div>
        </div>
        <div class="flex-center" style="gap: 32px;">
          ${user.role === 'student' ? `
            <a href="/index.html" class="${activeLink === 'dashboard' ? 'active' : ''}" style="font-size: 14px; font-weight: 500;">Dashboard</a>
            <a href="#" style="font-size: 14px; font-weight: 500; opacity: 0.6;">Profile</a>
          ` : `
            <a href="/teacher.html" class="${activeLink === 'dashboard' ? 'active' : ''}" style="font-size: 14px; font-weight: 500;">Dashboard</a>
            <a href="#" style="font-size: 14px; font-weight: 500; opacity: 0.6;">Analytics</a>
          `}
        </div>
        <div class="flex-center" style="gap: 16px;">
          <div style="text-align: right">
            <div style="font-size: 13px; font-weight: 600;">${user.name}</div>
            <div style="font-size: 11px; opacity: 0.5;">${user.role.toUpperCase()}</div>
          </div>
          <button onclick="auth.logout()" class="btn btn-outline" style="padding: 8px 16px; font-size: 12px;">Logout</button>
        </div>
      </nav>
    `;

    container.innerHTML = navHtml;
  }
};

window.Navbar = Navbar;
