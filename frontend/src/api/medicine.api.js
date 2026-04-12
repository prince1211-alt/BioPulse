import { api } from './axios.js';

export const medicineApi = {
  // GET /medicines
  getAll: () => api.get('/medicines'),

  // GET /medicines/:id
  getById: (id) => api.get(`/medicines/${id}`),

  // POST /medicines
  // body: { name, dosage, times: ['08:00','20:00'], start_date, end_date?, notes? }
  create: (data) => api.post('/medicines', data),

  // PATCH /medicines/:id
  // body: any of { name, dosage, times, start_date, end_date, notes }
  update: (id, data) => api.patch(`/medicines/${id}`, data),

  // DELETE /medicines/:id
  delete: (id) => api.delete(`/medicines/${id}`),

  // POST /medicines/log
  // body: { medicine_id, scheduled_at, status: 'taken'|'missed'|'skipped', notes? }
  logDose: (data) => api.post('/medicines/log', data),

  // GET /medicines/schedule/today
  getTodaySchedule: () => api.get('/medicines/schedule/today'),

  // GET /medicines/adherence?days=30
  getAdherence: (days = 30) => api.get('/medicines/adherence', { params: { days } }),
};