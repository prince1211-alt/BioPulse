import { api } from './axios.js';

export const authApi = {
  // POST /auth/register
  register: (data) => api.post('/auth/register', data),

  // POST /auth/login
  login: (data) => api.post('/auth/login', data),

  // POST /auth/logout
  logout: () => api.post('/auth/logout'),

  // POST /auth/refresh  (called by axios interceptor, but exposed for manual use)
  refresh: () => api.post('/auth/refresh'),

  // GET /auth/me
  verify: () => api.get('/auth/me'),

  // PATCH /auth/password
  changePassword: (data) => api.patch('/auth/password', data),

  // PUT /auth/fcm-token
  updateFcmToken: (fcm_token) => api.put('/auth/fcm-token', { fcm_token }),
};

export const notificationApi = {
  // GET /notifications
  getAll: () => api.get('/notifications'),

  // PATCH /notifications/:id/read
  markRead: (id) => api.patch(`/notifications/${id}/read`),
};