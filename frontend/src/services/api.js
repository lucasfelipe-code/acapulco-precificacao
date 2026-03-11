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
// Retorna: { product, materials (BOM com staleness por linha), markup, combinacoes }
export const productsAPI = {
  list:             ()                          => api.get('/products'),
  getByReference:   (ref, forceRefresh = false) =>
    api.get(`/products/${encodeURIComponent(ref)}${forceRefresh ? '?refresh=true' : ''}`),
  getFormacaoPreco: (ref) =>
    api.get(`/products/${encodeURIComponent(ref)}/formacao-preco`),
  erpStatus:        () => api.get('/products/erp/status'),
};

// ─── Quotes ───────────────────────────────────────────────────────────────
export const quotesAPI = {
  list:              (params)      => api.get('/quotes', { params }),
  get:               (id)          => api.get(`/quotes/${id}`),
  create:            (data)        => api.post('/quotes', data),
  update:            (id, data)    => api.put(`/quotes/${id}`, data),
  submit:            (id)          => api.post(`/quotes/${id}/submit`),
  confirmEmbroidery: (id, data)    => api.post(`/quotes/${id}/confirm-embroidery`, data),
  delete:            (id)          => api.delete(`/quotes/${id}`),
  stats:             ()            => api.get('/quotes/stats/summary'),
};

// ─── Approvals ────────────────────────────────────────────────────────────
export const approvalsAPI = {
  pending: ()                         => api.get('/approvals/pending'),
  decide:  (quoteId, decision, notes) => api.post(`/approvals/${quoteId}/decide`, { decision, notes }),
  history: ()                         => api.get('/approvals/history'),
};

// ─── Manufacturing Costs ──────────────────────────────────────────────────
export const costsAPI = {
  list:    ()         => api.get('/costs'),
  grouped: ()         => api.get('/costs/grouped'),
  lookup:  (body)     => api.post('/costs/lookup', body),  // resolve custos automáticos por tipo+qtd
  get:     (id)       => api.get(`/costs/${id}`),
  create:  (data)     => api.post('/costs', data),
  update:  (id, data) => api.put(`/costs/${id}`, data),
  delete:  (id)       => api.delete(`/costs/${id}`),
};

// ─── Clients ──────────────────────────────────────────────────────────────────
export const clientsAPI = {
  search: (q = '') => api.get('/clients', { params: q ? { q } : {} }),
  get:    (id)     => api.get(`/clients/${id}`),
  create: (data)   => api.post('/clients', data),
  update: (id, data) => api.put(`/clients/${id}`, data),
};

// ─── Embroidery ───────────────────────────────────────────────────────────
export const embroideryAPI = {
  // Análise de imagem via GPT-4o Vision — retorna estimativa de pontos + bordados similares
  analyze:       (formData) => api.post('/embroidery/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  }),
  calculate:     (points, pricePerK) => api.post('/embroidery/calculate', { points, pricePerK }),
  calculatePrint: (data)             => api.post('/embroidery/print-calculate', data),

  // Biblioteca de bordados anteriores
  library:       (params)    => api.get('/embroidery/library', { params }),
  libraryGet:    (id)        => api.get(`/embroidery/library/${id}`),
  libraryCreate: (formData)  => api.post('/embroidery/library', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  libraryUpdate: (id, data)  => api.put(`/embroidery/library/${id}`, data),
};

export default api;
