import { api } from '../lib/api';
export const reportApi = {
  getUploadUrl: data => api('/reports/upload-url', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  create: data => api('/reports', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getAll: () => api('/reports', {
    method: 'GET'
  }),
  getById: id => api(`/reports/${id}`, {
    method: 'GET'
  }),
  reanalyze: id => api(`/reports/${id}/analyse`, {
    method: 'POST'
  }),
  getTrends: biomarker => api(`/reports/trends/${biomarker}`, {
    method: 'GET'
  })
};