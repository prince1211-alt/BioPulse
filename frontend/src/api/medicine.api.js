import { api } from '../lib/api';
export const medicineApi = {
  create: data => api('/medicines', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getAll: () => api('/medicines', {
    method: 'GET'
  }),
  delete: id => api(`/medicines/${id}`, {
    method: 'DELETE'
  }),
  getToday: () => api('/medicines/today', {
    method: 'GET'
  }),
  logDose: data => api('/medicines/logs', {
    method: 'POST',
    body: JSON.stringify(data)
  })
};