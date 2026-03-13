// ══════════════════════════════════════════════
// MP CRM Frontend — API Service
// ══════════════════════════════════════════════

import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Interceptor: добавляем JWT ───
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Interceptor: обработка 401 → refresh token ───
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });

        localStorage.setItem('accessToken', data.data.accessToken);
        localStorage.setItem('refreshToken', data.data.refreshToken);

        originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// ═══ Auth ═══
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (data) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
  logout: () => {
    const refreshToken = localStorage.getItem('refreshToken');
    return api.post('/auth/logout', { refreshToken });
  },
};

// ═══ Marketplaces & Cabinets ═══
export const marketplaceAPI = {
  getAll: () => api.get('/marketplaces'),
  getCabinet: (id) => api.get(`/cabinets/${id}`),
  updateCabinet: (id, data) => api.put(`/cabinets/${id}`, data),
};

// ═══ Chats ═══
export const chatAPI = {
  getAll: (params) => api.get('/chats', { params }),
  getById: (chatId) => api.get(`/chats/${chatId}`),
  sendMessage: (chatId, text) => api.post(`/chats/${chatId}/messages`, { text }),
  markAsRead: (chatId) => api.patch(`/chats/${chatId}/read`),
  assignManager: (chatId, managerId) => api.patch(`/chats/${chatId}/assign`, { managerId }),
  updateStatus: (chatId, status) => api.patch(`/chats/${chatId}/status`, { status }),
};

// ═══ Tasks ═══
export const taskAPI = {
  getAll: (params) => api.get('/tasks', { params }),
  getById: (taskId) => api.get(`/tasks/${taskId}`),
  create: (data) => api.post('/tasks', data),
  update: (taskId, data) => api.put(`/tasks/${taskId}`, data),
  delete: (taskId) => api.delete(`/tasks/${taskId}`),
  toggle: (taskId) => api.patch(`/tasks/${taskId}/toggle`),
};

// ═══ Analytics ═══
export const analyticsAPI = {
  getResponseTime: (params) => api.get('/analytics/response-time', { params }),
  exportCSV: (params) =>
    api.get('/analytics/response-time/export', {
      params,
      responseType: 'blob',
    }),
  getDashboard: () => api.get('/analytics/dashboard'),
};

export default api;
