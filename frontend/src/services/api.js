import axios from 'axios';

/**
 * API Service Layer - Domain Agnostic Version
 * * 1. Base URL is empty string or relative path. 
 * Browser automatically appends it to current domain.
 * 2. Login uses URLSearchParams (Required by FastAPI).
 */

// API_URL is relative. If you are at https://site.com, this becomes https://site.com/api/v1
const API_URL = '/api/v1'; 

const client = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach JWT
client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle Auth Errors
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.location.href = '/login'; 
    }
    return Promise.reject(error);
  }
);

const api = {
  // --- Auth ---
  auth: {
    login: async (username, password) => {
      // 1. Format data as Form URL Encoded (Required by Python/FastAPI)
      const params = new URLSearchParams();
      params.append('username', username);
      params.append('password', password);
      
      // 2. Post to '/token'. 
      // We override baseURL to '/' because the token endpoint is usually 
      // at the root (https://site.com/token), not inside /api/v1.
      const response = await client.post('/token', params, {
         baseURL: '/', 
         headers: {
           'Content-Type': 'application/x-www-form-urlencoded'
         }
      });
      return response.data;
    },
    loginMfa: async (username, password, mfa_token) => {
      const params = new URLSearchParams();
      params.append('username', username);
      params.append('password', password);
      params.append('client_secret', mfa_token); // Pass MFA token in client_secret
      
      const response = await client.post('/token', params, {
         baseURL: '/', 
         headers: {
           'Content-Type': 'application/x-www-form-urlencoded'
         }
      });
      return response.data;
    },
    me: () => client.get('/auth/me'),
    setupMfa: () => client.post('/auth/mfa/setup'),
    verifyMfa: (token) => client.post('/auth/mfa/verify', { token }),
    disableMfa: (token) => client.post('/auth/mfa/disable', { token }),
    requestPasswordReset: (email) => client.post('/auth/request-password-reset', { email }),
    verifyResetToken: (token) => client.post('/auth/verify-reset-token', { token }),
    resetPassword: (token, new_password) => client.post('/auth/reset-password', { token, new_password }),
  },

  // --- Sites ---
  sites: {
    list: () => client.get('/sites'),
    get: (domain) => client.get(`/sites/${domain}`),
    create: (data) => client.post('/sites', data),
    delete: (domain) => client.delete(`/sites/${domain}`),
    toggleSSL: (domain, enabled) => client.post(`/sites/${domain}/ssl`, { enabled }),
    clearCache: (domain) => client.post(`/sites/${domain}/cache/clear`),
    updatePHP: (domain, version) => client.put(`/sites/${domain}/stack`, { php_version: version }),
  },

  // --- Bulk Deploy ---
  bulk: {
    deploy: (payload) => client.post('/bulk/deploy', payload),
  },

  // --- Users ---
  users: {
    list: () => client.get('/users'),
    invite: (data) => client.post('/users', data),
    delete: (id) => client.delete(`/users/${id}`),
    // Fixed: Backend expects PUT /users/{id} with body { role: ... }
    updateRole: (id, role) => client.put(`/users/${id}`, { role }),
  },

  // --- Logs & Audit ---
  logs: {
    stream: (domain, type) => client.get(`/sites/${domain}/logs`, { params: { type } }),
    // Note: /audit-logs endpoint is currently missing in backend
    audit: (filters) => client.get('/audit-logs', { params: filters }),
  },

  // --- Stacks & Services ---
  stack: {
    getStats: () => client.get('/system/stats'),
    // Fixed: Backend endpoint is /system/services
    list: () => client.get('/system/services'),
    manageService: (service, action) => client.post('/system/services', { service, action }),
  },

  // --- Settings ---
  settings: {
    update: (data) => client.post('/settings', data),
  },

  // --- Vault ---
  vault: {
    list: () => client.get('/vault'),
    upload: (formData) => client.post('/vault/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
    delete: (filename) => client.delete(`/vault/${filename}`),
    downloadWp: (slugs, type) => client.post('/vault/download-wp', { slugs, type }),
  }
};

export default api;