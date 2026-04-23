/**
 * js/components/loader.js
 * Loading indicator
 */

const Loader = {
  show(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = `
      <div class="flex-center" style="padding: 40px; flex-direction: column; gap: 16px;">
        <div class="spinner"></div>
        <p class="p-dim">Loading...</p>
      </div>
      <style>
        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(255,255,255,0.1);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
    `;
  },

  hide(containerId) {
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '';
  }
};

window.Loader = Loader;
