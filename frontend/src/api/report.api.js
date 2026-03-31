import { api } from '../lib/axios';

export const reportApi = {
  getUploadUrl: (data) => api.post('/reports/upload-url', data),
  create: (data) => api.post('/reports', data),
  getAll: () => api.get('/reports'),
  getById: (id) => api.get(`/reports/${id}`),
  reanalyze: (id) => api.post(`/reports/${id}/analyse`),
  getTrends: (biomarker) => api.get(`/reports/trends/${biomarker}`)
};