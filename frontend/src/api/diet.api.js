import { api } from '../lib/axios';

export const dietApi = {
  getCurrent: () => api.get('/diet/current'),
  generate: () => api.post('/diet/generate'),
  searchFood: (q) => api.get(`/diet/foods/search?q=${encodeURIComponent(q)}`)
};