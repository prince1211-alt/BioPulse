import { api } from './axios.js';

export const appointmentApi = {
  // ── Doctors ─────────────────────────────────────────────────────────────────

  // GET /appointments/doctors?specialisation=Cardiologist
  getDoctors: (specialisation) =>
    api.get('/appointments/doctors', { params: specialisation ? { specialisation } : {} }),

  // GET /appointments/doctors/:id/slots
  getDoctorSlots: (doctorId) => api.get(`/appointments/doctors/${doctorId}/slots`),

  // POST /appointments/doctors/slots  (doctor only)
  // body: { slots: ['2025-05-01T09:00:00Z', ...] }
  addSlots: (data) => api.post('/appointments/doctors/slots', data),

  // DELETE /appointments/doctors/slots  (doctor only)
  // body: { slot: '2025-05-01T09:00:00Z' }
  removeSlot: (slot) => api.delete('/appointments/doctors/slots', { data: { slot } }),

  // ── Appointments ─────────────────────────────────────────────────────────────

  // GET /appointments
  getAll: () => api.get('/appointments'),

  // POST /appointments
  // body: { doctor_id, scheduled_at, type?, notes? }
  book: (data) => api.post('/appointments', data),

  // PATCH /appointments/:id/reschedule
  // body: { new_scheduled_at }
  reschedule: (id, newDate) =>
    api.patch(`/appointments/${id}/reschedule`, { new_scheduled_at: newDate }),

  // DELETE /appointments/:id
  cancel: (id) => api.delete(`/appointments/${id}`),

  // PATCH /appointments/:id/status  (doctor only)
  // body: { status: 'completed' | 'no_show' }
  updateStatus: (id, status) => api.patch(`/appointments/${id}/status`, { status }),

  // POST /appointments/auto-book
  // body: { doctor_id, window_days?, trigger_medicine_id? }
  autoBook: (data) => api.post('/appointments/auto-book', data),
};