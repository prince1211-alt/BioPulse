import { api } from './axios.js';

export const reportApi = {
  // POST /reports/upload
  // body: FormData (file, report_type, report_date)
  upload: (formData) => api.post('/reports/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),

  // GET /reports?page=1&limit=10&report_type=blood_test
  getAll: (params) => api.get('/reports', { params }),

  // GET /reports/:id
  getById: (id) => api.get(`/reports/${id}`),

  // GET /reports/:id/status  — poll for ocr/analysis completion
  getStatus: (id) => api.get(`/reports/${id}/status`),

  // POST /reports/:id/reanalyze
  reanalyze: (id) => api.post(`/reports/${id}/reanalyze`),

  // DELETE /reports/:id
  delete: (id) => api.delete(`/reports/${id}`),

  // GET /reports/trends/:biomarker?limit=20
  // biomarker: 'diabetes.hba1c.standard' | 'lipid.ldl.standard' etc.
  getTrends: (biomarker, limit = 20) =>
    api.get(`/reports/trends/${biomarker}`, { params: { limit } }),

  // GET /reports/patient/:patientId  (doctor only)
  getPatientReports: (patientId, params) =>
    api.get(`/reports/patient/${patientId}`, { params }),
};