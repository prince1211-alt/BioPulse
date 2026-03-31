import { api } from '../lib/api';
export const dietApi = {
  getCurrent: () => api('/diet/current', {
    method: 'GET'
  }),
  generate: () => api('/diet/generate', {
    method: 'POST'
  }),
  searchFood: q => api(`/diet/foods/search?q=${encodeURIComponent(q)}`, {
    method: 'GET'
  })
};