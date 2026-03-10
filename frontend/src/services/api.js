import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
});

// ─── Auth token injection ─────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('acapulco_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Response error handling ──────────────────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('acapulco_token');
      localStorage.removeItem('acapulco_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
  changePassword: (data) => api.post('/auth/change-password', data),
};

// ─── Products / ERP ───────────────────────────────────────────────────────
export const productsAPI = {
  getByReference: (ref, forceRefresh = false) =>
    api.get(`/products/${encodeURIComponent(ref)}${forceRefresh ? '?refresh=true' : ''}`),
  search: (q) => api.get(`/products/search?q=${encodeURIComponent(q)}`),
  erpStatus: () => api.get('/products/erp/status'),
};

// ─── Quotes ───────────────────────────────────────────────────────────────
export const quotesAPI = {
  list: (params) => api.get('/quotes', { params }),
  get: (id) => api.get(`/quotes/${id}`),
  create: (data) => api.post('/quotes', data),
  update: (id, data) => api.put(`/quotes/${id}`, data),
  submit: (id) => api.post(`/quotes/${id}/submit`),
  delete: (id) => api.delete(`/quotes/${id}`),
  stats: () => api.get('/quotes/stats/summary'),
};

// ─── Approvals ────────────────────────────────────────────────────────────
export const approvalsAPI = {
  pending: () => api.get('/approvals/pending'),
  decide: (quoteId, decision, notes) =>
    api.post(`/approvals/${quoteId}/decide`, { decision, notes }),
  history: () => api.get('/approvals/history'),
};

// ─── Manufacturing Costs ──────────────────────────────────────────────────
export const costsAPI = {
  list: () => api.get('/costs'),
  grouped: () => api.get('/costs/grouped'),
  create: (data) => api.post('/costs', data),
  update: (id, data) => api.put(`/costs/${id}`, data),
  delete: (id) => api.delete(`/costs/${id}`),
};

// ─── Embroidery ───────────────────────────────────────────────────────────
export const embroideryAPI = {
  analyze: (formData) =>
    api.post('/embroidery/analyze', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    }),
  analyzeBase64: (imageBase64) =>
    api.post('/embroidery/analyze', { imageBase64 }),
  calculate: (points, pricePerK) =>
    api.post('/embroidery/calculate', { points, pricePerK }),
  calculatePrint: (data) => api.post('/embroidery/print-calculate', data),
};

export default api;
