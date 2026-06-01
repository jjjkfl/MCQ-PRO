/**
 * js/shared/utils.js
 * Common utility functions
 */

const utils = {
  /**
   * Format date to Apple-style readable string
   */
  formatDate(dateString) {
    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
  },

  /**
   * Format time (seconds to MM:SS)
   */
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  },

  /**
   * Generate a random string
   */
  randomStr(len = 8) {
    return Math.random().toString(36).substring(2, 2 + len).toUpperCase();
  },

  /**
   * Safe DOM selector
   */
  $(selector) {
    return document.querySelector(selector);
  },

  $all(selector) {
    return document.querySelectorAll(selector);
  },

  /**
   * Debounce function for inputs
   */
  debounce(fn, delay) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  /**
   * Update URL parameter and reload
   */
  setUrlParam(key, value) {
    const url = new URL(window.location);
    url.searchParams.set(key, value);
    window.location.href = url.toString();
  },

  async applySchoolBranding() {
    try {
      const token = sessionStorage.getItem('token');
      if (!token) return;
      const response = await fetch('/api/auth/my-school', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) return;
      const data = await response.json();
      if (!data) return;

      // Update school name text in header/sidebar
      const schoolNameEl = document.getElementById('school-name');
      if (schoolNameEl) {
        schoolNameEl.textContent = data.name;
      }
      
      const schoolSubtitleEl = document.getElementById('school-subtitle');
      if (schoolSubtitleEl) {
        schoolSubtitleEl.textContent = `Administrative portal for ${data.name}`;
      }

      // Dynamic Branding Colors (Theme customization)
      if (data.branding) {
        if (data.branding.primary_color) {
          document.documentElement.style.setProperty('--primary', data.branding.primary_color);
        }
        if (data.branding.secondary_color) {
          document.documentElement.style.setProperty('--secondary', data.branding.secondary_color);
        }
      }

      // Handle School Logo update in headers/sidebars
      if (data.logo) {
        const logoContainers = document.querySelectorAll('.sidebar-logo, .sidebar-header h1');
        logoContainers.forEach(container => {
          let img = container.querySelector('.school-branding-logo');
          if (!img) {
            const icon = container.querySelector('i');
            if (icon) {
              icon.style.display = 'none';
            }
            img = document.createElement('img');
            img.className = 'school-branding-logo';
            img.alt = 'School Logo';
            img.style.cssText = 'width:32px; height:32px; border-radius:50%; object-fit:cover; margin-right:10px; flex-shrink:0; display:inline-block; vertical-align:middle;';
            container.insertBefore(img, container.firstChild);
          }
          img.src = data.logo;
        });
      } else {
        // Restore default icons if logo is deleted/empty
        const logoContainers = document.querySelectorAll('.sidebar-logo, .sidebar-header h1');
        logoContainers.forEach(container => {
          const img = container.querySelector('.school-branding-logo');
          if (img) {
            img.remove();
          }
          const icon = container.querySelector('i');
          if (icon) {
            icon.style.display = '';
          }
        });
      }
    } catch (err) {
      console.warn('Failed to apply school branding:', err);
    }
  }
};

window.utils = utils;
