import { api } from '../lib/axios';

export const medicineApi = {
  create: (data) => api.post('/medicines', data),
  getAll: () => api.get('/medicines'),
  getToday: () => api.get('/medicines/today'),
  delete: (id) => api.delete(`/medicines/${id}`),
  logDose: (data) => api.post('/medicines/logs', data)
};