import { api } from '../lib/api';
export const appointmentApi = {
  getDoctors: specialisation => api(specialisation ? `/appointments/doctors?specialisation=${specialisation}` : '/appointments/doctors', {
    method: 'GET'
  }),
  getDoctorSlots: id => api(`/appointments/doctors/${id}/slots`, {
    method: 'GET'
  }),
  getAppointments: () => api('/appointments', {
    method: 'GET'
  }),
  book: data => api('/appointments', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  cancel: id => api(`/appointments/${id}`, {
    method: 'DELETE'
  })
};