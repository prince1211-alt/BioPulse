import { api } from './axios.js';

export const appointmentApi = {
  // ── Doctors ─────────────────────────────────────────────────────────────────

  // GET /appointments/doctors?specialisation=Cardiologist
  getDoctors: (specialisation) =>
    api.get('/appointments/doctors', { params: specialisation ? { specialisation } : {} }),

  // GET /appointments/doctors/:id/schedules
  getDoctorSchedules: (doctorId) => api.get(`/appointments/doctors/${doctorId}/schedules`),

  // GET /appointments/doctors/:id/queue
  getDoctorQueue: (doctorId) => api.get(`/appointments/doctors/${doctorId}/queue`),

  // POST /appointments/doctors/schedules  (doctor only)
  addSchedule: (data) => api.post('/appointments/doctors/schedules', data),

  // DELETE /appointments/doctors/schedules  (doctor only)
  removeSchedule: (id) => api.delete('/appointments/doctors/schedules', { data: { id } }),

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

  // PATCH /appointments/:id/queue-status  (doctor only)
  // body: { queue_status }
  updateQueueStatus: (id, queue_status) => api.patch(`/appointments/${id}/queue-status`, { queue_status }),

  // POST /appointments/auto-book
  // body: { doctor_id, window_days?, trigger_medicine_id? }
  autoBook: (data) => api.post('/appointments/auto-book', data),
};