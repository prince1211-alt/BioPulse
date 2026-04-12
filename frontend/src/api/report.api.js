import { api } from './axios.js';

export const reportApi = {
  // POST /reports/upload-url
  // body: { filename, contentType }  → returns { uploadUrl, fileUrl, key }
  getUploadUrl: (data) => api.post('/reports/upload-url', data),

  // POST /reports
  // body: { file_url, report_type, content_type, report_date? }
  create: (data) => api.post('/reports', data),

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