/**
 * js/shared/api.js
 * Centralized API handler for backend communication
 */

const API_BASE_URL = window.location.origin + '/api';
const SERVER_URL = window.location.origin;

const api = {
  /**
   * Core request wrapper
   */
  async request(endpoint, options = {}) {
    const token = sessionStorage.getItem('token');

    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers
    };

    const config = {
      ...options,
      headers
    };

    try {
      console.log(`🌐 API Request: ${options.method || 'GET'} ${endpoint}`);
      const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
      const result = await response.json();

      if (!response.ok) {
        // Handle token expiration (skip for auth routes so errors can be shown)
        if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/register')) {
          auth.logout();
        }
        throw new Error(result.message || 'Something went wrong');
      }

      return result;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },

  put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },

  patch(endpoint, body) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },

  /**
   * Specialized for file uploads (FormData)
   */
  async upload(endpoint, formData, method = 'POST') {
    const token = sessionStorage.getItem('token');
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method,
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: formData
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401) auth.logout();
        throw new Error(result.message || 'Upload failed');
      }
      return result;
    } catch (error) {
      console.error('Upload Error:', error);
      throw error;
    }
  }
};

window.api = api;
window.SERVER_URL = SERVER_URL;
