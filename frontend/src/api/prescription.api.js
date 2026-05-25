import { api } from './axios.js';

export const prescriptionApi = {
  create: (data) => api.post('/prescriptions', data),
  getPatientPrescriptions: () => api.get('/prescriptions/patient'),
  getDoctorPrescriptions: () => api.get('/prescriptions/doctor'),
  getTemplates: () => api.get('/prescriptions/templates'),
  saveTemplate: (data) => api.post('/prescriptions/templates', data),
  getById: (id) => api.get(`/prescriptions/${id}`),
};
