import { api } from '../lib/axios';

export const appointmentApi = {
  getDoctors: (specialisation) =>
    api.get(specialisation ? `/appointments/doctors?specialisation=${specialisation}` : '/appointments/doctors'),
  getDoctorSlots: (id) => api.get(`/appointments/doctors/${id}/slots`),
  getAppointments: () => api.get('/appointments'),
  book: (data) => api.post('/appointments', data),
  cancel: (id) => api.delete(`/appointments/${id}`)
};