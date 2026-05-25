import { api } from './axios.js';

export const userApi = {
  // GET /users/me
  getProfile: () => api.get('/users/me'),

  // PATCH /users/me
  updateProfile: (data) => api.patch('/users/me', data),

  // DELETE /users/me
  deleteAccount: () => api.delete('/users/me'),

  // GET /users/doctors/:doctorId  — public doctor profile
  getDoctorProfile: (doctorId) => api.get(`/users/doctors/${doctorId}`),

  // ── Admin ───────────────────────────────────────────────────────────────────

  // GET /users?role=patient&page=1&limit=20
  getAllUsers: (params) => api.get('/users', { params }),

  // GET /users/:userId
  getUserById: (userId) => api.get(`/users/${userId}`),

  // GET /users/:userId/history
  getPatientHistory: (userId) => api.get(`/users/${userId}/history`),

  // PATCH /users/:userId/ban
  banUser: (userId, ban) => api.patch(`/users/${userId}/ban`, { ban }),
};